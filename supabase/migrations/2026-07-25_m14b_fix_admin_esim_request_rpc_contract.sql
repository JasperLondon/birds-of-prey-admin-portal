-- Milestone 14 Phase 1B: fix admin_get_esim_requests result contract mismatch.
-- Scope: function contract typing only. No table recreation, no data changes.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_esim_requests(
  p_status text DEFAULT NULL,
  p_athlete_id uuid DEFAULT NULL,
  p_trip_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  athlete_id uuid,
  athlete_name text,
  athlete_email text,
  trip_id uuid,
  trip_name text,
  trip_start_date date,
  trip_end_date date,
  trip_status text,
  requested_by_user_id uuid,
  requested_by_email text,
  status text,
  destination_country_code text,
  residence_country_code text,
  eligibility_status text,
  international_travel boolean,
  athlete_notes text,
  admin_notes text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  reviewed_by_user_id uuid,
  reviewed_by_email text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_filter_status text := NULLIF(lower(btrim(COALESCE(p_status, ''))), '');
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  IF v_filter_status IS NOT NULL
     AND v_filter_status NOT IN ('requested', 'under_review', 'approved', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status filter';
  END IF;

  RETURN QUERY
  SELECT
    er.id::uuid,
    er.athlete_id::uuid,
    a.name::text AS athlete_name,
    a.email::text AS athlete_email,
    er.trip_id::uuid,
    t.name::text AS trip_name,
    t.start_date::date AS trip_start_date,
    t.end_date::date AS trip_end_date,
    t.status::text AS trip_status,
    er.requested_by_user_id::uuid,
    req_user.email::text AS requested_by_email,
    er.status::text,
    er.destination_country_code::text,
    er.residence_country_code::text,
    er.eligibility_status::text,
    er.international_travel::boolean,
    er.athlete_notes::text,
    er.admin_notes::text,
    er.requested_at::timestamptz,
    er.reviewed_at::timestamptz,
    er.approved_at::timestamptz,
    er.cancelled_at::timestamptz,
    er.cancellation_reason::text,
    er.reviewed_by_user_id::uuid,
    rev_user.email::text AS reviewed_by_email,
    er.created_at::timestamptz,
    er.updated_at::timestamptz
  FROM public.esim_requests er
  JOIN public.athletes a
    ON a.id = er.athlete_id
  JOIN public.trips t
    ON t.id = er.trip_id
  LEFT JOIN auth.users req_user
    ON req_user.id = er.requested_by_user_id
  LEFT JOIN auth.users rev_user
    ON rev_user.id = er.reviewed_by_user_id
  WHERE (v_filter_status IS NULL OR er.status::text = v_filter_status)
    AND (p_athlete_id IS NULL OR er.athlete_id = p_athlete_id)
    AND (p_trip_id IS NULL OR er.trip_id = p_trip_id)
  ORDER BY er.requested_at DESC;
END;
$$;

COMMENT ON FUNCTION public.admin_get_esim_requests(text, uuid, uuid) IS
  'Admin-only queue retrieval for eSIM requests with optional status/athlete/trip filters. Contract-cast to stable API types.';

REVOKE ALL ON FUNCTION public.admin_get_esim_requests(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_esim_requests(text, uuid, uuid) TO authenticated;

COMMIT;
