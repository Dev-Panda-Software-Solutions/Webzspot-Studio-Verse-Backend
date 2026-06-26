-- Add access_expires to EventUserMapping (was in schema but never migrated)
ALTER TABLE "EventUserMapping" ADD COLUMN IF NOT EXISTS "access_expires" TIMESTAMP(3);

-- Make user_phone_number and user_email_id optional in User
ALTER TABLE "User" ALTER COLUMN "user_phone_number" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "user_email_id" DROP NOT NULL;
