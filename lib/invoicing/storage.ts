import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "node:fs/promises";
import path from "node:path";

const hasR2 =
  !!process.env.R2_ACCOUNT_ID &&
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY &&
  !!process.env.R2_BUCKET;

const s3 = hasR2
  ? new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
      }
    })
  : null;

const LOCAL_DIR = process.env.LOCAL_PDF_DIR ?? "/tmp/kickpact-pdfs";

export async function storePdf(key: string, body: Buffer): Promise<string> {
  if (s3 && process.env.R2_BUCKET) {
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: "application/pdf"
      })
    );
    return `r2://${process.env.R2_BUCKET}/${key}`;
  }
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  const localPath = path.join(LOCAL_DIR, key.replace(/\//g, "_"));
  await fs.writeFile(localPath, body);
  return `file://${localPath}`;
}

export async function getDownloadUrl(storedUrl: string): Promise<string> {
  if (storedUrl.startsWith("r2://") && s3) {
    const withoutScheme = storedUrl.slice("r2://".length);
    const slashIdx = withoutScheme.indexOf("/");
    const bucket = withoutScheme.slice(0, slashIdx);
    const key = withoutScheme.slice(slashIdx + 1);
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
  }
  // Local fallback: return file:// URL (for dev only, not browser-friendly)
  return storedUrl;
}
