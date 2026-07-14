-- AlterTable
ALTER TABLE "SubscriptionPlan" DROP COLUMN "launched_at",
DROP COLUMN "price_lock_window_days",
ADD COLUMN     "special_access_cutoff_date" TIMESTAMP(3);

