import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import Chip from '@mui/material/Chip';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';

interface GearRequest {
  id: string;
  name: string;
  category: string;
  size: string;
  notes: string;
  athlete_id: string;
  created_at: string;
  status?: string; // optional, if present in some records
}

interface AthleteProfile {
  id: string;
  name: string | null;
  email: string | null;
}

const columns = [
  { id: 'name', label: 'Request' },
  { id: 'athlete_id', label: 'Athlete' },
  { id: 'created_at', label: 'Requested At' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: 'Actions' },
];

const AdminGearRequestsTable: React.FC = () => {
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

  const [gearRequests, setGearRequests] = useState<GearRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [athletesById, setAthletesById] = useState<Record<string, AthleteProfile>>({});


  const fetchRequests = async () => {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('gear_requests')
      .select('id, name, category, size, notes, athlete_id, created_at, status')
      .order('created_at', { ascending: false });

    if (error) {
      setError(error.message || 'Failed to load gear requests.');
    } else if (data) {
      setGearRequests(data);

      const athleteIds = Array.from(new Set(data.map((row) => row.athlete_id).filter(Boolean)));
      if (athleteIds.length > 0) {
        const { data: athleteRows, error: athleteError } = await supabase
          .from('athletes')
          .select('id, name, email')
          .in('id', athleteIds);

        if (!athleteError && athleteRows) {
          const nextMap: Record<string, AthleteProfile> = {};
          athleteRows.forEach((athlete) => {
            nextMap[athlete.id] = athlete as AthleteProfile;
          });
          setAthletesById(nextMap);
        } else {
          setAthletesById({});
        }
      } else {
        setAthletesById({});
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    let subscription: any;
    fetchRequests();
    // Subscribe to realtime updates
    subscription = supabase
      .channel('gear_requests_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gear_requests' }, fetchRequests)
      .subscribe();
    return () => {
      if (subscription) supabase.removeChannel(subscription);
    };
  }, []);


  // Action handlers
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const handleUpdateStatus = async (id: string, status: string) => {
    setError('');
    setActionLoading(id + status);
    const { error } = await supabase.from('gear_requests').update({ status }).eq('id', id);
    if (error) {
      setError('Failed to update status: ' + error.message);
    }
    await fetchRequests();
    setActionLoading(null);
  };
  const handleDelete = async (id: string) => {
    setError('');
    setActionLoading(id + 'delete');
    const { error } = await supabase.from('gear_requests').delete().eq('id', id);
    if (error) {
      setError('Failed to delete request: ' + error.message);
    }
    await fetchRequests();
    setActionLoading(null);
    setDeleteDialogOpen(false);
    setDeleteId(null);
  };

  const normalizedStatus = (value?: string) => {
    if (!value || value.trim() === '') return 'pending';
    return value.toLowerCase();
  };

  const summary = React.useMemo(() => {
    let pending = 0;
    let approved = 0;
    let denied = 0;

    gearRequests.forEach((row) => {
      const state = normalizedStatus(row.status);
      if (state === 'pending') pending += 1;
      if (state === 'approved') approved += 1;
      if (state === 'denied') denied += 1;
    });

    return { pending, approved, denied };
  }, [gearRequests]);

  const filteredRequests = gearRequests.filter((row) => {
    const rowStatus = normalizedStatus(row.status);
    const athleteProfile = athletesById[row.athlete_id];
    const athleteName = (athleteProfile?.name || '').toLowerCase();
    const athleteEmail = (athleteProfile?.email || '').toLowerCase();
    const searchMatch =
      search.trim() === '' ||
      row.name.toLowerCase().includes(search.toLowerCase()) ||
      row.category.toLowerCase().includes(search.toLowerCase()) ||
      row.size.toLowerCase().includes(search.toLowerCase()) ||
      row.notes.toLowerCase().includes(search.toLowerCase()) ||
      athleteName.includes(search.toLowerCase()) ||
      athleteEmail.includes(search.toLowerCase()) ||
      row.athlete_id.toLowerCase().includes(search.toLowerCase());
    const statusMatch = statusFilter === '' || rowStatus === statusFilter;
    return searchMatch && statusMatch;
  });

  const requestDelete = (id: string) => {
    setDeleteId(id);
    setDeleteDialogOpen(true);
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
  };

  const statusChipSx = (status: string) => {
    if (status === 'approved') {
      return {
        bgcolor: '#1d2b21',
        color: '#c7e2cc',
        border: '1px solid #355c3a',
      };
    }

    if (status === 'denied') {
      return {
        bgcolor: '#3a1f1f',
        color: '#f3c2c2',
        border: '1px solid #6a3c3c',
      };
    }

    return {
      bgcolor: '#2d2519',
      color: '#efcf9d',
      border: '1px solid #6e5933',
    };
  };

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
              Gear Requests
            </Typography>
            <Typography variant="body2" sx={{ color: '#a8a8ac' }}>
              Operational inbox for gear request review and disposition.
            </Typography>
          </Box>
        </Box>

        <Card sx={{ bgcolor: '#151517', color: '#fff', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', mb: 2.25 }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.15 }}>
              {[
                { label: 'Pending', value: summary.pending, valueColor: '#efcf9d' },
                { label: 'Approved', value: summary.approved, valueColor: '#5f8f62' },
                { label: 'Denied', value: summary.denied, valueColor: '#d25757' },
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
                label="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                sx={{
                  minWidth: { xs: '100%', md: 200 },
                  '& .MuiOutlinedInput-root': { bgcolor: '#131315', color: '#fff', borderRadius: 2 },
                  '& .MuiInputLabel-root': { color: '#a0a0a5' },
                }}
              >
                <MenuItem value="">All Status</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="denied">Denied</MenuItem>
              </TextField>
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
        ) : filteredRequests.length === 0 ? (
          <Card sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none' }}>
            <CardContent sx={{ py: 3 }}>
              <Typography sx={{ color: '#d8d8db', fontWeight: 620, mb: 0.35 }}>
                {gearRequests.length === 0 ? 'No gear requests found.' : 'No requests match your filters.'}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9a9a9f' }}>
                {gearRequests.length === 0
                  ? 'Incoming athlete requests will appear here for review.'
                  : 'Try adjusting search or status filters to view requests.'}
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <TableContainer component={Paper} sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', overflow: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {columns.map((col) => (
                    <TableCell key={col.id} sx={{ color: '#f1f1f2', fontWeight: 700, borderBottom: '1px solid #2f2f33', whiteSpace: 'nowrap' }}>
                      {col.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRequests.map((row) => {
                  const status = normalizedStatus(row.status);
                  const athleteProfile = athletesById[row.athlete_id];
                  const athleteName = athleteProfile?.name?.trim() || 'Unknown Athlete';
                  const athleteEmail = athleteProfile?.email?.trim() || '';
                  return (
                    <TableRow key={row.id} hover sx={{ '&:hover': { bgcolor: '#1d1e22' }, bgcolor: status === 'pending' ? '#181713' : 'transparent' }}>
                      <TableCell sx={{ color: '#f4f4f5', borderBottom: '1px solid #27272b' }}>
                        <Typography sx={{ fontWeight: 620 }}>{row.name}</Typography>
                        <Typography sx={{ color: '#9a9a9f', fontSize: 12.5 }}>
                          {row.category || 'Unspecified'} · {row.size || 'Unspecified'}
                        </Typography>
                        {row.notes ? (
                          <Typography sx={{ color: '#b4b4b8', fontSize: 12.5, mt: 0.35 }}>{row.notes}</Typography>
                        ) : null}
                      </TableCell>
                      <TableCell sx={{ color: '#d2d2d6', borderBottom: '1px solid #27272b' }}>
                        <Typography sx={{ color: '#d2d2d6', fontWeight: 610 }}>{athleteName}</Typography>
                        {athleteEmail ? (
                          <Typography sx={{ color: '#8f8f94', fontSize: 12.5, mt: 0.2 }}>{athleteEmail}</Typography>
                        ) : null}
                      </TableCell>
                      <TableCell sx={{ color: '#c7c7cb', borderBottom: '1px solid #27272b', whiteSpace: 'nowrap' }}>
                        {row.created_at ? new Date(row.created_at).toLocaleString() : ''}
                      </TableCell>
                      <TableCell sx={{ borderBottom: '1px solid #27272b' }}>
                        <Chip
                          size="small"
                          label={status.charAt(0).toUpperCase() + status.slice(1)}
                          sx={statusChipSx(status)}
                        />
                      </TableCell>
                      <TableCell sx={{ borderBottom: '1px solid #27272b' }}>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          <Button
                            variant="contained"
                            onClick={() => handleUpdateStatus(row.id, 'approved')}
                            disabled={!!actionLoading}
                            sx={primaryButtonSx}
                          >
                            {actionLoading === row.id + 'approved' ? 'Approving...' : 'Approve'}
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={() => handleUpdateStatus(row.id, 'denied')}
                            disabled={!!actionLoading}
                            sx={neutralButtonSx}
                          >
                            {actionLoading === row.id + 'denied' ? 'Denying...' : 'Deny'}
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={() => requestDelete(row.id)}
                            disabled={!!actionLoading}
                            sx={{ ...neutralButtonSx, borderColor: DANGER_RED, color: '#f1b2b2', '&:hover': { borderColor: DANGER_RED, color: '#ffd0d0' } }}
                          >
                            Delete
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: dialogPaperSx }}>
          <DialogTitle sx={dialogTitleSx}>Delete Request</DialogTitle>
          <DialogContent sx={{ pt: 0.5 }}>
            <DialogContentText sx={{ color: '#b3b3b7' }}>
              Are you sure you want to delete this request? This action cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={dialogActionsSx}>
            <Button onClick={() => setDeleteDialogOpen(false)} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
            <Button
              onClick={() => { if (deleteId) void handleDelete(deleteId); }}
              disabled={actionLoading === (deleteId ? deleteId + 'delete' : 'no-id')}
              variant="contained"
              sx={destructiveButtonSx}
            >
              {actionLoading === (deleteId ? deleteId + 'delete' : 'no-id') ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default AdminGearRequestsTable;
