
-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateTable
CREATE TABLE "Bill" (
    "bill_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "billing_client_id" TEXT NOT NULL,
    "bill_number" INTEGER NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'UNPAID',
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("bill_id")
);

-- CreateTable
CREATE TABLE "BillItem" (
    "bill_item_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "discount_per_unit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillItem_pkey" PRIMARY KEY ("bill_item_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bill_quotation_id_key" ON "Bill"("quotation_id");

-- CreateIndex
CREATE INDEX "Bill_tenant_id_idx" ON "Bill"("tenant_id");

-- CreateIndex
CREATE INDEX "Bill_billing_client_id_idx" ON "Bill"("billing_client_id");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_tenant_id_bill_number_key" ON "Bill"("tenant_id", "bill_number");

-- CreateIndex
CREATE INDEX "BillItem_bill_id_idx" ON "BillItem"("bill_id");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "Quotation"("quotation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_billing_client_id_fkey" FOREIGN KEY ("billing_client_id") REFERENCES "BillingClient"("billing_client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "Bill"("bill_id") ON DELETE RESTRICT ON UPDATE CASCADE;

