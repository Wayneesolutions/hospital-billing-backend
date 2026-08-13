const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validate } = require("../lib/validate");
const { patientCreateSchema } = require("../lib/schemas");

const router = express.Router();

// POST /api/patients — Front Desk registers a new patient, returns Patient ID
router.post("/", requireAuth, requireRole("front_desk"), validate(patientCreateSchema), async (req, res, next) => {
  try {
    const { name, age, gender, contact, referringDoctor, wardRoom } = req.body;

    const patient = await prisma.patient.create({
      data: {
        name,
        age,
        gender,
        contact,
        referringDoctor: referringDoctor || null,
        wardRoom: wardRoom || null,
        createdById: req.user.id,
      },
    });

    res.status(201).json(patient);
  } catch (err) {
    next(err);
  }
});

// GET /api/patients?search=name&status=admitted&from=&to=&page=&limit= — search/retrieval (Module 5.5)
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { search, status, from, to } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const where = {};
    if (search) {
      where.OR = [{ name: { contains: String(search), mode: "insensitive" } }, { id: String(search) }];
    }
    if (status && ["admitted", "discharged"].includes(String(status))) {
      where.status = status;
    }
    if (from || to) {
      where.admissionDate = {};
      if (from) where.admissionDate.gte = new Date(String(from));
      if (to) where.admissionDate.lte = new Date(String(to));
    }

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        orderBy: { admissionDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.patient.count({ where }),
    ]);

    res.json({ patients, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/patients/:id — fetch patient record
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    res.json(patient);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
