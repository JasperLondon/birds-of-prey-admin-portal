-- Non-destructive contracts RLS policies.
-- Goal: assigned athletes can view/update only their own contracts.
--
-- This assumes contracts.athlete_id references athletes.id and athletes.user_id links
-- to auth.users.id. Includes a direct-match fallback for legacy rows.

ALTER POLICY "Athletes can view assigned contracts"
  ON contracts
  USING (
    athlete_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM athletes a
      WHERE a.id = contracts.athlete_id
        AND a.user_id = auth.uid()
    )
  );

ALTER POLICY "Athletes can update assigned contracts"
  ON contracts
  USING (
    athlete_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM athletes a
      WHERE a.id = contracts.athlete_id
        AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    athlete_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM athletes a
      WHERE a.id = contracts.athlete_id
        AND a.user_id = auth.uid()
    )
  );