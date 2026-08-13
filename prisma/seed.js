// Optional convenience seed: creates a default accounts_admin (if none exists yet)
// and a starter service catalog so the app isn't empty on first run.
// Run with: npm run seed
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DEFAULT_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@hospital.local";
const DEFAULT_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

const STARTER_CATALOG = [
  { department: "OPD", serviceName: "Doctor Consultation", standardRate: 500 },
  { department: "LAB", serviceName: "Blood Test - CBC", standardRate: 300 },
  { department: "LAB", serviceName: "X-Ray Chest", standardRate: 600 },
  { department: "PHARMACY", serviceName: "Medicine Dispense (avg)", standardRate: 250 },
  { department: "OT", serviceName: "Minor Procedure", standardRate: 5000 },
  { department: "NURSING", serviceName: "Nursing Care - Per Day", standardRate: 400 },
  { department: "ROOM", serviceName: "General Ward - Per Day", standardRate: 1500 },
  { department: "ROOM", serviceName: "Private Room - Per Day", standardRate: 3500 },
];

async function main() {
  const existingAdmin = await prisma.user.findFirst({ where: { role: "accounts_admin" } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    await prisma.user.create({
      data: {
        name: "System Admin",
        email: DEFAULT_ADMIN_EMAIL,
        passwordHash,
        role: "accounts_admin",
      },
    });
    console.log(`Created default accounts_admin: ${DEFAULT_ADMIN_EMAIL} / ${DEFAULT_ADMIN_PASSWORD}`);
    console.log("Log in and change this password immediately, or set SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD before seeding.");
  } else {
    console.log("An accounts_admin already exists — skipping admin creation.");
  }

  for (const entry of STARTER_CATALOG) {
    await prisma.serviceCatalog.upsert({
      where: { department_serviceName: { department: entry.department, serviceName: entry.serviceName } },
      update: {},
      create: entry,
    });
  }
  console.log(`Seeded ${STARTER_CATALOG.length} starter service catalog entries.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
