-- notifications_reminder.sql: Add reminder_sent column to notifications and create a function to insert reminders
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;

-- Function to insert reminders for upcoming events (to be called by a scheduled job or manually)
-- This is a template for a Postgres function, not a Supabase trigger
CREATE OR REPLACE FUNCTION insert_event_reminders(reminder_minutes integer DEFAULT 60) RETURNS void AS $$
DECLARE
  now_time timestamptz := now();
  reminder_time timestamptz := now() + (reminder_minutes || ' minutes')::interval;
BEGIN
  INSERT INTO notifications (athlete_id, event_id, type, message, read, created_at, reminder_sent)
  SELECT r.athlete_id, e.id, 'reminder',
    'Reminder: ' || e.title || ' at ' || to_char(e.start_time, 'YYYY-MM-DD HH24:MI'),
    false, now(), true
  FROM events e
  JOIN event_rsvps r ON r.event_id = e.id
  WHERE e.start_time BETWEEN now_time AND reminder_time
    AND r.status = 'accepted'
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.athlete_id = r.athlete_id AND n.event_id = e.id AND n.type = 'reminder'
    );
END;
$$ LANGUAGE plpgsql;
