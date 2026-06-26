CREATE TABLE IF NOT EXISTS "TenantFavouriteMediaMapping" (
    "tenant_favourite_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantFavouriteMediaMapping_pkey" PRIMARY KEY ("tenant_favourite_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantFavouriteMediaMapping_event_id_tenant_id_media_id_key"
    ON "TenantFavouriteMediaMapping"("event_id", "tenant_id", "media_id");

CREATE INDEX IF NOT EXISTS "TenantFavouriteMediaMapping_event_id_tenant_id_idx"
    ON "TenantFavouriteMediaMapping"("event_id", "tenant_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TenantFavouriteMediaMapping_event_id_fkey'
    ) THEN
        ALTER TABLE "TenantFavouriteMediaMapping"
            ADD CONSTRAINT "TenantFavouriteMediaMapping_event_id_fkey"
            FOREIGN KEY ("event_id") REFERENCES "Event"("event_id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TenantFavouriteMediaMapping_tenant_id_fkey'
    ) THEN
        ALTER TABLE "TenantFavouriteMediaMapping"
            ADD CONSTRAINT "TenantFavouriteMediaMapping_tenant_id_fkey"
            FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("tenant_id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TenantFavouriteMediaMapping_media_id_fkey'
    ) THEN
        ALTER TABLE "TenantFavouriteMediaMapping"
            ADD CONSTRAINT "TenantFavouriteMediaMapping_media_id_fkey"
            FOREIGN KEY ("media_id") REFERENCES "UploadedMedia"("media_id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
