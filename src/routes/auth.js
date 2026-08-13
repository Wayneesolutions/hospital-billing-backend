const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const prisma = require("../lib/prisma");
const { validate } = require("../lib/validate");
const { signupSchema, loginSchema } = require("../lib/schemas");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Throttle auth endpoints to slow down credential-stuffing/brute-force attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
});

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, {
    expiresIn: "12h",
  });
}

// POST /api/auth/bootstrap-admin — one-time use. Creates the FIRST accounts_admin
// user when the users table is empty. Refuses once any user already exists, so it
// cannot be used to slip in extra accounts later. Use this once, then use
// POST /api/auth/signup (which requires an accounts_admin token) to add more staff.
router.post("/bootstrap-admin", authLimiter, validate(signupSchema), async (req, res, next) => {
  try {
    const existingCount = await prisma.user.count();
    if (existingCount > 0) {
      return res.status(409).json({
        error: "Bootstrap already used — an accounts_admin must create further users via /api/auth/signup",
      });
    }

    const { name, email, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: "accounts_admin" },
    });

    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/signup — accounts_admin only, adds staff (front_desk, doctor, pharmacy, lab, accounts_admin)
router.post(
  "/signup",
  requireAuth,
  requireRole("accounts_admin"),
  authLimiter,
  validate(signupSchema),
  async (req, res, next) => {
    try {
      const { name, email, password, role } = req.body;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ error: "A user with this email already exists" });

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({ data: { name, email, passwordHash, role } });

      res.status(201).json({ id: user.id, name: user.name, role: user.role, email: user.email });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/login
router.post("/login", authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    // Same error for "no such user" and "wrong password" so we don't leak which emails exist.
    if (!user || !user.active) return res.status(401).json({ error: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email } });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — verify token / fetch current user profile
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user.id, name: user.name, role: user.role, email: user.email });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/users — accounts_admin only, staff directory
router.get("/users", requireAuth, requireRole("accounts_admin"), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, role: true, email: true, active: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
