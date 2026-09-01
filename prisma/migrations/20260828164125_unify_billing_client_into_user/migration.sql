
-- New billing clients are stored in User, while BillingClient remains for
-- legacy rows created before this migration. Keep both relation paths nullable
-- so old and new documents can render through billingAccess.resolveClient().

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "user_id" TEXT,
ALTER COLUMN "billing_client_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "user_id" TEXT,
ALTER COLUMN "billing_client_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "validity_days" DROP NOT NULL,
ALTER COLUMN "expiry_date" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Bill_user_id_idx" ON "Bill"("user_id");

-- CreateIndex
CREATE INDEX "Quotation_user_id_idx" ON "Quotation"("user_id");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
