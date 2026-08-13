const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Uses the AWS SDK's default credential provider chain. On App Runner / ECS /
// EC2 this resolves automatically from the attached IAM role — do NOT set
// static AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in production. For local
// development, run `aws configure` or export those two env vars yourself.
const REGION = process.env.AWS_REGION || "ap-south-1";
const BUCKET = process.env.S3_BILLS_BUCKET;

const s3 = BUCKET ? new S3Client({ region: REGION }) : null;

// TESTING FALLBACK: when S3_BILLS_BUCKET is not configured (e.g. on the
// Vercel test deployment, before AWS is wired up), the PDF is embedded
// directly as a base64 data URL and stored in bills.pdf_url instead of an
// S3 key. This works fine for demoing the flow but is NOT how production
// (App Runner/ECS + S3) behaves — swap S3_BILLS_BUCKET + AWS creds back in
// before going live and this path is skipped automatically.
async function uploadBillPdf(key, bytes) {
  if (!BUCKET) {
    const base64 = Buffer.from(bytes).toString("base64");
    return `data:application/pdf;base64,${base64}`;
  }
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: bytes,
      ContentType: "application/pdf",
    })
  );
  return key;
}

// Returns a short-lived signed URL (default 5 minutes) for downloading a bill
// PDF directly from S3. Generate a fresh one on every download request rather
// than caching it — do not store presigned URLs anywhere.
async function getBillPdfUrl(key, expiresInSeconds = 300) {
  if (!BUCKET || key.startsWith("data:")) {
    // Testing fallback: the "key" is already a self-contained data URL.
    return key;
  }
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

module.exports = { uploadBillPdf, getBillPdfUrl };
