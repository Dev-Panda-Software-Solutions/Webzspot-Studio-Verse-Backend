-- CreateEnum
CREATE TYPE "WalletTier" AS ENUM ('INITIAL', 'TOPUP');

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "wallet_tier" "WalletTier";

