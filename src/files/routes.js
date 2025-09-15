import {Router} from "express";
import multer from "multer";
import {nanoid} from "nanoid";
import fs from "fs";
import path from "path";
import {db} from "../lib/db.js";

const upload = multer({dest: "data/uploads"});
export const router = Router();

router.post("/", upload.single("file"), (req, res) => {
    const id = nanoid();
    const ext = path.extname(req.file.originalname) || "";
    const finalDir = path.join("data", "files", req.user.sub);
    fs.mkdirSync(finalDir, {recursive: true});
    const finalPath = path.join(finalDir, `${id}${ext}`);
    fs.renameSync(req.file.path, finalPath);

    db.prepare(`
        INSERT INTO files (id, ownerId, path, mime, size, createdAt)
        VALUES (?,?,?,?,?, datetime('now'))
        `).run(id, req.user.sub, finalPath, req.file.mimetype, req.file.size);

        res.status(201).json({id});
});

router.get("/", (req, res) => {
    const {sort = "createdAt", order = "desc", mime, minSize, maxSize } = req.query;
    const limit = Math.min(100, Number(req.query.limit || 20));
    const offset = Math.max(0, Number(req.query.offset || 0));

    const clauses = ["ownerId = ?"];
    const params = [req.user.sub];

    if (mime) {
        clauses.push("mime = ?");
        params.push(mime);
    }
    if (minSize) {
        clauses.push("size >= ?");
        params.push(Number(minSize));
    }
    if (maxSize) {
        clauses.push("size <= ?");
        params.push(Number(maxSize));
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    const sortable = new Set(["createdAt", "size", "mime"]);
    const col = sortable.has(sort) ? sort : "createdAt";
    const ord = (String(order).toLowerCase() === "asc") ? "ASC" : "DESC";

    const rows = db.prepare(
        `SELECT * FROM files ${where} ORDER BY ${col} ${ord} LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const ver = rows.length ? `${rows[0].createdAt}:${rows.length}` : "0";
    const etag = `W/"${ver}"`;
    if (req.headers["if-none-match"] === etag) return res.status(304).end();

    res.set("ETag", etag);
    res.json({ items: rows, count: rows.length, sort: col, order: ord, limit, offset});
    // const rows = db.prepare(`
    //     SELECT * FROM files WHERE ownerId=? ORDER BY createdAt DESC LIMIT ? OFFSET ?
    //     `).all(req.user.sub, limit, offset);
    //     res.json({items: rows});
});
