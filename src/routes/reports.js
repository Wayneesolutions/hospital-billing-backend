const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/reports/revenue?from=&to=&department= — accounts_admin only.
// Daily revenue by department, computed from bill_items (captures revenue as it's
// earned, not just at the point a final bill is generated) plus outstanding dues
// (admitted patients whose running bill hasn't been collected yet).
router.get("/revenue", requireAuth, requireRole("accounts_admin"), async (req, res, next) => {
  try {
    const { from, to, department } = req.query;

    const where = {};
    if (department) where.department = String(department);
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(String(from));
      if (to) where.timestamp.lte = new Date(String(to));
    }

    const items = await prisma.billItem.findMany({ where });

    const byDay = {};
    const byDepartment = {};
    let total = 0;

    for (const item of items) {
      const day = item.timestamp.toISOString().slice(0, 10);
      const amt = Number(item.amount);
      byDay[day] = (byDay[day] || 0) + amt;
      byDepartment[item.department] = (byDepartment[item.department] || 0) + amt;
      total += amt;
    }

    const finalBillsGenerated = await prisma.bill.count();

    res.json({
      totalRevenue: total,
      billItemCount: items.length,
      finalBillsGenerated,
      byDay,
      byDepartment,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/outstanding-dues — admitted patients with an unpaid running total
router.get("/outstanding-dues", requireAuth, requireRole("accounts_admin"), async (req, res, next) => {
  try {
    const admitted = await prisma.patient.findMany({
      where: { status: "admitted" },
      include: { billItems: true },
      orderBy: { admissionDate: "asc" },
    });

    const dues = admitted.map((p) => ({
      patientId: p.id,
      name: p.name,
      wardRoom: p.wardRoom,
      admissionDate: p.admissionDate,
      runningTotal: p.billItems.reduce((sum, i) => sum + Number(i.amount), 0),
      itemCount: p.billItems.length,
    }));

    res.json({ count: dues.length, dues });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
