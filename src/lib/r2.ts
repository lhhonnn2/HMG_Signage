import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 exposes an S3-compatible API at this endpoint pattern.
// Egress (downloads) from R2 is free, which is why files are served
// directly from R2's public URL rather than proxied through the app.
export function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
    }
  });
}

// Returns a short-lived URL the browser can PUT the file to directly,
// so large image/font/audio files never pass through our server.
export async function createUploadUrl(key: string, contentType: string) {
  const client = r2Client();
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ContentType: contentType
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  const publicUrl = `${process.env.R2_PUBLIC_BASE_URL}/${key}`;
  return { uploadUrl, publicUrl };
}
