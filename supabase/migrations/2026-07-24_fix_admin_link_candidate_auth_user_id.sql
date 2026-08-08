-- Fix identity-link candidate identifier ambiguity and harden link RPC error handling.
-- This migration keeps onboarding behavior unchanged and only updates identity-link RPCs.

BEGIN;

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
  athlete_id uuid,
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
    )
    INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS auth_user_id,
    p.full_name,
    p.email,
    a.id AS athlete_id,
    (a.id IS NOT NULL) AS linked
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
  'Admin-only search over profiles for athlete account linking. Returns explicit auth_user_id.';

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

  SELECT a.user_id
  INTO v_existing_user_id
  FROM public.athletes a
  WHERE a.id = p_athlete_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Athlete not found';
  END IF;

  PERFORM 1
  FROM auth.users u
  WHERE u.id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'target_user_not_found'::text, p_athlete_id, v_existing_user_id, NULL::uuid,
      'Target auth user does not exist'::text;
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

  BEGIN
    UPDATE public.athletes a
    SET user_id = p_target_user_id
    WHERE a.id = p_athlete_id
      AND a.user_id IS NULL;
  EXCEPTION
    WHEN foreign_key_violation THEN
      RETURN QUERY SELECT 'target_user_not_found'::text, p_athlete_id, v_existing_user_id, NULL::uuid,
        'Target auth user does not exist'::text;
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

  RETURN QUERY SELECT 'linked'::text, p_athlete_id, NULL::uuid, p_target_user_id,
    'Athlete linked successfully'::text;
END;
$$;

COMMENT ON FUNCTION public.admin_link_athlete_account(uuid, uuid, text) IS
  'Admin-only operation to link an existing athlete to an existing auth user with controlled missing-user status.';

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

  SELECT a.user_id
  INTO v_existing_user_id
  FROM public.athletes a
  WHERE a.id = p_athlete_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Athlete not found';
  END IF;

  PERFORM 1
  FROM auth.users u
  WHERE u.id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'target_user_not_found'::text, p_athlete_id, v_existing_user_id, NULL::uuid,
      'Target auth user does not exist'::text;
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
    RETURN QUERY SELECT 'target_already_linked_elsewhere'::text, p_athlete_id, v_existing_user_id, NULL::uuid,
      'Target user is already linked to another athlete'::text;
    RETURN;
  END IF;

  IF v_existing_user_id = p_target_user_id THEN
    RETURN QUERY SELECT 'already_linked'::text, p_athlete_id, v_existing_user_id, p_target_user_id,
      'Athlete already linked to this account'::text;
    RETURN;
  END IF;

  BEGIN
    UPDATE public.athletes a
    SET user_id = p_target_user_id
    WHERE a.id = p_athlete_id;
  EXCEPTION
    WHEN foreign_key_violation THEN
      RETURN QUERY SELECT 'target_user_not_found'::text, p_athlete_id, v_existing_user_id, NULL::uuid,
        'Target auth user does not exist'::text;
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

  RETURN QUERY SELECT 'relinked'::text, p_athlete_id, v_existing_user_id, p_target_user_id,
    'Athlete relinked successfully'::text;
END;
$$;

COMMENT ON FUNCTION public.admin_relink_athlete_account(uuid, uuid, text) IS
  'Admin-only operation to atomically move an athlete link to an auth user with controlled missing-user status.';

COMMIT;
