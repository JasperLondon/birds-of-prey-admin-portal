-- Allow authenticated users to insert event_rsvps
CREATE POLICY "Allow insert for authenticated"
  ON event_rsvps
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow authenticated users to select their own event_rsvps
CREATE POLICY "Allow select for authenticated"
  ON event_rsvps
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Allow authenticated users to update their own event_rsvps
CREATE POLICY "Allow update for authenticated"
  ON event_rsvps
  FOR UPDATE
  USING (auth.uid()::uuid = athlete_id);

-- Allow authenticated users to delete their own event_rsvps
CREATE POLICY "Allow delete for authenticated"
  ON event_rsvps
  FOR DELETE
  USING (auth.uid()::uuid = athlete_id);
