import Database from "better-sqlite3";
import fs from "fs"; 
import path from "path";

const dataDir = process.env.DATA_DIR || "data";
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "app.sqlite"));
db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS files  (
        id TEXT PRIMARY KEY,
        ownerId TEXT,
        path TEXT,
        mime TEXT,
        size INTEGER,
        createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    ownerId TEXT, 
    fileId TEXT,
    status TEXT,
    params TEXT,
    outputPath TEXT,
    createdAt TEXT,
    updatedAt TEXT
    );

    -- NEW: per-job logs (structured data)
    CREATE TABLE IF NOT EXISTS job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jobId TEXT,
    ownerId TEXT,
    stage TEXT,
    detail TEXT,    -- JSON string for flexible metadata
    createdAt TEXT
    );

    -- NEW: thumbnail mapping (structured index of unstructured file)
    CREATE TABLE IF NOT EXISTS thumbnails (
    jobId TEXT PRIMARY KEY,
    ownerId TEXT,
    path TEXT, 
    createdAt TEXT
    );
`);