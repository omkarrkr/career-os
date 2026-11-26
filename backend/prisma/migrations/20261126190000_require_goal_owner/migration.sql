BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Refuse unresolved legacy rows; never infer or silently assign an owner.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "public"."Goal" WHERE "userId" IS NULL) THEN
        RAISE EXCEPTION 'Verified ownership backfill must finish before requiring Goal.userId';
    END IF;
END
$$;
ALTER TABLE "public"."Goal" ALTER COLUMN "userId" SET NOT NULL;
COMMIT;
