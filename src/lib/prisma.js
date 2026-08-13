const { PrismaClient } = require("@prisma/client");

// Reuse a single instance across hot reloads / serverless invocations
const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") global.__prisma = prisma;

module.exports = prisma;
