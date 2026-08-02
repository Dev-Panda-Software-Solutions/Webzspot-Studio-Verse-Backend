
-- CreateEnum
CREATE TYPE "MediaGalleryType" AS ENUM ('PHOTO_SELECTION', 'AI_MEDIA');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "published_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "includes_ai_media" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UploadedMedia" ADD COLUMN     "gallery_type" "MediaGalleryType" NOT NULL DEFAULT 'PHOTO_SELECTION';

-- CreateTable
CREATE TABLE "EventGuest" (
    "event_guest_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "guest_email" TEXT NOT NULL,
    "selfie_server_path" TEXT NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventGuest_pkey" PRIMARY KEY ("event_guest_id")
);

-- CreateIndex
CREATE INDEX "EventGuest_event_id_idx" ON "EventGuest"("event_id");

-- CreateIndex
CREATE INDEX "UploadedMedia_event_id_gallery_type_idx" ON "UploadedMedia"("event_id", "gallery_type");

-- AddForeignKey
ALTER TABLE "EventGuest" ADD CONSTRAINT "EventGuest_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

