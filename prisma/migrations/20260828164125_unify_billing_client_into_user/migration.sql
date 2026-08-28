
-- DropForeignKey
ALTER TABLE "Bill" DROP CONSTRAINT "Bill_billing_client_id_fkey";

-- DropForeignKey
ALTER TABLE "BillingClient" DROP CONSTRAINT "BillingClient_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "Quotation" DROP CONSTRAINT "Quotation_billing_client_id_fkey";

-- DropIndex
DROP INDEX "Bill_billing_client_id_idx";

-- DropIndex
DROP INDEX "Quotation_billing_client_id_idx";

-- AlterTable
ALTER TABLE "Bill" DROP COLUMN "billing_client_id",
ADD COLUMN     "user_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Quotation" DROP COLUMN "billing_client_id",
ADD COLUMN     "user_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "validity_days" DROP NOT NULL,
ALTER COLUMN "expiry_date" DROP NOT NULL;

-- DropTable
DROP TABLE "BillingClient";

-- CreateIndex
CREATE INDEX "Bill_user_id_idx" ON "Bill"("user_id");

-- CreateIndex
CREATE INDEX "Quotation_user_id_idx" ON "Quotation"("user_id");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

