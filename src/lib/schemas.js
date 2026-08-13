const { z } = require("zod");

const DEPARTMENTS = ["OPD", "LAB", "PHARMACY", "OT", "NURSING", "ROOM", "OTHER"];
const ROLES = ["front_desk", "doctor", "pharmacy", "lab", "accounts_admin"];

const signupSchema = z.object({
  name: z.string().trim().min(2, "name must be at least 2 characters"),
  email: z.string().trim().email("invalid email"),
  password: z.string().min(6, "password must be at least 6 characters"),
  role: z.enum(ROLES, { errorMap: () => ({ message: `role must be one of ${ROLES.join(", ")}` }) }),
});

const loginSchema = z.object({
  email: z.string().trim().email("invalid email"),
  password: z.string().min(1, "password is required"),
});

const patientCreateSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  age: z.coerce.number().int().min(0, "age must be a positive number").max(150, "age is unrealistic"),
  gender: z.enum(["male", "female", "other"], {
    errorMap: () => ({ message: "gender must be male, female, or other" }),
  }),
  contact: z.string().trim().min(5, "contact must be a valid phone/email"),
  referringDoctor: z.string().trim().optional().nullable(),
  wardRoom: z.string().trim().optional().nullable(),
});

const billItemCreateSchema = z.object({
  department: z.enum(DEPARTMENTS, {
    errorMap: () => ({ message: `department must be one of ${DEPARTMENTS.join(", ")}` }),
  }),
  serviceName: z.string().trim().min(1, "serviceName is required"),
  amount: z.coerce.number().positive("amount must be greater than 0").max(10000000, "amount is unrealistic"),
});

const serviceCatalogCreateSchema = z.object({
  department: z.enum(DEPARTMENTS),
  serviceName: z.string().trim().min(1, "serviceName is required"),
  standardRate: z.coerce.number().positive("standardRate must be greater than 0"),
});

module.exports = {
  DEPARTMENTS,
  ROLES,
  signupSchema,
  loginSchema,
  patientCreateSchema,
  billItemCreateSchema,
  serviceCatalogCreateSchema,
};
