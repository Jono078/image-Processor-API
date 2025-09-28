import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3 = new S3Client({ region: process.env.AWS_REGION});

export async function putObject({ Bucket, Key, Body, ContentType}) {
    const params = {
        Bucket, Key, Body, ContentType,
    };
    await s3.send(new PutObjectCommand(params))
    return `s3://${Bucket}/${Key}`;
}

export async function presignGet({ Bucket, Key, expiresIn = 300}) {
    const cmd = new GetObjectCommand({Bucket, Key});
    return getSignedUrl(s3, cmd, { expiresIn });
}
