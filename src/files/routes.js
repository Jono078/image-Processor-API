import {Router} from "express";
import multer from "multer";
import {nanoid} from "nanoid";
import fs from "fs";
import path from "path";
import { requireAuth } from "../auth/routes.js";
import { putObject } from "../lib/s3.js";
import { Tables, ddbPut, ddbQuery } from "../lib/ddb.js";
import { ddbGet } from "../lib/ddb.js";
import { presignGet } from "../lib/s3.js";
import { cacheGet, cacheSet, cacheDel } from "../lib/cache.js";

const upload = multer({dest: "/tmp/uploads"});
export const router = Router();

router.post("/", upload.single("file"), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ code: "BadRequest", message: "file is required" });

        const id = nanoid();
        const ext = path.extname(req.file.originalname) || "";

        const key = `${process.env.S3_UPLOAD_PREFIX}${req.user.sub}/${id}${ext}`;
        await putObject({
            Bucket: process.env.S3_BUCKET,
            Key: key,
            Body: fs.createReadStream(req.file.path),
            ContentType: req.file.mimetype
        });
        fs.unlinkSync(req.file.path);

        await ddbPut(Tables.files, {
            ownerId: req.user.sub,
            id,
            s3Key: key,
            mime: req.file.mimetype,
            size: Number(req.file.size),
            createdAt: new Date().toISOString(),
        });

        res.status(201).json({id});
    } catch (e) {next(e);}
});

router.get("/", async (req, res, next) => {
    try {
        const limit = Math.min(100, Number(req.query.limit || 20));
        const cacheKey = `files:${req.user.sub}:limit=${limit}`;

        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);

        const q = await ddbQuery({
            TableName: Tables.files,
            KeyConditionExpression: "ownerId = :u",
            ExpressionAttributeValues: { ":u": req.user.sub },
            Limit: limit,
        });
        const items = (q.Items || []).sort((a,b) => String(b.createdAt).localeCompare(a.createdAt));
        const payload = { items, count: items.length, limit, offset: 0};

        await cacheSet(cacheKey, payload, 60);
        res.json(payload);
        return;
    } catch (e) { next(e); }
});

// GET /v1/files/:id/url -> { url }
router.get("/:id/url", requireAuth, async (req, res, next) => {
    try {
        const f = await ddbGet(Tables.files, { ownerId: req.user.sub, id: req.params.id });
        if (!f.Item) return res.status(404).json({ code: "NotFound", message: "File not found" });

        const url = await presignGet({
            Bucket: process.env.S3_BUCKET,
            Key: f.Item.s3Key,
            expiresIn: 300,
        });
        res.json({ url, expiresIn: 300 });
    }catch (e) { next(e); }
});
