-- AlterTable
ALTER TABLE "applications" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "audit_trail" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;
