CREATE TABLE IF NOT EXISTS "TokenBlocklist" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TokenBlocklist_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX IF NOT EXISTS "TokenBlocklist_expiresAt_idx" ON "TokenBlocklist"("expiresAt");
