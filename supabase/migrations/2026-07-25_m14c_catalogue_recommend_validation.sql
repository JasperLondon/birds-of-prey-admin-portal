-- Milestone 14 Phase 2: eSIM Go catalogue cache, plan recommendation/selection,
-- and no-charge order validation storage.
--
-- Safety scope:
-- - No paid order placement.
-- - No eSIM provisioning/assignment.
-- - No installation credential storage.

BEGIN;

CREATE TABLE IF NOT EXISTS public.esim_catalog_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_bundle_id text NOT NULL,
  name text NOT NULL,
  countries text[] NOT NULL DEFAULT '{}'::text[],
  region text,
  data_amount_bytes bigint,
  data_amount_display text NOT NULL,
  validity_days integer NOT NULL,
  price_amount numeric,
  price_currency text,
  plan_type text NOT NULL,
  provider_payload_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT esim_catalog_plans_provider_bundle_id_key UNIQUE (provider_bundle_id),
  CONSTRAINT esim_catalog_plans_validity_days_check CHECK (validity_days > 0),
  CONSTRAINT esim_catalog_plans_plan_type_check CHECK (plan_type IN ('destination', 'regional', 'global', 'unknown'))
);

CREATE INDEX IF NOT EXISTS idx_esim_catalog_plans_provider_active
  ON public.esim_catalog_plans (provider, is_active, expires_at DESC, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_esim_catalog_plans_validity
  ON public.esim_catalog_plans (validity_days);

CREATE INDEX IF NOT EXISTS idx_esim_catalog_plans_countries_gin
  ON public.esim_catalog_plans
  USING gin (countries);

CREATE TABLE IF NOT EXISTS public.esim_request_plan_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.esim_requests(id) ON DELETE CASCADE,
  catalog_plan_id uuid NOT NULL REFERENCES public.esim_catalog_plans(id) ON DELETE RESTRICT,
  selection_type text NOT NULL,
  selected_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recommendation_reason text,
  destination_country_code text NOT NULL,
  trip_duration_days integer NOT NULL CHECK (trip_duration_days > 0),
  estimated_price_amount numeric,
  estimated_price_currency text,
  provider_bundle_id_snapshot text NOT NULL,
  plan_name_snapshot text NOT NULL,
  data_allowance_snapshot text NOT NULL,
  validity_days_snapshot integer NOT NULL CHECK (validity_days_snapshot > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT esim_request_plan_selections_selection_type_check CHECK (
    selection_type IN ('recommended', 'selected')
  )
);

CREATE INDEX IF NOT EXISTS idx_esim_request_plan_selections_request
  ON public.esim_request_plan_selections (request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_esim_request_plan_selections_catalog
  ON public.esim_request_plan_selections (catalog_plan_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_esim_request_plan_selected_one_current
  ON public.esim_request_plan_selections (request_id)
  WHERE selection_type = 'selected';

CREATE UNIQUE INDEX IF NOT EXISTS uq_esim_request_plan_recommended_one_current
  ON public.esim_request_plan_selections (request_id)
  WHERE selection_type = 'recommended';

CREATE TABLE IF NOT EXISTS public.esim_order_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.esim_requests(id) ON DELETE CASCADE,
  plan_selection_id uuid NOT NULL REFERENCES public.esim_request_plan_selections(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  status text NOT NULL,
  provider_order_reference text,
  validated_price_amount numeric,
  validated_price_currency text,
  balance_sufficient boolean,
  provider_error_code text,
  provider_error_message text,
  requested_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT esim_order_validations_status_check CHECK (status IN ('pending', 'passed', 'failed')),
  CONSTRAINT esim_order_validations_idempotency_key_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_esim_order_validations_request
  ON public.esim_order_validations (request_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_esim_order_validations_status
  ON public.esim_order_validations (status, requested_at DESC);

CREATE OR REPLACE FUNCTION public.touch_esim_phase2_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_esim_catalog_plans_updated_at ON public.esim_catalog_plans;
CREATE TRIGGER trg_touch_esim_catalog_plans_updated_at
BEFORE UPDATE ON public.esim_catalog_plans
FOR EACH ROW
EXECUTE FUNCTION public.touch_esim_phase2_updated_at();

DROP TRIGGER IF EXISTS trg_touch_esim_request_plan_selections_updated_at ON public.esim_request_plan_selections;
CREATE TRIGGER trg_touch_esim_request_plan_selections_updated_at
BEFORE UPDATE ON public.esim_request_plan_selections
FOR EACH ROW
EXECUTE FUNCTION public.touch_esim_phase2_updated_at();

DROP TRIGGER IF EXISTS trg_touch_esim_order_validations_updated_at ON public.esim_order_validations;
CREATE TRIGGER trg_touch_esim_order_validations_updated_at
BEFORE UPDATE ON public.esim_order_validations
FOR EACH ROW
EXECUTE FUNCTION public.touch_esim_phase2_updated_at();

ALTER TABLE public.esim_catalog_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esim_request_plan_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esim_order_validations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS esim_catalog_plans_select_admin_only ON public.esim_catalog_plans';
  EXECUTE 'CREATE POLICY esim_catalog_plans_select_admin_only ON public.esim_catalog_plans FOR SELECT TO authenticated USING (public.is_admin())';

  EXECUTE 'DROP POLICY IF EXISTS esim_request_plan_selections_select_admin_only ON public.esim_request_plan_selections';
  EXECUTE 'CREATE POLICY esim_request_plan_selections_select_admin_only ON public.esim_request_plan_selections FOR SELECT TO authenticated USING (public.is_admin())';

  EXECUTE 'DROP POLICY IF EXISTS esim_order_validations_select_admin_only ON public.esim_order_validations';
  EXECUTE 'CREATE POLICY esim_order_validations_select_admin_only ON public.esim_order_validations FOR SELECT TO authenticated USING (public.is_admin())';
END
$$;

CREATE OR REPLACE FUNCTION public.get_my_esim_plan_summary()
RETURNS TABLE (
  request_id uuid,
  trip_id uuid,
  request_status text,
  plan_selected boolean,
  validation_status text,
  validation_completed_at timestamptz,
  readiness_summary text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth, pg_temp
AS $$
  WITH own_requests AS (
    SELECT er.id, er.trip_id, er.status
    FROM public.esim_requests er
    WHERE er.athlete_id = public.current_athlete_id()
  ),
  selected_plan AS (
    SELECT
      s.request_id,
      true AS plan_selected
    FROM public.esim_request_plan_selections s
    WHERE s.selection_type = 'selected'
  ),
  latest_validation AS (
    SELECT DISTINCT ON (v.request_id)
      v.request_id,
      v.status,
      v.completed_at
    FROM public.esim_order_validations v
    ORDER BY v.request_id, v.requested_at DESC
  )
  SELECT
    r.id AS request_id,
    r.trip_id,
    r.status::text AS request_status,
    COALESCE(sp.plan_selected, false) AS plan_selected,
    lv.status::text AS validation_status,
    lv.completed_at AS validation_completed_at,
    CASE
      WHEN r.status <> 'approved' THEN 'Awaiting approval'
      WHEN COALESCE(sp.plan_selected, false) = false THEN 'Approved - awaiting plan selection'
      WHEN lv.status = 'passed' THEN 'Preparing for provisioning'
      WHEN lv.status = 'failed' THEN 'Plan selected - validation failed'
      WHEN lv.status = 'pending' THEN 'Plan selected - validating'
      ELSE 'Plan selected - awaiting validation'
    END AS readiness_summary
  FROM own_requests r
  LEFT JOIN selected_plan sp
    ON sp.request_id = r.id
  LEFT JOIN latest_validation lv
    ON lv.request_id = r.id
  ORDER BY r.id;
$$;

COMMENT ON FUNCTION public.get_my_esim_plan_summary() IS
  'Athlete-safe readiness summary for own eSIM requests without exposing catalogue internals or provider secrets.';

REVOKE ALL ON FUNCTION public.get_my_esim_plan_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_esim_plan_summary() TO authenticated;

COMMIT;
