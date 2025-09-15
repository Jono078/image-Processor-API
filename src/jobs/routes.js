import {Router} from "express";
import {nanoid} from "nanoid";
import path from "path";
import fs from "fs";
import {db} from "../lib/db.js";
import { processImage } from "./pipeline.js";

export const router = Router();

// POST /v1/jobs
// body { fileId, iterations=30, kernel="edge"}
// creates a queued job
router.post("/", (req, res) => {
    const id = nanoid();
    const {fileId, iterations = 30, kernel = "edge"} = req.body || {};

    if (!fileId) {
        return res.status(400).json({ code: "BadRequest", message: "Missing fileId"});
    }

    //clamp iterations to a sane range
    const it = Math.max(1, Math.min(200, Number(iterations) || 30));
    db.prepare(`
        INSERT INTO jobs (id, ownerId, fileId, status, params, outputPath, createdAt, updatedAt)
        Values (?,?,?,?,?, NULL, datetime('now'),datetime('now'))
        `).run(id, req.user.sub, fileId, "queued", JSON.stringify({iterations: it, kernel }));
    res.status(201).json({id});
});

//POST /v1/jobs/:id/process
// runs CPU heavy pipeline and writes output/thumbnail
router.post("/:id/process", async (req, res, next) => {
    try{
        const job = db.prepare("SELECT * FROM jobs WHERE id=? AND ownerId=?")
            .get(req.params.id, req.user.sub);
        if (!job) return res.status(404).json({code: "NotFound", message: "Job not found"});

        const file = db.prepare("SELECT * FROM files WHERE id=? AND ownerId=?")
            .get(job.fileId, req.user.sub);
        if (!file) return res.status(404).json({code: "NotFound", message: "File not found"});

        db.prepare("UPDATE jobs SET status='running', updatedAt=datetime('now') WHERE id=?")
            .run(job.id);

        const outDir = path.join("data", "outputs", req.user.sub);
        fs.mkdirSync(outDir, { recursive: true});

        const {iterations = 30, kernel = "edge"} = JSON.parse(job.params || "{}");
        const {outPath, thumbPath, durationMs} = 
            await processImage(file.path, outDir, job.id, iterations, kernel);

        
        db.prepare("UPDATE jobs SET status='done', outputPath=?, updatedAt=datetime('now') WHERE id=?")
            .run(outPath, job.id);

        db.prepare(`INSERT INTO job_logs (jobId, ownerId, stage, detail, createdAt) VALUES (?,?,?,?, datetime('now'))
            `).run(job.id, req.user.sub, "process", JSON.stringify({durationMs, iterations, kernel})
        );

        db.prepare(`INSERT OR REPLACE INTO thumbnails (jobId, ownerId, path, createdAt) VALUES (?,?,?, datetime('now'))
            `).run(job.id, req.user.sub, thumbPath);

        res.json({status:"done", outputPath: outPath, thumbnail: thumbPath, durationMs, iterations, kernel});
    } catch (e) {next(e);}
});

// GET /v1/jobs
// query status from to sort 
router.get("/", (req, res) => {

    // Query Params
    const {status, from, to, sort = "createdAt", order = "desc" } = req.query;
    const limit = Math.min(100, Number(req.query.limit || 20));
    const offset = Math.max(0, Number(req.query.offset || 0));

    // build WHERE clause safely
    const clauses = ["ownerId = ?"];
    const params = [req.user.sub];

    if (status) {
        clauses.push("status = ?");
        params.push(status);
    }
    if (from) {
        clauses.push("createdAt >= ?");
        params.push(from);
    }
    if (to) {
        clauses.push("createdAt <= ?");
        params.push(to);
    }

    const where = `WHERE ${clauses.join(" AND ")}`;

    // validate sort/order
    const sortable = new Set(["createdAt","updatedAt","status"]);
    const col = sortable.has(sort) ? sort : "createdAt";
    const ord = (String(order).toLowerCase() === "asc") ? "ASC" : "DESC";

    // fetch
    const rows = db.prepare(
        `SELECT * FROM jobs ${where} ORDER BY ${col} ${ord} LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    //simple version for Etag last updatedAt + count
    const ver = rows.length ? `${rows[0].updatedAt}:${rows.length}` : "0";
    const etag = `W/"${ver}"`;

    // conditional get support
    if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
    }

    res.set("ETag", etag);
    res.json({items: rows, count: rows.length, sort: col, order: ord, limit, offset});

});

/**
 * GET /v1/jobs/:id
 * returns a single job
 */
router.get("/:id", (req, res) => {
    const job = db.prepare("SELECT * FROM jobs WHERE id=? AND ownerId=?")
        .get(req.params.id, req.user.sub);
    if (!job) return res.status(404).json({ code: "NotFound", message: "Job Not Found"});
    res.json(job);
});

/**
 * GET /v1/jobs/:id/logs
 * returns structured logs for the job(duration, iterations, kernel, )
 */
router.get("/:id/logs", (req, res) => {
    //ensure the job belongs to the user (avoid leaking id)
    const job = db.prepare("SELECT * FROM jobs WHERE id=? AND ownerId=?")
        .get(req.params.id, req.user.sub);
        if (!job) return res.status(404).json({code: "NotFound", message: "Job Not Found"});

        const rows = db.prepare(`
            SELECT id, stage, detail, createdAt
            FROM job_logs
            WHERE jobId=? AND ownerId=?
            ORDER BY id ASC
            `).all(job.id, req.user.sub);

            // parse detail JSON for convenience
            const items = rows.map(r => ({...r, detail: JSON.parse(r.detail || "{}")}));
            res.json({ items, count: items.length});
});