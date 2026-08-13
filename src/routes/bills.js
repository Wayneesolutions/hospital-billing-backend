const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { generateFinalBillPdf } = require("../lib/pdf");
const { getBillPdfUrl } = require("../lib/s3");

const router = express.Router();

async function buildBillTotals(patientId) {
  const items = await prisma.billItem.findMany({
    where: { patientId },
    orderBy: { timestamp: "asc" },
    include: { loggedBy: { select: { name: true, role: true } } },
  });
  const subtotalByDept = items.reduce((acc, item) => {
    acc[item.department] = (acc[item.department] || 0) + Number(item.amount);
    return acc;
  }, {});
  const grandTotal = Object.values(subtotalByDept).reduce((a, b) => a + b, 0);
  return { items, subtotalByDept, grandTotal };
}

// POST /api/patients/:id/discharge — locks further bill entries for this visit
router.post(
  "/patients/:id/discharge",
  requireAuth,
  requireRole("front_desk"),
  async (req, res, next) => {
    try {
      const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (patient.status === "discharged") {
        return res.status(409).json({ error: "Patient already discharged" });
      }

      await prisma.billItem.updateMany({
        where: { patientId: patient.id },
        data: { locked: true },
      });

      const updated = await prisma.patient.update({
        where: { id: patient.id },
        data: { status: "discharged", dischargeDate: new Date() },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/patients/:id/final-bill — consolidates all bill_items into one itemized final bill + PDF
router.post(
  "/patients/:id/final-bill",
  requireAuth,
  requireRole("front_desk", "accounts_admin"),
  async (req, res, next) => {
    try {
      const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      if (patient.status !== "discharged") {
        return res.status(409).json({ error: "Patient must be discharged before generating final bill" });
      }

      const existing = await prisma.bill.findUnique({ where: { patientId: patient.id } });
      if (existing) return res.status(409).json({ error: "Final bill already generated for this visit. Use PATCH to regenerate after late entries." });

      const { items, subtotalByDept, grandTotal } = await buildBillTotals(patient.id);

      const bill = await prisma.bill.create({
        data: {
          patientId: patient.id,
          subtotalByDept,
          grandTotal,
          generatedById: req.user.id,
        },
      });

      const pdfUrl = await generateFinalBillPdf({ bill, patient, items });
      const withPdf = await prisma.bill.update({ where: { id: bill.id }, data: { pdfUrl } });

      res.status(201).json(withPdf);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/patients/:id/final-bill — regenerate after accounts_admin logged late entries
router.patch(
  "/patients/:id/final-bill",
  requireAuth,
  requireRole("accounts_admin"),
  async (req, res, next) => {
    try {
      const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      const existing = await prisma.bill.findUnique({ where: { patientId: patient.id } });
      if (!existing) return res.status(404).json({ error: "No final bill exists yet for this patient — use POST first" });

      const { items, subtotalByDept, grandTotal } = await buildBillTotals(patient.id);

      const bill = await prisma.bill.update({
        where: { id: existing.id },
        data: { subtotalByDept, grandTotal, regeneratedCount: { increment: 1 }, generatedAt: new Date(), generatedById: req.user.id },
      });

      const pdfUrl = await generateFinalBillPdf({ bill, patient, items });
      const withPdf = await prisma.bill.update({ where: { id: bill.id }, data: { pdfUrl } });

      res.json(withPdf);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/bills/:id — retrieve stored final bill
router.get(
  "/bills/:id",
  requireAuth,
  requireRole("front_desk", "accounts_admin"),
  async (req, res, next) => {
    try {
      const bill = await prisma.bill.findUnique({
        where: { id: req.params.id },
        include: { patient: true },
      });
      if (!bill) return res.status(404).json({ error: "Bill not found" });
      res.json(bill);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/patients/:id/bill — convenience lookup: find the final bill by patient id
router.get(
  "/patients/:id/bill",
  requireAuth,
  async (req, res, next) => {
    try {
      const bill = await prisma.bill.findUnique({ where: { patientId: req.params.id } });
      if (!bill) return res.status(404).json({ error: "No final bill generated yet for this patient" });
      res.json(bill);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/bills/:id/pdf-url — mints a short-lived (5 min) presigned S3 URL for
// downloading the final bill PDF. bill.pdfUrl stores the S3 object key, not a
// public link, since patient billing data should not sit behind a public URL.
router.get(
  "/bills/:id/pdf-url",
  requireAuth,
  requireRole("front_desk", "accounts_admin"),
  async (req, res, next) => {
    try {
      const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
      if (!bill) return res.status(404).json({ error: "Bill not found" });
      if (!bill.pdfUrl) return res.status(404).json({ error: "PDF has not been generated for this bill yet" });

      const url = await getBillPdfUrl(bill.pdfUrl);
      res.json({ url, expiresIn: 300 });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
