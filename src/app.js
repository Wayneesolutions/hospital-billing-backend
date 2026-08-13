const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const authRouter = require("./routes/auth");
const patientsRouter = require("./routes/patients");
const billItemsRouter = require("./routes/billItems");
const billsRouter = require("./routes/bills");
const serviceCatalogRouter = require("./routes/serviceCatalog");
const reportsRouter = require("./routes/reports");

const app = express();

app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
  })
);

app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true, service: "hospital-billing-backend" }));

// Final-bill PDFs live in S3, not on local disk (local disk doesn't survive
// redeploys or scale-out on App Runner / ECS). See GET /api/bills/:id/pdf-url.

app.use("/api/auth", authRouter);
app.use("/api/patients", patientsRouter);
app.use("/api", billItemsRouter); // /api/patients/:id/bill-items, /api/patients/:id/running-bill
app.use("/api", billsRouter); // /api/patients/:id/discharge, /api/patients/:id/final-bill, /api/bills/:id
app.use("/api/service-catalog", serviceCatalogRouter);
app.use("/api/reports", reportsRouter);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Central error handler — translates known Prisma/zod error shapes into clean
// JSON responses instead of leaking stack traces to API clients.
app.use((err, req, res, next) => {
  console.error(err);

  if (err.code === "P2002") {
    return res.status(409).json({ error: `Duplicate value for unique field: ${err.meta?.target || "unknown"}` });
  }
  if (err.code === "P2025") {
    return res.status(404).json({ error: "Record not found" });
  }
  if (err.code === "P2003") {
    return res.status(400).json({ error: "Invalid reference — related record does not exist" });
  }

  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

module.exports = app;
