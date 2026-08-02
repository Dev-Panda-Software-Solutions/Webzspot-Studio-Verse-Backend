
-- AlterEnum
ALTER TYPE "TenantSubscriptionStatus" ADD VALUE 'GRACE';

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "monthly_grace_days" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "yearly_grace_days" INTEGER NOT NULL DEFAULT 12;

-- AlterTable
ALTER TABLE "TenantSubscription" ADD COLUMN     "grace_ends_at" TIMESTAMP(3);

