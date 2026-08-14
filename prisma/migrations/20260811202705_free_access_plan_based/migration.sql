/*
  Warnings:

  - You are about to drop the column `free_access_granted_at` on the `Tenant` table. All the data in the column will be lost.
  - You are about to drop the column `free_access_granted_by` on the `Tenant` table. All the data in the column will be lost.
  - You are about to drop the column `free_access_until` on the `Tenant` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "free_access_granted_at",
DROP COLUMN "free_access_granted_by",
DROP COLUMN "free_access_until";

-- AlterTable
ALTER TABLE "TenantSubscription" ADD COLUMN     "is_free_grant" BOOLEAN NOT NULL DEFAULT false;
