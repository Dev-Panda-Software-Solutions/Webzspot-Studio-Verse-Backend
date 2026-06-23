-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'USER');

-- CreateTable
CREATE TABLE "tbl_admins" (
    "admin_id" TEXT NOT NULL,
    "admin_name" TEXT NOT NULL,
    "admin_phone_number" TEXT NOT NULL,
    "admin_email_id" TEXT NOT NULL,
    "profile_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'SUPER_ADMIN',
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "rcu" TEXT NOT NULL,
    "rcm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "luu" TEXT,
    "lum" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_admins_pkey" PRIMARY KEY ("admin_id")
);

-- CreateTable
CREATE TABLE "tbl_tenants" (
    "tenant_id" TEXT NOT NULL,
    "tenant_name" TEXT NOT NULL,
    "tenant_phone_number" TEXT NOT NULL,
    "tenant_email_id" TEXT NOT NULL,
    "tenant_studio_name" TEXT NOT NULL,
    "tenant_studio_address" TEXT NOT NULL,
    "profile_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "rcu" TEXT NOT NULL,
    "rcm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "luu" TEXT,
    "lum" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_tenants_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "tbl_users" (
    "user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_phone_number" TEXT NOT NULL,
    "user_email_id" TEXT NOT NULL,
    "validity_days" TEXT NOT NULL,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "profile_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "rcu" TEXT NOT NULL,
    "rcm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "luu" TEXT,
    "lum" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "tbl_login" (
    "transid" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "role" "Role",
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "rcu" TEXT,
    "rcm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "luu" TEXT,
    "lum" TIMESTAMP(3) NOT NULL,
    "admin_id" TEXT,
    "tenant_id" TEXT,
    "user_id" TEXT,

    CONSTRAINT "tbl_login_pkey" PRIMARY KEY ("transid")
);

-- CreateTable
CREATE TABLE "tbl_events" (
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
    "rcu" TEXT NOT NULL,
    "rcm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "luu" TEXT,
    "lum" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "tbl_event_tenant_mapping" (
    "event_tenant_mapping_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "rcu" TEXT NOT NULL,
    "rcm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "luu" TEXT,
    "lum" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_event_tenant_mapping_pkey" PRIMARY KEY ("event_tenant_mapping_id")
);

-- CreateTable
CREATE TABLE "tbl_event_user_mapping" (
    "event_user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "rcu" TEXT NOT NULL,
    "rcm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "luu" TEXT,
    "lum" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_event_user_mapping_pkey" PRIMARY KEY ("event_user_id")
);

-- CreateTable
CREATE TABLE "tbl_media_upload_stages" (
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
    "media_original_uploaded_link" TEXT NOT NULL DEFAULT 'Not Uploaded Yet',
    "media_compressed_uploaded" TEXT NOT NULL DEFAULT '0',
    "media_compressed_uploaded_time" TIMESTAMP(3),
    "media_compressed_uploaded_link" TEXT NOT NULL DEFAULT 'Not Uploaded Yet',
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "rcu" TEXT NOT NULL,
    "rcm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "luu" TEXT,
    "lum" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_media_upload_stages_pkey" PRIMARY KEY ("media_upload_stage_id")
);

-- CreateTable
CREATE TABLE "tbl_uploaded_media" (
    "media_id" TEXT NOT NULL,
    "event_id" TEXT,
    "media_upload_stage_id" TEXT,
    "media_name" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "media_size" TEXT NOT NULL,
    "media_original_link" TEXT NOT NULL,
    "media_compressed_link" TEXT NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "rcu" TEXT NOT NULL,
    "rcm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "luu" TEXT,
    "lum" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_uploaded_media_pkey" PRIMARY KEY ("media_id")
);

-- CreateTable
CREATE TABLE "tbl_user_favourite_media_mapping" (
    "user_favourite_media_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "rcu" TEXT NOT NULL,
    "rcm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "luu" TEXT,
    "lum" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_user_favourite_media_mapping_pkey" PRIMARY KEY ("user_favourite_media_id")
);

-- CreateTable
CREATE TABLE "tbl_tenant_settings" (
    "tenant_settings_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "tenant_watermark_path" TEXT,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "rcu" TEXT NOT NULL,
    "rcm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "luu" TEXT,
    "lum" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_tenant_settings_pkey" PRIMARY KEY ("tenant_settings_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_login_admin_id_key" ON "tbl_login"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_login_tenant_id_key" ON "tbl_login"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_login_user_id_key" ON "tbl_login"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_uploaded_media_media_upload_stage_id_key" ON "tbl_uploaded_media"("media_upload_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_tenant_settings_tenant_id_key" ON "tbl_tenant_settings"("tenant_id");

-- AddForeignKey
ALTER TABLE "tbl_login" ADD CONSTRAINT "tbl_login_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "tbl_admins"("admin_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_login" ADD CONSTRAINT "tbl_login_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tbl_tenants"("tenant_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_login" ADD CONSTRAINT "tbl_login_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_event_tenant_mapping" ADD CONSTRAINT "tbl_event_tenant_mapping_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_event_tenant_mapping" ADD CONSTRAINT "tbl_event_tenant_mapping_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tbl_tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_event_user_mapping" ADD CONSTRAINT "tbl_event_user_mapping_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_event_user_mapping" ADD CONSTRAINT "tbl_event_user_mapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_media_upload_stages" ADD CONSTRAINT "tbl_media_upload_stages_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_uploaded_media" ADD CONSTRAINT "tbl_uploaded_media_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_events"("event_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_uploaded_media" ADD CONSTRAINT "tbl_uploaded_media_media_upload_stage_id_fkey" FOREIGN KEY ("media_upload_stage_id") REFERENCES "tbl_media_upload_stages"("media_upload_stage_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_user_favourite_media_mapping" ADD CONSTRAINT "tbl_user_favourite_media_mapping_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_user_favourite_media_mapping" ADD CONSTRAINT "tbl_user_favourite_media_mapping_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_user_favourite_media_mapping" ADD CONSTRAINT "tbl_user_favourite_media_mapping_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "tbl_uploaded_media"("media_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_tenant_settings" ADD CONSTRAINT "tbl_tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tbl_tenants"("tenant_id") ON DELETE SET NULL ON UPDATE CASCADE;
