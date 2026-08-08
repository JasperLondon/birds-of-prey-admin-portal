-- Identity linking foundation for athlete accounts.
-- This migration adds secure RPCs for self-link and admin link operations,
-- plus audit logging and safe preflight integrity checks.

BEGIN;

-- 1) Minimal audit log for identity-link operations.
CREATE TABLE IF NOT EXISTS public.athlete_identity_link_audit (
  id bigserial PRIMARY KEY,
  athlete_id uuid NOT NULL,
  auth_user_id uuid,
  operation text NOT NULL,
  actor_user_id uuid,
  source text NOT NULL DEFAULT 'unknown',
  previous_user_id uuid,
  new_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_athlete_identity_link_audit_athlete_id
  ON public.athlete_identity_link_audit (athlete_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_athlete_identity_link_audit_auth_user_id
  ON public.athlete_identity_link_audit (auth_user_id, created_at DESC);

COMMENT ON TABLE public.athlete_identity_link_audit IS
  'Audit log for athlete identity linking operations (self-link/admin link/admin unlink/admin relink).';

-- 2) Preflight conflict reporting for duplicate canonical athlete emails.
CREATE TABLE IF NOT EXISTS public.athlete_identity_link_preflight_conflicts (
  id bigserial PRIMARY KEY,
  normalized_email text NOT NULL,
  athlete_ids uuid[] NOT NULL,
  athlete_count integer NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_athlete_identity_link_preflight_conflicts_email
  ON public.athlete_identity_link_preflight_conflicts (normalized_email, detected_at DESC);

DO $$
DECLARE
  v_dup_count integer := 0;
BEGIN
  IF to_regclass('public.athletes') IS NULL THEN
    RAISE EXCEPTION 'Missing required table: public.athletes';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'athletes'
      AND column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'Missing required column: public.athletes.id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'athletes'
      AND column_name = 'email'
  ) THEN
    RAISE EXCEPTION 'Missing required column: public.athletes.email';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'athletes'
      AND column_name = 'user_id'
  ) THEN
    RAISE EXCEPTION 'Missing required column: public.athletes.user_id';
  END IF;

  INSERT INTO public.athlete_identity_link_preflight_conflicts (normalized_email, athlete_ids, athlete_count)
  SELECT
    lower(btrim(a.email)) AS normalized_email,
    array_agg(a.id ORDER BY a.id) AS athlete_ids,
    count(*)::integer AS athlete_count
  FROM public.athletes a
  WHERE a.email IS NOT NULL
    AND btrim(a.email) <> ''
  GROUP BY lower(btrim(a.email))
  HAVING count(*) > 1;

  SELECT count(*)::integer
  INTO v_dup_count
  FROM (
    SELECT lower(btrim(a.email))
    FROM public.athletes a
    WHERE a.email IS NOT NULL
      AND btrim(a.email) <> ''
    GROUP BY lower(btrim(a.email))
    HAVING count(*) > 1
  ) d;

  IF v_dup_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_athletes_email_norm_unique
      ON public.athletes ((lower(btrim(email))))
      WHERE email IS NOT NULL AND btrim(email) <> '';
  ELSE
    RAISE WARNING 'Skipping canonical athlete email uniqueness index; found % duplicate normalized email groups. See public.athlete_identity_link_preflight_conflicts.', v_dup_count;
  END IF;
END
$$;

-- 3) Enforce one linked auth user per athlete and one athlete per linked auth user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_athletes_user_id_unique
  ON public.athletes (user_id)
  WHERE user_id IS NOT NULL;

DO $$
DECLARE
  v_constraint_exists boolean;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'athletes'
      AND column_name = 'user_id'
  ) THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'athletes'
        AND c.conname = 'athletes_user_id_fkey_auth_users'
    )
    INTO v_constraint_exists;

    IF NOT v_constraint_exists THEN
      ALTER TABLE public.athletes
        ADD CONSTRAINT athletes_user_id_fkey_auth_users
        FOREIGN KEY (user_id)
        REFERENCES auth.users(id)
        ON DELETE SET NULL
        NOT VALID;

      -- Validate immediately when possible. If orphaned links exist, keep NOT VALID and continue.
      BEGIN
        ALTER TABLE public.athletes VALIDATE CONSTRAINT athletes_user_id_fkey_auth_users;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'Could not validate athletes_user_id_fkey_auth_users immediately; leaving NOT VALID. Error: %', SQLERRM;
      END;
    END IF;
  END IF;
END
$$;

-- 4) Self-service claim RPC.
CREATE OR REPLACE FUNCTION public.claim_my_athlete_identity(
  p_source text DEFAULT 'mobile_app'
)
RETURNS TABLE (
  status text,
  athlete_id uuid,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_email_norm text;
  v_email_confirmed_at timestamptz;
  v_has_email_confirmed_col boolean := false;
  v_existing_athlete_id uuid;
  v_match_count integer := 0;
  v_match_athlete_id uuid;
  v_match_user_id uuid;
  v_updated_athlete_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::uuid, 'Authentication required'::text;
    RETURN;
  END IF;

  SELECT u.email
  INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RETURN QUERY SELECT 'missing_email'::text, NULL::uuid, 'Authenticated account has no email'::text;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name = 'users'
      AND column_name = 'email_confirmed_at'
  )
  INTO v_has_email_confirmed_col;

  IF v_has_email_confirmed_col THEN
    EXECUTE 'SELECT email_confirmed_at FROM auth.users WHERE id = $1'
      INTO v_email_confirmed_at
      USING v_uid;

    IF v_email_confirmed_at IS NULL THEN
      RETURN QUERY SELECT 'unverified_email'::text, NULL::uuid, 'Email must be verified before linking'::text;
      RETURN;
    END IF;
  END IF;

  v_email_norm := lower(btrim(v_email));

  SELECT a.id
  INTO v_existing_athlete_id
  FROM public.athletes a
  WHERE a.user_id = v_uid
  LIMIT 1
  FOR UPDATE;

  SELECT count(*)::integer,
         min(m.id),
         min(m.user_id)
  INTO v_match_count, v_match_athlete_id, v_match_user_id
  FROM (
    SELECT a.id, a.user_id
    FROM public.athletes a
    WHERE a.email IS NOT NULL
      AND lower(btrim(a.email)) = v_email_norm
    FOR UPDATE
  ) m;

  IF v_match_count = 0 THEN
    IF v_existing_athlete_id IS NOT NULL THEN
      RETURN QUERY SELECT 'already_linked'::text, v_existing_athlete_id, 'Account is already linked'::text;
      RETURN;
    END IF;

    RETURN QUERY SELECT 'no_match'::text, NULL::uuid, 'No athlete record matches this email'::text;
    RETURN;
  END IF;

  IF v_match_count > 1 THEN
    RETURN QUERY SELECT 'ambiguous'::text, NULL::uuid, 'Multiple athletes share this email; admin action required'::text;
    RETURN;
  END IF;

  IF v_existing_athlete_id IS NOT NULL AND v_existing_athlete_id <> v_match_athlete_id THEN
    RETURN QUERY SELECT 'already_linked_elsewhere'::text, v_existing_athlete_id, 'Account is already linked to another athlete'::text;
    RETURN;
  END IF;

  IF v_match_user_id = v_uid THEN
    RETURN QUERY SELECT 'already_linked'::text, v_match_athlete_id, 'Account is already linked'::text;
    RETURN;
  END IF;

  IF v_match_user_id IS NOT NULL AND v_match_user_id <> v_uid THEN
    RETURN QUERY SELECT 'already_claimed'::text, v_match_athlete_id, 'Athlete already linked to another account'::text;
    RETURN;
  END IF;

  UPDATE public.athletes a
  SET user_id = v_uid
  WHERE a.id = v_match_athlete_id
    AND a.user_id IS NULL
  RETURNING a.id
  INTO v_updated_athlete_id;

  IF v_updated_athlete_id IS NULL THEN
    SELECT a.user_id
    INTO v_match_user_id
    FROM public.athletes a
    WHERE a.id = v_match_athlete_id;

    IF v_match_user_id = v_uid THEN
      RETURN QUERY SELECT 'already_linked'::text, v_match_athlete_id, 'Account is already linked'::text;
      RETURN;
    END IF;

    RETURN QUERY SELECT 'already_claimed'::text, v_match_athlete_id, 'Athlete already linked to another account'::text;
    RETURN;
  END IF;

  INSERT INTO public.athlete_identity_link_audit (
    athlete_id,
    auth_user_id,
    operation,
    actor_user_id,
    source,
    previous_user_id,
    new_user_id,
    metadata
  ) VALUES (
    v_match_athlete_id,
    v_uid,
    'automatic_self_link',
    v_uid,
    COALESCE(NULLIF(btrim(p_source), ''), 'mobile_app'),
    NULL,
    v_uid,
    jsonb_build_object('email_norm', v_email_norm)
  );

  RETURN QUERY SELECT 'linked'::text, v_match_athlete_id, 'Athlete account linked successfully'::text;
END;
$$;

COMMENT ON FUNCTION public.claim_my_athlete_identity(text) IS
  'Links the authenticated user to exactly one athlete by normalized email using trusted auth.users identity.';

-- 5) Admin helper: search candidate accounts for linking.
CREATE OR REPLACE FUNCTION public.admin_search_link_candidates(
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_include_linked boolean DEFAULT false,
  p_exclude_athlete_id uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  linked_athlete_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_query text := NULLIF(btrim(COALESCE(p_query, '')), '');
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    EXECUTE 'SELECT public.is_admin()' INTO v_is_admin;
  ELSIF to_regclass('public.users') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = v_actor
        AND u.role IN ('admin', 'super_admin', 'owner')
    )
    INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.full_name,
    p.email,
    a.id AS linked_athlete_id
  FROM public.profiles p
  LEFT JOIN public.athletes a
    ON a.user_id = p.id
  WHERE (
      v_query IS NULL
      OR COALESCE(p.full_name, '') ILIKE '%' || v_query || '%'
      OR COALESCE(p.email, '') ILIKE '%' || v_query || '%'
    )
    AND (
      p_include_linked
      OR a.id IS NULL
      OR (p_exclude_athlete_id IS NOT NULL AND a.id = p_exclude_athlete_id)
    )
  ORDER BY
    CASE WHEN a.id IS NULL THEN 0 ELSE 1 END,
    COALESCE(p.full_name, p.email, p.id::text)
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.admin_search_link_candidates(text, integer, boolean, uuid) IS
  'Admin-only search over profiles for athlete account linking.';

-- 6) Admin link/unlink/relink RPCs.
CREATE OR REPLACE FUNCTION public.admin_link_athlete_account(
  p_athlete_id uuid,
  p_target_user_id uuid,
  p_source text DEFAULT 'admin_portal'
)
RETURNS TABLE (
  status text,
  athlete_id uuid,
  previous_user_id uuid,
  new_user_id uuid,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_existing_user_id uuid;
  v_other_athlete_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_athlete_id IS NULL OR p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'athlete_id and target_user_id are required';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    EXECUTE 'SELECT public.is_admin()' INTO v_is_admin;
  ELSIF to_regclass('public.users') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = v_actor
        AND u.role IN ('admin', 'super_admin', 'owner')
    )
    INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  PERFORM 1
  FROM auth.users u
  WHERE u.id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user does not exist';
  END IF;

  SELECT a.user_id
  INTO v_existing_user_id
  FROM public.athletes a
  WHERE a.id = p_athlete_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Athlete not found';
  END IF;

  SELECT a.id
  INTO v_other_athlete_id
  FROM public.athletes a
  WHERE a.user_id = p_target_user_id
    AND a.id <> p_athlete_id
  LIMIT 1
  FOR UPDATE;

  IF v_other_athlete_id IS NOT NULL THEN
    RETURN QUERY SELECT 'target_already_linked_elsewhere'::text, p_athlete_id, v_existing_user_id, NULL::uuid,
      'Target user is already linked to another athlete'::text;
    RETURN;
  END IF;

  IF v_existing_user_id = p_target_user_id THEN
    RETURN QUERY SELECT 'already_linked'::text, p_athlete_id, v_existing_user_id, p_target_user_id,
      'Athlete already linked to this account'::text;
    RETURN;
  END IF;

  IF v_existing_user_id IS NOT NULL AND v_existing_user_id <> p_target_user_id THEN
    RETURN QUERY SELECT 'requires_relink'::text, p_athlete_id, v_existing_user_id, NULL::uuid,
      'Athlete is linked to another account; use relink operation'::text;
    RETURN;
  END IF;

  UPDATE public.athletes a
  SET user_id = p_target_user_id
  WHERE a.id = p_athlete_id
    AND a.user_id IS NULL;

  INSERT INTO public.athlete_identity_link_audit (
    athlete_id,
    auth_user_id,
    operation,
    actor_user_id,
    source,
    previous_user_id,
    new_user_id,
    metadata
  ) VALUES (
    p_athlete_id,
    p_target_user_id,
    'admin_link',
    v_actor,
    COALESCE(NULLIF(btrim(p_source), ''), 'admin_portal'),
    NULL,
    p_target_user_id,
    '{}'::jsonb
  );

  RETURN QUERY SELECT 'linked'::text, p_athlete_id, NULL::uuid, p_target_user_id,
    'Athlete linked successfully'::text;
END;
$$;

COMMENT ON FUNCTION public.admin_link_athlete_account(uuid, uuid, text) IS
  'Admin-only operation to link an existing athlete to an existing auth user.';

CREATE OR REPLACE FUNCTION public.admin_unlink_athlete_account(
  p_athlete_id uuid,
  p_source text DEFAULT 'admin_portal'
)
RETURNS TABLE (
  status text,
  athlete_id uuid,
  previous_user_id uuid,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_existing_user_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_athlete_id IS NULL THEN
    RAISE EXCEPTION 'athlete_id is required';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    EXECUTE 'SELECT public.is_admin()' INTO v_is_admin;
  ELSIF to_regclass('public.users') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = v_actor
        AND u.role IN ('admin', 'super_admin', 'owner')
    )
    INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  SELECT a.user_id
  INTO v_existing_user_id
  FROM public.athletes a
  WHERE a.id = p_athlete_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Athlete not found';
  END IF;

  IF v_existing_user_id IS NULL THEN
    RETURN QUERY SELECT 'already_unlinked'::text, p_athlete_id, NULL::uuid,
      'Athlete is already unlinked'::text;
    RETURN;
  END IF;

  UPDATE public.athletes a
  SET user_id = NULL
  WHERE a.id = p_athlete_id;

  INSERT INTO public.athlete_identity_link_audit (
    athlete_id,
    auth_user_id,
    operation,
    actor_user_id,
    source,
    previous_user_id,
    new_user_id,
    metadata
  ) VALUES (
    p_athlete_id,
    v_existing_user_id,
    'admin_unlink',
    v_actor,
    COALESCE(NULLIF(btrim(p_source), ''), 'admin_portal'),
    v_existing_user_id,
    NULL,
    '{}'::jsonb
  );

  RETURN QUERY SELECT 'unlinked'::text, p_athlete_id, v_existing_user_id,
    'Athlete unlinked successfully'::text;
END;
$$;

COMMENT ON FUNCTION public.admin_unlink_athlete_account(uuid, text) IS
  'Admin-only operation to unlink an athlete from the currently linked auth user.';

CREATE OR REPLACE FUNCTION public.admin_relink_athlete_account(
  p_athlete_id uuid,
  p_target_user_id uuid,
  p_source text DEFAULT 'admin_portal'
)
RETURNS TABLE (
  status text,
  athlete_id uuid,
  previous_user_id uuid,
  new_user_id uuid,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_existing_user_id uuid;
  v_other_athlete_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_athlete_id IS NULL OR p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'athlete_id and target_user_id are required';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    EXECUTE 'SELECT public.is_admin()' INTO v_is_admin;
  ELSIF to_regclass('public.users') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = v_actor
        AND u.role IN ('admin', 'super_admin', 'owner')
    )
    INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  PERFORM 1
  FROM auth.users u
  WHERE u.id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user does not exist';
  END IF;

  SELECT a.user_id
  INTO v_existing_user_id
  FROM public.athletes a
  WHERE a.id = p_athlete_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Athlete not found';
  END IF;

  SELECT a.id
  INTO v_other_athlete_id
  FROM public.athletes a
  WHERE a.user_id = p_target_user_id
    AND a.id <> p_athlete_id
  LIMIT 1
  FOR UPDATE;

  IF v_other_athlete_id IS NOT NULL THEN
    RETURN QUERY SELECT 'target_already_linked_elsewhere'::text, p_athlete_id, v_existing_user_id, NULL::uuid,
      'Target user is already linked to another athlete'::text;
    RETURN;
  END IF;

  IF v_existing_user_id = p_target_user_id THEN
    RETURN QUERY SELECT 'already_linked'::text, p_athlete_id, v_existing_user_id, p_target_user_id,
      'Athlete already linked to this account'::text;
    RETURN;
  END IF;

  UPDATE public.athletes a
  SET user_id = p_target_user_id
  WHERE a.id = p_athlete_id;

  INSERT INTO public.athlete_identity_link_audit (
    athlete_id,
    auth_user_id,
    operation,
    actor_user_id,
    source,
    previous_user_id,
    new_user_id,
    metadata
  ) VALUES (
    p_athlete_id,
    p_target_user_id,
    'admin_relink',
    v_actor,
    COALESCE(NULLIF(btrim(p_source), ''), 'admin_portal'),
    v_existing_user_id,
    p_target_user_id,
    '{}'::jsonb
  );

  RETURN QUERY SELECT 'relinked'::text, p_athlete_id, v_existing_user_id, p_target_user_id,
    'Athlete relinked successfully'::text;
END;
$$;

COMMENT ON FUNCTION public.admin_relink_athlete_account(uuid, uuid, text) IS
  'Admin-only operation to atomically move an athlete link from one auth user to another.';

-- 7) Function security grants.
REVOKE ALL ON FUNCTION public.claim_my_athlete_identity(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_search_link_candidates(text, integer, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_link_athlete_account(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_unlink_athlete_account(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_relink_athlete_account(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_my_athlete_identity(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_link_candidates(text, integer, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_link_athlete_account(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlink_athlete_account(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_relink_athlete_account(uuid, uuid, text) TO authenticated;

COMMIT;
