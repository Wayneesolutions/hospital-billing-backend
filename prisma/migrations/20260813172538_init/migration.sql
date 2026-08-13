-- CreateEnum
CREATE TYPE "Role" AS ENUM ('front_desk', 'doctor', 'pharmacy', 'lab', 'accounts_admin');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('admitted', 'discharged');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('OPD', 'LAB', 'PHARMACY', 'OT', 'NURSING', 'ROOM', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "admission_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referring_doctor" TEXT,
    "ward_room" TEXT,
    "status" "PatientStatus" NOT NULL DEFAULT 'admitted',
    "discharge_date" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_items" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "service_name" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "logged_by" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "is_late_entry" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "bill_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "subtotal_by_dept" JSONB NOT NULL,
    "grand_total" DECIMAL(10,2) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_by" TEXT NOT NULL,
    "pdf_url" TEXT,
    "regenerated_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_catalog" (
    "id" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "service_name" TEXT NOT NULL,
    "standard_rate" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "patients_name_idx" ON "patients"("name");

-- CreateIndex
CREATE INDEX "patients_status_idx" ON "patients"("status");

-- CreateIndex
CREATE INDEX "bill_items_patient_id_idx" ON "bill_items"("patient_id");

-- CreateIndex
CREATE INDEX "bill_items_department_idx" ON "bill_items"("department");

-- CreateIndex
CREATE INDEX "bill_items_timestamp_idx" ON "bill_items"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "bills_patient_id_key" ON "bills"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_catalog_department_service_name_key" ON "service_catalog"("department", "service_name");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
