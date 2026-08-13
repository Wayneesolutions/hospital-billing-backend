const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validate } = require("../lib/validate");
const { billItemCreateSchema } = require("../lib/schemas");

const router = express.Router();

const LOGGABLE_ROLES = ["front_desk", "doctor", "pharmacy", "lab", "accounts_admin"];

// POST /api/patients/:id/bill-items — log a service, creates a bill line item instantly.
// Once a patient is discharged, entries are locked for everyone except accounts_admin,
// who can log a flagged "late entry" for review (spec: "flags any late entries for review").
router.post(
  "/patients/:id/bill-items",
  requireAuth,
  requireRole(...LOGGABLE_ROLES),
  validate(billItemCreateSchema),
  async (req, res, next) => {
    try {
      const { department, serviceName, amount } = req.body;

      const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      let isLateEntry = false;
      if (patient.status === "discharged") {
        if (req.user.role !== "accounts_admin") {
          return res.status(409).json({
            error: "Billing is locked — patient already discharged. Ask accounts/admin to log a late entry.",
          });
        }
        isLateEntry = true;
      }

      const item = await prisma.billItem.create({
        data: {
          patientId: patient.id,
          department,
          serviceName,
          amount,
          loggedById: req.user.id,
          locked: patient.status === "discharged",
          isLateEntry,
        },
      });

      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/patients/:id/running-bill — live total + itemized list so far
router.get("/patients/:id/running-bill", requireAuth, async (req, res, next) => {
  try {
    const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    const items = await prisma.billItem.findMany({
      where: { patientId: req.params.id },
      orderBy: { timestamp: "asc" },
      include: { loggedBy: { select: { name: true, role: true } } },
    });

    const total = items.reduce((sum, item) => sum + Number(item.amount), 0);
    const byDepartment = items.reduce((acc, item) => {
      acc[item.department] = (acc[item.department] || 0) + Number(item.amount);
      return acc;
    }, {});
    const lateEntries = items.filter((i) => i.isLateEntry);

    res.json({
      patientId: req.params.id,
      patientStatus: patient.status,
      items,
      total,
      byDepartment,
      hasLateEntries: lateEntries.length > 0,
      lateEntryCount: lateEntries.length,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
