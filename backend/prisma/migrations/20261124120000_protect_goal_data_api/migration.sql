BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- The owning backend role enforces account ownership in its queries.
-- Ordinary Data API roles get no direct access, including to legacy NULL owners.
-- Refuse unexpected policies: enabling RLS alone would not close permissive ones.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'Goal') THEN
        RAISE EXCEPTION 'Review existing Goal policies before enabling backend-only access';
    END IF;
END
$$;
ALTER TABLE "public"."Goal" ENABLE ROW LEVEL SECURITY;
COMMIT;
