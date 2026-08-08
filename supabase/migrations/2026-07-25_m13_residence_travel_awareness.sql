-- Milestone 13: canonical athlete residence/home fields, trip destination metadata,
-- and travel awareness eligibility RPC.
--
-- Safety goals:
-- - Forward-only additions.
-- - Preserve all existing rows/links/trips.
-- - No backfill and no inference.
-- - Nullable columns for safe rollout.

BEGIN;

ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS residence_country_code text,
  ADD COLUMN IF NOT EXISTS home_timezone text,
  ADD COLUMN IF NOT EXISTS preferred_airport_code text,
  ADD COLUMN IF NOT EXISTS nationality_country_code text,
  ADD COLUMN IF NOT EXISTS home_city text,
  ADD COLUMN IF NOT EXISTS home_region text;

ALTER TABLE public.athletes
  DROP CONSTRAINT IF EXISTS athletes_residence_country_code_format;
ALTER TABLE public.athletes
  ADD CONSTRAINT athletes_residence_country_code_format
  CHECK (
    residence_country_code IS NULL
    OR residence_country_code ~ '^[A-Z]{2}$'
  );

ALTER TABLE public.athletes
  DROP CONSTRAINT IF EXISTS athletes_nationality_country_code_format;
ALTER TABLE public.athletes
  ADD CONSTRAINT athletes_nationality_country_code_format
  CHECK (
    nationality_country_code IS NULL
    OR nationality_country_code ~ '^[A-Z]{2}$'
  );

ALTER TABLE public.athletes
  DROP CONSTRAINT IF EXISTS athletes_preferred_airport_code_format;
ALTER TABLE public.athletes
  ADD CONSTRAINT athletes_preferred_airport_code_format
  CHECK (
    preferred_airport_code IS NULL
    OR preferred_airport_code ~ '^[A-Z]{3}$'
  );

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS destination_country_code text,
  ADD COLUMN IF NOT EXISTS destination_timezone text,
  ADD COLUMN IF NOT EXISTS destination_airport_code text;

ALTER TABLE public.trips
  DROP CONSTRAINT IF EXISTS trips_destination_country_code_format;
ALTER TABLE public.trips
  ADD CONSTRAINT trips_destination_country_code_format
  CHECK (
    destination_country_code IS NULL
    OR destination_country_code ~ '^[A-Z]{2}$'
  );

ALTER TABLE public.trips
  DROP CONSTRAINT IF EXISTS trips_destination_airport_code_format;
ALTER TABLE public.trips
  ADD CONSTRAINT trips_destination_airport_code_format
  CHECK (
    destination_airport_code IS NULL
    OR destination_airport_code ~ '^[A-Z]{3}$'
  );

CREATE INDEX IF NOT EXISTS idx_trips_destination_country_code
  ON public.trips (destination_country_code)
  WHERE destination_country_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_my_travel_awareness()
RETURNS TABLE (
  trip_id uuid,
  trip_name text,
  start_date date,
  end_date date,
  destination_country_code text,
  athlete_residence_country_code text,
  international_travel boolean,
  esim_recommended boolean,
  eligibility_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_athlete_id uuid;
  v_has_trip_athletes boolean := false;
  v_has_trips_athlete_id boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF to_regprocedure('public.current_athlete_id()') IS NOT NULL THEN
    SELECT public.current_athlete_id() INTO v_athlete_id;
  ELSE
    SELECT a.id
    INTO v_athlete_id
    FROM public.athletes a
    WHERE a.user_id = v_uid
    LIMIT 1;
  END IF;

  IF v_athlete_id IS NULL THEN
    RETURN;
  END IF;

  SELECT (
    to_regclass('public.trip_athletes') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'trip_athletes'
        AND column_name = 'trip_id'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'trip_athletes'
        AND column_name = 'athlete_id'
    )
  )
  INTO v_has_trip_athletes;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trips'
      AND column_name = 'athlete_id'
  )
  INTO v_has_trips_athlete_id;

  IF v_has_trip_athletes THEN
    RETURN QUERY
    SELECT
      t.id AS trip_id,
      t.name AS trip_name,
      t.start_date,
      t.end_date,
      t.destination_country_code,
      a.residence_country_code AS athlete_residence_country_code,
      (
        t.destination_country_code IS NOT NULL
        AND a.residence_country_code IS NOT NULL
        AND lower(COALESCE(t.status, '')) IN ('planned', 'upcoming', 'active')
        AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
        AND t.destination_country_code <> a.residence_country_code
      ) AS international_travel,
      (
        t.destination_country_code IS NOT NULL
        AND a.residence_country_code IS NOT NULL
        AND lower(COALESCE(t.status, '')) IN ('planned', 'upcoming', 'active')
        AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
        AND t.destination_country_code <> a.residence_country_code
      ) AS esim_recommended,
      CASE
        WHEN t.destination_country_code IS NULL OR a.residence_country_code IS NULL THEN 'insufficient_data'
        WHEN lower(COALESCE(t.status, '')) NOT IN ('planned', 'upcoming', 'active') THEN 'not_eligible'
        WHEN t.end_date IS NOT NULL AND t.end_date < CURRENT_DATE THEN 'not_eligible'
        WHEN t.destination_country_code <> a.residence_country_code THEN 'eligible'
        ELSE 'not_eligible'
      END AS eligibility_status
    FROM public.trip_athletes ta
    JOIN public.trips t
      ON t.id = ta.trip_id
    JOIN public.athletes a
      ON a.id = v_athlete_id
    WHERE ta.athlete_id = v_athlete_id
    ORDER BY t.start_date NULLS LAST, t.end_date NULLS LAST, t.id;

    RETURN;
  END IF;

  IF v_has_trips_athlete_id THEN
    RETURN QUERY
    SELECT
      t.id AS trip_id,
      t.name AS trip_name,
      t.start_date,
      t.end_date,
      t.destination_country_code,
      a.residence_country_code AS athlete_residence_country_code,
      (
        t.destination_country_code IS NOT NULL
        AND a.residence_country_code IS NOT NULL
        AND lower(COALESCE(t.status, '')) IN ('planned', 'upcoming', 'active')
        AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
        AND t.destination_country_code <> a.residence_country_code
      ) AS international_travel,
      (
        t.destination_country_code IS NOT NULL
        AND a.residence_country_code IS NOT NULL
        AND lower(COALESCE(t.status, '')) IN ('planned', 'upcoming', 'active')
        AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
        AND t.destination_country_code <> a.residence_country_code
      ) AS esim_recommended,
      CASE
        WHEN t.destination_country_code IS NULL OR a.residence_country_code IS NULL THEN 'insufficient_data'
        WHEN lower(COALESCE(t.status, '')) NOT IN ('planned', 'upcoming', 'active') THEN 'not_eligible'
        WHEN t.end_date IS NOT NULL AND t.end_date < CURRENT_DATE THEN 'not_eligible'
        WHEN t.destination_country_code <> a.residence_country_code THEN 'eligible'
        ELSE 'not_eligible'
      END AS eligibility_status
    FROM public.trips t
    JOIN public.athletes a
      ON a.id = v_athlete_id
    WHERE t.athlete_id = v_athlete_id
    ORDER BY t.start_date NULLS LAST, t.end_date NULLS LAST, t.id;

    RETURN;
  END IF;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.get_my_travel_awareness() IS
  'Returns travel-awareness eligibility rows for the authenticated athlete from assigned trips without persisting derived travel state.';

REVOKE ALL ON FUNCTION public.get_my_travel_awareness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_travel_awareness() TO authenticated;

COMMIT;
