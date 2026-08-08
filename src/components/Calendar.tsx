import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';

// Basic calendar event display and fetch logic
export default function Calendar() {
  const [events, setEvents] = useState<any[]>([]);
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
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchEvents();
  }, []);

  async function fetchEvents() {
    setLoading(true);
    const { data, error } = await supabase.from('events').select('*').order('start_time', { ascending: true });
    if (error) setErrorMsg(error.message);
    setEvents(data || []);
    setLoading(false);
  }

  async function addEvent() {
    setErrorMsg('');
    setSuccessMsg('');
    if (!form.title || !form.start_time || !form.end_time) {
      setErrorMsg('Title, start, and end time are required.');
      return;
    }
    const { error } = await supabase.from('events').insert([form]);
    if (error) setErrorMsg(error.message);
    else {
      setSuccessMsg('Event added!');
      setOpen(false);
      setForm({ title: '', description: '', event_type: 'general', start_time: '', end_time: '', location: '', created_by: '' });
      fetchEvents();
    }
  }

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" fontWeight={700} mb={3}>Calendar</Typography>
      <Button variant="contained" color="primary" onClick={() => setOpen(true)} sx={{ mb: 2 }}>Add Event</Button>
      {loading ? <Typography>Loading events...</Typography> : (
        <Box>
          {events.length === 0 ? <Typography>No events found.</Typography> : (
            events.map(event => (
              <Box key={event.id} sx={{ mb: 2, p: 2, borderRadius: 2, bgcolor: '#232323', color: '#fff' }}>
                <Typography fontWeight={600}>{event.title}</Typography>
                <Typography variant="body2">{event.description}</Typography>
                <Typography variant="caption">{event.event_type} | {new Date(event.start_time).toLocaleString()} - {new Date(event.end_time).toLocaleString()}</Typography>
                <Typography variant="caption">Location: {event.location}</Typography>
              </Box>
            ))
          )}
        </Box>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Event</DialogTitle>
        <DialogContent>
          {errorMsg && <Typography color="error" sx={{ mb: 1 }}>{errorMsg}</Typography>}
          <TextField label="Title" fullWidth margin="normal" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <TextField label="Description" fullWidth margin="normal" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <TextField label="Type" select fullWidth margin="normal" value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })}>
            <MenuItem value="general">General</MenuItem>
            <MenuItem value="training">Training</MenuItem>
            <MenuItem value="competition">Competition</MenuItem>
            <MenuItem value="meeting">Meeting</MenuItem>
            <MenuItem value="other">Other</MenuItem>
          </TextField>
          <TextField label="Start Time" type="datetime-local" fullWidth margin="normal" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} InputLabelProps={{ shrink: true }} />
          <TextField label="End Time" type="datetime-local" fullWidth margin="normal" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} InputLabelProps={{ shrink: true }} />
          <TextField label="Location" fullWidth margin="normal" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={addEvent} variant="contained" color="primary">Add</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
