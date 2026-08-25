
-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "gst_state" TEXT,
ADD COLUMN     "gstin_number" TEXT,
ADD COLUMN     "next_bill_number" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "next_quotation_number" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "next_receipt_number" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "StudioService" (
    "studio_service_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioService_pkey" PRIMARY KEY ("studio_service_id")
);

-- CreateTable
CREATE TABLE "BillingClient" (
    "billing_client_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingClient_pkey" PRIMARY KEY ("billing_client_id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "quotation_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "billing_client_id" TEXT NOT NULL,
    "quotation_number" INTEGER NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("quotation_id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "quotation_item_id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "discount_per_unit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("quotation_item_id")
);

-- CreateIndex
CREATE INDEX "StudioService_tenant_id_idx" ON "StudioService"("tenant_id");

-- CreateIndex
CREATE INDEX "BillingClient_tenant_id_idx" ON "BillingClient"("tenant_id");

-- CreateIndex
CREATE INDEX "Quotation_tenant_id_idx" ON "Quotation"("tenant_id");

-- CreateIndex
CREATE INDEX "Quotation_billing_client_id_idx" ON "Quotation"("billing_client_id");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_tenant_id_quotation_number_key" ON "Quotation"("tenant_id", "quotation_number");

-- CreateIndex
CREATE INDEX "QuotationItem_quotation_id_idx" ON "QuotationItem"("quotation_id");

-- AddForeignKey
ALTER TABLE "StudioService" ADD CONSTRAINT "StudioService_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingClient" ADD CONSTRAINT "BillingClient_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_billing_client_id_fkey" FOREIGN KEY ("billing_client_id") REFERENCES "BillingClient"("billing_client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "Quotation"("quotation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

