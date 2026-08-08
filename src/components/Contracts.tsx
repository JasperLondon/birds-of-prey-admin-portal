import * as React from 'react';
import { supabase } from '../supabaseClient';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { ArrowDownward, ArrowUpward, Edit, RestartAlt, DeleteOutline, Visibility } from '@mui/icons-material';

export default function Contracts() {
  const theme = useTheme();
  const previewFullScreen = useMediaQuery(theme.breakpoints.down('sm'));

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

  const [isAdmin, setIsAdmin] = React.useState(false);
  React.useEffect(() => {
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsAdmin(false); return; }
      if (user.user_metadata && user.user_metadata.role === 'admin') {
        setIsAdmin(true);
        return;
      }
      if (user.app_metadata && Array.isArray(user.app_metadata.roles) && user.app_metadata.roles.includes('admin')) {
        setIsAdmin(true);
        return;
      }
      setIsAdmin(false);
    }
    checkRole();
  }, []);

  const [fileUploading, setFileUploading] = React.useState(false);
  const [athletes, setAthletes] = React.useState<any[]>([]);
  const [contracts, setContracts] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    title: '',
    type: 'contract',
    athlete_id: '',
    status: 'draft',
    file_url: '',
    expiration_date: '',
    effective_date: '',
    content_requirements: '',
    acknowledged: false,
    acknowledged_at: '',
    athlete_action: '',
    athlete_message: '',
    admin_response: '',
  });
  const [editId, setEditId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [successMsg, setSuccessMsg] = React.useState('');
  const [formErrors, setFormErrors] = React.useState<any>({});
  const [filterStatus, setFilterStatus] = React.useState('');
  const [filterType, setFilterType] = React.useState('');
  const [filterAthlete, setFilterAthlete] = React.useState('');
  const [searchAthlete, setSearchAthlete] = React.useState('');
  const [sortBy, setSortBy] = React.useState('expiration_date');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const [now] = React.useState(() => new Date());

  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [resetId, setResetId] = React.useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = React.useState(false);

  const [adminResponseOpen, setAdminResponseOpen] = React.useState(false);
  const [adminResponseValue, setAdminResponseValue] = React.useState('');
  const [adminResponseContractId, setAdminResponseContractId] = React.useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState('');
  const [previewSignedUrl, setPreviewSignedUrl] = React.useState('');
  const [previewFileUrl, setPreviewFileUrl] = React.useState('');
  const [previewTitle, setPreviewTitle] = React.useState('');
  const [previewIsPdf, setPreviewIsPdf] = React.useState(false);

  function emptyToNull(value: any) {
    return value === '' ? null : value;
  }

  function buildContractPayload(rawForm: any) {
    return {
      title: rawForm.title?.trim() || '',
      type: rawForm.type || 'contract',
      athlete_id: emptyToNull(rawForm.athlete_id),
      status: rawForm.status || 'draft',
      file_url: emptyToNull(rawForm.file_url),
      expiration_date: emptyToNull(rawForm.expiration_date),
      effective_date: emptyToNull(rawForm.effective_date),
      content_requirements: rawForm.content_requirements
        ? (typeof rawForm.content_requirements === 'string'
            ? JSON.parse(rawForm.content_requirements)
            : rawForm.content_requirements)
        : null,
      acknowledged: !!rawForm.acknowledged,
      acknowledged_at: emptyToNull(rawForm.acknowledged_at),
      athlete_action: emptyToNull(rawForm.athlete_action),
      athlete_message: emptyToNull(rawForm.athlete_message),
      admin_response: emptyToNull(rawForm.admin_response),
    };
  }

  const fetchContracts = async () => {
    setLoading(true);
    const { data: contractsData, error } = await supabase.from('contracts').select('*');
    if (error) {
      setErrorMsg(error.message || 'Failed to load contracts.');
    }
    setContracts(contractsData || []);
    setLoading(false);
  };

  React.useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [{ data: contractsData, error: contractsError }, { data: athletesData, error: athletesError }] = await Promise.all([
        supabase.from('contracts').select('*'),
        supabase.from('athletes').select('id, name'),
      ]);
      if (contractsError) {
        setErrorMsg(contractsError.message || 'Failed to load contracts.');
      }
      if (athletesError) {
        setErrorMsg(athletesError.message || 'Failed to load athletes.');
      }
      setContracts(contractsData || []);
      setAthletes(athletesData || []);
      setLoading(false);
    };
    fetchAll();
  }, []);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `contracts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('files').upload(filePath, file, { upsert: false });
      if (error) throw error;
      setForm((f) => ({ ...f, file_url: filePath }));
    } catch (err: any) {
      setErrorMsg('File upload failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setFileUploading(false);
    }
  }

  async function addOrEditContract() {
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    const errors: any = {};
    if (form.content_requirements) {
      try { JSON.parse(form.content_requirements); } catch { errors.content_requirements = 'Invalid JSON.'; }
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSaving(false);
      setErrorMsg('Please fix the errors above.');
      return;
    }

    console.log('Submitting contract form payload:', form);
    let error;
    const payload = buildContractPayload(form);
    if (editId) {
      ({ error } = await supabase.from('contracts').update(payload).eq('id', editId));
      console.log('Supabase update error:', error);
    } else {
      ({ error } = await supabase.from('contracts').insert([payload]));
      console.log('Supabase insert error:', error);
    }
    setSaving(false);

    if (!error) {
      setOpen(false);
      setForm({
        title: '',
        type: 'contract',
        athlete_id: '',
        status: 'draft',
        file_url: '',
        expiration_date: '',
        effective_date: '',
        content_requirements: '',
        acknowledged: false,
        acknowledged_at: '',
        athlete_action: '',
        athlete_message: '',
        admin_response: '',
      });
      setEditId(null);
      setFormErrors({});
      setSuccessMsg(editId ? 'Contract updated!' : 'Contract added!');
      fetchContracts();
    } else {
      setErrorMsg(error.message || 'Failed to save contract.');
    }
  }

  function openAdd() {
    setOpen(true);
    setEditId(null);
    setErrorMsg('');
    setSuccessMsg('');
    setFormErrors({});
    setForm({
      title: '',
      type: 'contract',
      athlete_id: '',
      status: 'draft',
      file_url: '',
      expiration_date: '',
      effective_date: '',
      content_requirements: '',
      acknowledged: false,
      acknowledged_at: '',
      athlete_action: '',
      athlete_message: '',
      admin_response: '',
    });
  }

  function openEdit(contract: any) {
    setForm({
      title: contract.title || '',
      type: contract.type || '',
      athlete_id: contract.athlete_id || '',
      status: (contract.status || 'Draft').toLowerCase(),
      file_url: contract.file_url || '',
      expiration_date: contract.expiration_date || '',
      effective_date: contract.effective_date || '',
      content_requirements:
        typeof contract.content_requirements === 'string'
          ? contract.content_requirements
          : (contract.content_requirements ? JSON.stringify(contract.content_requirements) : ''),
      acknowledged: contract.acknowledged || false,
      acknowledged_at: contract.acknowledged_at || '',
      athlete_action: contract.athlete_action || '',
      athlete_message: contract.athlete_message || '',
      admin_response: contract.admin_response || '',
    });
    setEditId(contract.id);
    setOpen(true);
  }

  function deleteContract(id: string) {
    setDeleteId(id);
    setDeleteDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('contracts').delete().eq('id', deleteId);
    console.log('Supabase delete error:', error);
    setDeleteDialogOpen(false);
    setDeleteId(null);
    fetchContracts();
  }

  function openResetAcknowledgement(id: string) {
    setResetId(id);
    setResetDialogOpen(true);
  }

  async function resetAcknowledgement(id: string) {
    const { error } = await supabase.from('contracts').update({ acknowledged: false, acknowledged_at: null }).eq('id', id);
    if (error) {
      setErrorMsg(error.message || 'Failed to reset acknowledgement.');
    } else {
      setSuccessMsg('Acknowledgement reset.');
      fetchContracts();
    }
  }

  async function confirmResetAcknowledgement() {
    if (!resetId) return;
    await resetAcknowledgement(resetId);
    setResetDialogOpen(false);
    setResetId(null);
  }

  function getAthleteName(id: string) {
    return athletes.find((a) => a.id === id)?.name || '';
  }

  function canPreviewPdf(fileUrl: string) {
    return /\.pdf($|\?)/i.test(fileUrl);
  }

  function closePreviewDialog() {
    setPreviewOpen(false);
    setPreviewLoading(false);
    setPreviewError('');
    setPreviewSignedUrl('');
    setPreviewFileUrl('');
    setPreviewTitle('');
    setPreviewIsPdf(false);
  }

  async function openContractFile(contract: any) {
    const fileUrl = contract?.file_url;
    if (!fileUrl) return;

    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewSignedUrl('');
    setPreviewFileUrl(fileUrl);
    setPreviewTitle(contract?.title || 'Contract File');
    setPreviewIsPdf(canPreviewPdf(fileUrl));

    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      setPreviewSignedUrl(fileUrl);
      setPreviewLoading(false);
      return;
    }

    const { data, error } = await supabase.storage.from('files').createSignedUrl(fileUrl, 60 * 10);
    if (error || !data?.signedUrl) {
      setPreviewError(error?.message || 'Failed to generate secure preview link.');
      setPreviewLoading(false);
      return;
    }

    setPreviewSignedUrl(data.signedUrl);
    setPreviewLoading(false);
  }

  function getAthleteResponse(contract: any) {
    if (contract.acknowledged) {
      return { label: 'Accepted', tone: 'accepted', date: contract.acknowledged_at, message: '' };
    }
    if (contract.athlete_action === 'rejected') {
      return { label: 'Rejected', tone: 'rejected', date: '', message: contract.athlete_message };
    }
    if (contract.athlete_action === 'info_requested') {
      return { label: 'Info Requested', tone: 'requested', date: '', message: contract.athlete_message };
    }
    return { label: 'Awaiting Response', tone: 'awaiting', date: '', message: '' };
  }

  function expiringSoon(date: string) {
    if (!date) return false;
    const d = new Date(date);
    const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 30;
  }

  function overdue(date: string, status: string) {
    if (!date) return false;
    const d = new Date(date);
    return d < now || status === 'expired';
  }

  const filteredContracts = contracts
    .filter((c) => !filterStatus || c.status === filterStatus)
    .filter((c) => !filterType || c.type === filterType)
    .filter((c) => !filterAthlete || c.athlete_id === filterAthlete)
    .filter((c) => {
      if (!searchAthlete) return true;
      const athlete = athletes.find((a) => a.id === c.athlete_id);
      return athlete && athlete.name.toLowerCase().includes(searchAthlete.toLowerCase());
    });

  const sortedContracts = [...filteredContracts].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    if (sortBy.endsWith('_date') || sortBy.endsWith('_at')) {
      aVal = aVal ? new Date(aVal) : 0;
      bVal = bVal ? new Date(bVal) : 0;
    }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const summary = React.useMemo(() => {
    let awaitingAdmin = 0;
    let awaitingAthlete = 0;
    let expiring = 0;
    let expired = 0;
    let accepted = 0;

    contracts.forEach((contract) => {
      if ((contract.athlete_action === 'rejected' || contract.athlete_action === 'info_requested') && !contract.admin_response) {
        awaitingAdmin += 1;
      }

      if (!contract.acknowledged && !contract.athlete_action) {
        awaitingAthlete += 1;
      }

      if (contract.expiration_date) {
        const d = new Date(contract.expiration_date);
        const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (diff > 0 && diff <= 30) {
          expiring += 1;
        }
        if (d < now || contract.status === 'expired') {
          expired += 1;
        }
      }

      if (contract.acknowledged) {
        accepted += 1;
      }
    });

    return { awaitingAdmin, awaitingAthlete, expiring, expired, accepted };
  }, [contracts, now]);

  function clearFilters() {
    setFilterStatus('');
    setFilterType('');
    setFilterAthlete('');
    setSearchAthlete('');
  }

  async function saveAdminResponse() {
    console.log('[AdminResponse] Saving for contract id:', adminResponseContractId, 'value:', adminResponseValue);
    if (!adminResponseContractId) {
      setErrorMsg('No contract selected for admin response.');
      console.error('[AdminResponse] No contract id');
      return;
    }
    if (!adminResponseValue.trim()) {
      setErrorMsg('Response cannot be empty.');
      console.error('[AdminResponse] Empty response');
      return;
    }
    const { error, data } = await supabase.from('contracts').update({ admin_response: adminResponseValue }).eq('id', adminResponseContractId).select();
    console.log('[AdminResponse] Supabase update result:', { error, data });
    if (!error) {
      setSuccessMsg('Admin response saved.');
      setAdminResponseOpen(false);
      setAdminResponseContractId(null);
      setAdminResponseValue('');
      fetchContracts();
    } else {
      setErrorMsg(error.message || 'Failed to save admin response.');
      console.error('[AdminResponse] Error:', error);
    }
  }

  const statusChipSx = (status: string) => {
    if (status === 'active') return { bgcolor: '#1d2b21', color: '#c7e2cc', border: '1px solid #355c3a' };
    if (status === 'expired') return { bgcolor: '#3a1f1f', color: '#f3c2c2', border: '1px solid #6a3c3c' };
    if (status === 'sent') return { bgcolor: '#2d2519', color: '#efcf9d', border: '1px solid #6e5933' };
    return { bgcolor: '#1f2022', color: '#d2d2d6', border: '1px solid #35363a' };
  };

  const responseChipSx = (tone: string) => {
    if (tone === 'accepted') return { bgcolor: '#1d2b21', color: '#c7e2cc', border: '1px solid #355c3a' };
    if (tone === 'rejected') return { bgcolor: '#3a1f1f', color: '#f3c2c2', border: '1px solid #6a3c3c' };
    if (tone === 'requested') return { bgcolor: '#2d2519', color: '#efcf9d', border: '1px solid #6e5933' };
    return { bgcolor: '#1f2022', color: '#d2d2d6', border: '1px solid #35363a' };
  };

  return (
    <>
      <Box sx={{ bgcolor: '#0d0d0e', minHeight: '100vh', px: { xs: 2, sm: 3, md: 4 }, py: { xs: 3, sm: 4 }, position: 'relative' }}>
        {(saving || fileUploading) && (
          <Box
            sx={{
              position: 'fixed',
              inset: 0,
              bgcolor: 'rgba(13,13,14,0.35)',
              zIndex: 1300,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress size={32} sx={{ color: ACCENT_ORANGE }} />
          </Box>
        )}

        <Box sx={{ maxWidth: 1320, mx: 'auto' }}>
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
                Contracts
              </Typography>
              <Typography variant="body2" sx={{ color: '#a8a8ac' }}>
                Contract compliance queue for action, review, and response.
              </Typography>
            </Box>

            <Button variant="contained" onClick={openAdd} sx={{ ...primaryButtonSx, fontWeight: 700, px: 2 }}>
              Add Contract
            </Button>
          </Box>

          <Card sx={{ bgcolor: '#151517', color: '#fff', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', mb: 2.25 }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Typography sx={{ color: '#9a9a9f', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.6, mb: 1.1 }}>
                Operations Brief
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' }, gap: 1.1 }}>
                {[
                  { label: 'Awaiting Admin Response', value: summary.awaitingAdmin, valueColor: '#efcf9d' },
                  { label: 'Awaiting Athlete Response', value: summary.awaitingAthlete, valueColor: '#d6d6d9' },
                  { label: 'Expiring Soon', value: summary.expiring, valueColor: '#efcf9d' },
                  { label: 'Expired', value: summary.expired, valueColor: '#d25757' },
                  { label: 'Accepted', value: summary.accepted, valueColor: '#5f8f62' },
                ].map((metric) => (
                  <Box key={metric.label} sx={{ p: 1.1, borderRadius: 2, border: '1px solid #252528', bgcolor: '#131315' }}>
                    <Typography sx={{ color: '#9b9ba0', fontSize: 12.5 }}>{metric.label}</Typography>
                    <Typography sx={{ mt: 0.3, fontSize: 24, fontWeight: 710, color: metric.valueColor }}>{metric.value}</Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ bgcolor: '#151517', color: '#fff', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', mb: 2.25 }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Box sx={{ display: 'flex', gap: 1.3, flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' } }}>
                <TextField label="Filter Status" select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: { xs: '100%', md: 160 }, '& .MuiOutlinedInput-root': { bgcolor: '#131315', color: '#fff', borderRadius: 2 }, '& .MuiInputLabel-root': { color: '#a0a0a5' } }}>
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="sent">Sent</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="expired">Expired</MenuItem>
                </TextField>

                <TextField label="Filter Type" select value={filterType} onChange={(e) => setFilterType(e.target.value)} sx={{ minWidth: { xs: '100%', md: 160 }, '& .MuiOutlinedInput-root': { bgcolor: '#131315', color: '#fff', borderRadius: 2 }, '& .MuiInputLabel-root': { color: '#a0a0a5' } }}>
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="contract">Contract</MenuItem>
                  <MenuItem value="nda">NDA</MenuItem>
                  <MenuItem value="waiver">Waiver</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </TextField>

                <TextField label="Filter Athlete" select value={filterAthlete} onChange={(e) => setFilterAthlete(e.target.value)} sx={{ minWidth: { xs: '100%', md: 190 }, '& .MuiOutlinedInput-root': { bgcolor: '#131315', color: '#fff', borderRadius: 2 }, '& .MuiInputLabel-root': { color: '#a0a0a5' } }}>
                  <MenuItem value="">All</MenuItem>
                  {athletes.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                </TextField>

                <TextField label="Search Athlete Name" value={searchAthlete} onChange={(e) => setSearchAthlete(e.target.value)} sx={{ minWidth: { xs: '100%', md: 220 }, flex: 1, '& .MuiOutlinedInput-root': { bgcolor: '#131315', color: '#fff', borderRadius: 2 }, '& .MuiInputLabel-root': { color: '#a0a0a5' } }} />

                <Button variant="outlined" onClick={clearFilters} sx={neutralButtonSx}>Clear Filters</Button>
              </Box>
            </CardContent>
          </Card>

          {errorMsg && (
            <Box sx={{ mb: 2.25, p: 1.5, borderRadius: 2, border: `1px solid ${DANGER_RED}`, bgcolor: '#2a1818' }}>
              <Typography sx={{ color: '#f2c0c0', fontSize: 14 }}>{errorMsg}</Typography>
            </Box>
          )}

          {loading ? (
            <Card sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none' }}>
              <CardContent sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={28} sx={{ color: ACCENT_ORANGE }} />
              </CardContent>
            </Card>
          ) : sortedContracts.length === 0 ? (
            <Card sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none' }}>
              <CardContent sx={{ py: 3 }}>
                <Typography sx={{ color: '#d8d8db', fontWeight: 620, mb: 0.35 }}>
                  {contracts.length === 0 ? 'No contracts found.' : 'No contracts match your filters.'}
                </Typography>
                <Typography variant="body2" sx={{ color: '#9a9a9f' }}>
                  {contracts.length === 0
                    ? 'Contracts will appear here as they are created and assigned.'
                    : 'Try adjusting filters to review available contracts.'}
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <TableContainer component={Paper} sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', overflow: 'auto' }}>
              <Table size="small" sx={{ minWidth: 1040 }}>
                <TableHead>
                  <TableRow>
                    {['Athlete', 'Title', 'Type', 'Status', 'Effective Date', 'Expiration Date', 'Acknowledged', 'Acknowledged At', 'Created At', 'Actions'].map((col) => (
                      <TableCell key={col} sx={{ color: '#f1f1f2', fontWeight: 700, borderBottom: '1px solid #2f2f33', whiteSpace: 'nowrap' }}>
                        {col !== 'Actions' ? (
                          <Box
                            component="span"
                            sx={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                            onClick={() => {
                              const colMap: any = {
                                Athlete: 'athlete_id',
                                Title: 'title',
                                Type: 'type',
                                Status: 'status',
                                'Effective Date': 'effective_date',
                                'Expiration Date': 'expiration_date',
                                Acknowledged: 'acknowledged',
                                'Acknowledged At': 'acknowledged_at',
                                'Created At': 'created_at',
                              };
                              const key = colMap[col];
                              if (sortBy === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
                              else { setSortBy(key); setSortDir('asc'); }
                            }}
                          >
                            {col}
                            {sortBy === {
                              Athlete: 'athlete_id',
                              Title: 'title',
                              Type: 'type',
                              Status: 'status',
                              'Effective Date': 'effective_date',
                              'Expiration Date': 'expiration_date',
                              Acknowledged: 'acknowledged',
                              'Acknowledged At': 'acknowledged_at',
                              'Created At': 'created_at',
                            }[col] && (
                              sortDir === 'asc'
                                ? <ArrowDownward fontSize="inherit" sx={{ ml: 0.5, fontSize: 16 }} />
                                : <ArrowUpward fontSize="inherit" sx={{ ml: 0.5, fontSize: 16 }} />
                            )}
                          </Box>
                        ) : col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {sortedContracts.map((contract) => {
                    const response = getAthleteResponse(contract);
                    const needsAdminResponse = (contract.athlete_action === 'rejected' || contract.athlete_action === 'info_requested') && !contract.admin_response;
                    const isExpired = overdue(contract.expiration_date, contract.status);
                    const isExpiringSoon = expiringSoon(contract.expiration_date);

                    return (
                      <TableRow
                        key={contract.id}
                        hover
                        sx={{
                          '&:hover': { bgcolor: '#1d1e22' },
                          bgcolor: needsAdminResponse ? '#191611' : (isExpired ? '#1d1515' : (isExpiringSoon ? '#181613' : 'transparent')),
                        }}
                      >
                        <TableCell sx={{ color: '#f4f4f5', borderBottom: '1px solid #27272b', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <Tooltip title={getAthleteName(contract.athlete_id)} arrow>
                            <span>{getAthleteName(contract.athlete_id)}</span>
                          </Tooltip>
                        </TableCell>

                        <TableCell sx={{ color: '#f4f4f5', borderBottom: '1px solid #27272b', minWidth: 220 }}>
                          <Typography sx={{ fontWeight: 620, maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {contract.title}
                          </Typography>
                          {(contract.athlete_action === 'rejected' || contract.athlete_action === 'info_requested') ? (
                            <Typography sx={{ color: '#9f9fa3', fontSize: 12.5, mt: 0.25 }}>
                              {contract.admin_response ? 'Admin Response Added' : 'Awaiting Admin Response'}
                            </Typography>
                          ) : null}
                        </TableCell>

                        <TableCell sx={{ color: '#d2d2d6', borderBottom: '1px solid #27272b', whiteSpace: 'nowrap' }}>{contract.type}</TableCell>

                        <TableCell sx={{ borderBottom: '1px solid #27272b' }}>
                          <Chip
                            size="small"
                            label={contract.status}
                            sx={statusChipSx((contract.status || '').toLowerCase())}
                          />
                        </TableCell>

                        <TableCell sx={{ color: '#d2d2d6', borderBottom: '1px solid #27272b', whiteSpace: 'nowrap' }}>{contract.effective_date}</TableCell>

                        <TableCell sx={{ color: '#d2d2d6', borderBottom: '1px solid #27272b', whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                            <Typography sx={{ color: '#d2d2d6' }}>{contract.expiration_date}</Typography>
                            {isExpired ? <Typography sx={{ color: '#d98f8f', fontSize: 12 }}>Expired</Typography> : null}
                            {!isExpired && isExpiringSoon ? <Typography sx={{ color: '#efcf9d', fontSize: 12 }}>Expiring Soon</Typography> : null}
                          </Box>
                        </TableCell>

                        <TableCell sx={{ borderBottom: '1px solid #27272b', minWidth: 220 }}>
                          <Chip
                            size="small"
                            label={response.label}
                            sx={responseChipSx(response.tone)}
                          />
                          {response.date ? (
                            <Typography sx={{ color: '#9a9a9f', fontSize: 12.5, mt: 0.45 }}>{new Date(response.date).toLocaleString()}</Typography>
                          ) : null}
                          {response.message ? (
                            <Typography sx={{ color: '#9a9a9f', fontSize: 12.5, mt: 0.45 }}>
                              {response.tone === 'rejected' ? 'Reason: ' : 'Request: '}
                              {response.message}
                            </Typography>
                          ) : null}

                          {(contract.athlete_action === 'rejected' || contract.athlete_action === 'info_requested') && (
                            <Box sx={{ mt: 0.7 }}>
                              <Typography sx={{ color: '#90caf9', fontSize: 12.5, fontWeight: 600 }}>Admin Response:</Typography>
                              {contract.admin_response ? (
                                <Typography sx={{ color: '#d2d2d6', fontSize: 12.5 }}>{contract.admin_response}</Typography>
                              ) : (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="warning"
                                  sx={{ mt: 0.4, textTransform: 'none' }}
                                  onClick={() => {
                                    console.log('[AdminResponse] Open modal for contract id:', contract.id, 'current value:', contract.admin_response);
                                    setAdminResponseOpen(true);
                                    setAdminResponseContractId(contract.id);
                                    setAdminResponseValue(contract.admin_response || '');
                                    setErrorMsg('');
                                    setSuccessMsg('');
                                  }}
                                >
                                  Respond
                                </Button>
                              )}
                            </Box>
                          )}
                        </TableCell>

                        <TableCell sx={{ color: '#d2d2d6', borderBottom: '1px solid #27272b', whiteSpace: 'nowrap' }}>
                          {contract.acknowledged_at ? new Date(contract.acknowledged_at).toLocaleString() : ''}
                        </TableCell>

                        <TableCell sx={{ color: '#d2d2d6', borderBottom: '1px solid #27272b', whiteSpace: 'nowrap' }}>
                          {contract.created_at ? new Date(contract.created_at).toLocaleString() : ''}
                        </TableCell>

                        <TableCell sx={{ borderBottom: '1px solid #27272b', minWidth: 205 }}>
                          {isAdmin && (
                            <Box sx={{ display: 'flex', gap: 0.7, alignItems: 'center', flexWrap: 'wrap' }}>
                              <Tooltip title="Edit">
                                <IconButton color="primary" onClick={() => openEdit(contract)} aria-label={`Edit contract ${contract.title}`}>
                                  <Edit />
                                </IconButton>
                              </Tooltip>

                              {contract.file_url && (
                                <Tooltip title="View File">
                                  <IconButton
                                    color="info"
                                    aria-label={`View file for contract ${contract.title}`}
                                    onClick={() => { void openContractFile(contract); }}
                                  >
                                    <Visibility />
                                  </IconButton>
                                </Tooltip>
                              )}

                              <Tooltip title="Reset Acknowledgement">
                                <span>
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<RestartAlt />}
                                    onClick={() => openResetAcknowledgement(contract.id)}
                                    disabled={!contract.acknowledged}
                                    sx={{ ...neutralButtonSx, minWidth: 0, px: 1 }}
                                    aria-label={`Reset acknowledgement for contract ${contract.title}`}
                                    tabIndex={0}
                                  >
                                    Reset
                                  </Button>
                                </span>
                              </Tooltip>

                              <Tooltip title="Delete">
                                <IconButton color="error" onClick={() => deleteContract(contract.id)} aria-label={`Delete contract ${contract.title}`}>
                                  <DeleteOutline />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>

        <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
          <DialogTitle sx={dialogTitleSx}>{editId ? 'Edit Contract' : 'Add Contract'}</DialogTitle>
          <DialogContent sx={dialogContentSx}>
            {errorMsg && <Typography sx={{ color: '#f2c0c0', mb: 1 }}>{errorMsg}</Typography>}
            {successMsg && <Typography sx={{ color: '#a6caa8', mb: 1 }}>{successMsg}</Typography>}

            {form && (form.acknowledged || form.athlete_action) && (
              <Box sx={{ mb: 2, p: 2, borderRadius: 2, bgcolor: '#131315', border: '1px solid #2d2d31' }}>
                <Typography sx={{ color: '#a8a8ac', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.65 }}>
                  Athlete Response
                </Typography>
                <Chip
                  size="small"
                  label={form.acknowledged ? 'Accepted' : form.athlete_action === 'rejected' ? 'Rejected' : form.athlete_action === 'info_requested' ? 'Info Requested' : 'Awaiting Response'}
                  sx={responseChipSx(form.acknowledged ? 'accepted' : form.athlete_action === 'rejected' ? 'rejected' : form.athlete_action === 'info_requested' ? 'requested' : 'awaiting')}
                />

                {form.acknowledged && form.acknowledged_at && (
                  <Typography sx={{ color: '#9a9a9f', fontSize: 12.5, mt: 0.7 }}>
                    {new Date(form.acknowledged_at).toLocaleString()}
                  </Typography>
                )}

                {form.athlete_action === 'rejected' && form.athlete_message && (
                  <Typography sx={{ color: '#b7b7bc', fontSize: 13, mt: 0.9 }}>Reason: {form.athlete_message}</Typography>
                )}
                {form.athlete_action === 'info_requested' && form.athlete_message && (
                  <Typography sx={{ color: '#b7b7bc', fontSize: 13, mt: 0.9 }}>Request: {form.athlete_message}</Typography>
                )}

                {(form.athlete_action === 'rejected' || form.athlete_action === 'info_requested') && (
                  <Box sx={{ mt: 1.15 }}>
                    <Typography sx={{ color: '#90caf9', fontWeight: 600, fontSize: 12.5 }}>Admin Response:</Typography>
                    {form.admin_response ? (
                      <Typography sx={{ color: '#d8d8db', mt: 0.4 }}>{form.admin_response}</Typography>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        sx={{ mt: 0.7, textTransform: 'none' }}
                        onClick={() => {
                          console.log('[AdminResponse] Open modal for contract id:', editId, 'current value:', form.admin_response);
                          setAdminResponseOpen(true);
                          setAdminResponseContractId(editId);
                          setAdminResponseValue(form.admin_response || '');
                          setErrorMsg('');
                          setSuccessMsg('');
                        }}
                      >
                        Respond
                      </Button>
                    )}
                    {!form.admin_response && (
                      <Typography sx={{ color: '#efcf9d', fontWeight: 600, mt: 0.8 }}>(Awaiting Admin Response)</Typography>
                    )}
                  </Box>
                )}
              </Box>
            )}

            <Typography sx={sectionLabelSx}>Contract</Typography>
            <TextField label="Title" fullWidth margin="normal" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} error={!!formErrors.title} helperText={formErrors.title} />
            <TextField label="Type" select fullWidth margin="normal" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} error={!!formErrors.type} helperText={formErrors.type}>
              <MenuItem value="contract">Contract</MenuItem>
              <MenuItem value="nda">NDA</MenuItem>
              <MenuItem value="waiver">Waiver</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>
            <TextField label="Athlete" select fullWidth margin="normal" value={form.athlete_id} onChange={(e) => setForm({ ...form, athlete_id: e.target.value })} error={!!formErrors.athlete_id} helperText={formErrors.athlete_id}>
              {athletes.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </TextField>
            <TextField label="Status" select fullWidth margin="normal" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} error={!!formErrors.status} helperText={formErrors.status}>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="sent">Sent</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="expired">Expired</MenuItem>
            </TextField>

            <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
            <Typography sx={sectionLabelSx}>File</Typography>
            <Box sx={{ my: 1 }}>
              <Button component="label" variant="outlined" disabled={fileUploading} sx={neutralButtonSx}>
                {fileUploading ? 'Uploading...' : (form.file_url ? 'Replace File' : 'Upload File')}
                <input type="file" hidden onChange={handleFileUpload} />
              </Button>
              {form.file_url && (
                <Typography variant="caption" sx={{ ml: 2, color: '#90caf9' }}>File uploaded</Typography>
              )}
            </Box>

            <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
            <Typography sx={sectionLabelSx}>Dates</Typography>
            <TextField label="Expiration Date" type="date" fullWidth margin="normal" value={form.expiration_date} onChange={(e) => setForm({ ...form, expiration_date: e.target.value })} error={!!formErrors.expiration_date} helperText={formErrors.expiration_date} InputLabelProps={{ shrink: true }} />
            <TextField label="Effective Date" type="date" fullWidth margin="normal" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} error={!!formErrors.effective_date} helperText={formErrors.effective_date} InputLabelProps={{ shrink: true }} />

            <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
            <Typography sx={sectionLabelSx}>Requirements</Typography>
            <TextField
              label="Content Requirements (JSON)"
              fullWidth
              margin="normal"
              multiline
              minRows={2}
              value={form.content_requirements}
              onChange={(e) => setForm({ ...form, content_requirements: e.target.value })}
              error={!!formErrors.content_requirements}
              helperText={formErrors.content_requirements || 'Enter JSON for requirements.'}
            />
          </DialogContent>
          <DialogActions sx={dialogActionsSx}>
            <Button onClick={() => setOpen(false)} disabled={saving} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
            <Button onClick={addOrEditContract} variant="contained" disabled={saving} sx={primaryButtonSx}>
              {saving ? 'Saving...' : (editId ? 'Update' : 'Add')}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: dialogPaperSx }}>
          <DialogTitle sx={dialogTitleSx}>Delete Contract</DialogTitle>
          <DialogContent sx={{ ...dialogContentSx, pt: 0.5 }}>
            <DialogContentText sx={{ color: '#b3b3b7' }}>
              Are you sure you want to delete this contract? This action cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={dialogActionsSx}>
            <Button onClick={() => setDeleteDialogOpen(false)} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
            <Button onClick={confirmDelete} variant="contained" sx={destructiveButtonSx}>Delete</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: dialogPaperSx }}>
          <DialogTitle sx={dialogTitleSx}>Reset Acknowledgement</DialogTitle>
          <DialogContent sx={{ ...dialogContentSx, pt: 0.5 }}>
            <DialogContentText sx={{ color: '#b3b3b7' }}>
              Are you sure you want to reset acknowledgement for this contract?
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={dialogActionsSx}>
            <Button onClick={() => setResetDialogOpen(false)} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
            <Button onClick={confirmResetAcknowledgement} variant="contained" sx={destructiveButtonSx}>Reset</Button>
          </DialogActions>
        </Dialog>
      </Box>

      <Dialog open={adminResponseOpen} onClose={() => setAdminResponseOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={dialogTitleSx}>Admin Response</DialogTitle>
        <DialogContent sx={dialogContentSx}>
          {errorMsg && <Typography sx={{ color: '#f2c0c0', mb: 1 }}>{errorMsg}</Typography>}
          {successMsg && <Typography sx={{ color: '#a6caa8', mb: 1 }}>{successMsg}</Typography>}
          <TextField
            label="Enter your response"
            fullWidth
            multiline
            minRows={2}
            value={adminResponseValue}
            onChange={(e) => setAdminResponseValue(e.target.value)}
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={dialogActionsSx}>
          <Button onClick={() => setAdminResponseOpen(false)} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
          <Button onClick={saveAdminResponse} variant="contained" disabled={!adminResponseValue.trim()} sx={primaryButtonSx}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={previewOpen}
        onClose={closePreviewDialog}
        fullScreen={previewFullScreen}
        fullWidth
        maxWidth="lg"
        PaperProps={{
          sx: {
            ...dialogPaperSx,
            borderColor: '#2b2b2e',
            height: { xs: '96vh', sm: '88vh' },
            maxHeight: { xs: '96vh', sm: '88vh' },
          },
        }}
      >
        <DialogTitle sx={{ ...dialogTitleSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ fontWeight: 690, color: '#f4f4f5', pr: 1 }}>{previewTitle || 'Contract File'}</Typography>
          <Button onClick={closePreviewDialog} variant="outlined" sx={neutralButtonSx} aria-label="Close file preview">Close</Button>
        </DialogTitle>

        <DialogContent sx={{ pt: 0.5, px: { xs: 2, sm: 3 }, pb: 1.5, overflowX: 'hidden' }}>
          <Box sx={{ border: '1px solid #2b2b2e', bgcolor: '#101113', borderRadius: 2, minHeight: { xs: '62vh', sm: '66vh' }, height: { xs: '62vh', sm: '66vh' }, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
            {previewLoading ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={26} sx={{ color: ACCENT_ORANGE }} />
                <Typography sx={{ color: '#a8a8ac', fontSize: 13 }}>Generating secure preview...</Typography>
              </Box>
            ) : previewError ? (
              <Box sx={{ textAlign: 'center' }}>
                <Typography sx={{ color: '#f2c0c0', mb: 0.75 }}>{previewError}</Typography>
                <Typography sx={{ color: '#9a9a9f', fontSize: 13 }}>You can still use Open in New Tab if available.</Typography>
              </Box>
            ) : previewSignedUrl && previewIsPdf ? (
              <Box sx={{ width: '100%', height: '100%', borderRadius: 1, overflow: 'hidden' }}>
                <iframe
                  title={`Preview: ${previewTitle || 'Contract file'}`}
                  src={previewSignedUrl}
                  style={{ width: '100%', height: '100%', border: 'none', background: '#101113' }}
                />
              </Box>
            ) : previewSignedUrl ? (
              <Box sx={{ textAlign: 'center' }}>
                <Typography sx={{ color: '#d2d2d6', mb: 0.75 }}>Preview is not available for this file type.</Typography>
                {previewFileUrl ? (
                  <Typography sx={{ color: '#8f9094', fontSize: 12.5, mb: 0.75, wordBreak: 'break-all' }}>{previewFileUrl}</Typography>
                ) : null}
                <Typography sx={{ color: '#9a9a9f', fontSize: 13 }}>
                  Use Open in New Tab to view this file.
                </Typography>
              </Box>
            ) : (
              <Typography sx={{ color: '#9a9a9f', fontSize: 13 }}>No preview is available for this file.</Typography>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ ...dialogActionsSx, px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 2.2 } }}>
          <Button
            variant="outlined"
            sx={neutralButtonSx}
            disabled={!previewSignedUrl}
            onClick={() => window.open(previewSignedUrl, '_blank', 'noopener,noreferrer')}
          >
            Open in New Tab
          </Button>
          {previewSignedUrl && (
            <Button
              component="a"
              href={previewSignedUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              variant="contained"
              sx={primaryButtonSx}
            >
              Download
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
