CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TYPE "UserRole" AS ENUM ('APPLICANT', 'ADMIN');
CREATE TYPE "ApplicationStatus" AS ENUM (
  'SUBMITTED',
  'KYC_IN_PROGRESS',
  'KYC_FAILED',
  'RISK_REVIEW',
  'PARTNER_VERIFICATION',
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(320) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'APPLICANT',
  "refresh_token_hash" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "applications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "dedupe_key" VARCHAR(255) NOT NULL,
  "applicant_name" VARCHAR(200) NOT NULL,
  "date_of_birth" DATE NOT NULL,
  "id_document_url" VARCHAR(2048),
  "device_fingerprint" VARCHAR(255),
  "ip_address" INET,
  "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
  "kyc_extracted_name" VARCHAR(200),
  "kyc_id_number" VARCHAR(255),
  "kyc_failure_reason" VARCHAR(500),
  "risk_score" INTEGER,
  "risk_flags" JSONB,
  "decision_reason" VARCHAR(1000),
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processing_started_at" TIMESTAMP(3),
  "processing_finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_trail" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_id" UUID NOT NULL,
  "from_status" "ApplicationStatus",
  "to_status" "ApplicationStatus" NOT NULL,
  "event" VARCHAR(100) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_trail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "applications_dedupe_key_key" ON "applications"("dedupe_key");
CREATE INDEX "applications_user_id_idx" ON "applications"("user_id");
CREATE INDEX "applications_status_idx" ON "applications"("status");
CREATE INDEX "applications_device_fingerprint_created_at_idx" ON "applications"("device_fingerprint", "created_at");
CREATE INDEX "audit_trail_application_id_created_at_idx" ON "audit_trail"("application_id", "created_at");

ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;