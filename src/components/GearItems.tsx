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
import Chip from '@mui/material/Chip';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';


interface GearItem {
  id: string;
  name: string;
  category: string;
  size: string;
  serial: string;
  status: string;
  created_at?: string;
}

const statusOptions = [
  'in_storage',
  'assigned',
  'retired',
  'lost',
];

function formatStatusLabel(value: string) {
  return value.replace('_', ' ').toUpperCase();
}

export default function GearItems() {
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

  const [gear, setGear] = useState<GearItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<GearItem, 'id' | 'created_at'>>({ name: '', category: '', size: '', serial: '', status: 'in_storage' });
  const [toast, setToast] = useState<{ open: boolean; message: string; type: 'success' | 'error' }>({ open: false, message: '', type: 'success' });
  const [search, setSearch] = useState({ name: '', category: '', status: '' });
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Fetch gear
  useEffect(() => {
    setLoading(true);
    supabase.from('gear_items').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (error) setError(error.message);
      setGear(data || []);
      setLoading(false);
    });
  }, []);

  // Remove TanStack Table, use plain HTML table below

  // Filtered data
  const filteredGear = gear.filter(item =>
    (search.name === '' || item.name.toLowerCase().includes(search.name.toLowerCase())) &&
    (search.category === '' || item.category.toLowerCase().includes(search.category.toLowerCase())) &&
    (search.status === '' || item.status === search.status)
  );

  const opsBrief = React.useMemo(() => {
    let inStorage = 0;
    let assigned = 0;
    let retired = 0;
    let lost = 0;

    gear.forEach((item) => {
      if (item.status === 'in_storage') inStorage += 1;
      if (item.status === 'assigned') assigned += 1;
      if (item.status === 'retired') retired += 1;
      if (item.status === 'lost') lost += 1;
    });

    return { inStorage, assigned, retired, lost };
  }, [gear]);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ open: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, open: false })), 3000);
  }


  function handleCancelEdit() {
    setEditingId(null);
    setForm({ name: '', category: '', size: '', serial: '', status: 'in_storage' });
    setError('');
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      if (!form.name.trim()) {
        setError('Name is required.');
        showToast('Name is required.', 'error');
        setSaving(false);
        return;
      }
      if (!form.serial.trim()) {
        setError('Serial number is required.');
        showToast('Serial number is required.', 'error');
        setSaving(false);
        return;
      }
      // Unique serial validation
      const serialExists = gear.some(item => item.serial.trim().toLowerCase() === form.serial.trim().toLowerCase() && item.id !== editingId);
      if (serialExists) {
        setError('Serial number must be unique.');
        showToast('Serial number must be unique.', 'error');
        setSaving(false);
        return;
      }
      if (editingId) {
        // Edit
        const { error } = await supabase.from('gear_items').update(form).eq('id', editingId);
        if (error) {
          setError(error.message);
          showToast(error.message, 'error');
        } else {
          setGear(g => g.map(item => item.id === editingId ? { ...item, ...form } : item));
          showToast('Gear updated!', 'success');
          handleCancelEdit();
        }
      } else {
        // Add
        const { data, error } = await supabase.from('gear_items').insert([{ ...form }]).select();
        if (error) {
          setError(error.message);
          showToast(error.message, 'error');
        } else if (data && data[0]) {
          setGear(g => [data[0], ...g]);
          showToast('Gear added!', 'success');
          setForm({ name: '', category: '', size: '', serial: '', status: 'in_storage' });
        }
      }
    } finally {
      setSaving(false);
    }
  }

  const [showAddForm, setShowAddForm] = useState(false);

  function requestDelete(id: string) {
    setDeleteId(id);
    setDeleteDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setError('');
    const { error } = await supabase.from('gear_items').delete().eq('id', deleteId);
    setDeleteDialogOpen(false);
    setDeleteId(null);
    if (error) {
      setError(error.message);
      showToast(error.message, 'error');
    } else {
      showToast('Gear deleted!', 'success');
      setGear(g => g.filter(gItem => gItem.id !== deleteId));
    }
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
              Gear Inventory
            </Typography>
            <Typography variant="body2" sx={{ color: '#a8a8ac' }}>
              System of record for equipment inventory lifecycle.
            </Typography>
          </Box>

          <Button
            variant="contained"
            onClick={() => {
              setShowAddForm(true);
              setEditingId(null);
              setForm({ name: '', category: '', size: '', serial: '', status: 'in_storage' });
            }}
            sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2, px: 2, bgcolor: ACCENT_ORANGE, '&:hover': { bgcolor: ACCENT_ORANGE_DIM } }}
          >
            Add Gear
          </Button>
        </Box>

        <Card sx={{ bgcolor: '#151517', color: '#fff', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', mb: 2.25 }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Typography sx={{ color: '#9a9a9f', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.8 }}>
              Operations Brief
            </Typography>
            <Typography variant="h6" sx={{ color: '#f3f3f4', fontWeight: 660, mb: 1.25 }}>
              Gear Inventory
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.15 }}>
              {[
                { label: 'In Storage', value: opsBrief.inStorage, valueColor: '#d6d6d9' },
                { label: 'Assigned', value: opsBrief.assigned, valueColor: '#5f8f62' },
                { label: 'Retired', value: opsBrief.retired, valueColor: '#9fa0a5' },
                { label: 'Lost', value: opsBrief.lost, valueColor: '#d25757' },
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
                label="Search Category"
                value={search.category}
                onChange={e => setSearch(s => ({ ...s, category: e.target.value }))}
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
                  <MenuItem key={opt} value={opt}>{formatStatusLabel(opt)}</MenuItem>
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
        ) : filteredGear.length === 0 ? (
          <Card sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none' }}>
            <CardContent sx={{ py: 3 }}>
              <Typography sx={{ color: '#d8d8db', fontWeight: 620, mb: 0.35 }}>
                {gear.length === 0 ? 'No gear items found.' : 'No gear items match your filters.'}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9a9a9f' }}>
                {gear.length === 0
                  ? 'Add gear to begin managing inventory lifecycle.'
                  : 'Try adjusting search or status filters to view available inventory items.'}
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <TableContainer component={Paper} sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', overflow: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Name', 'Category', 'Size', 'Serial #', 'Status', 'Actions'].map((heading) => (
                    <TableCell key={heading} sx={{ color: '#f1f1f2', fontWeight: 700, borderBottom: '1px solid #2f2f33', whiteSpace: 'nowrap' }}>
                      {heading}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredGear.map(item => (
                  <TableRow key={item.id} hover sx={{ '&:hover': { bgcolor: '#1d1e22' } }}>
                    <TableCell sx={{ color: '#f4f4f5', borderBottom: '1px solid #27272b', fontWeight: 620 }}>{item.name}</TableCell>
                    <TableCell sx={{ color: '#d2d2d6', borderBottom: '1px solid #27272b' }}>{item.category || 'Not set'}</TableCell>
                    <TableCell sx={{ color: '#d2d2d6', borderBottom: '1px solid #27272b' }}>{item.size || 'Not set'}</TableCell>
                    <TableCell sx={{ color: '#c7c7cb', borderBottom: '1px solid #27272b', whiteSpace: 'nowrap' }}>{item.serial}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid #27272b' }}>
                      <Chip
                        size="small"
                        label={formatStatusLabel(item.status)}
                        sx={{
                          bgcolor: item.status === 'assigned' ? '#1d2b21' : item.status === 'lost' ? '#3a1f1f' : '#1f2022',
                          color: item.status === 'assigned' ? '#c7e2cc' : item.status === 'lost' ? '#f3c2c2' : '#d2d2d6',
                          border: '1px solid #35363a',
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ borderBottom: '1px solid #27272b' }}>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Button
                          variant="outlined"
                          onClick={() => {
                            setEditingId(item.id);
                            setForm({ name: item.name, category: item.category, size: item.size, serial: item.serial, status: item.status });
                            setShowAddForm(true);
                          }}
                          sx={neutralButtonSx}
                        >
                          Edit
                        </Button>
                        <Button variant="outlined" onClick={() => requestDelete(item.id)} sx={{ ...neutralButtonSx, borderColor: DANGER_RED, color: '#f1b2b2', '&:hover': { borderColor: DANGER_RED, color: '#ffd0d0' } }}>
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

        <Dialog open={showAddForm} onClose={() => { setShowAddForm(false); handleCancelEdit(); }} fullWidth maxWidth="sm" PaperProps={{ sx: dialogPaperSx }}>
          <DialogTitle sx={dialogTitleSx}>{editingId ? 'Edit Gear' : 'Add Gear'}</DialogTitle>
          <DialogContent sx={dialogContentSx}>
            <form onSubmit={handleSubmit}>
              <Typography sx={sectionLabelSx}>Identity</Typography>
              <TextField
                label="Name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                fullWidth
                margin="normal"
              />
              <TextField
                label="Serial #"
                value={form.serial}
                onChange={e => setForm(f => ({ ...f, serial: e.target.value }))}
                required
                fullWidth
                margin="normal"
              />

              <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
              <Typography sx={sectionLabelSx}>Attributes</Typography>
              <TextField
                label="Category"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                fullWidth
                margin="normal"
              />
              <TextField
                label="Size"
                value={form.size}
                onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
                fullWidth
                margin="normal"
              />

              <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
              <Typography sx={sectionLabelSx}>Lifecycle</Typography>
              <TextField
                select
                label="Status"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                fullWidth
                margin="normal"
              >
                {statusOptions.map(opt => (
                  <MenuItem key={opt} value={opt}>{formatStatusLabel(opt)}</MenuItem>
                ))}
              </TextField>

              <DialogActions sx={dialogActionsSx}>
                <Button type="button" onClick={() => { setShowAddForm(false); handleCancelEdit(); }} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
                <Button type="submit" disabled={saving} variant="contained" sx={primaryButtonSx}>
                  {saving ? (editingId ? 'Saving...' : 'Adding...') : (editingId ? 'Save' : 'Add')}
                </Button>
              </DialogActions>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: dialogPaperSx }}>
          <DialogTitle sx={dialogTitleSx}>Delete Gear</DialogTitle>
          <DialogContent sx={{ ...dialogContentSx, pt: 0.5 }}>
            <DialogContentText sx={{ color: '#b3b3b7' }}>
              Are you sure you want to delete this gear item? This action cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={dialogActionsSx}>
            <Button onClick={() => setDeleteDialogOpen(false)} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
            <Button onClick={confirmDelete} variant="contained" sx={destructiveButtonSx}>Delete</Button>
          </DialogActions>
        </Dialog>

        <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast(t => ({ ...t, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
          <Alert
            onClose={() => setToast(t => ({ ...t, open: false }))}
            severity={toast.type === 'success' ? 'success' : 'error'}
            sx={{ width: '100%', bgcolor: toast.type === 'success' ? '#1d2b21' : '#2a1818', color: '#fff', border: `1px solid ${toast.type === 'success' ? '#355c3a' : '#854040'}` }}
          >
            {toast.message}
          </Alert>
        </Snackbar>
      </Box>
    </Box>
  );
}
