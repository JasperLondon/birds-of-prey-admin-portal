import { supabase } from '../../supabaseClient';

// Helper to call the Supabase Edge Function for email
async function sendNotificationEmail({ athlete_id, type, message, subject }: { athlete_id: string; type: string; message: string; subject?: string }) {
  // The function must be deployed as 'send-notification-email'
  await fetch('/functions/v1/send-notification-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ athlete_id, type, message, subject }),
  });
}

export async function createNotificationsForEvent({
  eventId,
  athleteIds,
  type = 'invite',
  message,
}: {
  eventId: string;
  athleteIds: string[];
  type?: string;
  message: string;
}) {
  if (!eventId || !athleteIds || athleteIds.length === 0) return;
  const notifications = athleteIds.map(athlete_id => ({
    athlete_id,
    event_id: eventId,
    type,
    message,
    read: false,
  }));
  await supabase.from('notifications').insert(notifications);
  // Send email for each notification
  for (const athlete_id of athleteIds) {
    await sendNotificationEmail({
      athlete_id,
      type,
      message,
      subject: type === 'reminder' ? 'Event Reminder' : type === 'invite' ? 'Event Invitation' : 'Event Update',
    });
  }
}

export async function fetchNotifications(athleteId: string) {
  if (!athleteId) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data;
}

export async function markNotificationRead(notificationId: string) {
  if (!notificationId) return;
  await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
}
