import {Router} from "express";
import {nanoid} from "nanoid";
import path from "path";
import fs from "fs";
import { requireAuth } from "../auth/routes.js";
import { processImage } from "./pipeline.js";
import { putObject } from "../lib/s3.js";
import mime from "mime-types";
import { s3 } from "../lib/s3.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Tables, ddbPut, ddbGet, ddbUpdate, ddbQuery } from "../lib/ddb.js";
import { presignGet } from "../lib/s3.js";
import { cacheGet, cacheSet, cacheDel } from "../lib/cache.js";

export const router = Router();

// POST /v1/jobs
// body { fileId, iterations=30, kernel="edge"}
// creates a queued job
router.post("/", async (req, res, next) => {
    try{
        const id = nanoid();
        const {fileId, iterations = 30, kernel = "edge"} = req.body || {};

        if (!fileId) {
            return res.status(400).json({ code: "BadRequest", message: "Missing fileId"});
        }
        const it = Math.max(1, Math.min(200, Number(iterations) || 30));

        await ddbPut(Tables.jobs, {
            ownerId:req.user.sub,
            id, 
            fileId, 
            status: "queued",
            params: { iterations: it, kernel },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        res.status(201).json({id});

        try {
            await cacheDel(`jobs:${req.user.sub}:limit=20`);
            await cacheDel(`jobs:${req.user.sub}:limit=100`);
        } catch {}
    } catch (e) { next(e); }
});

//POST /v1/jobs/:id/process
// runs CPU heavy pipeline and writes output/thumbnail
router.post("/:id/process", async (req, res, next) => {
    let tempIn, outPath, thumbPath;
    let jobIdForError = req.params.id;
    try{
        const gj = await ddbGet(Tables.jobs, { ownerId: req.user.sub, id: req.params.id });
        const job = gj.Item;
        if (!job) return res.status(404).json({ code:"NotFound", message:"Job not found"});
        jobIdForError = job.id;

        const gf = await ddbGet(Tables.files, { ownerId: req.user.sub, id: job.fileId });
        const ddbFile = gf.Item;
        if (!ddbFile) return res.status(404).json({ code:"NotFound", message:"File not found"});

        await ddbUpdate({
            TableName: Tables.jobs,
            Key: { ownerId: req.user.sub, id: job.id},
            UpdateExpression: "SET #s=:s, updatedAt=:u",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":s": "running", ":u": new Date().toISOString() }
        });

        const outDir = path.join("/tmp", "outputs", req.user.sub);
        fs.mkdirSync(outDir, { recursive: true});

        const p = (job && typeof job.params === "object") ? job.params : {};
        const iterations = Math.max(1, Math.min(200, Number(p.iterations ?? 30)));
        const kernel = String(p.kernel ?? "edge");


        const inExt = path.extname(ddbFile.s3Key || "") || ".jpg";
        const tempDir = path.join("/tmp", "tmp", req.user.sub);
        fs.mkdirSync(tempDir, { recursive: true });
        tempIn = path.join(tempDir, `${job.id}-in${inExt}`);

        const obj = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: ddbFile.s3Key}));
        await new Promise((resolve, reject) => 
            obj.Body.pipe(fs.createWriteStream(tempIn)).on("finish", resolve).on("error", reject));

        const results = await processImage(tempIn, outDir, job.id, iterations, kernel);

        outPath = results.outPath;
        thumbPath = results.thumbPath;
        const durationMs = results.durationMs;

        const outKey = `${process.env.S3_OUTPUT_PREFIX}${req.user.sub}/${job.id}.jpg`;
        const thumbKey = `${process.env.S3_THUMB_PREFIX}${req.user.sub}/${job.id}.jpg`;

        await putObject({
            Bucket: process.env.S3_BUCKET,
            Key: outKey,
            Body: fs.createReadStream(outPath),
            ContentType: mime.lookup(outPath) || "image/jpeg"
        });

        await putObject({
            Bucket: process.env.S3_BUCKET,
            Key: thumbKey,
            Body: fs.createReadStream(thumbPath),
            ContentType: mime.lookup(thumbPath) || "image/jpeg"
        });
        
        await ddbUpdate({
            TableName: Tables.jobs,
            Key: { ownerId: req.user.sub, id: job.id},
            UpdateExpression: "SET #s=:s, outputS3Key=:k, thumbS3Key=:t, updatedAt=:u",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":s": "done", ":k": outKey, ":t": thumbKey, ":u": new Date().toISOString() }
        });

        try {
            await cacheDel(`jobs:${req.user.sub}:limit=20`);
            await cacheDel(`jobs:${req.user.sub}:limit=100`);
            await cacheDel(`jobs:${req.user.sub}:${job.id}`);
        } catch {}

        await ddbPut(Tables.jobLogs, {
            jobId: job.id,
            id: Date.now().toString(),
            ownerId: req.user.sub,
            stage: "process",
            detail: JSON.stringify({ durationMs, iterations, kernel }),
            createdAt: new Date().toISOString()
        });


        res.json({status:"done", outputS3Key: outKey, thumbS3Key: thumbKey, durationMs, iterations, kernel});
    } catch (e) {
        try {
            await ddbUpdate({
            TableName: Tables.jobs,
            Key: { ownerId: req.user.sub, id: jobIdForError},
            UpdateExpression: "SET #s=:s, updatedAt=:u",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":s": "failed", ":u": new Date().toISOString() }
        });
        } catch {}
        next(e);
    } finally {
        for (const p of [tempIn, outPath, thumbPath]) {
            if (p) { try {fs.unlinkSync(p);} catch {}}
        }
    }
});

// GET /v1/jobs
// query status from to sort 
router.get("/", requireAuth, async (req, res, next) => {
    try{
        const limit = Math.min(100, Number(req.query.limit || 20));
        const cacheKey = `jobs:${req.user.sub}:limit=${limit}`;

        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);

        const q = await ddbQuery({
            TableName: Tables.jobs,
            KeyConditionExpression: "ownerId = :u",
            ExpressionAttributeValues: { ":u": req.user.sub },
            Limit: limit
        });
        const items = (q.Items || []).sort((a,b)=> String(b.createdAt).localeCompare(a.createdAt));
        const payload = { items, count: items.length, limit, offset: 0};

        await cacheSet(cacheKey, payload, 60);
        res.json(payload);
        return;
    } catch (e) { next(e);}
});

/**
 * GET /v1/jobs/:id
 * returns a single job
 */
router.get("/:id", async (req, res, next) => {
    try{
        const cacheKey = `jobs:${req.user.sub}:${req.params.id}`;
        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);

        const j = await ddbGet(Tables.jobs, { ownerId: req.user.sub, id: req.params.id });
        if (!j.Item) return res.status(404).json({ code:"NotFound", message:"Job not found"});

        await cacheSet(cacheKey, j.Item, 60);
        res.json(j.Item);
        return;
    } catch (e) { next(e); }
});

/**
 * GET /v1/jobs/:id/logs
 * returns structured logs for the job(duration, iterations, kernel, )
 */
router.get("/:id/logs", async (req, res, next) => {
    try {
        const job = await ddbGet(Tables.jobs, { ownerId: req.user.sub, id: req.params.id});
        if (!job.Item) return res.status(404).json({ code:"NotFound", message:"Job not found"});

        const logs = await ddbQuery({
            TableName: Tables.jobLogs,
            KeyConditionExpression: "jobId = :j",
            ExpressionAttributeValues: { ":j": req.params.id }
        });
        const items = (logs.Items || []).sort((a,b)=> String(a.id).localeCompare(b.id));
        res.json({ items, count: items.length });
    } catch (e) { next(e);}
});

// GET /v1/jobs/:id/result -> { outputURL, thumbURL, expiresIn }
router.get("/:id/result", requireAuth, async (req, res, next) => {
    try {
        const j = await ddbGet(Tables.jobs, { ownerId: req.user.sub, id: req.params.id });
        if (!j.Item) return res.status(404).json({ code: "NotFound", message: "Job not found"});
        if (j.Item.status !== "done") return res.status(409).json({ code: "NotReady", message: "Job not completed" });

        if (!j.Item.outputS3Key || !j.Item.thumbS3Key) return res.status(409).json({ code: "NotReady", message: "Outputs not available yet"});

        const expiresIn = 300;
        const [outputURL, thumbURL] = await Promise.all([
            presignGet({ Bucket: process.env.S3_BUCKET, Key: j.Item.outputS3Key, expiresIn }),
            presignGet({ Bucket: process.env.S3_BUCKET, Key: j.Item.thumbS3Key, expiresIn }),
        ]);

        res.json({ outputURL, thumbURL, expiresIn });
    } catch (e) { next(e); }
});