-- A tenant must never have more than one active subscription at a time.
-- This is a partial unique index (Prisma's schema syntax can't express a WHERE
-- clause on a unique constraint), enforced at the database level so a race
-- between two concurrent requests (e.g. a double-clicked Subscribe/Activate
-- Trial button) can never leave two rows both isactive = true, regardless of
-- any check-then-act timing gap in application code.
CREATE UNIQUE INDEX "TenantSubscription_one_active_per_tenant"
ON "TenantSubscription" ("tenant_id")
WHERE "isactive" = true;
