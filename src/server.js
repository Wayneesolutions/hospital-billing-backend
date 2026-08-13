require("dotenv").config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "change-this-in-production") {
  console.warn(
    "WARNING: JWT_SECRET is missing or still set to the placeholder value. " +
      "Set a strong, random JWT_SECRET in your .env before going to production."
  );
}
if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.");
  process.exit(1);
}
if (!process.env.S3_BILLS_BUCKET) {
  console.warn(
    "WARNING: S3_BILLS_BUCKET is not set. Final-bill PDFs will be embedded as base64 data URLs " +
      "instead of stored in S3 (fine for testing, not for production)."
  );
}

const app = require("./app");

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => console.log(`Hospital Billing API listening on :${PORT}`));

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
