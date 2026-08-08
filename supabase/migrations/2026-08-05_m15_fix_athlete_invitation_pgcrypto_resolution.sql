-- Milestone 15: fix invitation token crypto function resolution.
--
-- Scope:
-- - Migration-only fix.
-- - Preserve existing invitation workflow, token generation algorithm,
--   expiration rules, authorization checks, and delivery behavior.
--
-- Rationale:
-- - admin_create_athlete_invitation uses gen_random_bytes() and digest().
-- - Runtime error indicates unresolved gen_random_bytes(integer).
-- - Ensure pgcrypto exists and function search_path can resolve extension schema.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_namespace
    WHERE nspname = 'extensions'
  ) THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions';
  ELSE
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto';
  END IF;
END;
$$;

ALTER FUNCTION public.admin_create_athlete_invitation(uuid, text, integer, text)
SET search_path = public, auth, extensions, pg_temp;

ALTER FUNCTION public.admin_resend_athlete_invitation(uuid, text, integer, text)
SET search_path = public, auth, extensions, pg_temp;

COMMIT;
