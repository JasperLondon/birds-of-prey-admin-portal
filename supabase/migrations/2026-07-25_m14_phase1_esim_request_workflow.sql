-- Milestone 14 Phase 1: internal eSIM request workflow and admin review queue.
-- Scope intentionally excludes provider ordering/provisioning/installation credentials.

BEGIN;

CREATE TABLE IF NOT EXISTS public.esim_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL,
  trip_id uuid NOT NULL,
  requested_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL,
  destination_country_code text,
  residence_country_code text,
  eligibility_status text,
  international_travel boolean,
  athlete_notes text,
  admin_notes text,
  reviewed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  approved_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT esim_requests_status_check CHECK (
    status IN ('requested', 'under_review', 'approved', 'cancelled')
  ),
  CONSTRAINT esim_requests_athlete_fk
    FOREIGN KEY (athlete_id)
    REFERENCES public.athletes(id)
    ON DELETE RESTRICT,
  CONSTRAINT esim_requests_trip_fk
    FOREIGN KEY (trip_id)
    REFERENCES public.trips(id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_esim_requests_athlete_status_date
  ON public.esim_requests (athlete_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_esim_requests_trip_status_date
  ON public.esim_requests (trip_id, status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_esim_requests_one_open_per_athlete_trip
  ON public.esim_requests (athlete_id, trip_id)
  WHERE status IN ('requested', 'under_review', 'approved');

CREATE TABLE IF NOT EXISTS public.esim_request_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.esim_requests(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT esim_request_status_history_to_status_check CHECK (
    to_status IN ('requested', 'under_review', 'approved', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_esim_request_status_history_request_date
  ON public.esim_request_status_history (request_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_esim_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_esim_requests_updated_at ON public.esim_requests;
CREATE TRIGGER trg_touch_esim_requests_updated_at
BEFORE UPDATE ON public.esim_requests
FOR EACH ROW
EXECUTE FUNCTION public.touch_esim_requests_updated_at();

CREATE OR REPLACE FUNCTION public.log_esim_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor_text text;
  v_actor uuid;
  v_reason text;
BEGIN
  v_actor_text := nullif(current_setting('app.esim_request_actor', true), '');
  IF v_actor_text IS NOT NULL THEN
    BEGIN
      v_actor := v_actor_text::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_actor := NULL;
    END;
  END IF;

  v_reason := nullif(current_setting('app.esim_request_reason', true), '');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.esim_request_status_history (
      request_id,
      from_status,
      to_status,
      changed_by_user_id,
      reason
    )
    VALUES (
      NEW.id,
      NULL,
      NEW.status,
      COALESCE(v_actor, NEW.requested_by_user_id),
      v_reason
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.esim_request_status_history (
      request_id,
      from_status,
      to_status,
      changed_by_user_id,
      reason
    )
    VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      COALESCE(v_actor, NEW.reviewed_by_user_id, NEW.requested_by_user_id),
      COALESCE(v_reason, NEW.cancellation_reason)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_esim_request_status_change ON public.esim_requests;
CREATE TRIGGER trg_log_esim_request_status_change
AFTER INSERT OR UPDATE ON public.esim_requests
FOR EACH ROW
EXECUTE FUNCTION public.log_esim_request_status_change();

CREATE OR REPLACE FUNCTION public.cancel_open_esim_requests_for_cancelled_trip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND lower(COALESCE(NEW.status, '')) = 'cancelled'
     AND lower(COALESCE(OLD.status, '')) <> 'cancelled' THEN
    PERFORM set_config('app.esim_request_actor', coalesce(auth.uid()::text, ''), true);
    PERFORM set_config('app.esim_request_reason', 'trip_cancelled', true);

    UPDATE public.esim_requests er
    SET
      status = 'cancelled',
      reviewed_by_user_id = coalesce(auth.uid(), er.reviewed_by_user_id),
      reviewed_at = coalesce(er.reviewed_at, now()),
      cancelled_at = now(),
      cancellation_reason = coalesce(er.cancellation_reason, 'trip_cancelled'),
      admin_notes = CASE
        WHEN er.admin_notes IS NULL OR btrim(er.admin_notes) = ''
          THEN 'Auto-cancelled because trip status changed to cancelled.'
        ELSE er.admin_notes
      END
    WHERE er.trip_id = NEW.id
      AND er.status IN ('requested', 'under_review', 'approved');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_open_esim_requests_for_cancelled_trip ON public.trips;
CREATE TRIGGER trg_cancel_open_esim_requests_for_cancelled_trip
AFTER UPDATE OF status ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.cancel_open_esim_requests_for_cancelled_trip();

ALTER TABLE public.esim_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esim_request_status_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS esim_requests_select_athlete_or_admin ON public.esim_requests';
  EXECUTE 'CREATE POLICY esim_requests_select_athlete_or_admin ON public.esim_requests FOR SELECT TO authenticated USING (athlete_id = public.current_athlete_id() OR public.is_admin())';

  EXECUTE 'DROP POLICY IF EXISTS esim_requests_insert_admin_only ON public.esim_requests';
  EXECUTE 'CREATE POLICY esim_requests_insert_admin_only ON public.esim_requests FOR INSERT TO authenticated WITH CHECK (public.is_admin())';

  EXECUTE 'DROP POLICY IF EXISTS esim_requests_update_admin_only ON public.esim_requests';
  EXECUTE 'CREATE POLICY esim_requests_update_admin_only ON public.esim_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';

  EXECUTE 'DROP POLICY IF EXISTS esim_requests_delete_admin_only ON public.esim_requests';
  EXECUTE 'CREATE POLICY esim_requests_delete_admin_only ON public.esim_requests FOR DELETE TO authenticated USING (public.is_admin())';

  EXECUTE 'DROP POLICY IF EXISTS esim_request_status_history_select_athlete_or_admin ON public.esim_request_status_history';
  EXECUTE 'CREATE POLICY esim_request_status_history_select_athlete_or_admin ON public.esim_request_status_history FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.esim_requests er WHERE er.id = esim_request_status_history.request_id AND er.athlete_id = public.current_athlete_id()))';

  EXECUTE 'DROP POLICY IF EXISTS esim_request_status_history_insert_admin_only ON public.esim_request_status_history';
  EXECUTE 'CREATE POLICY esim_request_status_history_insert_admin_only ON public.esim_request_status_history FOR INSERT TO authenticated WITH CHECK (public.is_admin())';

  EXECUTE 'DROP POLICY IF EXISTS esim_request_status_history_update_admin_only ON public.esim_request_status_history';
  EXECUTE 'CREATE POLICY esim_request_status_history_update_admin_only ON public.esim_request_status_history FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';

  EXECUTE 'DROP POLICY IF EXISTS esim_request_status_history_delete_admin_only ON public.esim_request_status_history';
  EXECUTE 'CREATE POLICY esim_request_status_history_delete_admin_only ON public.esim_request_status_history FOR DELETE TO authenticated USING (public.is_admin())';
END
$$;

CREATE OR REPLACE FUNCTION public.request_my_trip_esim(
  p_trip_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  athlete_id uuid,
  trip_id uuid,
  status text,
  destination_country_code text,
  residence_country_code text,
  eligibility_status text,
  international_travel boolean,
  athlete_notes text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_athlete_id uuid;
  v_trip_assigned boolean := false;
  v_existing public.esim_requests%ROWTYPE;
  v_new public.esim_requests%ROWTYPE;
  v_awareness record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_trip_id IS NULL THEN
    RAISE EXCEPTION 'trip_id is required';
  END IF;

  IF to_regprocedure('public.current_athlete_id()') IS NOT NULL THEN
    SELECT public.current_athlete_id() INTO v_athlete_id;
  ELSE
    SELECT a.id
    INTO v_athlete_id
    FROM public.athletes a
    WHERE a.user_id = v_actor
    LIMIT 1;
  END IF;

  IF v_athlete_id IS NULL THEN
    RAISE EXCEPTION 'No linked athlete found for current user';
  END IF;

  IF to_regclass('public.trip_athletes') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'trip_athletes' AND column_name = 'trip_id'
     )
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'trip_athletes' AND column_name = 'athlete_id'
     ) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.trip_athletes ta
      WHERE ta.trip_id = p_trip_id
        AND ta.athlete_id = v_athlete_id
    )
    INTO v_trip_assigned;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = 'athlete_id'
  ) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = p_trip_id
        AND t.athlete_id = v_athlete_id
    )
    INTO v_trip_assigned;
  END IF;

  IF NOT v_trip_assigned THEN
    RAISE EXCEPTION 'Trip is not assigned to this athlete';
  END IF;

  SELECT *
  INTO v_awareness
  FROM public.get_my_travel_awareness() ta
  WHERE ta.trip_id = p_trip_id
  LIMIT 1;

  IF v_awareness.trip_id IS NULL THEN
    RAISE EXCEPTION 'No travel awareness result found for trip';
  END IF;

  IF v_awareness.eligibility_status IS DISTINCT FROM 'eligible'
     OR v_awareness.esim_recommended IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'This trip is not eligible for an MWD eSIM request';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.esim_requests er
  WHERE er.athlete_id = v_athlete_id
    AND er.trip_id = p_trip_id
    AND er.status IN ('requested', 'under_review', 'approved')
  ORDER BY er.created_at DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.athlete_id,
      v_existing.trip_id,
      v_existing.status,
      v_existing.destination_country_code,
      v_existing.residence_country_code,
      v_existing.eligibility_status,
      v_existing.international_travel,
      v_existing.athlete_notes,
      v_existing.requested_at,
      v_existing.reviewed_at,
      v_existing.approved_at,
      v_existing.cancelled_at,
      v_existing.cancellation_reason,
      v_existing.created_at,
      v_existing.updated_at;
    RETURN;
  END IF;

  PERFORM set_config('app.esim_request_actor', v_actor::text, true);
  PERFORM set_config('app.esim_request_reason', 'request_submitted', true);

  INSERT INTO public.esim_requests (
    athlete_id,
    trip_id,
    requested_by_user_id,
    status,
    destination_country_code,
    residence_country_code,
    eligibility_status,
    international_travel,
    athlete_notes
  )
  VALUES (
    v_athlete_id,
    p_trip_id,
    v_actor,
    'requested',
    v_awareness.destination_country_code,
    v_awareness.athlete_residence_country_code,
    v_awareness.eligibility_status,
    v_awareness.international_travel,
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING * INTO v_new;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (
        athlete_id,
        type,
        message,
        read
      )
      VALUES (
        v_athlete_id,
        'esim_request_submitted',
        'Your eSIM request has been submitted.',
        false
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN QUERY
  SELECT
    v_new.id,
    v_new.athlete_id,
    v_new.trip_id,
    v_new.status,
    v_new.destination_country_code,
    v_new.residence_country_code,
    v_new.eligibility_status,
    v_new.international_travel,
    v_new.athlete_notes,
    v_new.requested_at,
    v_new.reviewed_at,
    v_new.approved_at,
    v_new.cancelled_at,
    v_new.cancellation_reason,
    v_new.created_at,
    v_new.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_esim_requests()
RETURNS TABLE (
  id uuid,
  athlete_id uuid,
  trip_id uuid,
  trip_name text,
  trip_start_date date,
  trip_end_date date,
  trip_status text,
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
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    er.id,
    er.athlete_id,
    er.trip_id,
    t.name AS trip_name,
    t.start_date AS trip_start_date,
    t.end_date AS trip_end_date,
    t.status AS trip_status,
    er.status,
    er.destination_country_code,
    er.residence_country_code,
    er.eligibility_status,
    er.international_travel,
    er.athlete_notes,
    er.admin_notes,
    er.requested_at,
    er.reviewed_at,
    er.approved_at,
    er.cancelled_at,
    er.cancellation_reason,
    er.created_at,
    er.updated_at
  FROM public.esim_requests er
  JOIN public.trips t
    ON t.id = er.trip_id
  WHERE er.athlete_id = public.current_athlete_id()
  ORDER BY er.requested_at DESC;
$$;

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
    er.id,
    er.athlete_id,
    a.name AS athlete_name,
    a.email AS athlete_email,
    er.trip_id,
    t.name AS trip_name,
    t.start_date AS trip_start_date,
    t.end_date AS trip_end_date,
    t.status AS trip_status,
    er.requested_by_user_id,
    req_user.email AS requested_by_email,
    er.status,
    er.destination_country_code,
    er.residence_country_code,
    er.eligibility_status,
    er.international_travel,
    er.athlete_notes,
    er.admin_notes,
    er.requested_at,
    er.reviewed_at,
    er.approved_at,
    er.cancelled_at,
    er.cancellation_reason,
    er.reviewed_by_user_id,
    rev_user.email AS reviewed_by_email,
    er.created_at,
    er.updated_at
  FROM public.esim_requests er
  JOIN public.athletes a
    ON a.id = er.athlete_id
  JOIN public.trips t
    ON t.id = er.trip_id
  LEFT JOIN auth.users req_user
    ON req_user.id = er.requested_by_user_id
  LEFT JOIN auth.users rev_user
    ON rev_user.id = er.reviewed_by_user_id
  WHERE (v_filter_status IS NULL OR er.status = v_filter_status)
    AND (p_athlete_id IS NULL OR er.athlete_id = p_athlete_id)
    AND (p_trip_id IS NULL OR er.trip_id = p_trip_id)
  ORDER BY er.requested_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_esim_request(
  p_request_id uuid,
  p_action text,
  p_notes text DEFAULT NULL,
  p_cancellation_reason text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  status text,
  reviewed_at timestamptz,
  approved_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  admin_notes text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_action text := lower(btrim(COALESCE(p_action, '')));
  v_reason text := NULLIF(btrim(COALESCE(p_cancellation_reason, '')), '');
  v_review_note text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_request public.esim_requests%ROWTYPE;
  v_updated public.esim_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id is required';
  END IF;

  IF v_action NOT IN ('under_review', 'approved', 'cancelled') THEN
    RAISE EXCEPTION 'Action must be under_review, approved, or cancelled';
  END IF;

  SELECT *
  INTO v_request
  FROM public.esim_requests er
  WHERE er.id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled requests cannot be reviewed further';
  END IF;

  IF v_action = 'under_review' AND v_request.status = 'approved' THEN
    RAISE EXCEPTION 'Approved requests cannot be moved back to under_review';
  END IF;

  IF v_action = 'cancelled' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Cancellation reason is required';
  END IF;

  PERFORM set_config('app.esim_request_actor', v_actor::text, true);
  PERFORM set_config(
    'app.esim_request_reason',
    CASE
      WHEN v_action = 'cancelled' THEN v_reason
      WHEN v_review_note IS NOT NULL THEN v_review_note
      ELSE concat('status_', v_action)
    END,
    true
  );

  UPDATE public.esim_requests er
  SET
    status = v_action,
    reviewed_by_user_id = v_actor,
    reviewed_at = now(),
    approved_at = CASE
      WHEN v_action = 'approved' THEN COALESCE(er.approved_at, now())
      ELSE er.approved_at
    END,
    cancelled_at = CASE
      WHEN v_action = 'cancelled' THEN COALESCE(er.cancelled_at, now())
      ELSE er.cancelled_at
    END,
    cancellation_reason = CASE
      WHEN v_action = 'cancelled' THEN v_reason
      ELSE er.cancellation_reason
    END,
    admin_notes = CASE
      WHEN v_review_note IS NULL THEN er.admin_notes
      WHEN er.admin_notes IS NULL OR btrim(er.admin_notes) = '' THEN v_review_note
      ELSE er.admin_notes || E'\n' || v_review_note
    END
  WHERE er.id = p_request_id
  RETURNING * INTO v_updated;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (
        athlete_id,
        type,
        message,
        read
      )
      VALUES (
        v_updated.athlete_id,
        CASE v_updated.status
          WHEN 'under_review' THEN 'esim_request_under_review'
          WHEN 'approved' THEN 'esim_request_approved'
          WHEN 'cancelled' THEN 'esim_request_cancelled'
          ELSE 'esim_request_update'
        END,
        CASE v_updated.status
          WHEN 'under_review' THEN 'Your eSIM request is under review.'
          WHEN 'approved' THEN 'Your eSIM request has been approved.'
          WHEN 'cancelled' THEN 'Your eSIM request was cancelled.'
          ELSE 'Your eSIM request was updated.'
        END,
        false
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN QUERY
  SELECT
    v_updated.id,
    v_updated.status,
    v_updated.reviewed_at,
    v_updated.approved_at,
    v_updated.cancelled_at,
    v_updated.cancellation_reason,
    v_updated.admin_notes,
    v_updated.updated_at;
END;
$$;

COMMENT ON FUNCTION public.request_my_trip_esim(uuid, text) IS
  'Creates an idempotent athlete eSIM request for an eligible assigned international trip.';
COMMENT ON FUNCTION public.get_my_esim_requests() IS
  'Returns eSIM requests for the authenticated athlete with trip summary fields.';
COMMENT ON FUNCTION public.admin_get_esim_requests(text, uuid, uuid) IS
  'Admin-only queue retrieval for eSIM requests with optional status/athlete/trip filters.';
COMMENT ON FUNCTION public.admin_review_esim_request(uuid, text, text, text) IS
  'Admin-only review action for eSIM requests (under_review, approved, cancelled).';

REVOKE ALL ON FUNCTION public.request_my_trip_esim(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_esim_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_esim_requests(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_review_esim_request(uuid, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_my_trip_esim(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_esim_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_esim_requests(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_esim_request(uuid, text, text, text) TO authenticated;

COMMIT;
