-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('SUBSCRIPTION', 'WALLET');

-- CreateEnum
CREATE TYPE "DurationUnit" AS ENUM ('DAYS', 'MONTHS', 'YEARS');

-- CreateEnum
CREATE TYPE "TenantSubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('RECHARGE', 'AI_USAGE', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "is_ai_event" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TenantFavouriteMediaMapping" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "subscription_plan_id" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "plan_type" "PlanType" NOT NULL,
    "duration_value" INTEGER,
    "duration_unit" "DurationUnit",
    "photo_quota" INTEGER,
    "price" DECIMAL(10,2) NOT NULL,
    "wallet_credits" INTEGER,
    "ai_credit_cost_per_photo" INTEGER,
    "price_lock_window_days" INTEGER NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "launched_at" TIMESTAMP(3),
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("subscription_plan_id")
);

-- CreateTable
CREATE TABLE "TenantSubscription" (
    "tenant_subscription_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "subscription_plan_id" TEXT,
    "status" "TenantSubscriptionStatus" NOT NULL,
    "locked_price" DECIMAL(10,2),
    "is_price_locked" BOOLEAN NOT NULL DEFAULT false,
    "photo_quota_total" INTEGER NOT NULL,
    "photo_quota_used" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("tenant_subscription_id")
);

-- CreateTable
CREATE TABLE "TenantWallet" (
    "tenant_wallet_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "balance_credits" INTEGER NOT NULL DEFAULT 0,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantWallet_pkey" PRIMARY KEY ("tenant_wallet_id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "wallet_transaction_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "credits" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("wallet_transaction_id")
);

-- CreateIndex
CREATE INDEX "SubscriptionPlan_display_order_idx" ON "SubscriptionPlan"("display_order");

-- CreateIndex
CREATE INDEX "TenantSubscription_tenant_id_idx" ON "TenantSubscription"("tenant_id");

-- CreateIndex
CREATE INDEX "TenantSubscription_tenant_id_isactive_idx" ON "TenantSubscription"("tenant_id", "isactive");

-- CreateIndex
CREATE UNIQUE INDEX "TenantWallet_tenant_id_key" ON "TenantWallet"("tenant_id");

-- CreateIndex
CREATE INDEX "WalletTransaction_tenant_id_idx" ON "WalletTransaction"("tenant_id");

-- CreateIndex
CREATE INDEX "EventTenantMapping_event_id_idx" ON "EventTenantMapping"("event_id");

-- CreateIndex
CREATE INDEX "EventTenantMapping_tenant_id_idx" ON "EventTenantMapping"("tenant_id");

-- CreateIndex
CREATE INDEX "EventTenantMapping_event_id_tenant_id_idx" ON "EventTenantMapping"("event_id", "tenant_id");

-- CreateIndex
CREATE INDEX "EventUserMapping_event_id_idx" ON "EventUserMapping"("event_id");

-- CreateIndex
CREATE INDEX "EventUserMapping_user_id_idx" ON "EventUserMapping"("user_id");

-- CreateIndex
CREATE INDEX "EventUserMapping_event_id_user_id_idx" ON "EventUserMapping"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdmin_super_admin_email_id_key" ON "SuperAdmin"("super_admin_email_id");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_tenant_email_id_key" ON "Tenant"("tenant_email_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_user_email_id_key" ON "User"("user_email_id");

-- CreateIndex
CREATE INDEX "User_created_by_tenant_id_idx" ON "User"("created_by_tenant_id");

-- CreateIndex
CREATE INDEX "UserFavouriteMediaMapping_event_id_user_id_idx" ON "UserFavouriteMediaMapping"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavouriteMediaMapping_event_id_user_id_media_id_key" ON "UserFavouriteMediaMapping"("event_id", "user_id", "media_id");

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_subscription_plan_id_fkey" FOREIGN KEY ("subscription_plan_id") REFERENCES "SubscriptionPlan"("subscription_plan_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantWallet" ADD CONSTRAINT "TenantWallet_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

