const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validate } = require("../lib/validate");
const { serviceCatalogCreateSchema } = require("../lib/schemas");

const router = express.Router();

// GET /api/service-catalog?department=LAB — everyone with a login can browse it while
// logging a bill item, to speed up entry and avoid typos in service names/rates.
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { department } = req.query;
    const items = await prisma.serviceCatalog.findMany({
      where: {
        active: true,
        ...(department ? { department: String(department) } : {}),
      },
      orderBy: [{ department: "asc" }, { serviceName: "asc" }],
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /api/service-catalog — accounts_admin maintains the standard rate list
router.post(
  "/",
  requireAuth,
  requireRole("accounts_admin"),
  validate(serviceCatalogCreateSchema),
  async (req, res, next) => {
    try {
      const { department, serviceName, standardRate } = req.body;
      const item = await prisma.serviceCatalog.upsert({
        where: { department_serviceName: { department, serviceName } },
        update: { standardRate, active: true },
        create: { department, serviceName, standardRate },
      });
      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/service-catalog/:id — soft delete (deactivate) rather than hard delete,
// so historical bill items that reference the same service name are unaffected.
router.delete("/:id", requireAuth, requireRole("accounts_admin"), async (req, res, next) => {
  try {
    const item = await prisma.serviceCatalog.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json(item);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Service catalog entry not found" });
    next(err);
  }
});

module.exports = router;
