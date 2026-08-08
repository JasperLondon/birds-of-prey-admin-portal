import React, { useEffect, useMemo, useState } from 'react';
import appCss from '../App.css';
import './CalendarGrid.fullcalendar.css';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { fetchNotifications } from '../modules/notifications/notificationsApi';
import { createNotificationsForEvent } from '../modules/notifications/notificationsApi';
import Autocomplete from '@mui/material/Autocomplete';
import { supabase } from '../supabaseClient';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Edit from '@mui/icons-material/Edit';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

const CalendarGrid: React.FC = () => {
  void appCss;

  const [entries, setEntries] = useState<any[]>([]);
  const [reminderEventIds, setReminderEventIds] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [inviteeStatuses, setInviteeStatuses] = useState<{ name: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    event_type: 'general',
    start_time: '',
    end_time: '',
    location: '',
    created_by: '',
    invitees: [] as { id: string; name: string }[],
    id: undefined as string | undefined,
  });
  const [editMode, setEditMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [athletes, setAthletes] = useState<{ id: string; name: string }[]>([]);
  const [showTrips, setShowTrips] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [showAvailability, setShowAvailability] = useState(true);

  const ACCENT_ORANGE = '#c9782d';
  const ACCENT_ORANGE_DIM = '#ab621f';

  const dialogPaperSx = {
    bgcolor: '#151517',
    color: '#f3f3f4',
    borderRadius: 3,
    border: '1px solid #2b2b2e',
    boxShadow: 'none',
  };
  const dialogTitleSx = {
    pb: 1,
    '& .MuiTypography-root': {
      fontWeight: 690,
      letterSpacing: 0.1,
      color: '#f4f4f5',
    },
  };
  const dialogContentSx = {
    pt: 0.5,
    '& .MuiTextField-root': { mb: 0.65 },
    '& .MuiInputLabel-root': { color: '#9fa0a5' },
    '& .MuiOutlinedInput-root': {
      bgcolor: '#131315',
      color: '#f1f1f2',
      borderRadius: 2,
      '& fieldset': { borderColor: '#313136' },
      '&:hover fieldset': { borderColor: '#4a4a50' },
      '&.Mui-focused fieldset': { borderColor: '#595960' },
    },
  };
  const sectionLabelSx = {
    color: '#9a9a9f',
    fontSize: 12,
    letterSpacing: 0.65,
    textTransform: 'uppercase',
    mb: 0.75,
    mt: 1.25,
  };
  const dialogActionsSx = {
    px: 3,
    pb: 2.2,
    pt: 1,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 1,
    flexWrap: 'wrap',
  };
  const neutralButtonSx = {
    textTransform: 'none',
    borderRadius: 2,
    borderColor: '#4f4f54',
    color: '#d6d6da',
    '&:hover': { borderColor: ACCENT_ORANGE, color: ACCENT_ORANGE },
  };
  const primaryButtonSx = {
    textTransform: 'none',
    borderRadius: 2,
    bgcolor: ACCENT_ORANGE,
    '&:hover': { bgcolor: ACCENT_ORANGE_DIM },
  };

  // Keep one-time initial load behavior consistent with existing workflow.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    fetchEvents();
    fetchAthletes();
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    async function getReminders() {
      let athleteId = undefined;
      try {
        const user = await import('../supabaseClient').then(m => m.supabase.auth.getUser());
        if (user && user.data && user.data.user) athleteId = user.data.user.id;
      } catch {}
      if (!athleteId) return;
      const notifs = await fetchNotifications(athleteId);
      const reminderIds = notifs.filter((n: any) => n.type === 'reminder' && !n.read).map((n: any) => n.event_id);
      setReminderEventIds(reminderIds);
    }
    getReminders();
  }, []);

  async function fetchAthletes() {
    const { data, error } = await supabase.from('athletes').select('id, name');
    if (!error && data) setAthletes(data);
  }

  const eventTypeColors: Record<string, string> = {
    general: '#1976d2',
    training: '#43a047',
    competition: '#e53935',
    meeting: '#ffb300',
    other: '#8e24aa',
  };

  const tripColor = '#1565c0';
  const availabilityColor = '#8d6e63';

  const visibleEntries = useMemo(() => {
    return entries.filter((entry) => {
      const kind = entry.extendedProps?.entryType;
      if (kind === 'trip') return showTrips;
      if (kind === 'availability') return showAvailability;
      return showEvents;
    });
  }, [entries, showAvailability, showEvents, showTrips]);

  const summary = useMemo(() => {
    const now = new Date();
    const eventRows = entries.filter((entry) => entry.entryType === 'event');
    const upcomingEvents = eventRows.filter((entry) => {
      if (!entry.start) return false;
      const dt = new Date(entry.start);
      return !Number.isNaN(dt.getTime()) && dt.getTime() >= now.getTime();
    });

    const nextEvent = [...upcomingEvents].sort((a, b) => {
      const aTs = new Date(a.start).getTime();
      const bTs = new Date(b.start).getTime();
      return aTs - bTs;
    })[0];

    let accepted = 0;
    let declined = 0;
    let invited = 0;
    let pending = 0;
    let conflicts = 0;

    eventRows.forEach((entry) => {
      const rsvp = entry.rsvpSummary || { accepted: 0, declined: 0, invited: 0, pending: 0 };
      accepted += rsvp.accepted || 0;
      declined += rsvp.declined || 0;
      invited += rsvp.invited || 0;
      pending += rsvp.pending || 0;
      if (entry.hasConflict) conflicts += 1;
    });

    return {
      upcomingCount: upcomingEvents.length,
      nextEvent,
      accepted,
      declined,
      invited,
      pending,
      conflicts,
      eventCount: eventRows.length,
    };
  }, [entries]);

  async function fetchEvents() {
    setLoading(true);
    const [eventsResult, tripsResult, availabilityResult] = await Promise.all([
      supabase.from('events').select('*').order('start_time', { ascending: true }),
      supabase.from('trips').select('id, name, start_date, end_date, status, location, notes').order('start_date', { ascending: true }),
      supabase
        .from('athlete_availability')
        .select('id, athlete_id, start_date, end_date, status, note, athletes:athlete_id(name)')
        .order('start_date', { ascending: true }),
    ]);

    const eventsData = eventsResult.data || [];
    if (eventsResult.error) setErrorMsg(eventsResult.error.message);
    if (tripsResult.error) setErrorMsg(tripsResult.error.message);
    if (availabilityResult.error) setErrorMsg(availabilityResult.error.message);

    const addOneDay = (dateValue: string | null | undefined) => {
      if (!dateValue) return undefined;
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return dateValue;
      date.setDate(date.getDate() + 1);
      return date.toISOString().slice(0, 10);
    };

    const athleteNameMap = new Map(athletes.map((a) => [a.id, a.name]));

    let rsvpMap: Record<string, { accepted: number; declined: number; invited: number; pending: number }> = {};
    let inviteeMap: Record<string, Set<string>> = {};

    if (eventsData.length > 0) {
      const eventIds = eventsData.map((ev) => ev.id);
      const { data: rsvps } = await supabase.from('event_rsvps').select('event_id, athlete_id, status');
      if (rsvps) {
        for (const evId of eventIds) {
          rsvpMap[evId] = { accepted: 0, declined: 0, invited: 0, pending: 0 };
          inviteeMap[evId] = new Set();
        }
        for (const rsvp of rsvps) {
          if (rsvpMap[rsvp.event_id]) {
            const status = (rsvp.status || 'pending').toLowerCase();
            if (status === 'accepted') rsvpMap[rsvp.event_id].accepted += 1;
            else if (status === 'declined') rsvpMap[rsvp.event_id].declined += 1;
            else if (status === 'invited') rsvpMap[rsvp.event_id].invited += 1;
            else rsvpMap[rsvp.event_id].pending += 1;
            if (rsvp.athlete_id) inviteeMap[rsvp.event_id].add(rsvp.athlete_id);
          }
        }
      }
    }

    const conflictMap: Record<string, boolean> = {};
    if (eventsData.length > 1) {
      for (let i = 0; i < eventsData.length; i += 1) {
        const evA = eventsData[i];
        const inviteesA = inviteeMap[evA.id] || new Set();
        const startA = new Date(evA.start_time).getTime();
        const endA = new Date(evA.end_time).getTime();
        conflictMap[evA.id] = false;

        for (let j = 0; j < eventsData.length; j += 1) {
          if (i === j) continue;
          const evB = eventsData[j];
          const inviteesB = inviteeMap[evB.id] || new Set();
          const startB = new Date(evB.start_time).getTime();
          const endB = new Date(evB.end_time).getTime();
          if (startA < endB && endA > startB) {
            const shared = Array.from(inviteesA).some((id) => inviteesB.has(id));
            if (shared) {
              conflictMap[evA.id] = true;
              break;
            }
          }
        }
      }
    }

    const eventEntries = eventsData.map((ev) => ({
      id: ev.id,
      title: ev.title,
      start: ev.start_time,
      end: ev.end_time,
      backgroundColor: eventTypeColors[ev.event_type] || '#1976d2',
      textColor: '#fff',
      extendedProps: ev,
      rsvpSummary: rsvpMap[ev.id] || { accepted: 0, declined: 0, invited: 0, pending: 0 },
      hasConflict: conflictMap[ev.id] || false,
      entryType: 'event',
    }));

    const tripEntries = ((tripsResult.data || []) as any[]).map((trip) => ({
      id: `trip-${trip.id}`,
      title: `Trip: ${trip.name}`,
      start: trip.start_date,
      end: addOneDay(trip.end_date || trip.start_date),
      allDay: true,
      backgroundColor: tripColor,
      borderColor: tripColor,
      textColor: '#fff',
      extendedProps: {
        entryType: 'trip',
        trip,
      },
    }));

    const availabilityEntries = ((availabilityResult.data || []) as any[]).map((row) => {
      const relation = row.athletes;
      const relationName = Array.isArray(relation) ? relation[0]?.name : relation?.name;
      const athleteName = relationName || athleteNameMap.get(row.athlete_id) || row.athlete_id;
      return {
        id: `availability-${row.id}`,
        title: athleteName,
        start: row.start_date,
        end: addOneDay(row.end_date || row.start_date),
        allDay: true,
        backgroundColor: availabilityColor,
        borderColor: availabilityColor,
        textColor: '#fff',
        extendedProps: {
          entryType: 'availability',
          availability: row,
          athleteName,
        },
      };
    });

    setEntries([...tripEntries, ...eventEntries, ...availabilityEntries]);
    setLoading(false);
  }

  async function addOrEditEvent() {
    setSaving(true);
    setErrorMsg('');

    if (!form.title || !form.start_time || !form.end_time) {
      setErrorMsg('Title, start, and end time are required.');
      setSaving(false);
      return;
    }

    const payload = {
      ...form,
      created_by: form.created_by ? form.created_by : null,
    };

    const { invitees, id, ...eventPayload } = payload;
    let eventId = id;
    let error;
    let data;

    if (editMode && id) {
      ({ error } = await supabase.from('events').update(eventPayload).eq('id', id));
      eventId = id;
    } else {
      ({ data, error } = await supabase.from('events').insert([eventPayload]).select());
      eventId = data && data[0]?.id;
    }

    if (error) {
      setErrorMsg(error.message);
      setSaving(false);
      return;
    }

    if (eventId) {
      await supabase.from('event_rsvps').delete().eq('event_id', eventId);
      if (invitees && invitees.length > 0) {
        const rsvps = invitees.map((ath: { id: string }) => ({ event_id: eventId, athlete_id: ath.id, status: 'invited' }));
        await supabase.from('event_rsvps').insert(rsvps);

        const athleteIds = invitees.map((ath: { id: string }) => ath.id);
        await createNotificationsForEvent({
          eventId,
          athleteIds,
          type: editMode ? 'update' : 'invite',
          message: editMode
            ? `Event updated: ${form.title} (${form.start_time} - ${form.end_time})`
            : `You have been invited to: ${form.title} (${form.start_time} - ${form.end_time})`,
        });
      }
    }

    setOpen(false);
    setEditMode(false);
    setForm({ title: '', description: '', event_type: 'general', start_time: '', end_time: '', location: '', created_by: '', invitees: [], id: undefined });
    fetchEvents();
    setSaving(false);
  }

  function renderEventContent(arg: any) {
    const { event } = arg;
    const entryType = event.extendedProps?.entryType || 'event';
    const timeText = arg.timeText;

    if (entryType === 'availability') {
      const athleteName = event.extendedProps?.athleteName || event.title;
      return (
        <div className="mwd-event-card mwd-event-card--availability">
          <span className="mwd-event-title">{athleteName}</span>
          <span className="mwd-event-meta">Unavailable</span>
        </div>
      );
    }

    if (entryType === 'trip') {
      const trip = event.extendedProps?.trip;
      return (
        <div className="mwd-event-card mwd-event-card--trip">
          {timeText ? <span className="mwd-event-time">{timeText}</span> : null}
          <span className="mwd-event-title">{event.title}</span>
          {trip?.location ? <span className="mwd-event-meta">{trip.location}</span> : (trip?.status ? <span className="mwd-event-meta">{trip.status}</span> : null)}
        </div>
      );
    }

    const rsvp = event.extendedProps.rsvpSummary;
    const hasConflict = event.hasConflict;
    const showReminder = reminderEventIds.includes(event.id);

    return (
      <div className="mwd-event-card mwd-event-card--event">
        {timeText ? <span className="mwd-event-time">{timeText}</span> : null}
        <span className="mwd-event-title-row">
          <span className="mwd-event-title">{event.title}</span>
          {showReminder ? <NotificationsActiveIcon fontSize="small" sx={{ color: '#cf8b49', ml: 0.5 }} titleAccess="You have a reminder for this event" /> : null}
          {hasConflict ? <span title="Scheduling conflict with shared invitee(s)" className="mwd-event-pill mwd-event-pill--conflict">Conflict</span> : null}
        </span>
        {event.extendedProps?.location ? <span className="mwd-event-meta">{event.extendedProps.location}</span> : null}
        {rsvp && (rsvp.accepted > 0 || rsvp.declined > 0 || rsvp.invited > 0 || rsvp.pending > 0) ? (
          <Box className="mwd-event-pill-row">
            {rsvp.accepted > 0 ? <span className="mwd-event-pill mwd-event-pill--accepted">A {rsvp.accepted}</span> : null}
            {rsvp.declined > 0 ? <span className="mwd-event-pill mwd-event-pill--declined">D {rsvp.declined}</span> : null}
            {rsvp.invited > 0 ? <span className="mwd-event-pill mwd-event-pill--invited">I {rsvp.invited}</span> : null}
            {rsvp.pending > 0 ? <span className="mwd-event-pill mwd-event-pill--pending">P {rsvp.pending}</span> : null}
          </Box>
        ) : null}
      </div>
    );
  }

  return (
    <Box sx={{ bgcolor: '#0d0d0e', minHeight: '100vh', px: { xs: 2, sm: 3, md: 4 }, py: { xs: 3, sm: 4 } }}>
      <Box sx={{ maxWidth: 1320, mx: 'auto' }}>
        <Box
          sx={{
            mb: 2.5,
            p: { xs: 2.25, sm: 2.75 },
            borderRadius: 3,
            border: '1px solid #2a2a2d',
            bgcolor: '#151517',
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'flex-start', md: 'center' },
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Box>
            <Typography sx={{ color: '#8e8e92', fontSize: 12, letterSpacing: 0.9, textTransform: 'uppercase', mb: 0.75 }}>
              MWD Command and Control
            </Typography>
            <Typography variant="h4" sx={{ color: '#fff', fontWeight: 720, letterSpacing: 0.1, mb: 0.5 }}>
              Events
            </Typography>
            <Typography variant="body2" sx={{ color: '#a8a8ac' }}>
              Timeline, invite visibility, and shared planning overlays.
            </Typography>
          </Box>
          <Button variant="contained" sx={{ ...primaryButtonSx, fontWeight: 700, px: 2 }} onClick={() => setOpen(true)}>
            Add Event
          </Button>
        </Box>

        <Card sx={{ bgcolor: '#151517', color: '#fff', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', mb: 2.25 }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Typography sx={{ color: '#9a9a9f', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.6, mb: 1.1 }}>
              Operations Snapshot
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(6, minmax(0, 1fr))' }, gap: 1.1 }}>
              {[
                { label: 'Upcoming Events', value: summary.upcomingCount, tone: '#d6d6d9' },
                { label: 'Invited', value: summary.invited, tone: '#efcf9d' },
                { label: 'Accepted', value: summary.accepted, tone: '#5f8f62' },
                { label: 'Declined', value: summary.declined, tone: '#d25757' },
                { label: 'Pending', value: summary.pending, tone: '#90caf9' },
                { label: 'Conflicts', value: summary.conflicts, tone: '#efcf9d' },
              ].map((metric) => (
                <Box key={metric.label} sx={{ p: 1.1, borderRadius: 2, border: '1px solid #252528', bgcolor: '#131315' }}>
                  <Typography sx={{ color: '#9b9ba0', fontSize: 12.5 }}>{metric.label}</Typography>
                  <Typography sx={{ mt: 0.3, fontSize: 23, fontWeight: 710, color: metric.tone }}>{metric.value}</Typography>
                </Box>
              ))}
            </Box>
            <Box sx={{ mt: 1.1 }}>
              <Typography sx={{ color: '#a0a0a5', fontSize: 12.5 }}>
                {summary.nextEvent
                  ? `Next event: ${summary.nextEvent.title || 'Untitled Event'}${summary.nextEvent.start ? ` • ${new Date(summary.nextEvent.start).toLocaleString()}` : ''}`
                  : 'No upcoming event in loaded entries.'}
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ bgcolor: '#151517', color: '#fff', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', mb: 2.25 }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.2, alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', gap: 1.1, flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={<Checkbox checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} sx={{ color: '#a5a5aa' }} />}
                  label={<Typography sx={{ color: '#d8d8dc', fontSize: 13.5 }}>Events Layer</Typography>}
                />
                <FormControlLabel
                  control={<Checkbox checked={showTrips} onChange={(e) => setShowTrips(e.target.checked)} sx={{ color: '#a5a5aa' }} />}
                  label={<Typography sx={{ color: '#d8d8dc', fontSize: 13.5 }}>Trips Layer</Typography>}
                />
                <FormControlLabel
                  control={<Checkbox checked={showAvailability} onChange={(e) => setShowAvailability(e.target.checked)} sx={{ color: '#a5a5aa' }} />}
                  label={<Typography sx={{ color: '#d8d8dc', fontSize: 13.5 }}>Athlete Availability Layer</Typography>}
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip size="small" label={`${visibleEntries.length} visible`} sx={{ bgcolor: '#1f2022', color: '#d2d2d6', border: '1px solid #35363a' }} />
                <Chip size="small" label={`${summary.eventCount} events loaded`} sx={{ bgcolor: '#1f2022', color: '#d2d2d6', border: '1px solid #35363a' }} />
              </Box>
            </Box>
          </CardContent>
        </Card>

        {errorMsg ? (
          <Box sx={{ mb: 2.25, p: 1.5, borderRadius: 2, border: '1px solid #7b3a3a', bgcolor: '#2a1818' }}>
            <Typography sx={{ color: '#f2c0c0', fontSize: 14 }}>{errorMsg}</Typography>
          </Box>
        ) : null}

        <Paper sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', p: { xs: 1.2, sm: 1.8 }, overflow: 'hidden' }}>
          {loading ? (
            <Box sx={{ py: 5, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={28} sx={{ color: ACCENT_ORANGE }} />
              <Typography sx={{ color: '#9a9a9f', fontSize: 13.5 }}>Loading calendar entries...</Typography>
            </Box>
          ) : visibleEntries.length === 0 ? (
            <Box sx={{ py: 4, px: 1 }}>
              <Typography sx={{ color: '#d8d8db', fontWeight: 620, mb: 0.35 }}>
                {entries.length === 0 ? 'No calendar entries found.' : 'No entries are visible with the current layer selection.'}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9a9a9f' }}>
                {entries.length === 0
                  ? 'Events, trips, and athlete availability will appear here when available.'
                  : 'Enable additional layers to review hidden entries.'}
              </Typography>
            </Box>
          ) : (
            <Box className="mwd-calendar-surface">
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
                events={visibleEntries}
                eventContent={renderEventContent}
                height={700}
                dayMaxEvents={3}
                eventDisplay="block"
                contentHeight={700}
                displayEventTime={true}
                displayEventEnd={true}
                weekends={true}
                themeSystem="standard"
                eventClassNames={(arg: any) => {
                  const entryTypeValue = arg.event.extendedProps?.entryType;
                  const classNames = ['mwd-calendar-event'];
                  if (entryTypeValue === 'trip') classNames.push('mwd-calendar-event--trip');
                  else if (entryTypeValue === 'availability') classNames.push('mwd-calendar-event--availability');
                  else classNames.push('mwd-calendar-event--event');
                  if (arg.event.extendedProps?.hasConflict) classNames.push('mwd-calendar-event--conflict');
                  return classNames;
                }}
                dayCellClassNames={(arg: any) => (arg.date.getDay() === 0 || arg.date.getDay() === 6 ? ['mwd-calendar-day--weekend'] : [])}
                moreLinkClassNames={() => ['mwd-calendar-more-link']}
                dayHeaderFormat={{ weekday: 'short' }}
                slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                eventClick={async (info: import('@fullcalendar/core').EventClickArg) => {
                  const entryType = info.event.extendedProps?.entryType || 'event';
                  setSelectedEvent({
                    ...info.event.extendedProps,
                    title: info.event.title,
                    start: info.event.start,
                    end: info.event.end,
                  });
                  if (entryType !== 'event') {
                    setInviteeStatuses([]);
                    return;
                  }
                  const eventId = info.event.extendedProps.id;
                  const { data: rsvps, error } = await supabase.from('event_rsvps').select('athlete_id, status').eq('event_id', eventId);
                  if (!error && rsvps) {
                    const invitees = rsvps.map((rsvp: any) => {
                      const athlete = athletes.find((a) => a.id === rsvp.athlete_id);
                      return { name: athlete ? athlete.name : rsvp.athlete_id, status: rsvp.status };
                    });
                    setInviteeStatuses(invitees);
                  } else {
                    setInviteeStatuses([]);
                  }
                }}
              />
            </Box>
          )}
        </Paper>

        <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
          <DialogTitle sx={dialogTitleSx}>{editMode ? 'Edit Event' : 'Add Event'}</DialogTitle>
          <DialogContent sx={dialogContentSx}>
            {errorMsg ? <Typography sx={{ color: '#f2c0c0', mb: 1 }}>{errorMsg}</Typography> : null}

            <Typography sx={sectionLabelSx}>Event Information</Typography>
            <TextField label="Title" fullWidth margin="normal" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <TextField label="Description" fullWidth margin="normal" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <TextField label="Type" select fullWidth margin="normal" value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })}>
              <MenuItem value="general">General</MenuItem>
              <MenuItem value="training">Training</MenuItem>
              <MenuItem value="competition">Competition</MenuItem>
              <MenuItem value="meeting">Meeting</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>

            <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
            <Typography sx={sectionLabelSx}>Schedule and Location</Typography>
            <TextField label="Start Time" type="datetime-local" fullWidth margin="normal" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField label="End Time" type="datetime-local" fullWidth margin="normal" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField label="Location" fullWidth margin="normal" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />

            <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
            <Typography sx={sectionLabelSx}>Invitees</Typography>
            <Autocomplete
              multiple
              options={athletes}
              getOptionLabel={(option) => option.name}
              value={form.invitees}
              onChange={(_, value) => setForm({ ...form, invitees: value })}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Invite Athletes"
                  margin="normal"
                />
              )}
              sx={{ mt: 0.2 }}
            />
          </DialogContent>
          <DialogActions sx={dialogActionsSx}>
            <Button onClick={() => setOpen(false)} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
            <Button onClick={addOrEditEvent} variant="contained" disabled={saving} sx={primaryButtonSx}>{saving ? 'Saving...' : (editMode ? 'Save' : 'Add')}</Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={!!selectedEvent}
          onClose={() => { setSelectedEvent(null); setInviteeStatuses([]); setEditMode(false); }}
          maxWidth="md"
          fullWidth
          PaperProps={{ sx: dialogPaperSx }}
        >
          <DialogTitle sx={dialogTitleSx}>
            {selectedEvent?.entryType === 'availability' ? 'Availability Details' : selectedEvent?.entryType === 'trip' ? 'Trip Details' : 'Event Details'}
          </DialogTitle>
          <DialogContent sx={dialogContentSx}>
            {selectedEvent ? (
              <>
                {selectedEvent.entryType === 'availability' ? (
                  <>
                    <Typography sx={sectionLabelSx}>Event Information</Typography>
                    <Typography variant="h6" sx={{ color: '#f4f4f5', fontWeight: 680, mb: 0.9 }}>{selectedEvent.athleteName}</Typography>
                    <Typography sx={{ color: '#d3d3d7', mb: 0.65 }}>Status: Unavailable</Typography>

                    <Divider sx={{ my: 1.3, borderColor: '#2a2a2d' }} />
                    <Typography sx={sectionLabelSx}>Schedule and Location</Typography>
                    <Typography sx={{ color: '#d3d3d7', mb: 0.45 }}>Start Date: {selectedEvent.availability?.start_date || ''}</Typography>
                    <Typography sx={{ color: '#d3d3d7', mb: 0.45 }}>End Date: {selectedEvent.availability?.end_date || selectedEvent.availability?.start_date || ''}</Typography>
                    <Typography sx={{ color: '#d3d3d7', mb: 0.45 }}>Location: N/A</Typography>

                    <Divider sx={{ my: 1.3, borderColor: '#2a2a2d' }} />
                    <Typography sx={sectionLabelSx}>Actions</Typography>
                    <Typography sx={{ color: '#9a9a9f', fontSize: 13.5 }}>No edit/delete actions are defined for this surface.</Typography>
                  </>
                ) : selectedEvent.entryType === 'trip' ? (
                  <>
                    <Typography sx={sectionLabelSx}>Event Information</Typography>
                    <Typography variant="h6" sx={{ color: '#f4f4f5', fontWeight: 680, mb: 0.9 }}>{selectedEvent.trip?.name || selectedEvent.title}</Typography>
                    <Typography sx={{ color: '#d3d3d7', mb: 0.45 }}>Status: {selectedEvent.trip?.status || 'N/A'}</Typography>

                    <Divider sx={{ my: 1.3, borderColor: '#2a2a2d' }} />
                    <Typography sx={sectionLabelSx}>Schedule and Location</Typography>
                    <Typography sx={{ color: '#d3d3d7', mb: 0.45 }}>Start Date: {selectedEvent.trip?.start_date || ''}</Typography>
                    <Typography sx={{ color: '#d3d3d7', mb: 0.45 }}>End Date: {selectedEvent.trip?.end_date || ''}</Typography>
                    <Typography sx={{ color: '#d3d3d7', mb: 0.45 }}>Location: {selectedEvent.trip?.location || 'N/A'}</Typography>

                    <Divider sx={{ my: 1.3, borderColor: '#2a2a2d' }} />
                    <Typography sx={sectionLabelSx}>Actions</Typography>
                    <Typography sx={{ color: '#9a9a9f', fontSize: 13.5 }}>Trip details are informational in this surface.</Typography>
                  </>
                ) : (
                  <>
                    <Typography sx={sectionLabelSx}>Event Information</Typography>
                    <Typography variant="h6" sx={{ color: '#f4f4f5', fontWeight: 680, mb: 0.9 }}>{selectedEvent.title}</Typography>
                    <Typography sx={{ color: '#d3d3d7', mb: 0.45 }}>Type: {selectedEvent.event_type || 'N/A'}</Typography>
                    <Typography sx={{ color: '#d3d3d7', mb: 0.45 }}>Description: {selectedEvent.description || 'No description provided.'}</Typography>

                    <Divider sx={{ my: 1.3, borderColor: '#2a2a2d' }} />
                    <Typography sx={sectionLabelSx}>Schedule and Location</Typography>
                    <Typography sx={{ color: '#d3d3d7', mb: 0.45 }}>Start: {selectedEvent.start_time ? new Date(selectedEvent.start_time).toLocaleString() : 'N/A'}</Typography>
                    <Typography sx={{ color: '#d3d3d7', mb: 0.45 }}>End: {selectedEvent.end_time ? new Date(selectedEvent.end_time).toLocaleString() : 'N/A'}</Typography>
                    <Typography sx={{ color: '#d3d3d7', mb: 0.45 }}>Location: {selectedEvent.location || 'N/A'}</Typography>

                    <Divider sx={{ my: 1.3, borderColor: '#2a2a2d' }} />
                    <Typography sx={sectionLabelSx}>Invitees and RSVP Status</Typography>
                    {inviteeStatuses.length === 0 ? (
                      <Typography sx={{ color: '#9a9a9f', fontStyle: 'italic' }}>No invitees.</Typography>
                    ) : (
                      <Box component="ul" sx={{ pl: 2, color: '#fff', mb: 0 }}>
                        {inviteeStatuses.map((inv, idx) => (
                          <li key={idx} style={{ marginBottom: 6 }}>
                            <span style={{ fontWeight: 600 }}>{inv.name}</span>
                            {': '}
                            <span style={{ color: inv.status === 'accepted' ? '#8dc291' : inv.status === 'declined' ? '#e2a1a1' : '#efcf9d', fontWeight: 500 }}>
                              {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                            </span>
                          </li>
                        ))}
                      </Box>
                    )}

                    {selectedEvent.required_gear ? (
                      <>
                        <Divider sx={{ my: 1.3, borderColor: '#2a2a2d' }} />
                        <Typography sx={sectionLabelSx}>Required Gear</Typography>
                        <Typography sx={{ color: '#d3d3d7' }}>{selectedEvent.required_gear}</Typography>
                      </>
                    ) : null}

                    {selectedEvent.file_url ? (
                      <>
                        <Divider sx={{ my: 1.3, borderColor: '#2a2a2d' }} />
                        <Typography sx={sectionLabelSx}>Documents</Typography>
                        <Button
                          component="a"
                          href={selectedEvent.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="outlined"
                          sx={neutralButtonSx}
                        >
                          Open Document
                        </Button>
                      </>
                    ) : null}

                    <Divider sx={{ my: 1.3, borderColor: '#2a2a2d' }} />
                    <Typography sx={sectionLabelSx}>Actions</Typography>
                    <Typography sx={{ color: '#9a9a9f', fontSize: 13.5, mb: 1 }}>
                      Edit is available. Delete is not implemented in this active surface.
                    </Typography>
                  </>
                )}
              </>
            ) : null}
          </DialogContent>
          <DialogActions sx={dialogActionsSx}>
            <Button onClick={() => { setSelectedEvent(null); setInviteeStatuses([]); setEditMode(false); }} variant="outlined" sx={neutralButtonSx}>Close</Button>
            {selectedEvent?.entryType === 'event' ? (
              <Tooltip title="Edit Event">
                <IconButton
                  onClick={async () => {
                    setForm({
                      title: selectedEvent.title,
                      description: selectedEvent.description,
                      event_type: selectedEvent.event_type,
                      start_time: selectedEvent.start_time,
                      end_time: selectedEvent.end_time,
                      location: selectedEvent.location,
                      created_by: selectedEvent.created_by,
                      invitees: inviteeStatuses.map((inv) => {
                        const ath = athletes.find((a) => a.name === inv.name);
                        return ath ? ath : { id: '', name: inv.name };
                      }),
                      id: selectedEvent.id,
                    });
                    setOpen(true);
                    setEditMode(true);
                    setSelectedEvent(null);
                  }}
                  sx={{ border: '1px solid #2b2b2e', borderRadius: 2, color: '#efcf9d' }}
                  aria-label="Edit event"
                >
                  <Edit />
                </IconButton>
              </Tooltip>
            ) : null}
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default CalendarGrid;
