/*
  Warnings:

  - You are about to drop the `tbl_admins` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tbl_event_tenant_mapping` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tbl_event_user_mapping` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tbl_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tbl_login` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tbl_media_upload_stages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tbl_tenant_settings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tbl_tenants` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tbl_uploaded_media` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tbl_user_favourite_media_mapping` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tbl_users` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TenantEventRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- DropForeignKey
ALTER TABLE "tbl_event_tenant_mapping" DROP CONSTRAINT "tbl_event_tenant_mapping_event_id_fkey";

-- DropForeignKey
ALTER TABLE "tbl_event_tenant_mapping" DROP CONSTRAINT "tbl_event_tenant_mapping_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "tbl_event_user_mapping" DROP CONSTRAINT "tbl_event_user_mapping_event_id_fkey";

-- DropForeignKey
ALTER TABLE "tbl_event_user_mapping" DROP CONSTRAINT "tbl_event_user_mapping_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tbl_login" DROP CONSTRAINT "tbl_login_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "tbl_login" DROP CONSTRAINT "tbl_login_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "tbl_login" DROP CONSTRAINT "tbl_login_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tbl_media_upload_stages" DROP CONSTRAINT "tbl_media_upload_stages_event_id_fkey";

-- DropForeignKey
ALTER TABLE "tbl_tenant_settings" DROP CONSTRAINT "tbl_tenant_settings_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "tbl_uploaded_media" DROP CONSTRAINT "tbl_uploaded_media_event_id_fkey";

-- DropForeignKey
ALTER TABLE "tbl_uploaded_media" DROP CONSTRAINT "tbl_uploaded_media_media_upload_stage_id_fkey";

-- DropForeignKey
ALTER TABLE "tbl_user_favourite_media_mapping" DROP CONSTRAINT "tbl_user_favourite_media_mapping_event_id_fkey";

-- DropForeignKey
ALTER TABLE "tbl_user_favourite_media_mapping" DROP CONSTRAINT "tbl_user_favourite_media_mapping_media_id_fkey";

-- DropForeignKey
ALTER TABLE "tbl_user_favourite_media_mapping" DROP CONSTRAINT "tbl_user_favourite_media_mapping_user_id_fkey";

-- DropTable
DROP TABLE "tbl_admins";

-- DropTable
DROP TABLE "tbl_event_tenant_mapping";

-- DropTable
DROP TABLE "tbl_event_user_mapping";

-- DropTable
DROP TABLE "tbl_events";

-- DropTable
DROP TABLE "tbl_login";

-- DropTable
DROP TABLE "tbl_media_upload_stages";

-- DropTable
DROP TABLE "tbl_tenant_settings";

-- DropTable
DROP TABLE "tbl_tenants";

-- DropTable
DROP TABLE "tbl_uploaded_media";

-- DropTable
DROP TABLE "tbl_user_favourite_media_mapping";

-- DropTable
DROP TABLE "tbl_users";

-- CreateTable
CREATE TABLE "SuperAdmin" (
    "super_admin_id" TEXT NOT NULL,
    "super_admin_name" TEXT NOT NULL,
    "super_admin_phone_number" TEXT NOT NULL,
    "super_admin_email_id" TEXT NOT NULL,
    "profile_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'SUPER_ADMIN',
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdmin_pkey" PRIMARY KEY ("super_admin_id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "tenant_id" TEXT NOT NULL,
    "tenant_name" TEXT NOT NULL,
    "tenant_phone_number" TEXT NOT NULL,
    "tenant_email_id" TEXT NOT NULL,
    "tenant_studio_name" TEXT NOT NULL,
    "tenant_studio_address" TEXT NOT NULL,
    "profile_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "User" (
    "user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_phone_number" TEXT NOT NULL,
    "user_email_id" TEXT NOT NULL,
    "validity_days" TEXT NOT NULL,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "profile_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "created_by_tenant_id" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "Login" (
    "transid" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "role" "Role",
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "super_admin_id" TEXT,
    "tenant_id" TEXT,
    "user_id" TEXT,

    CONSTRAINT "Login_pkey" PRIMARY KEY ("transid")
);

-- CreateTable
CREATE TABLE "Event" (
    "event_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "event_description" TEXT,
    "event_date" TIMESTAMP(3),
    "event_time" TEXT,
    "event_venue" TEXT,
    "event_organizer" TEXT,
    "event_organizer_phone_number" TEXT,
    "event_organizer_email_id" TEXT,
    "profile_url" TEXT,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "EventTenantMapping" (
    "event_tenant_mapping_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "collaboration_role" "TenantEventRole" NOT NULL DEFAULT 'OWNER',
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTenantMapping_pkey" PRIMARY KEY ("event_tenant_mapping_id")
);

-- CreateTable
CREATE TABLE "EventUserMapping" (
    "event_user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventUserMapping_pkey" PRIMARY KEY ("event_user_id")
);

-- CreateTable
CREATE TABLE "MediaUploadStage" (
    "media_upload_stage_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "media_name" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "media_size" TEXT NOT NULL,
    "media_upload_status" TEXT NOT NULL DEFAULT 'Upload Just Started',
    "media_upload_start" TEXT NOT NULL DEFAULT '0',
    "media_upload_start_time" TIMESTAMP(3),
    "media_uploaded" TEXT NOT NULL DEFAULT '0',
    "media_uploaded_time" TIMESTAMP(3),
    "media_compressed" TEXT NOT NULL DEFAULT '0',
    "media_compressed_time" TIMESTAMP(3),
    "media_original_uploaded" TEXT NOT NULL DEFAULT '0',
    "media_original_uploaded_time" TIMESTAMP(3),
    "media_original_server_path" TEXT NOT NULL DEFAULT 'Not Uploaded Yet',
    "media_compressed_uploaded" TEXT NOT NULL DEFAULT '0',
    "media_compressed_uploaded_time" TIMESTAMP(3),
    "media_compressed_server_path" TEXT NOT NULL DEFAULT 'Not Uploaded Yet',
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaUploadStage_pkey" PRIMARY KEY ("media_upload_stage_id")
);

-- CreateTable
CREATE TABLE "UploadedMedia" (
    "media_id" TEXT NOT NULL,
    "event_id" TEXT,
    "media_upload_stage_id" TEXT,
    "media_name" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "media_size" TEXT NOT NULL,
    "media_server_path" TEXT NOT NULL,
    "compressed_server_path" TEXT NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadedMedia_pkey" PRIMARY KEY ("media_id")
);

-- CreateTable
CREATE TABLE "UserFavouriteMediaMapping" (
    "user_favourite_media_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFavouriteMediaMapping_pkey" PRIMARY KEY ("user_favourite_media_id")
);

-- CreateTable
CREATE TABLE "TenantSettings" (
    "tenant_settings_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "tenant_watermark_path" TEXT,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("tenant_settings_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Login_username_key" ON "Login"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Login_super_admin_id_key" ON "Login"("super_admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "Login_tenant_id_key" ON "Login"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "Login_user_id_key" ON "Login"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedMedia_media_upload_stage_id_key" ON "UploadedMedia"("media_upload_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSettings_tenant_id_key" ON "TenantSettings"("tenant_id");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_created_by_tenant_id_fkey" FOREIGN KEY ("created_by_tenant_id") REFERENCES "Tenant"("tenant_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Login" ADD CONSTRAINT "Login_super_admin_id_fkey" FOREIGN KEY ("super_admin_id") REFERENCES "SuperAdmin"("super_admin_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Login" ADD CONSTRAINT "Login_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("tenant_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Login" ADD CONSTRAINT "Login_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTenantMapping" ADD CONSTRAINT "EventTenantMapping_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTenantMapping" ADD CONSTRAINT "EventTenantMapping_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventUserMapping" ADD CONSTRAINT "EventUserMapping_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventUserMapping" ADD CONSTRAINT "EventUserMapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaUploadStage" ADD CONSTRAINT "MediaUploadStage_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedMedia" ADD CONSTRAINT "UploadedMedia_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("event_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedMedia" ADD CONSTRAINT "UploadedMedia_media_upload_stage_id_fkey" FOREIGN KEY ("media_upload_stage_id") REFERENCES "MediaUploadStage"("media_upload_stage_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavouriteMediaMapping" ADD CONSTRAINT "UserFavouriteMediaMapping_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavouriteMediaMapping" ADD CONSTRAINT "UserFavouriteMediaMapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavouriteMediaMapping" ADD CONSTRAINT "UserFavouriteMediaMapping_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "UploadedMedia"("media_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("tenant_id") ON DELETE SET NULL ON UPDATE CASCADE;
