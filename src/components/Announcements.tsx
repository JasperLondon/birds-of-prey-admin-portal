import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Add from '@mui/icons-material/Add';
import './Announcements.scoped.css';

interface Announcement {
  id: string;
  title: string;
  message: string;
  created_at: string;
  audience: string[];
  expires_at: string | null;
}

interface ReadStatus { user_id: string; read_at: string; }

const audienceOptions = [
  { value: 'all', label: 'All Users' },
  { value: 'athletes', label: 'Athletes' },
  { value: 'staff', label: 'Staff' },
];

function normalizeAudience(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v));
  if (typeof value === 'string' && value.trim() !== '') return value.split(',').map(v => v.trim()).filter(Boolean);
  return [];
}

export default function Announcements() {
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

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Announcement, 'id' | 'created_at'> & { audience: string[] }>({
    title: '', message: '', audience: ['all'], expires_at: null
  });
  const [search, setSearch] = useState({ title: '', audience: '' });
  const [saving, setSaving] = useState(false);
  const [readStatuses, setReadStatuses] = useState<{ [id: string]: ReadStatus[] }>({});

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    if (error) setError(error.message);
    setAnnouncements(data || []);
    setLoading(false);
  }

  async function fetchReadStatuses(announcementId: string) {
    const { data, error } = await supabase.from('announcement_reads').select('*').eq('announcement_id', announcementId);
    if (!error) setReadStatuses(rs => ({ ...rs, [announcementId]: data || [] }));
  }

  function startAdd() {
    setEditingId(null);
    setForm({ title: '', message: '', audience: ['all'], expires_at: null });
    setShowModal(true);
    setError('');
  }

  async function startEdit(announcement: Announcement) {
    setEditingId(announcement.id);
    const normalizedAudience = normalizeAudience(announcement.audience);
    setForm({ ...announcement, audience: normalizedAudience.length ? normalizedAudience : ['all'] });
    setShowModal(true);
    setError('');
    await fetchReadStatuses(announcement.id);
  }

  function handleModalClose() {
    setShowModal(false);
    setEditingId(null);
    setError('');
  }

  async function handleDelete(id: string) {
    setError('');
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) setError(error.message);
    else fetchAll();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const targetId = editingId;
      if (!form.title.trim()) {
        setError('Title is required.');
        setSaving(false);
        return;
      }
      if (!form.message.trim()) {
        setError('Message is required.');
        setSaving(false);
        return;
      }
      if (form.audience.length === 0) {
        setError('Select at least one audience.');
        setSaving(false);
        return;
      }
      const payload = {
        title: form.title,
        message: form.message,
        audience: form.audience,
        expires_at: form.expires_at,
      };

      if (targetId) {
        const result = await supabase
          .from('announcements')
          .update(payload)
          .eq('id', targetId)
          .select('id, title, message, audience, expires_at')
          .single();

        if (result.error) {
          const statusPart = typeof result.status === 'number' ? ` (${result.status}${result.statusText ? ` ${result.statusText}` : ''})` : '';
          setError(`Announcement update failed${statusPart}: ${result.error.message}`);
          setSaving(false);
          return;
        }

        if (!result.data || result.data.id !== targetId) {
          const statusPart = typeof result.status === 'number' ? ` (${result.status}${result.statusText ? ` ${result.statusText}` : ''})` : '';
          setError(`Announcement update could not be confirmed for the selected record${statusPart}.`);
          setSaving(false);
          return;
        }
      } else {
        const { error } = await supabase.from('announcements').insert([payload]);
        if (error) {
          setError(error.message);
          setSaving(false);
          return;
        }
      }
      setShowModal(false);
      fetchAll();
    } finally {
      setSaving(false);
    }
  }
  const filteredAnnouncements = announcements.filter(a =>
    (search.title === '' || a.title.toLowerCase().includes(search.title.toLowerCase())) &&
    (search.audience === '' || a.audience.includes(search.audience))
  );

  const summary = React.useMemo(() => {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    let audienceAll = 0;
    let audienceAthletes = 0;
    let audienceStaff = 0;

    announcements.forEach((item) => {
      const expiresMs = item.expires_at ? new Date(item.expires_at).getTime() : null;
      if (expiresMs && !Number.isNaN(expiresMs) && expiresMs < now) expired += 1;
      else active += 1;

      if (Array.isArray(item.audience)) {
        if (item.audience.includes('all')) audienceAll += 1;
        if (item.audience.includes('athletes')) audienceAthletes += 1;
        if (item.audience.includes('staff')) audienceStaff += 1;
      }
    });

    return {
      total: announcements.length,
      active,
      expired,
      audienceAll,
      audienceAthletes,
      audienceStaff,
    };
  }, [announcements]);

  function clearFilters() {
    setSearch({ title: '', audience: '' });
  }

  function formatDateTime(value: string | null) {
    if (!value) return 'None';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  return (
    <div className="mwd-announcements-shell">
      <div className="mwd-announcements-command">
        <div>
          <h2>Announcements</h2>
          <p>Manage operational communication windows and audience reach.</p>
        </div>
        <button className="modern-btn primary" onClick={startAdd}>
          <Add fontSize="small" className="modern-icon" aria-hidden="true" />
          Add Announcement
        </button>
      </div>

      <div className="mwd-announcements-summary-grid" aria-label="Operations Brief">
        <div className="mwd-summary-card">
          <span className="label">Total Announcements</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="mwd-summary-card">
          <span className="label">Active</span>
          <strong>{summary.active}</strong>
        </div>
        <div className="mwd-summary-card">
          <span className="label">Expired</span>
          <strong>{summary.expired}</strong>
        </div>
        <div className="mwd-summary-card">
          <span className="label">Audience Distribution</span>
          <div className="mwd-audience-distribution">
            <span>All Users: {summary.audienceAll}</span>
            <span>Athletes: {summary.audienceAthletes}</span>
            <span>Staff: {summary.audienceStaff}</span>
          </div>
        </div>
      </div>

      <div className="mwd-announcement-filters">
        <div className="mwd-filter-field">
          <label htmlFor="announcement-title-search">Search Title</label>
          <input
            id="announcement-title-search"
            placeholder="Search Title"
            value={search.title}
            onChange={e => setSearch(s => ({ ...s, title: e.target.value }))}
            className="mwd-control"
          />
        </div>
        <div className="mwd-filter-field">
          <label htmlFor="announcement-audience-filter">Audience</label>
          <select
            id="announcement-audience-filter"
            value={search.audience}
            onChange={e => setSearch(s => ({ ...s, audience: e.target.value }))}
            className="mwd-control"
          >
            <option value="">All Audiences</option>
            {audienceOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="mwd-filter-spacer" />
        <span className="mwd-filter-count" aria-live="polite">{filteredAnnouncements.length} shown</span>
        <button className="modern-btn secondary" onClick={clearFilters} type="button">
          Clear Filters
        </button>
      </div>

      {error && <div className="mwd-alert danger">{error}</div>}

      {loading ? (
        <div className="mwd-state-card">
          <div className="mwd-loading-dot" aria-hidden="true" />
          <div>
            <h3>Loading announcements</h3>
            <p>Pulling latest communication records.</p>
          </div>
        </div>
      ) : announcements.length === 0 ? (
        <div className="mwd-state-card">
          <div>
            <h3>No announcements found</h3>
            <p>Add your first announcement to begin managing communication updates.</p>
          </div>
        </div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="mwd-state-card">
          <div>
            <h3>No matching announcements</h3>
            <p>Adjust filters to find existing announcement records.</p>
          </div>
        </div>
      ) : (
        <div className="mwd-announcements-table-wrap">
          <table className="mwd-announcements-table">
            <colgroup>
              <col className="mwd-col-title" />
              <col className="mwd-col-message" />
              <col className="mwd-col-audience" />
              <col className="mwd-col-created" />
              <col className="mwd-col-expires" />
              <col className="mwd-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Title</th>
                <th>Message</th>
                <th>Audience</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAnnouncements.map(a => (
                <tr key={a.id}>
                  <td>
                    <div className="mwd-title-cell">{a.title}</div>
                  </td>
                  <td>
                    <div className="mwd-message-cell">{a.message}</div>
                  </td>
                  <td>
                    <div className="mwd-audience-cell">{a.audience.map(aud => audienceOptions.find(opt => opt.value === aud)?.label || aud).join(', ')}</div>
                  </td>
                  <td className="mwd-time-cell">{formatDateTime(a.created_at)}</td>
                  <td className="mwd-time-cell">{formatDateTime(a.expires_at)}</td>
                  <td>
                    <div className="mwd-row-actions">
                      <button className="modern-btn compact secondary" onClick={() => startEdit(a)} aria-label={`Edit announcement ${a.title}`}>
                        Edit
                      </button>
                      <button className="modern-btn compact danger" onClick={() => handleDelete(a.id)} aria-label={`Delete announcement ${a.title}`}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showModal} onClose={handleModalClose} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={dialogTitleSx}>{editingId ? 'Edit Announcement' : 'Add Announcement'}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent sx={dialogContentSx}>
            {error ? <div className="mwd-alert danger">{error}</div> : null}
            <TextField
              label="Title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              required
              fullWidth
              autoFocus
              margin="dense"
            />
            <TextField
              label="Message"
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              required
              fullWidth
              multiline
              minRows={3}
              margin="dense"
            />
            <div style={sectionLabelSx}>Audience</div>
            <TextField
              select
              value={form.audience}
              onChange={(e) => {
                const nextAudience = normalizeAudience(e.target.value);
                setForm(f => ({ ...f, audience: nextAudience }));
              }}
              SelectProps={{ multiple: true }}
              fullWidth
              margin="dense"
              aria-label="Audience"
            >
              {audienceOptions.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Expires At (optional)"
              type="datetime-local"
              value={form.expires_at || ''}
              onChange={e => setForm(f => ({ ...f, expires_at: e.target.value || null }))}
              fullWidth
              margin="dense"
              InputLabelProps={{ shrink: true }}
            />
          </DialogContent>
          <DialogActions sx={dialogActionsSx}>
            <Button type="button" variant="outlined" onClick={handleModalClose} sx={neutralButtonSx}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saving} sx={primaryButtonSx}>
              {saving ? (editingId ? 'Saving...' : 'Adding...') : (editingId ? 'Save' : 'Add')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </div>
  );
}
