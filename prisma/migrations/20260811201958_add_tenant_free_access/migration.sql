-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "free_access_granted_at" TIMESTAMP(3),
ADD COLUMN     "free_access_granted_by" TEXT,
ADD COLUMN     "free_access_until" TIMESTAMP(3);
