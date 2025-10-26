import {
  SQSClient,
  SendMessageCommand,
  GetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

const QUEUE_URL = process.env.QUEUE_URL;
if (!QUEUE_URL) throw new Error("Missing env QUEUE_URL");

function regionFromQueueUrl(url) {
  try {
    const host = new URL(url).hostname; // sqs.ap-southeast-2.amazonaws.com
    const parts = host.split(".");
    return parts[1] || process.env.AWS_REGION || "ap-southeast-2";
  } catch {
    return process.env.AWS_REGION || "ap-southeast-2";
  }
}
const sqs = new SQSClient({ region: regionFromQueueUrl(QUEUE_URL) });

export const handler = async (event) => {
  console.log("QUEUE_URL:", QUEUE_URL);

  await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: QUEUE_URL,
      AttributeNames: ["QueueArn"],
    })
  );

  let sent = 0;
  for (const rec of event.Records ?? []) {
    if (rec.eventSource !== "aws:s3") continue;
    const bucket = rec.s3.bucket.name;
    const key = decodeURIComponent((rec.s3.object.key || "").replace(/\+/g, " "));
    const msg = {
      bucket,
      key,
      size: rec.s3.object.size,
      etag: rec.s3.object.eTag,
      time: rec.eventTime,
    };
    await sqs.send(new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(msg),
    }));
    sent++;
  }
  console.log("Enqueued messages:", sent);
  return { ok: true, sent };
};
