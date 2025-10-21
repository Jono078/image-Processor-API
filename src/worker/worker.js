import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } from "@aws-sdk/client-sqs";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { Readable } from "node:stream";

const {
    AWS_REGION = "ap-southeast-2",
    JOBS_QUEUE_URL,
    S3_BUCKET,
    S3_UPLOAD_PREFIX = "uploads/",
    S3_OUTPUT_PREFIX = "outputs/",
    VISIBILITY_TIMEOUT_SEC = "180",
    VISIBILITY_EXTEND_SEC = "60",
    EMPTY_SLEEP_MS = "400"
} = process.env;

if (!JOBS_QUEUE_URL || !S3_BUCKET) {
    console.error("Missing env: JOBS_QUEUE_URL and/or S3_BUCKET");
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
    const resp = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: JOBS_QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
        VisibilityTimeout: parseInt(VISIBILITY_TIMEOUT_SEC, 10)
    }));
    if (!resp.Messages || resp.Messages.length === 0) {
        await new Promise(r => setTimeout(r, parseInt(EMPTY_SLEEP_MS, 10)));
        return;
    }

    for (const m of resp.Messages) {
        const heartbeat = setInterval(() => {
            extend(m.ReceiptHandle, parseInt(VISIBILITY_TIMEOUT_SEC, 10)).catch(() => {});
        }, Math.max(10000, (parseInt(VISIBILITY_TIMEOUT_SEC, 10) * 1000) / 2));
        
        try {
            const body = JSON.parse(m.Body);
            await processJob(body);
            await sqs.send(new DeleteMessageCommand({ QueueUrl: JOBS_QUEUE_URL, ReceiptHandle: m.ReceiptHandle }));
            } catch (e) {
                console.error("worker error", e); // let redrive → DLQ
            } finally {
                clearInterval(heartbeat);
        }
    }
}

(async function main() {
    console.log("Worker up. Queue:", JOBS_QUEUE_URL, "Bucket:", S3_BUCKET);

    while (!stopping) {
        try {
            await poll();
        } catch (e) {
            console.error("poll error", e);
            await new Promise(r => setTimeout(r, 500)); // brief backoff on unexpected errors
        }
    }
    console.log("Worker stopped.");
})().catch(err => { console.error(err); process.exit(1); });