import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } from "@aws-sdk/client-sqs";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { Readable } from "node:stream";
import express from "express";

const {
    AWS_REGION = "ap-southeast-2",
    JOBS_QUEUE_URL,
    S3_BUCKET,
    S3_UPLOAD_PREFIX = "uploads/",
    S3_OUTPUT_PREFIX = "outputs/",
    VISIBILITY_TIMEOUT_SEC = "180",
    VISIBILITY_EXTEND_SEC = "60",
    EMPTY_SLEEP_MS = "400",
    HTTP_MODE = "true",
    WORKER_PORT = "9000" 
} = process.env;

if (!S3_BUCKET) {
  console.error("Missing env: S3_BUCKET");
  process.exit(2);
}
if (HTTP_MODE !== "true" && !JOBS_QUEUE_URL) {
  console.error("Missing env: JOBS_QUEUE_URL (required in SQS mode)");
  process.exit(2);
}

const sqs = new SQSClient({ region: AWS_REGION });
const s3 = new S3Client({ region: AWS_REGION});

sharp.cache(true);
sharp.concurrency(1);

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}
async function getObjectBuffer(Bucket, Key) {
    const out = await s3.send(new GetObjectCommand({ Bucket, Key}));
    const body = out.Body instanceof Readable ? out.Body : Readable.from(out.Body);
    return streamToBuffer(body);
}

async function putObjectBuffer(Bucket, Key, Body, ContentType="image/png") {
    await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType}));
}

async function processJob({ jobId, inputKey, outputKey, ops = {} }) {
    const inKey = inputKey ?? `${S3_UPLOAD_PREFIX}${jobId}.bin`;
    const outKey = outputKey ?? `${S3_OUTPUT_PREFIX}${jobId}.png`;
    if (!inKey || !outKey || inKey.includes("undefined") || outKey.includes("undefined")) {
        throw new Error("Missing keys: supply jobId or explicit inputKey/outputKey");
    }

    const inputBuf = await getObjectBuffer(S3_BUCKET, inKey);
    let img = sharp(inputBuf);

    if (ops?.resize?.width && ops?.resize?.height) {
        img = img.resize(ops.resize.width, ops.resize.height);
    }
    if (ops?.greyscale) img = img.greyscale();
    if (Number.isInteger(ops?.rotate)) img = img.rotate(ops.rotate);

    const outBuf = await img.toBuffer();
    await putObjectBuffer(S3_BUCKET, outKey, outBuf, "image/png");
}

async function extend(ReceiptHandle, seconds) {
    await sqs.send(new ChangeMessageVisibilityCommand({
        QueueUrl: JOBS_QUEUE_URL,
        ReceiptHandle,
        VisibilityTimeout: seconds
    }));
}

let stopping = false;
process.on("SIGTERM", () => {
    console.log("SIGTERM received; will stop after current iteration.");
    stopping = true;
});
process.on("SIGINT", () => {
    console.log("SIGINT received; stopping...");
    stopping = true;
});

async function poll() {
    const VTO = parseInt(VISIBILITY_TIMEOUT_SEC, 10);
    const VEXT = parseInt(VISIBILITY_EXTEND_SEC, 10);
    const EMPTY_MS = parseInt(EMPTY_SLEEP_MS, 10);

    const resp = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: JOBS_QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
        VisibilityTimeout: VTO
    }));

    if (!resp.Messages || resp.Messages.length === 0) {
        await new Promise(r => setTimeout(r, EMPTY_MS));
        return;
    }

    for (const m of resp.Messages) {
        const hbMs = Math.max(10_000, (VTO * 1000) / 2);
        const heartbeat = setInterval(() => {
        extend(m.ReceiptHandle, VEXT).catch(() => {});
        }, hbMs);

        try {
        const body = JSON.parse(m.Body);
        await processJob(body);
        await sqs.send(new DeleteMessageCommand({
            QueueUrl: JOBS_QUEUE_URL,
            ReceiptHandle: m.ReceiptHandle
        }));
        } catch (e) {
        console.error("worker error", e); // message will be re-delivered or go to DLQ
        } finally {
        clearInterval(heartbeat);
        }
    }
}

function startHttpServer() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

  app.post("/process", async (req, res) => {
    try {
      // Expect body like: { jobId, inputKey, outputKey, ops }
      const job = req.body || {};
      await processJob(job);
      return res.status(200).json({ status: "ok" });
    } catch (e) {
      console.error("process error", e);
      return res.status(500).json({ error: e?.message || "processing failed" });
    }
  });

  app.listen(parseInt(WORKER_PORT, 10), () => {
    console.log(`HTTP worker listening on ${WORKER_PORT}`);
  });
}

(async function main() {
  console.log("Worker starting. Bucket:", S3_BUCKET);

  if (HTTP_MODE === "true") {
    // HTTP load-balanced mode (no SQS)
    startHttpServer();
    return;
  }

  // SQS poller mode (if you ever get SQS later, set HTTP_MODE="false")
  while (!stopping) {
    try {
      await poll();
    } catch (e) {
      console.error("poll error", e);
      await new Promise(r => setTimeout(r, 500));
    }
  }
  console.log("Worker stopped.");
})().catch(err => { console.error(err); process.exit(1); });