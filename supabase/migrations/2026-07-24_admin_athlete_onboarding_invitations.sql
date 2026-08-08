-- Admin athlete onboarding invitations and lifecycle.
-- Implements secure admin-controlled invitation send/resend/revoke and
-- integrates invitation acceptance into claim_my_athlete_identity().

BEGIN;

CREATE TABLE IF NOT EXISTS public.athlete_onboarding_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  invitation_email text NOT NULL,
  invitation_email_norm text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('sent', 'accepted', 'revoked', 'expired')),
  source text NOT NULL DEFAULT 'admin_portal',
  resend_of uuid REFERENCES public.athlete_onboarding_invitations(id) ON DELETE SET NULL,
  sent_by uuid,
  accepted_user_id uuid,
  expires_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_athlete_onboarding_invitations_athlete
  ON public.athlete_onboarding_invitations(athlete_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_athlete_onboarding_invitations_email_norm
  ON public.athlete_onboarding_invitations(invitation_email_norm);

CREATE INDEX IF NOT EXISTS idx_athlete_onboarding_invitations_status
  ON public.athlete_onboarding_invitations(status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_athlete_onboarding_invitations_one_active_sent
  ON public.athlete_onboarding_invitations(athlete_id)
  WHERE status = 'sent';

CREATE OR REPLACE FUNCTION public.set_athlete_onboarding_invitations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_athlete_onboarding_invitations_updated_at ON public.athlete_onboarding_invitations;
CREATE TRIGGER trg_athlete_onboarding_invitations_updated_at
BEFORE UPDATE ON public.athlete_onboarding_invitations
FOR EACH ROW
EXECUTE FUNCTION public.set_athlete_onboarding_invitations_updated_at();

CREATE TABLE IF NOT EXISTS public.athlete_onboarding_invitation_audit (
  id bigserial PRIMARY KEY,
  invitation_id uuid,
  athlete_id uuid NOT NULL,
  operation text NOT NULL,
  actor_user_id uuid,
  previous_status text,
  new_status text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_athlete_onboarding_invitation_audit_athlete
  ON public.athlete_onboarding_invitation_audit(athlete_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.refresh_athlete_invitation_expirations(
  p_athlete_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_athlete_id IS NULL THEN
    UPDATE public.athlete_onboarding_invitations
    SET status = 'expired'
    WHERE status = 'sent'
      AND expires_at <= now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    UPDATE public.athlete_onboarding_invitations
    SET status = 'expired'
    WHERE status = 'sent'
      AND athlete_id = p_athlete_id
      AND expires_at <= now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.refresh_athlete_invitation_expirations(uuid) IS
  'Marks overdue sent athlete invitations as expired.';

CREATE OR REPLACE FUNCTION public.admin_get_athlete_onboarding_states()
RETURNS TABLE (
  athlete_id uuid,
  invitation_id uuid,
  invitation_status text,
  invitation_email text,
  invitation_sent_at timestamptz,
  invitation_expires_at timestamptz,
  invitation_accepted_at timestamptz,
  invitation_revoked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM public.refresh_athlete_invitation_expirations(NULL);

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
    a.id AS athlete_id,
    i.id AS invitation_id,
    CASE
      WHEN a.user_id IS NOT NULL THEN 'Linked'
      WHEN i.id IS NULL THEN 'Not Invited'
      WHEN i.status = 'accepted' THEN 'Invitation Accepted'
      WHEN i.status = 'sent' THEN 'Invitation Sent'
      WHEN i.status = 'expired' THEN 'Expired'
      WHEN i.status = 'revoked' THEN 'Not Invited'
      ELSE 'Not Invited'
    END AS invitation_status,
    i.invitation_email,
    i.sent_at,
    i.expires_at,
    i.accepted_at,
    i.revoked_at
  FROM public.athletes a
  LEFT JOIN LATERAL (
    SELECT inv.*
    FROM public.athlete_onboarding_invitations inv
    WHERE inv.athlete_id = a.id
    ORDER BY inv.created_at DESC
    LIMIT 1
  ) i ON true;
END;
$$;

COMMENT ON FUNCTION public.admin_get_athlete_onboarding_states() IS
  'Admin-only listing of onboarding invitation state for all athletes.';

CREATE OR REPLACE FUNCTION public.admin_create_athlete_invitation(
  p_athlete_id uuid,
  p_invitation_base_url text,
  p_valid_for_hours integer DEFAULT 168,
  p_source text DEFAULT 'admin_portal'
)
RETURNS TABLE (
  status text,
  invitation_id uuid,
  athlete_id uuid,
  invitation_email text,
  invitation_url text,
  expires_at timestamptz,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_athlete_email text;
  v_athlete_name text;
  v_athlete_user_id uuid;
  v_token text;
  v_token_hash text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
  v_existing_invitation_id uuid;
  v_base_url text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_athlete_id IS NULL THEN
    RAISE EXCEPTION 'athlete_id is required';
  END IF;

  IF p_invitation_base_url IS NULL OR btrim(p_invitation_base_url) = '' THEN
    RAISE EXCEPTION 'invitation_base_url is required';
  END IF;

  IF p_valid_for_hours IS NULL OR p_valid_for_hours <= 0 OR p_valid_for_hours > 24 * 30 THEN
    RAISE EXCEPTION 'valid_for_hours must be between 1 and 720';
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

  SELECT a.email, a.name, a.user_id
  INTO v_athlete_email, v_athlete_name, v_athlete_user_id
  FROM public.athletes a
  WHERE a.id = p_athlete_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Athlete not found';
  END IF;

  IF v_athlete_user_id IS NOT NULL THEN
    RETURN QUERY SELECT
      'linked'::text,
      NULL::uuid,
      p_athlete_id,
      v_athlete_email,
      NULL::text,
      NULL::timestamptz,
      'Athlete is already linked and cannot be invited'::text;
    RETURN;
  END IF;

  IF v_athlete_email IS NULL OR btrim(v_athlete_email) = '' THEN
    RAISE EXCEPTION 'Athlete must have an email before invitation';
  END IF;

  PERFORM public.refresh_athlete_invitation_expirations(p_athlete_id);

  SELECT inv.id
  INTO v_existing_invitation_id
  FROM public.athlete_onboarding_invitations inv
  WHERE inv.athlete_id = p_athlete_id
    AND inv.status = 'sent'
  LIMIT 1
  FOR UPDATE;

  IF v_existing_invitation_id IS NOT NULL THEN
    RETURN QUERY SELECT
      'already_invited'::text,
      v_existing_invitation_id,
      p_athlete_id,
      v_athlete_email,
      NULL::text,
      NULL::timestamptz,
      'An active invitation already exists for this athlete'::text;
    RETURN;
  END IF;

  v_token := replace(replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires_at := now() + make_interval(hours => p_valid_for_hours);

  INSERT INTO public.athlete_onboarding_invitations (
    athlete_id,
    invitation_email,
    invitation_email_norm,
    token_hash,
    status,
    source,
    sent_by,
    expires_at,
    metadata
  ) VALUES (
    p_athlete_id,
    v_athlete_email,
    lower(btrim(v_athlete_email)),
    v_token_hash,
    'sent',
    COALESCE(NULLIF(btrim(p_source), ''), 'admin_portal'),
    v_actor,
    v_expires_at,
    jsonb_build_object('athlete_name', v_athlete_name)
  )
  RETURNING id
  INTO v_invitation_id;

  INSERT INTO public.athlete_onboarding_invitation_audit (
    invitation_id,
    athlete_id,
    operation,
    actor_user_id,
    previous_status,
    new_status,
    details
  ) VALUES (
    v_invitation_id,
    p_athlete_id,
    'invitation_sent',
    v_actor,
    NULL,
    'sent',
    jsonb_build_object('expires_at', v_expires_at, 'source', p_source)
  );

  v_base_url := btrim(p_invitation_base_url);

  RETURN QUERY SELECT
    'invited'::text,
    v_invitation_id,
    p_athlete_id,
    v_athlete_email,
    (v_base_url || CASE WHEN position('?' in v_base_url) > 0 THEN '&' ELSE '?' END ||
      'invite=' || v_token || '&athlete_id=' || p_athlete_id::text),
    v_expires_at,
    'Invitation created'::text;
END;
$$;

COMMENT ON FUNCTION public.admin_create_athlete_invitation(uuid, text, integer, text) IS
  'Admin-only creation of a secure onboarding invitation for an existing unlinked athlete.';

CREATE OR REPLACE FUNCTION public.admin_resend_athlete_invitation(
  p_athlete_id uuid,
  p_invitation_base_url text,
  p_valid_for_hours integer DEFAULT 168,
  p_source text DEFAULT 'admin_portal'
)
RETURNS TABLE (
  status text,
  invitation_id uuid,
  athlete_id uuid,
  invitation_email text,
  invitation_url text,
  expires_at timestamptz,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_prev_id uuid;
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

  PERFORM public.refresh_athlete_invitation_expirations(p_athlete_id);

  SELECT inv.id
  INTO v_prev_id
  FROM public.athlete_onboarding_invitations inv
  WHERE inv.athlete_id = p_athlete_id
    AND inv.status = 'sent'
  LIMIT 1
  FOR UPDATE;

  IF v_prev_id IS NOT NULL THEN
    UPDATE public.athlete_onboarding_invitations
    SET status = 'revoked', revoked_at = now(), revoked_reason = 'resent'
    WHERE id = v_prev_id;

    INSERT INTO public.athlete_onboarding_invitation_audit (
      invitation_id,
      athlete_id,
      operation,
      actor_user_id,
      previous_status,
      new_status,
      details
    ) VALUES (
      v_prev_id,
      p_athlete_id,
      'invitation_revoked_for_resend',
      v_actor,
      'sent',
      'revoked',
      jsonb_build_object('reason', 'resent')
    );
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.admin_create_athlete_invitation(
    p_athlete_id,
    p_invitation_base_url,
    p_valid_for_hours,
    p_source
  );
END;
$$;

COMMENT ON FUNCTION public.admin_resend_athlete_invitation(uuid, text, integer, text) IS
  'Admin-only resend flow: revoke active sent invitation and issue a new one.';

CREATE OR REPLACE FUNCTION public.admin_revoke_athlete_invitation(
  p_athlete_id uuid,
  p_reason text DEFAULT NULL,
  p_source text DEFAULT 'admin_portal'
)
RETURNS TABLE (
  status text,
  invitation_id uuid,
  athlete_id uuid,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_invitation_id uuid;
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

  PERFORM public.refresh_athlete_invitation_expirations(p_athlete_id);

  SELECT inv.id
  INTO v_invitation_id
  FROM public.athlete_onboarding_invitations inv
  WHERE inv.athlete_id = p_athlete_id
    AND inv.status = 'sent'
  LIMIT 1
  FOR UPDATE;

  IF v_invitation_id IS NULL THEN
    RETURN QUERY SELECT
      'no_active_invitation'::text,
      NULL::uuid,
      p_athlete_id,
      'No active invitation to revoke'::text;
    RETURN;
  END IF;

  UPDATE public.athlete_onboarding_invitations
  SET status = 'revoked',
      revoked_at = now(),
      revoked_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'revoked_by_admin')
  WHERE id = v_invitation_id;

  INSERT INTO public.athlete_onboarding_invitation_audit (
    invitation_id,
    athlete_id,
    operation,
    actor_user_id,
    previous_status,
    new_status,
    details
  ) VALUES (
    v_invitation_id,
    p_athlete_id,
    'invitation_revoked',
    v_actor,
    'sent',
    'revoked',
    jsonb_build_object(
      'reason', COALESCE(NULLIF(btrim(p_reason), ''), 'revoked_by_admin'),
      'source', p_source
    )
  );

  RETURN QUERY SELECT
    'revoked'::text,
    v_invitation_id,
    p_athlete_id,
    'Invitation revoked'::text;
END;
$$;

COMMENT ON FUNCTION public.admin_revoke_athlete_invitation(uuid, text, text) IS
  'Admin-only revoke for active sent onboarding invitations.';

-- Integrate onboarding invitation acceptance into existing claim function.
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

REVOKE ALL ON FUNCTION public.refresh_athlete_invitation_expirations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_athlete_onboarding_states() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_athlete_invitation(uuid, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_resend_athlete_invitation(uuid, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_athlete_invitation(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.refresh_athlete_invitation_expirations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_athlete_onboarding_states() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_athlete_invitation(uuid, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resend_athlete_invitation(uuid, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_athlete_invitation(uuid, text, text) TO authenticated;

COMMIT;
