-- CreateTable
CREATE TABLE "PlatformSettings" (
    "platform_settings_id" TEXT NOT NULL,
    "trial_duration_days" INTEGER NOT NULL DEFAULT 7,
    "trial_photo_quota" INTEGER NOT NULL DEFAULT 200,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("platform_settings_id")
);

