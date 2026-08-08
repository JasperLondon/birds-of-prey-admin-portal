-- Shared identity provisioning for auth.users -> public.profiles + public.users.
-- This migration is forward-only and preserves existing roles/statuses.

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_profile_for_auth_user(
  p_auth_user_id uuid,
  p_email text DEFAULT NULL,
  p_user_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_has_profile_table boolean := false;
  v_has_email_col boolean := false;
  v_has_full_name_col boolean := false;
  v_full_name text := NULL;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT to_regclass('public.profiles') IS NOT NULL INTO v_has_profile_table;
  IF NOT v_has_profile_table THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email'
  ) INTO v_has_email_col;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'full_name'
  ) INTO v_has_full_name_col;

  v_full_name := COALESCE(
    NULLIF(btrim(COALESCE(p_user_meta ->> 'full_name', '')), ''),
    NULLIF(btrim(COALESCE(p_user_meta ->> 'name', '')), ''),
    NULL
  );

  IF v_has_email_col AND v_has_full_name_col THEN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (p_auth_user_id, p_email, v_full_name)
    ON CONFLICT (id) DO NOTHING;
  ELSIF v_has_email_col THEN
    INSERT INTO public.profiles (id, email)
    VALUES (p_auth_user_id, p_email)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO public.profiles (id)
    VALUES (p_auth_user_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.ensure_profile_for_auth_user(uuid, text, jsonb) IS
  'Idempotently ensures a public.profiles row exists for an auth user without overwriting existing profile data.';

CREATE OR REPLACE FUNCTION public.ensure_public_user_row(
  p_auth_user_id uuid
)
RETURNS TABLE (
  status text,
  provisioned boolean,
  role text,
  user_status text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_auth_email text;
  v_auth_meta jsonb;
  v_role text;
  v_status text;
  v_inserted_count integer := 0;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN QUERY SELECT
      'invalid_input'::text,
      false,
      NULL::text,
      NULL::text,
      'auth_user_id is required'::text;
    RETURN;
  END IF;

  SELECT u.email, COALESCE(u.raw_user_meta_data, '{}'::jsonb)
  INTO v_auth_email, v_auth_meta
  FROM auth.users u
  WHERE u.id = p_auth_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'auth_user_not_found'::text,
      false,
      NULL::text,
      NULL::text,
      'Target auth user does not exist'::text;
    RETURN;
  END IF;

  PERFORM public.ensure_profile_for_auth_user(p_auth_user_id, v_auth_email, v_auth_meta);

  INSERT INTO public.users (id, role, status)
  VALUES (p_auth_user_id, 'athlete', 'active')
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  SELECT u.role, u.status
  INTO v_role, v_status
  FROM public.users u
  WHERE u.id = p_auth_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'provisioning_unavailable'::text,
      false,
      NULL::text,
      NULL::text,
      'This account is not fully provisioned. Refresh after account setup completes.'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'ok'::text,
    true,
    v_role,
    v_status,
    CASE WHEN v_inserted_count > 0
      THEN 'Provisioned public.users row with safe defaults.'
      ELSE 'public.users row already provisioned.'
    END;
END;
$$;

COMMENT ON FUNCTION public.ensure_public_user_row(uuid) IS
  'Ensures public.users row exists for an auth user with safe default role=athlete,status=active; never overwrites existing role/status.';

CREATE OR REPLACE FUNCTION public.provision_auth_user_shared_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  PERFORM public.ensure_profile_for_auth_user(
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
  );

  PERFORM public.ensure_public_user_row(NEW.id);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Shared identity provisioning failed for auth user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_auth_user_shared_identity ON auth.users;
CREATE TRIGGER trg_provision_auth_user_shared_identity
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.provision_auth_user_shared_identity();

COMMENT ON FUNCTION public.provision_auth_user_shared_identity() IS
  'Auth trigger: idempotently provisions public.profiles and public.users for new auth accounts.';

CREATE TABLE IF NOT EXISTS public.identity_provisioning_backfill_review (
  id bigserial PRIMARY KEY,
  auth_user_id uuid NOT NULL,
  email text,
  reason text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_provisioning_backfill_review_auth_user
  ON public.identity_provisioning_backfill_review(auth_user_id);

WITH candidate_accounts AS (
  SELECT au.id AS auth_user_id, p.email
  FROM auth.users au
  JOIN public.profiles p
    ON p.id = au.id
  LEFT JOIN public.users pu
    ON pu.id = au.id
  WHERE pu.id IS NULL
),
athlete_match_accounts AS (
  SELECT c.auth_user_id, c.email
  FROM candidate_accounts c
  WHERE c.email IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.athletes a
      WHERE a.email IS NOT NULL
        AND lower(btrim(a.email)) = lower(btrim(c.email))
    )
)
INSERT INTO public.users (id, role, status)
SELECT m.auth_user_id, 'athlete', 'active'
FROM athlete_match_accounts m
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.identity_provisioning_backfill_review (auth_user_id, email, reason)
SELECT c.auth_user_id, c.email, 'profile_exists_without_safe_athlete_match'
FROM (
  SELECT au.id AS auth_user_id, p.email
  FROM auth.users au
  JOIN public.profiles p ON p.id = au.id
  LEFT JOIN public.users pu ON pu.id = au.id
  WHERE pu.id IS NULL
) c
ON CONFLICT (auth_user_id) DO NOTHING;

DROP FUNCTION IF EXISTS public.admin_search_link_candidates(text, integer, boolean, uuid);

CREATE OR REPLACE FUNCTION public.admin_search_link_candidates(
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_include_linked boolean DEFAULT false,
  p_exclude_athlete_id uuid DEFAULT NULL
)
RETURNS TABLE (
  auth_user_id uuid,
  full_name text,
  email text,
  provisioned boolean,
  role text,
  status text,
  linked_athlete_id uuid,
  linked boolean
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
    ) INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS auth_user_id,
    p.full_name,
    p.email,
    (pu.id IS NOT NULL) AS provisioned,
    pu.role,
    pu.status,
    a.id AS linked_athlete_id,
    (a.id IS NOT NULL) AS linked
  FROM public.profiles p
  LEFT JOIN public.users pu
    ON pu.id = p.id
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
    CASE WHEN pu.id IS NULL THEN 0 ELSE 1 END,
    COALESCE(p.full_name, p.email, p.id::text)
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.admin_search_link_candidates(text, integer, boolean, uuid) IS
  'Admin-only candidate search with provisioning status and explicit auth_user_id.';

CREATE OR REPLACE FUNCTION public.admin_repair_link_candidate_account(
  p_auth_user_id uuid,
  p_source text DEFAULT 'admin_portal'
)
RETURNS TABLE (
  status text,
  auth_user_id uuid,
  role text,
  user_status text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_status text;
  v_provisioned boolean;
  v_role text;
  v_user_status text;
  v_message text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_user_id is required';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    EXECUTE 'SELECT public.is_admin()' INTO v_is_admin;
  ELSIF to_regclass('public.users') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = v_actor
        AND u.role IN ('admin', 'super_admin', 'owner')
    ) INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  SELECT e.status, e.provisioned, e.role, e.user_status, e.message
  INTO v_status, v_provisioned, v_role, v_user_status, v_message
  FROM public.ensure_public_user_row(p_auth_user_id) e;

  RETURN QUERY SELECT
    v_status,
    p_auth_user_id,
    v_role,
    v_user_status,
    COALESCE(v_message, 'Provisioning check complete');
END;
$$;

COMMENT ON FUNCTION public.admin_repair_link_candidate_account(uuid, text) IS
  'Admin-only safe provisioning repair for link candidates missing public.users row.';

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
  v_provision_status text;
  v_provisioned boolean;
  v_provision_message text;
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
    ) INTO v_is_admin;
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

  SELECT e.status, e.provisioned, e.message
  INTO v_provision_status, v_provisioned, v_provision_message
  FROM public.ensure_public_user_row(p_target_user_id) e;

  IF v_provision_status = 'auth_user_not_found' THEN
    RETURN QUERY SELECT
      'target_user_not_found'::text,
      p_athlete_id,
      v_existing_user_id,
      NULL::uuid,
      'Target auth user does not exist'::text;
    RETURN;
  END IF;

  IF v_provision_status <> 'ok' OR NOT COALESCE(v_provisioned, false) THEN
    RETURN QUERY SELECT
      'not_fully_provisioned'::text,
      p_athlete_id,
      v_existing_user_id,
      NULL::uuid,
      COALESCE(v_provision_message, 'This account is not fully provisioned. Refresh after account setup completes.');
    RETURN;
  END IF;

  SELECT a.id
  INTO v_other_athlete_id
  FROM public.athletes a
  WHERE a.user_id = p_target_user_id
    AND a.id <> p_athlete_id
  LIMIT 1
  FOR UPDATE;

  IF v_other_athlete_id IS NOT NULL THEN
    RETURN QUERY SELECT
      'target_already_linked_elsewhere'::text,
      p_athlete_id,
      v_existing_user_id,
      NULL::uuid,
      'Target user is already linked to another athlete'::text;
    RETURN;
  END IF;

  IF v_existing_user_id = p_target_user_id THEN
    RETURN QUERY SELECT
      'already_linked'::text,
      p_athlete_id,
      v_existing_user_id,
      p_target_user_id,
      'Athlete already linked to this account'::text;
    RETURN;
  END IF;

  IF v_existing_user_id IS NOT NULL AND v_existing_user_id <> p_target_user_id THEN
    RETURN QUERY SELECT
      'requires_relink'::text,
      p_athlete_id,
      v_existing_user_id,
      NULL::uuid,
      'Athlete is linked to another account; use relink operation'::text;
    RETURN;
  END IF;

  BEGIN
    UPDATE public.athletes a
    SET user_id = p_target_user_id
    WHERE a.id = p_athlete_id
      AND a.user_id IS NULL;
  EXCEPTION
    WHEN foreign_key_violation THEN
      RETURN QUERY SELECT
        'not_fully_provisioned'::text,
        p_athlete_id,
        v_existing_user_id,
        NULL::uuid,
        'This account is not fully provisioned. Refresh after account setup completes.'::text;
      RETURN;
  END;

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

  RETURN QUERY SELECT
    'linked'::text,
    p_athlete_id,
    NULL::uuid,
    p_target_user_id,
    'Athlete linked successfully'::text;
END;
$$;

COMMENT ON FUNCTION public.admin_link_athlete_account(uuid, uuid, text) IS
  'Admin-only link operation with safe provisioning repair before link update.';

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
  v_provision_status text;
  v_provisioned boolean;
  v_provision_message text;
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
    ) INTO v_is_admin;
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

  SELECT e.status, e.provisioned, e.message
  INTO v_provision_status, v_provisioned, v_provision_message
  FROM public.ensure_public_user_row(p_target_user_id) e;

  IF v_provision_status = 'auth_user_not_found' THEN
    RETURN QUERY SELECT
      'target_user_not_found'::text,
      p_athlete_id,
      v_existing_user_id,
      NULL::uuid,
      'Target auth user does not exist'::text;
    RETURN;
  END IF;

  IF v_provision_status <> 'ok' OR NOT COALESCE(v_provisioned, false) THEN
    RETURN QUERY SELECT
      'not_fully_provisioned'::text,
      p_athlete_id,
      v_existing_user_id,
      NULL::uuid,
      COALESCE(v_provision_message, 'This account is not fully provisioned. Refresh after account setup completes.');
    RETURN;
  END IF;

  SELECT a.id
  INTO v_other_athlete_id
  FROM public.athletes a
  WHERE a.user_id = p_target_user_id
    AND a.id <> p_athlete_id
  LIMIT 1
  FOR UPDATE;

  IF v_other_athlete_id IS NOT NULL THEN
    RETURN QUERY SELECT
      'target_already_linked_elsewhere'::text,
      p_athlete_id,
      v_existing_user_id,
      NULL::uuid,
      'Target user is already linked to another athlete'::text;
    RETURN;
  END IF;

  IF v_existing_user_id = p_target_user_id THEN
    RETURN QUERY SELECT
      'already_linked'::text,
      p_athlete_id,
      v_existing_user_id,
      p_target_user_id,
      'Athlete already linked to this account'::text;
    RETURN;
  END IF;

  BEGIN
    UPDATE public.athletes a
    SET user_id = p_target_user_id
    WHERE a.id = p_athlete_id;
  EXCEPTION
    WHEN foreign_key_violation THEN
      RETURN QUERY SELECT
        'not_fully_provisioned'::text,
        p_athlete_id,
        v_existing_user_id,
        NULL::uuid,
        'This account is not fully provisioned. Refresh after account setup completes.'::text;
      RETURN;
  END;

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

  RETURN QUERY SELECT
    'relinked'::text,
    p_athlete_id,
    v_existing_user_id,
    p_target_user_id,
    'Athlete relinked successfully'::text;
END;
$$;

COMMENT ON FUNCTION public.admin_relink_athlete_account(uuid, uuid, text) IS
  'Admin-only relink operation with safe provisioning repair before link update.';

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
  v_accept_invitation_id uuid;
  v_provision_status text;
  v_provisioned boolean;
  v_provision_message text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::uuid, 'Authentication required'::text;
    RETURN;
  END IF;

  SELECT e.status, e.provisioned, e.message
  INTO v_provision_status, v_provisioned, v_provision_message
  FROM public.ensure_public_user_row(v_uid) e;

  IF v_provision_status <> 'ok' OR NOT COALESCE(v_provisioned, false) THEN
    RETURN QUERY SELECT
      'not_fully_provisioned'::text,
      NULL::uuid,
      COALESCE(v_provision_message, 'This account is not fully provisioned. Refresh after account setup completes.');
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
    SELECT inv.id
    INTO v_accept_invitation_id
    FROM public.athlete_onboarding_invitations inv
    WHERE inv.athlete_id = v_match_athlete_id
      AND inv.status IN ('sent', 'expired')
    ORDER BY inv.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_accept_invitation_id IS NOT NULL THEN
      UPDATE public.athlete_onboarding_invitations
      SET status = 'accepted',
          accepted_at = COALESCE(accepted_at, now()),
          accepted_user_id = v_uid
      WHERE id = v_accept_invitation_id;

      INSERT INTO public.athlete_onboarding_invitation_audit (
        invitation_id,
        athlete_id,
        operation,
        actor_user_id,
        previous_status,
        new_status,
        details
      ) VALUES (
        v_accept_invitation_id,
        v_match_athlete_id,
        'invitation_accepted_via_claim',
        v_uid,
        NULL,
        'accepted',
        jsonb_build_object('source', p_source)
      );
    END IF;

    RETURN QUERY SELECT 'already_linked'::text, v_match_athlete_id, 'Account is already linked'::text;
    RETURN;
  END IF;

  IF v_match_user_id IS NOT NULL AND v_match_user_id <> v_uid THEN
    RETURN QUERY SELECT 'already_claimed'::text, v_match_athlete_id, 'Athlete already linked to another account'::text;
    RETURN;
  END IF;

  BEGIN
    UPDATE public.athletes a
    SET user_id = v_uid
    WHERE a.id = v_match_athlete_id
      AND a.user_id IS NULL
    RETURNING a.id
    INTO v_updated_athlete_id;
  EXCEPTION
    WHEN foreign_key_violation THEN
      RETURN QUERY SELECT
        'not_fully_provisioned'::text,
        NULL::uuid,
        'This account is not fully provisioned. Refresh after account setup completes.'::text;
      RETURN;
  END;

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

  SELECT inv.id
  INTO v_accept_invitation_id
  FROM public.athlete_onboarding_invitations inv
  WHERE inv.athlete_id = v_match_athlete_id
    AND inv.status IN ('sent', 'expired')
  ORDER BY inv.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_accept_invitation_id IS NOT NULL THEN
    UPDATE public.athlete_onboarding_invitations
    SET status = 'accepted',
        accepted_at = COALESCE(accepted_at, now()),
        accepted_user_id = v_uid
    WHERE id = v_accept_invitation_id;

    INSERT INTO public.athlete_onboarding_invitation_audit (
      invitation_id,
      athlete_id,
      operation,
      actor_user_id,
      previous_status,
      new_status,
      details
    ) VALUES (
      v_accept_invitation_id,
      v_match_athlete_id,
      'invitation_accepted_via_claim',
      v_uid,
      NULL,
      'accepted',
      jsonb_build_object('source', p_source)
    );
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

REVOKE ALL ON FUNCTION public.ensure_profile_for_auth_user(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_public_user_row(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_repair_link_candidate_account(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_search_link_candidates(text, integer, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_link_athlete_account(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_relink_athlete_account(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_my_athlete_identity(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_repair_link_candidate_account(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_link_candidates(text, integer, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_link_athlete_account(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_relink_athlete_account(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_my_athlete_identity(text) TO authenticated;

COMMIT;
