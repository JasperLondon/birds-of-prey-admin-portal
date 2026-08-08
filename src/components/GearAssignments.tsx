import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
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

type Assignment = {
  id: string;
  gear_item_id: string;
  athlete_id: string;
  assigned_at?: string;
  notes: string;
};
type GearItemOption = {
  id: string;
  name: string;
};
type AthleteOption = {
  id: string;
  name: string;
};

export default function GearAssignments() {
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

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [gearOptions, setGearOptions] = useState<GearItemOption[]>([]);
  const [athleteOptions, setAthleteOptions] = useState<AthleteOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editForm, setEditForm] = useState<Omit<Assignment, 'id' | 'assigned_at'>>({
    gear_item_id: '',
    athlete_id: '',
    notes: '',
  });
  // Search/filter state
  const [searchGear, setSearchGear] = useState('');
  const [searchAthlete, setSearchAthlete] = useState('');

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setError('');
    const [assignRes, gearRes, athleteRes] = await Promise.all([
      supabase.from('gear_assignments').select('*').order('assigned_at', { ascending: false }),
      supabase.from('gear_items').select('id, name'),
      supabase.from('athletes').select('id, name'),
    ]);
    if (assignRes.error) setError(assignRes.error.message);
    if (gearRes.error) setError(gearRes.error.message);
    if (athleteRes.error) setError(athleteRes.error.message);
    setAssignments(assignRes.data || []);
    setGearOptions(gearRes.data || []);
    setAthleteOptions(athleteRes.data || []);
    setLoading(false);
  }

  function startAdd() {
    setEditingId(null);
    setEditForm({ gear_item_id: '', athlete_id: '', notes: '' }); 
    setShowModal(true);
    setError('');
  }

  function startEdit(item: Assignment) {
    setEditingId(item.id);
    setEditForm({ gear_item_id: item.gear_item_id, athlete_id: item.athlete_id, notes: item.notes });
    setShowModal(true);
    setError('');
  }

  function handleModalClose() {
    setShowModal(false);
    setEditingId(null);
    setEditForm({ gear_item_id: '', athlete_id: '', notes: '' });
    setError('');
  }

  async function handleAddOrEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    if (!editForm.gear_item_id || !editForm.athlete_id) {
      setError('Gear and Athlete are required.');
      setSaving(false);
      return;
    }
    if (editingId) {
      // Edit
      const { error } = await supabase.from('gear_assignments').update(editForm).eq('id', editingId);
      if (error) setError(error.message);
      else {
        handleModalClose();
        void fetchAll();
      }
    } else {
      // Add
      const { error } = await supabase.from('gear_assignments').insert([{ ...editForm }]);
      if (error) setError(error.message);
      else {
        handleModalClose();
        void fetchAll();
      }
    }
    setSaving(false);
  }

  function requestDelete(id: string) {
    setDeleteId(id);
    setDeleteDialogOpen(true);
  }

  async function handleDelete(id: string) {
    if (deleting) return;
    setDeleting(true);
    setError('');
    const { error } = await supabase.from('gear_assignments').delete().eq('id', id);
    if (error) setError(error.message);
    else await fetchAll();
    setDeleteDialogOpen(false);
    setDeleteId(null);
    setDeleting(false);
  }

  // Filtered data
  const filteredAssignments = assignments.filter(item =>
    (searchGear === '' || gearOptions.find(g => g.id === item.gear_item_id)?.name?.toLowerCase().includes(searchGear.toLowerCase())) &&
    (searchAthlete === '' || athleteOptions.find(a => a.id === item.athlete_id)?.name?.toLowerCase().includes(searchAthlete.toLowerCase()))
  );

  const summary = React.useMemo(() => {
    const uniqueGear = new Set(assignments.map((item) => item.gear_item_id).filter(Boolean)).size;
    const uniqueAthletes = new Set(assignments.map((item) => item.athlete_id).filter(Boolean)).size;
    return {
      activeAssignments: assignments.length,
      athletesAssigned: uniqueAthletes,
      inventoryAssigned: uniqueGear,
    };
  }, [assignments]);

  function clearFilters() {
    setSearchGear('');
    setSearchAthlete('');
  }

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
              Gear Assignments
            </Typography>
            <Typography variant="body2" sx={{ color: '#a8a8ac' }}>
              Locate, review, and manage equipment assignment coverage.
            </Typography>
          </Box>

          <Button variant="contained" onClick={startAdd} sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2, px: 2, bgcolor: ACCENT_ORANGE, '&:hover': { bgcolor: ACCENT_ORANGE_DIM } }}>
            Assign Gear
          </Button>
        </Box>

        <Card sx={{ bgcolor: '#151517', color: '#fff', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', mb: 2.25 }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.15 }}>
              {[
                { label: 'Active Assignments', value: summary.activeAssignments, valueColor: '#d6d6d9' },
                { label: 'Athletes Assigned', value: summary.athletesAssigned, valueColor: '#5f8f62' },
                { label: 'Inventory Assigned', value: summary.inventoryAssigned, valueColor: '#d6d6d9' },
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
                label="Search Gear"
                value={searchGear}
                onChange={(e) => setSearchGear(e.target.value)}
                sx={{
                  minWidth: 220,
                  flex: 1,
                  '& .MuiOutlinedInput-root': { bgcolor: '#131315', color: '#fff', borderRadius: 2 },
                  '& .MuiInputLabel-root': { color: '#a0a0a5' },
                }}
              />
              <TextField
                label="Search Athlete"
                value={searchAthlete}
                onChange={(e) => setSearchAthlete(e.target.value)}
                sx={{
                  minWidth: 220,
                  flex: 1,
                  '& .MuiOutlinedInput-root': { bgcolor: '#131315', color: '#fff', borderRadius: 2 },
                  '& .MuiInputLabel-root': { color: '#a0a0a5' },
                }}
              />
              <Button variant="outlined" onClick={clearFilters} sx={{ ...neutralButtonSx, alignSelf: { xs: 'stretch', md: 'center' } }}>
                Clear Filters
              </Button>
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
        ) : filteredAssignments.length === 0 ? (
          <Card sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none' }}>
            <CardContent sx={{ py: 3 }}>
              <Typography sx={{ color: '#d8d8db', fontWeight: 620, mb: 0.35 }}>
                {assignments.length === 0 ? 'No assignments found.' : 'No assignments match your filters.'}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9a9a9f' }}>
                {assignments.length === 0
                  ? 'Assign gear to begin tracking equipment ownership.'
                  : 'Try adjusting search filters to view available assignments.'}
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <TableContainer component={Paper} sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', overflow: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Gear', 'Athlete', 'Assigned', 'Notes', 'Actions'].map((heading) => (
                    <TableCell key={heading} sx={{ color: '#f1f1f2', fontWeight: 700, borderBottom: '1px solid #2f2f33', whiteSpace: 'nowrap' }}>
                      {heading}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredAssignments.map((item) => (
                  <TableRow key={item.id} hover sx={{ '&:hover': { bgcolor: '#1d1e22' } }}>
                    <TableCell sx={{ color: '#f4f4f5', borderBottom: '1px solid #27272b', fontWeight: 620 }}>
                      {gearOptions.find((g) => g.id === item.gear_item_id)?.name || 'Unknown'}
                    </TableCell>
                    <TableCell sx={{ color: '#d2d2d6', borderBottom: '1px solid #27272b' }}>
                      {athleteOptions.find((a) => a.id === item.athlete_id)?.name || 'Unknown'}
                    </TableCell>
                    <TableCell sx={{ color: '#c7c7cb', borderBottom: '1px solid #27272b', whiteSpace: 'nowrap' }}>
                      {item.assigned_at ? new Date(item.assigned_at).toLocaleString() : 'N/A'}
                    </TableCell>
                    <TableCell sx={{ color: '#d2d2d6', borderBottom: '1px solid #27272b', maxWidth: 280 }}>
                      {item.notes || 'None'}
                    </TableCell>
                    <TableCell sx={{ borderBottom: '1px solid #27272b' }}>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Button variant="outlined" onClick={() => startEdit(item)} sx={neutralButtonSx}>
                          Edit
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => requestDelete(item.id)}
                          sx={{ ...neutralButtonSx, borderColor: DANGER_RED, color: '#f1b2b2', '&:hover': { borderColor: DANGER_RED, color: '#ffd0d0' } }}
                        >
                          Delete
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Dialog open={showModal} onClose={handleModalClose} fullWidth maxWidth="sm" PaperProps={{ sx: dialogPaperSx }}>
          <DialogTitle sx={dialogTitleSx}>{editingId ? 'Edit Assignment' : 'Assign Gear'}</DialogTitle>
          <DialogContent sx={dialogContentSx}>
            <form onSubmit={handleAddOrEdit}>
              <Typography sx={sectionLabelSx}>Assignment</Typography>
              <TextField
                select
                label="Select Gear"
                value={editForm.gear_item_id}
                onChange={(e) => setEditForm((f) => ({ ...f, gear_item_id: e.target.value }))}
                required
                fullWidth
                margin="normal"
              >
                <MenuItem value="">Select Gear</MenuItem>
                {gearOptions.map((opt) => (
                  <MenuItem key={opt.id} value={opt.id}>{opt.name}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Select Athlete"
                value={editForm.athlete_id}
                onChange={(e) => setEditForm((f) => ({ ...f, athlete_id: e.target.value }))}
                required
                fullWidth
                margin="normal"
              >
                <MenuItem value="">Select Athlete</MenuItem>
                {athleteOptions.map((opt) => (
                  <MenuItem key={opt.id} value={opt.id}>{opt.name}</MenuItem>
                ))}
              </TextField>

              <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
              <Typography sx={sectionLabelSx}>Notes</Typography>
              <TextField
                label="Notes"
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                fullWidth
                margin="normal"
              />

              <DialogActions sx={dialogActionsSx}>
                <Button type="button" onClick={handleModalClose} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
                <Button type="submit" disabled={saving} variant="contained" sx={primaryButtonSx}>
                  {saving ? (editingId ? 'Saving...' : 'Assigning...') : (editingId ? 'Save' : 'Assign')}
                </Button>
              </DialogActions>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: dialogPaperSx }}>
          <DialogTitle sx={dialogTitleSx}>Delete Assignment</DialogTitle>
          <DialogContent sx={{ ...dialogContentSx, pt: 0.5 }}>
            <DialogContentText sx={{ color: '#b3b3b7' }}>
              Are you sure you want to delete this assignment? This action cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={dialogActionsSx}>
            <Button onClick={() => setDeleteDialogOpen(false)} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
            <Button onClick={() => { if (deleteId) void handleDelete(deleteId); }} disabled={deleting} variant="contained" sx={destructiveButtonSx}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}
