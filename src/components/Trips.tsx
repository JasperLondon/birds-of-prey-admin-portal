import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import ReferenceAutocomplete from './ReferenceAutocomplete';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DialogContentText from '@mui/material/DialogContentText';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import {
  AIRPORT_OPTIONS,
  COUNTRY_OPTIONS,
  TIMEZONE_OPTIONS,
} from '../referenceData/travelReferences';

interface Trip {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  notes: string;
  status: string;
  destination_country_code: string | null;
  destination_timezone: string | null;
  destination_airport_code: string | null;
}

interface AthleteOption { id: string; name: string; }
interface GearOption { id: string; name: string; }

const statusOptions = ['planned', 'active', 'completed', 'cancelled'];

export default function Trips() {
  const ACCENT_ORANGE = '#c9782d';
  const ACCENT_ORANGE_DIM = '#ab621f';
  const DANGER_RED = '#d25757';
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
    '& .MuiFormHelperText-root': {
      marginLeft: 0,
      color: '#8f8f94',
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
  const destructiveButtonSx = {
    textTransform: 'none',
    borderRadius: 2,
    bgcolor: DANGER_RED,
    '&:hover': { bgcolor: '#bb4a4a' },
  };

  const [trips, setTrips] = useState<Trip[]>([]);
  const [athleteOptions, setAthleteOptions] = useState<AthleteOption[]>([]);
  const [gearOptions, setGearOptions] = useState<GearOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Trip, 'id'> & { athlete_ids: string[]; gear_ids: string[] }>({
    name: '',
    start_date: '',
    end_date: '',
    location: '',
    notes: '',
    status: 'planned',
    destination_country_code: '',
    destination_timezone: '',
    destination_airport_code: '',
    athlete_ids: [],
    gear_ids: []
  });
  const [search, setSearch] = useState({ name: '', location: '', status: '' });
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setError('');
    const [tripsRes, athletesRes, gearRes] = await Promise.all([
      supabase.from('trips').select('*').order('start_date', { ascending: false }),
      supabase.from('athletes').select('id, name'),
      supabase.from('gear_items').select('id, name'),
    ]);
    if (tripsRes.error) setError(tripsRes.error.message);
    if (athletesRes.error) setError(athletesRes.error.message);
    if (gearRes.error) setError(gearRes.error.message);
    setTrips(tripsRes.data || []);
    setAthleteOptions(athletesRes.data || []);
    setGearOptions(gearRes.data || []);
    setLoading(false);
  }

  function startAdd() {
    setEditingId(null);
    setForm({
      name: '',
      start_date: '',
      end_date: '',
      location: '',
      notes: '',
      status: 'planned',
      destination_country_code: '',
      destination_timezone: '',
      destination_airport_code: '',
      athlete_ids: [],
      gear_ids: []
    });
    setShowModal(true);
    setError('');
  }

  async function startEdit(trip: Trip) {
    // Fetch trip_athletes and trip_gear for this trip
    let athlete_ids: string[] = [];
    let gear_ids: string[] = [];
    const [athleteRes, gearRes] = await Promise.all([
      supabase.from('trip_athletes').select('athlete_id').eq('trip_id', trip.id),
      supabase.from('trip_gear').select('gear_item_id').eq('trip_id', trip.id),
    ]);
    if (athleteRes.data) athlete_ids = athleteRes.data.map((row: any) => row.athlete_id);
    if (gearRes.data) gear_ids = gearRes.data.map((row: any) => row.gear_item_id);
    setEditingId(trip.id);
    setForm({ ...trip, athlete_ids, gear_ids });
    setShowModal(true);
    setError('');
  }

  function handleModalClose() {
    setShowModal(false);
    setEditingId(null);
    setForm({
      name: '',
      start_date: '',
      end_date: '',
      location: '',
      notes: '',
      status: 'planned',
      destination_country_code: '',
      destination_timezone: '',
      destination_airport_code: '',
      athlete_ids: [],
      gear_ids: []
    });
    setError('');
  }

  function handleDelete(id: string) {
    setDeleteId(id);
    setDeleteDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setError('');
    const { error } = await supabase.from('trips').delete().eq('id', deleteId);
    setDeleteDialogOpen(false);
    setDeleteId(null);
    if (error) setError(error.message);
    else fetchAll();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      if (!form.name.trim()) {
        setError('Trip name is required.');
        setSaving(false);
        return;
      }
      if (!form.start_date || !form.end_date) {
        setError('Start and end dates are required.');
        setSaving(false);
        return;
      }

      const destinationCountry = (form.destination_country_code || '').trim().toUpperCase();
      const destinationAirport = (form.destination_airport_code || '').trim().toUpperCase();

      if (!destinationCountry) {
        setError('Destination country is required.');
        setSaving(false);
        return;
      }

      if (!/^[A-Z]{2}$/.test(destinationCountry)) {
        setError('Destination country must be a 2-letter ISO code.');
        setSaving(false);
        return;
      }

      if (destinationAirport && !/^[A-Z]{3}$/.test(destinationAirport)) {
        setError('Destination airport must be a 3-letter IATA code.');
        setSaving(false);
        return;
      }

      let tripId = editingId;
      if (editingId) {
        const { error } = await supabase.from('trips').update({
          name: form.name,
          start_date: form.start_date,
          end_date: form.end_date,
          location: form.location,
          notes: form.notes,
          status: form.status,
          destination_country_code: destinationCountry,
          destination_timezone: form.destination_timezone || null,
          destination_airport_code: destinationAirport || null,
        }).eq('id', editingId);
        if (error) {
          setError(error.message);
          setSaving(false);
          return;
        }
      } else {
        const { data, error } = await supabase.from('trips').insert([{
          name: form.name,
          start_date: form.start_date,
          end_date: form.end_date,
          location: form.location,
          notes: form.notes,
          status: form.status,
          destination_country_code: destinationCountry,
          destination_timezone: form.destination_timezone || null,
          destination_airport_code: destinationAirport || null,
        }]).select();
        if (error) {
          setError(error.message);
          setSaving(false);
          return;
        }
        if (data && data[0]) tripId = data[0].id;
      }
      // Update trip_athletes and trip_gear
      if (tripId) {
        // Remove old links
        await supabase.from('trip_athletes').delete().eq('trip_id', tripId);
        await supabase.from('trip_gear').delete().eq('trip_id', tripId);
        // Insert new links
        if (form.athlete_ids.length > 0) {
          await supabase.from('trip_athletes').insert(form.athlete_ids.map(aid => ({ trip_id: tripId, athlete_id: aid })));
        }
        if (form.gear_ids.length > 0) {
          await supabase.from('trip_gear').insert(form.gear_ids.map(gid => ({ trip_id: tripId, gear_item_id: gid })));
        }
      }
      setShowModal(false);
      fetchAll();
    } finally {
      setSaving(false);
    }
  }

  const filteredTrips = trips.filter(trip =>
    (search.name === '' || trip.name.toLowerCase().includes(search.name.toLowerCase())) &&
    (search.location === '' || trip.location.toLowerCase().includes(search.location.toLowerCase())) &&
    (search.status === '' || trip.status === search.status)
  );

  const opsBrief = React.useMemo(() => {
    let planned = 0;
    let active = 0;
    let completed = 0;
    let cancelled = 0;

    trips.forEach((trip) => {
      const status = (trip.status || '').toLowerCase();
      if (status === 'planned') planned += 1;
      if (status === 'active') active += 1;
      if (status === 'completed') completed += 1;
      if (status === 'cancelled') cancelled += 1;
    });

    return { planned, active, completed, cancelled, total: trips.length };
  }, [trips]);

  return (
    <Box sx={{ bgcolor: '#0d0d0e', minHeight: '100vh', px: { xs: 2, sm: 3, md: 4 }, py: { xs: 3, sm: 4 } }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Box
          sx={{
            mb: 3,
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
              MWD Command & Control
            </Typography>
            <Typography variant="h4" sx={{ color: '#fff', fontWeight: 720, letterSpacing: 0.1, mb: 0.5 }}>
              Trips
            </Typography>
            <Typography variant="body2" sx={{ color: '#a8a8ac' }}>
              Operational trip planning and assignment workspace.
            </Typography>
          </Box>

          <Button variant="contained" onClick={startAdd} sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2, px: 2, bgcolor: ACCENT_ORANGE, '&:hover': { bgcolor: ACCENT_ORANGE_DIM } }}>
            Add Trip
          </Button>
        </Box>

        <Card sx={{ bgcolor: '#151517', color: '#fff', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', mb: 2.25 }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Typography sx={{ color: '#9a9a9f', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.8 }}>
              Operations Brief
            </Typography>
            <Typography variant="h6" sx={{ color: '#f3f3f4', fontWeight: 660, mb: 1.25 }}>
              Trips
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.15 }}>
              {[
                { label: 'Planned', value: opsBrief.planned, valueColor: '#d6d6d9' },
                { label: 'Active', value: opsBrief.active, valueColor: '#5f8f62' },
                { label: 'Completed', value: opsBrief.completed, valueColor: '#9fa0a5' },
                { label: 'Cancelled', value: opsBrief.cancelled, valueColor: '#d25757' },
              ].map((metric) => (
                <Box key={metric.label} sx={{ p: 1.1, borderRadius: 2, border: '1px solid #252528', bgcolor: '#131315' }}>
                  <Typography sx={{ color: '#9b9ba0', fontSize: 12.5 }}>{metric.label}</Typography>
                  <Typography sx={{ mt: 0.3, fontSize: 25, fontWeight: 710, color: metric.valueColor }}>{metric.value}</Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ bgcolor: '#151517', color: '#fff', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', mb: 2.25 }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1.5, alignItems: { xs: 'stretch', md: 'center' } }}>
              <TextField
                label="Search Name"
                variant="outlined"
                value={search.name}
                onChange={e => setSearch(s => ({ ...s, name: e.target.value }))}
                sx={{
                  minWidth: 220,
                  flex: 1,
                  '& .MuiOutlinedInput-root': { bgcolor: '#131315', color: '#fff', borderRadius: 2 },
                  '& .MuiInputLabel-root': { color: '#a0a0a5' },
                }}
              />
              <TextField
                label="Search Location"
                variant="outlined"
                value={search.location}
                onChange={e => setSearch(s => ({ ...s, location: e.target.value }))}
                sx={{
                  minWidth: 220,
                  flex: 1,
                  '& .MuiOutlinedInput-root': { bgcolor: '#131315', color: '#fff', borderRadius: 2 },
                  '& .MuiInputLabel-root': { color: '#a0a0a5' },
                }}
              />
              <TextField
                label="Status"
                select
                value={search.status}
                onChange={e => setSearch(s => ({ ...s, status: e.target.value }))}
                sx={{
                  minWidth: { xs: '100%', md: 200 },
                  '& .MuiOutlinedInput-root': { bgcolor: '#131315', color: '#fff', borderRadius: 2 },
                  '& .MuiInputLabel-root': { color: '#a0a0a5' },
                }}
              >
                <MenuItem value="">All Status</MenuItem>
                {statusOptions.map(opt => (
                  <MenuItem key={opt} value={opt}>{opt.toUpperCase()}</MenuItem>
                ))}
              </TextField>
            </Box>
          </CardContent>
        </Card>

        {error && (
          <Box sx={{ mb: 2.25, p: 1.5, borderRadius: 2, border: `1px solid ${DANGER_RED}`, bgcolor: '#2a1818' }}>
            <Typography sx={{ color: '#f2c0c0', fontSize: 14 }}>{error}</Typography>
          </Box>
        )}

        {loading ? (
          <Card sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none' }}>
            <CardContent sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={28} sx={{ color: ACCENT_ORANGE }} />
            </CardContent>
          </Card>
        ) : filteredTrips.length === 0 ? (
          <Card sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none' }}>
            <CardContent sx={{ py: 3 }}>
              <Typography sx={{ color: '#d8d8db', fontWeight: 620, mb: 0.35 }}>
                {trips.length === 0 ? 'No trips found.' : 'No trips match your filters.'}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9a9a9f' }}>
                {trips.length === 0
                  ? 'Add a trip to begin operational planning.'
                  : 'Try adjusting search or status filters to view available trips.'}
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <TableContainer component={Paper} sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', overflow: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Name', 'Start', 'End', 'Location', 'Destination Country', 'Status', 'Metadata', 'Actions'].map((heading) => (
                    <TableCell key={heading} sx={{ color: '#f1f1f2', fontWeight: 700, borderBottom: '1px solid #2f2f33', whiteSpace: 'nowrap' }}>
                      {heading}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTrips.map(trip => (
                  <TableRow key={trip.id} hover sx={{ '&:hover': { bgcolor: '#1d1e22' } }}>
                    <TableCell sx={{ color: '#f4f4f5', borderBottom: '1px solid #27272b', fontWeight: 620 }}>{trip.name}</TableCell>
                    <TableCell sx={{ color: '#c7c7cb', borderBottom: '1px solid #27272b', whiteSpace: 'nowrap' }}>{trip.start_date}</TableCell>
                    <TableCell sx={{ color: '#c7c7cb', borderBottom: '1px solid #27272b', whiteSpace: 'nowrap' }}>{trip.end_date}</TableCell>
                    <TableCell sx={{ color: '#d2d2d6', borderBottom: '1px solid #27272b' }}>{trip.location || 'Not set'}</TableCell>
                    <TableCell sx={{ color: '#d2d2d6', borderBottom: '1px solid #27272b' }}>{trip.destination_country_code || 'Not set'}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid #27272b' }}>
                      <Chip
                        size="small"
                        label={trip.status.toUpperCase()}
                        sx={{
                          bgcolor: trip.status === 'active' ? '#1d2b21' : trip.status === 'cancelled' ? '#3a1f1f' : '#1f2022',
                          color: trip.status === 'active' ? '#c7e2cc' : trip.status === 'cancelled' ? '#f3c2c2' : '#d2d2d6',
                          border: '1px solid #35363a',
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: '#b6b6ba', borderBottom: '1px solid #27272b' }}>{trip.destination_country_code ? 'Complete' : 'Incomplete'}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid #27272b' }}>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Button variant="outlined" onClick={() => startEdit(trip)} sx={neutralButtonSx}>Edit</Button>
                        <Button variant="outlined" onClick={() => handleDelete(trip.id)} sx={{ ...neutralButtonSx, borderColor: DANGER_RED, color: '#f1b2b2', '&:hover': { borderColor: DANGER_RED, color: '#ffd0d0' } }}>Delete</Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Dialog open={showModal} onClose={handleModalClose} fullWidth maxWidth="md" PaperProps={{ sx: dialogPaperSx }}>
          <DialogTitle sx={dialogTitleSx}>{editingId ? 'Edit Trip' : 'Add Trip'}</DialogTitle>
          <DialogContent sx={dialogContentSx}>
            <form onSubmit={handleSubmit}>
              <Typography sx={sectionLabelSx}>Identity</Typography>
              <TextField
                label="Trip Name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                fullWidth
                margin="normal"
              />
              <TextField
                label="Location"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                fullWidth
                margin="normal"
              />

              <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
              <Typography sx={sectionLabelSx}>Schedule and Status</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.2 }}>
                <TextField
                  type="date"
                  label="Start Date"
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  required
                  fullWidth
                  margin="normal"
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  type="date"
                  label="End Date"
                  value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  required
                  fullWidth
                  margin="normal"
                  InputLabelProps={{ shrink: true }}
                />
              </Box>
              <TextField
                select
                label="Status"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                fullWidth
                margin="normal"
              >
                {statusOptions.map(opt => (
                  <MenuItem key={opt} value={opt}>{opt.toUpperCase()}</MenuItem>
                ))}
              </TextField>

              <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
              <Typography sx={sectionLabelSx}>Destination</Typography>
              <ReferenceAutocomplete
                label="Destination Country"
                value={form.destination_country_code || ''}
                options={COUNTRY_OPTIONS}
                required
                onChange={(value) => setForm(f => ({ ...f, destination_country_code: value }))}
              />
              <ReferenceAutocomplete
                label="Destination Timezone (optional)"
                value={form.destination_timezone || ''}
                options={TIMEZONE_OPTIONS}
                onChange={(value) => setForm(f => ({ ...f, destination_timezone: value }))}
              />
              <ReferenceAutocomplete
                label="Destination Airport (optional)"
                value={form.destination_airport_code || ''}
                options={AIRPORT_OPTIONS}
                onChange={(value) => setForm(f => ({ ...f, destination_airport_code: value }))}
              />

              <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
              <Typography sx={sectionLabelSx}>Assignments and Notes</Typography>
              <TextField
                select
                label="Athletes"
                value={form.athlete_ids}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm(f => ({ ...f, athlete_ids: typeof value === 'string' ? value.split(',') : value }));
                }}
                SelectProps={{
                  multiple: true,
                  renderValue: (selected) => {
                    const selectedIds = selected as string[];
                    return selectedIds
                      .map((id) => athleteOptions.find((a) => a.id === id)?.name || id)
                      .join(', ');
                  },
                }}
                fullWidth
                margin="normal"
              >
                {athleteOptions.map(opt => (
                  <MenuItem key={opt.id} value={opt.id}>{opt.name}</MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label="Gear"
                value={form.gear_ids}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm(f => ({ ...f, gear_ids: typeof value === 'string' ? value.split(',') : value }));
                }}
                SelectProps={{
                  multiple: true,
                  renderValue: (selected) => {
                    const selectedIds = selected as string[];
                    return selectedIds
                      .map((id) => gearOptions.find((g) => g.id === id)?.name || id)
                      .join(', ');
                  },
                }}
                fullWidth
                margin="normal"
              >
                {gearOptions.map(opt => (
                  <MenuItem key={opt.id} value={opt.id}>{opt.name}</MenuItem>
                ))}
              </TextField>

              <TextField
                label="Notes"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                multiline
                minRows={3}
                fullWidth
                margin="normal"
              />

              <DialogActions sx={dialogActionsSx}>
                <Button type="button" onClick={handleModalClose} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
                <Button type="submit" disabled={saving} variant="contained" sx={primaryButtonSx}>
                  {saving ? (editingId ? 'Saving...' : 'Adding...') : (editingId ? 'Save' : 'Add')}
                </Button>
              </DialogActions>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: dialogPaperSx }}>
          <DialogTitle sx={dialogTitleSx}>Delete Trip</DialogTitle>
          <DialogContent sx={{ ...dialogContentSx, pt: 0.5 }}>
            <DialogContentText sx={{ color: '#b3b3b7' }}>
              Are you sure you want to delete this trip? This action cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={dialogActionsSx}>
            <Button onClick={() => setDeleteDialogOpen(false)} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
            <Button onClick={confirmDelete} variant="contained" sx={destructiveButtonSx}>Delete</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}
