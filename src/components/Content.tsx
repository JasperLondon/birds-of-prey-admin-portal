
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { Edit, DeleteOutline, Visibility, Save, Add, Check, Close } from '@mui/icons-material';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import './Content.scoped.css';

// FilePreview component for image/video
function FilePreview({ fileUrl, type }: { fileUrl: string, type: string }) {
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => {
    let isMounted = true;
    setError(null);
    setBroken(false);
    if (!fileUrl) {
      setPreviewUrl(null);
      return;
    }
    if (fileUrl.startsWith('http')) {
      setPreviewUrl(fileUrl);
      return;
    }
    async function getUrl() {
      const { data, error } = await supabase.storage.from('files').createSignedUrl(fileUrl, 60);
      if (error) {
        if (isMounted) setError('Could not get file preview.');
        console.error('Supabase signedUrl error:', error);
        return;
      }
      if (isMounted && data?.signedUrl) {
        setPreviewUrl(data.signedUrl);
      } else if (isMounted) {
        setError('No signed URL returned.');
      }
    }
    getUrl();
    return () => { isMounted = false; };
  }, [fileUrl]);
  if (error) return <span style={{ color: '#d32f2f', marginRight: 8 }}>{error}</span>;
  if (!previewUrl && (type === 'image' || type === 'video')) return <span style={{ color: '#90caf9', marginRight: 8 }}>Loading...</span>;

  // Document and fallback icons (SVG inline)
  const iconStyle = { width: 40, height: 40, marginRight: 8, verticalAlign: 'middle' };
  const icons: Record<string, JSX.Element> = {
    document: (
      <svg style={iconStyle} viewBox="0 0 24 24" fill="#90caf9"><rect x="4" y="2" width="16" height="20" rx="2"/><rect x="7" y="6" width="10" height="2" fill="#fff"/><rect x="7" y="10" width="10" height="2" fill="#fff"/><rect x="7" y="14" width="7" height="2" fill="#fff"/></svg>
    ),
    pdf: (
      <svg style={iconStyle} viewBox="0 0 24 24" fill="#e53935"><rect x="4" y="2" width="16" height="20" rx="2"/><text x="8" y="17" fontSize="8" fill="#fff">PDF</text></svg>
    ),
    doc: (
      <svg style={iconStyle} viewBox="0 0 24 24" fill="#1976d2"><rect x="4" y="2" width="16" height="20" rx="2"/><text x="8" y="17" fontSize="8" fill="#fff">DOC</text></svg>
    ),
    xls: (
      <svg style={iconStyle} viewBox="0 0 24 24" fill="#388e3c"><rect x="4" y="2" width="16" height="20" rx="2"/><text x="8" y="17" fontSize="8" fill="#fff">XLS</text></svg>
    ),
    ppt: (
      <svg style={iconStyle} viewBox="0 0 24 24" fill="#f57c00"><rect x="4" y="2" width="16" height="20" rx="2"/><text x="8" y="17" fontSize="8" fill="#fff">PPT</text></svg>
    ),
    txt: (
      <svg style={iconStyle} viewBox="0 0 24 24" fill="#bdbdbd"><rect x="4" y="2" width="16" height="20" rx="2"/><text x="8" y="17" fontSize="8" fill="#fff">TXT</text></svg>
    ),
    fallback: (
      <svg style={iconStyle} viewBox="0 0 24 24" fill="#757575"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg>
    ),
  };

  if (type === 'image') {
    return broken ? (
      <span style={{ color: '#d32f2f', marginRight: 8 }}>Image not found</span>
    ) : (
      <img
        src={previewUrl || ''}
        alt="preview"
        style={{ maxWidth: 80, maxHeight: 80, borderRadius: 4, marginRight: 8 }}
        onError={() => setBroken(true)}
      />
    );
  }
  if (type === 'video') {
    return broken ? (
      <span style={{ color: '#d32f2f', marginRight: 8 }}>Video not found</span>
    ) : (
      <video
        src={previewUrl || ''}
        controls
        style={{ maxWidth: 120, maxHeight: 80, borderRadius: 4, marginRight: 8 }}
        onError={() => setBroken(true)}
      />
    );
  }
  // Document types
  if (type === 'document') {
    // Guess extension for icon
    const ext = (fileUrl.split('.').pop() || '').toLowerCase();
    if (['pdf'].includes(ext)) return icons.pdf;
    if (['doc', 'docx'].includes(ext)) return icons.doc;
    if (['xls', 'xlsx'].includes(ext)) return icons.xls;
    if (['ppt', 'pptx'].includes(ext)) return icons.ppt;
    if (['txt'].includes(ext)) return icons.txt;
    return icons.document;
  }
  // Fallback for unknown types
  return icons.fallback;
}

interface ContentItem {
  id: string;
  title: string;
  type: string;
  description: string;
  file_url: string | null;
  external_url: string | null;
  athlete_id: string | null;
  contract_id: string | null;
  due_period: string | null;
  status: string;
  feedback?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
}

interface AthleteOption { id: string; name: string; }
interface ContractOption { id: string; title: string; }


const typeOptions = ['image', 'video', 'document', 'link'];
const statusOptions = ['draft', 'submitted', 'reviewed', 'needs_changes', 'approved', 'completed', 'fulfilled'];

function formatStatusLabel(value: string) {
  return value.replace('_', ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function statusToneClass(value: string) {
  if (value === 'needs_changes') return 'needs-changes';
  if (value === 'submitted') return 'submitted';
  if (value === 'approved' || value === 'fulfilled') return 'done';
  if (value === 'reviewed') return 'reviewed';
  return 'neutral';
}

export default function Content() {
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [athleteOptions, setAthleteOptions] = useState<AthleteOption[]>([]);
  const [contractOptions, setContractOptions] = useState<ContractOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<ContentItem, 'id' | 'created_at'>>({
    title: '', type: 'image', description: '', file_url: '', external_url: '', athlete_id: '', contract_id: '', due_period: '', status: 'submitted'
  });
  const [search, setSearch] = useState({ title: '', type: '', status: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modalFormRef = useRef<HTMLFormElement | null>(null);

  // Per-field error state for form validation
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  // Confirmation dialog state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Combined loading state for overlay
  const isBusy = loading || saving || uploading;

  // State for feedback and status editing per row (moved inside component)
  const [rowEdits, setRowEdits] = useState<Record<string, {feedback: string, status: string}>>({});
  const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({});

  // Compliance summary state
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Update current date every 10 minutes (for overdue highlighting)
    const interval = setInterval(() => setNow(new Date()), 600000);
    return () => clearInterval(interval);
  }, []);

  // Helper: parse due_period (YYYY-MM or YYYY-Qn)
  const isOverdue = React.useCallback((due_period: string | null, status: string) => {
    if (!due_period || status === 'fulfilled') return false;
    const today = now;
    if (/^\d{4}-\d{2}$/.test(due_period)) {
      // YYYY-MM
      const [y, m] = due_period.split('-').map(Number);
      const due = new Date(y, m, 0); // last day of month
      return today > due;
    } else if (/^\d{4}-Q[1-4]$/.test(due_period)) {
      // YYYY-Qn
      const [y, q] = due_period.split('-Q');
      const month = 3 * Number(q);
      const due = new Date(Number(y), month, 0); // last day of quarter
      return today > due;
    }
    return false;
  }, [now]);

  const summary = React.useMemo(() => {
    const total = content.length;
    const byStatus = Object.fromEntries(statusOptions.map(s => [s, 0]));
    let overdue = 0;
    let overdueList: ContentItem[] = [];
    for (const item of content) {
      if (byStatus[item.status] !== undefined) byStatus[item.status]++;
      if (isOverdue(item.due_period, item.status)) {
        overdue++;
        overdueList.push(item);
      }
    }
    return { total, byStatus, overdue, overdueList };
  }, [content, isOverdue]);

  const athleteNameById = React.useMemo(() => {
    const map: Record<string, string> = {};
    athleteOptions.forEach((a) => {
      map[a.id] = a.name;
    });
    return map;
  }, [athleteOptions]);

  const contractTitleById = React.useMemo(() => {
    const map: Record<string, string> = {};
    contractOptions.forEach((c) => {
      map[c.id] = c.title;
    });
    return map;
  }, [contractOptions]);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setError('');
    const [contentRes, athletesRes, contractsRes] = await Promise.all([
      supabase.from('content').select('*').order('created_at', { ascending: false }),
      supabase.from('athletes').select('id, name'),
      supabase.from('contracts').select('id, title'),
    ]);
    if (contentRes.error) setError(contentRes.error.message);
    if (athletesRes.error) setError(athletesRes.error.message);
    if (contractsRes.error) setError(contractsRes.error.message);
    setContent(contentRes.data || []);
    setAthleteOptions(athletesRes.data || []);
    setContractOptions(contractsRes.data || []);
    setLoading(false);
  }

  function startAdd() {
    setEditingId(null);
    setForm({ title: '', type: 'image', description: '', file_url: '', external_url: '', athlete_id: '', contract_id: '', due_period: '', status: 'submitted' });
    setShowModal(true);
    setError('');
    setFormErrors({});
  }

  function startEdit(item: ContentItem) {
    setEditingId(item.id);
    setForm({ ...item });
    setShowModal(true);
    setError('');
    setFormErrors({});
  }

  function handleModalClose() {
    setShowModal(false);
    setEditingId(null);
    setForm({ title: '', type: 'image', description: '', file_url: '', external_url: '', athlete_id: '', contract_id: '', due_period: '', status: 'submitted' });
    setError('');
    setFormErrors({});
  }

  async function handleDelete(id: string) {
    setError('');
    const { error } = await supabase.from('content').delete().eq('id', id);
    if (error) setError(error.message);
    else fetchAll();
    setConfirmDeleteId(null);
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      // Get extension from file name if present
      let ext = '';
      const nameParts = file.name.split('.');
      if (nameParts.length > 1 && nameParts[nameParts.length - 1].length <= 5) {
        ext = nameParts[nameParts.length - 1].toLowerCase();
      }
      // If extension is missing or generic, use MIME type
      if (!ext || ext === 'file') {
        // Map MIME type to extension
        const mimeMap: Record<string, string> = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/gif': 'gif',
          'image/webp': 'webp',
          'image/bmp': 'bmp',
          'image/svg+xml': 'svg',
          'video/mp4': 'mp4',
          'video/quicktime': 'mov',
          'video/x-msvideo': 'avi',
          'video/x-matroska': 'mkv',
          'application/pdf': 'pdf',
          'application/msword': 'doc',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
          'application/vnd.ms-excel': 'xls',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
          'application/vnd.ms-powerpoint': 'ppt',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
          'text/plain': 'txt',
        };
        ext = mimeMap[file.type] || '';
      }
      // Fallback to 'bin' if still missing
      if (!ext) ext = 'bin';
      const filePath = `content/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      let { error } = await supabase.storage.from('files').upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });
      if (error) throw error;
      return filePath;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    // Do not clear formErrors here, only after successful submit or modal close
    // Validate fields
    const errors: { [key: string]: string } = {};
    if (!form.title.trim()) errors.title = 'Title is required.';
    if (!form.type) errors.type = 'Type is required.';
    if (!form.athlete_id) errors.athlete_id = 'Athlete is required.';
    if (form.type === 'link' && !form.external_url) errors.external_url = 'External URL is required for links.';
    // Add more validations as needed
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setError('Please fix the errors below.');
      setSaving(false);
      return;
    }
    try {
      // If file input is present and a file is selected, upload it
      if (form.type !== 'link' && fileInputRef.current && fileInputRef.current.files && fileInputRef.current.files[0]) {
        const fileUrl = await handleFileUpload(fileInputRef.current.files[0]);
        form.file_url = fileUrl;
      }
      if (editingId) {
        const { error } = await supabase.from('content').update(form).eq('id', editingId);
        if (error) setError(error.message);
        else {
          setShowModal(false);
          setFormErrors({});
          fetchAll();
        }
      } else {
        const { error } = await supabase.from('content').insert([{ ...form }]);
        if (error) setError(error.message);
        else {
          setShowModal(false);
          setFormErrors({});
          fetchAll();
        }
      }
    } finally {
      setSaving(false);
    }
  }

  const filteredContent = content.filter(item =>
    (search.title === '' || item.title.toLowerCase().includes(search.title.toLowerCase())) &&
    (search.type === '' || item.type === search.type) &&
    (search.status === '' || item.status === search.status)
  );

  // Bulk selection helpers
  const allSelected = filteredContent.length > 0 && filteredContent.every(item => selectedIds.includes(item.id));
  const someSelected = filteredContent.some(item => selectedIds.includes(item.id));
  function toggleSelectAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(filteredContent.map(item => item.id));
  }
  function toggleSelectOne(id: string) {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }
  async function handleBulkDelete() {
    if (!selectedIds.length) return;
    setBulkSaving(true);
    await supabase.from('content').delete().in('id', selectedIds);
    setBulkSaving(false);
    setSelectedIds([]);
    setConfirmBulkDelete(false);
    fetchAll();
  }
  async function handleBulkStatus() {
    if (!selectedIds.length || !bulkStatus) return;
    setBulkSaving(true);
    await supabase.from('content').update({ status: bulkStatus }).in('id', selectedIds);
    setBulkSaving(false);
    setSelectedIds([]);
    setBulkStatus('');
    fetchAll();
  }

  return (
    <div className="mwd-content-shell">
      {/* Loading Overlay */}
      {isBusy && (
        <div className="mwd-content-overlay">
          <span className="visually-hidden">Loading...</span>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="#c9782d" strokeWidth="4" strokeDasharray="100" strokeDashoffset="60"/>
          </svg>
        </div>
      )}

      <div className="mwd-content-command">
        <div>
          <h2>Content</h2>
          <p>Assignment tracking, review status, and due-period compliance in one operational surface.</p>
        </div>
        <button
          className="modern-btn primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={startAdd}
        >
          <Add fontSize="small" className="modern-icon" aria-hidden="true" />
          Add Content
        </button>
      </div>

      <div className="mwd-content-summary-grid">
        <div className="mwd-summary-card">
          <span className="label">Total</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="mwd-summary-card">
          <span className="label">Submitted</span>
          <strong>{summary.byStatus.submitted}</strong>
        </div>
        <div className="mwd-summary-card">
          <span className="label">Needs Changes</span>
          <strong>{summary.byStatus.needs_changes}</strong>
        </div>
        <div className="mwd-summary-card">
          <span className="label">Approved</span>
          <strong>{summary.byStatus.approved}</strong>
        </div>
        <div className="mwd-summary-card">
          <span className="label">Fulfilled</span>
          <strong>{summary.byStatus.fulfilled}</strong>
        </div>
        <div className={`mwd-summary-card ${summary.overdue > 0 ? 'danger' : ''}`}>
          <span className="label">Overdue</span>
          <strong>{summary.overdue}</strong>
        </div>
      </div>

      {summary.overdueList.length > 0 ? (
        <div className="mwd-content-overdue-strip">
          <span>Overdue Work:</span>
          {summary.overdueList.slice(0, 5).map(item => (
            <span key={item.id} className="overdue-item">
              {item.title}
              {item.due_period ? ` (${item.due_period})` : ''}
              {athleteOptions.find(a => a.id === item.athlete_id) ? ` - ${athleteOptions.find(a => a.id === item.athlete_id)?.name}` : ''}
            </span>
          ))}
          {summary.overdueList.length > 5 ? <span className="overdue-item">...and {summary.overdueList.length - 5} more</span> : null}
        </div>
      ) : null}

      <div className="content-filters">
        <input
          placeholder="Search Title"
          value={search.title}
          onChange={e => setSearch(s => ({ ...s, title: e.target.value }))}
          className="mwd-control"
        />
        <select
          value={search.type}
          onChange={e => setSearch(s => ({ ...s, type: e.target.value }))}
          className="mwd-control"
        >
          <option value="">All Types</option>
          {typeOptions.map(opt => (
            <option key={opt} value={opt}>{opt.toUpperCase()}</option>
          ))}
        </select>
        <select
          value={search.status}
          onChange={e => setSearch(s => ({ ...s, status: e.target.value }))}
          className="mwd-control"
        >
          <option value="">All Status</option>
          {statusOptions.map(opt => (
            <option key={opt} value={opt}>{opt.toUpperCase()}</option>
          ))}
        </select>
        <div className="mwd-filter-spacer" />
        <span className="mwd-filter-count">{filteredContent.length} shown</span>
      </div>

      {Object.keys(formErrors).length > 0 && (
        <div className="mwd-alert danger">
          Please fix the following errors:
          <ul>
            {Object.entries(formErrors).map(([field, msg]) => (
              <li key={field}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
      {error && !Object.keys(formErrors).length && (
        <div className="mwd-alert danger">{error}</div>
      )}
      {loading ? (
        <div className="mwd-loading-state">Loading content data...</div>
      ) : (
        <div className="mwd-content-table-wrap">
          <table className="content-table">
            <colgroup>
              <col className="mwd-col-select" />
              <col className="mwd-col-identity" />
              <col className="mwd-col-athlete" />
              <col className="mwd-col-due" />
              <col className="mwd-col-review" />
              <col className="mwd-col-timing" />
              <col className="mwd-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all content"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Content Item</th>
                <th>Athlete</th>
                <th>Due</th>
                <th>Review Queue</th>
                <th>Timing</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContent.length === 0 ? (
                <tr>
                  <td colSpan={7} className="mwd-empty-row">
                    No content items match current filters.
                  </td>
                </tr>
              ) : null}
              {filteredContent.map(item => {
                const edit = rowEdits[item.id] || { feedback: item.feedback || '', status: item.status };
                const overdue = isOverdue(item.due_period, item.status);
                const rowSelected = selectedIds.includes(item.id);
                const needsReview = item.status === 'submitted' || item.status === 'needs_changes';
                const isDirty = edit.status !== item.status || edit.feedback !== (item.feedback || '');
                const athleteName = athleteNameById[item.athlete_id || ''] || '';
                const contractTitle = contractTitleById[item.contract_id || ''] || '';
                const reviewedLabel = item.reviewed_at ? new Date(item.reviewed_at).toLocaleString() : 'Not reviewed';
                const createdLabel = item.created_at ? new Date(item.created_at).toLocaleString() : '';

                return (
                  <tr
                    key={item.id}
                    className={`${overdue ? 'mwd-row-overdue' : ''} ${rowSelected ? 'mwd-row-selected' : ''} ${item.status === 'submitted' ? 'mwd-row-submitted' : ''} ${item.status === 'needs_changes' ? 'mwd-row-needs-changes' : ''}`}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select content ${item.title}`}
                        checked={rowSelected}
                        onChange={() => toggleSelectOne(item.id)}
                      />
                    </td>

                    <td className="mwd-title-cell">
                      <div className="mwd-title-row">{item.title}</div>
                      <div className="mwd-meta-row">
                        <span className="mwd-type-chip">{item.type.toUpperCase()}</span>
                        {contractTitle ? <span className="mwd-contract-chip">Contract: {contractTitle}</span> : null}
                      </div>
                      <div className="mwd-identity-desc">{item.description || 'No description provided.'}</div>
                      <div className="mwd-identity-assets">
                        {item.file_url ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                            <FilePreview fileUrl={item.file_url} type={item.type} />
                            <Tooltip title="View File">
                              <span>
                                <IconButton
                                  color="info"
                                  aria-label={`View file for ${item.title}`}
                                  className="icon-btn view"
                                  onClick={async () => {
                                    if (typeof item.file_url === 'string') {
                                      const { data } = await supabase.storage.from('files').createSignedUrl(item.file_url, 60);
                                      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                                      else alert('Could not get file link.');
                                    }
                                  }}
                                  size="small"
                                >
                                  <Visibility fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </span>
                        ) : null}
                        {item.external_url ? (
                          <a href={item.external_url} target="_blank" rel="noopener noreferrer" className="mwd-link">External Link</a>
                        ) : null}
                      </div>
                    </td>

                    <td>
                      <div className="mwd-athlete-primary">{athleteName || 'Unassigned'}</div>
                      <div className="mwd-athlete-secondary">{item.athlete_id ? 'Assigned athlete' : 'No athlete assignment'}</div>
                    </td>

                    <td>
                      {item.due_period ? (
                        <>
                          <div className={overdue ? 'mwd-due-value overdue' : 'mwd-due-value'}>{item.due_period}</div>
                          <div className="mwd-due-state">{overdue ? 'Overdue' : 'On schedule'}</div>
                        </>
                      ) : (
                        <div className="mwd-due-state">No due period</div>
                      )}
                    </td>

                    <td>
                      <div className="mwd-review-cell">
                        <div className="mwd-review-topline">
                          <span className={`mwd-status-chip ${statusToneClass(edit.status)}`}>{formatStatusLabel(edit.status)}</span>
                          {needsReview ? <span className="mwd-attention-chip">Needs Review</span> : null}
                          {isDirty ? <span className="mwd-dirty-chip">Unsaved</span> : null}
                        </div>
                        <div className="mwd-review-controls">
                          <select
                            value={edit.status}
                            onChange={e => setRowEdits(edits => ({ ...edits, [item.id]: { ...edit, status: e.target.value } }))}
                            className="mwd-inline-control"
                            aria-label={`Review status for ${item.title}`}
                          >
                            {statusOptions.map(opt => (
                              <option key={opt} value={opt}>{opt.replace('_', ' ').toUpperCase()}</option>
                            ))}
                          </select>
                          <div className="mwd-review-feedback-row">
                            <input
                              type="text"
                              value={edit.feedback}
                              onChange={e => setRowEdits(edits => ({ ...edits, [item.id]: { ...edit, feedback: e.target.value } }))}
                              placeholder="Feedback"
                              className="mwd-inline-control mwd-feedback-control"
                              aria-label={`Feedback for ${item.title}`}
                            />
                            <button
                              className="mwd-save-review-btn"
                              disabled={rowSaving[item.id]}
                              aria-label={`Save feedback and status for ${item.title}`}
                              onClick={async () => {
                                setRowSaving(s => ({ ...s, [item.id]: true }));
                                const now = new Date().toISOString();
                                const { error } = await supabase.from('content').update({ feedback: edit.feedback, status: edit.status, reviewed_at: now }).eq('id', item.id);
                                setRowSaving(s => ({ ...s, [item.id]: false }));
                                if (!error) {
                                  setRowEdits(edits => ({ ...edits, [item.id]: { ...edit } }));
                                  fetchAll();
                                } else {
                                  alert('Error saving feedback/status: ' + error.message);
                                }
                              }}
                            >
                              <Save fontSize="small" /> {rowSaving[item.id] ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="mwd-timing-cell">
                      <div className="mwd-timing-primary">Submitted: {createdLabel || 'N/A'}</div>
                      <div className="mwd-timing-secondary">Reviewed: {reviewedLabel}</div>
                    </td>

                    <td>
                      <div className="mwd-row-actions">
                        <Tooltip title="Edit">
                          <span>
                            <IconButton
                              className="icon-btn edit"
                              aria-label={`Edit content ${item.title}`}
                              onClick={() => startEdit(item)}
                              size="small"
                            >
                              <Edit fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <span>
                            <IconButton
                              className="icon-btn delete"
                              aria-label={`Delete content ${item.title}`}
                              onClick={() => setConfirmDeleteId(item.id)}
                              size="small"
                            >
                              <DeleteOutline fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="mwd-bulk-bar">
          <span className="mwd-bulk-count">{selectedIds.length} selected</span>
          <button
            className="modern-btn danger solid"
            onClick={() => setConfirmBulkDelete(true)}
            disabled={bulkSaving}
            aria-label="Delete selected content"
          >
            <DeleteOutline fontSize="small" /> Delete Selected
          </button>
          <select
            value={bulkStatus}
            onChange={e => setBulkStatus(e.target.value)}
            className="mwd-control"
            aria-label="Bulk update status"
            disabled={bulkSaving}
          >
            <option value="">Set Status...</option>
            {statusOptions.map(opt => (
              <option key={opt} value={opt}>{opt.toUpperCase()}</option>
            ))}
          </select>
          <button
            className="modern-btn primary"
            onClick={handleBulkStatus}
            disabled={bulkSaving || !bulkStatus}
            aria-label="Apply status to selected"
          >
            <Check fontSize="small" /> Apply Status
          </button>
        </div>
      )}
      {/* Single Delete Confirmation Dialog */}
      <Dialog
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        aria-labelledby="confirm-delete-title"
      >
        <DialogTitle id="confirm-delete-title">Confirm Delete</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this content item? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <button
            className="modern-btn secondary"
            onClick={() => setConfirmDeleteId(null)}
            aria-label="Cancel delete"
          >
            <Close fontSize="small" /> Cancel
          </button>
          <button
            className="modern-btn danger"
            onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
            aria-label="Confirm delete"
          >
            <DeleteOutline fontSize="small" /> Delete
          </button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        aria-labelledby="confirm-bulk-delete-title"
      >
        <DialogTitle id="confirm-bulk-delete-title">Confirm Bulk Delete</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the selected content items? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <button
            className="modern-btn secondary"
            onClick={() => setConfirmBulkDelete(false)}
            aria-label="Cancel bulk delete"
          >
            <Close fontSize="small" /> Cancel
          </button>
          <button
            className="modern-btn danger"
            onClick={handleBulkDelete}
            aria-label="Confirm bulk delete"
            disabled={bulkSaving}
          >
            <DeleteOutline fontSize="small" /> Delete All
          </button>
        </DialogActions>
      </Dialog>

      {/* Add/Edit Content Modal */}
      {showModal && (
        <Dialog
          open={showModal}
          onClose={handleModalClose}
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: {
              bgcolor: '#151517',
              color: '#f3f3f4',
              borderRadius: 3,
              border: '1px solid #2b2b2e',
              boxShadow: 'none',
            },
          }}
        >
          <DialogTitle sx={{ pb: 1, color: '#f4f4f5', fontWeight: 690, letterSpacing: 0.1 }}>{editingId ? 'Edit Content' : 'Add Content'}</DialogTitle>
          <DialogContent>
            <form ref={modalFormRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ color: '#d6d6da', fontWeight: 500 }}>Title *</label>
              <input
                placeholder="Title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
                style={{
                  padding: 6,
                  borderRadius: 4,
                  border: formErrors.title ? '2px solid #e53935' : '1px solid #444',
                  background: '#131315',
                  color: '#fff',
                  marginBottom: 2
                }}
                aria-required="true"
                aria-label="Title"
              />
              <span style={{ color: '#e53935', fontSize: 13, minHeight: 18, display: 'block' }}>{formErrors.title || ''}</span>
              <span style={{ color: '#bdbdbd', fontSize: 12, marginBottom: -8 }}>Required. Enter a descriptive title.</span>

              <label style={{ color: '#d6d6da', fontWeight: 500 }}>Type *</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                style={{
                  padding: 6,
                  borderRadius: 4,
                  border: formErrors.type ? '2px solid #e53935' : '1px solid #444',
                  background: '#131315',
                  color: '#fff',
                  marginBottom: 2
                }}
                aria-label="Type"
              >
                {typeOptions.map(opt => (
                  <option key={opt} value={opt}>{opt.toUpperCase()}</option>
                ))}
              </select>
              <span style={{ color: '#e53935', fontSize: 13, minHeight: 18, display: 'block' }}>{formErrors.type || ''}</span>
              <span style={{ color: '#bdbdbd', fontSize: 12, marginBottom: -8 }}>Select the content type.</span>

              <label style={{ color: '#d6d6da', fontWeight: 500 }}>Description</label>
              <textarea
                placeholder="Description"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#131315', color: '#fff', minHeight: 60 }}
                aria-label="Description"
              />
              <span style={{ color: '#bdbdbd', fontSize: 12, marginBottom: -8 }}>Optional. Add details about the content.</span>

              {form.type === 'link' ? (
                <>
                  <label style={{ color: '#d6d6da', fontWeight: 500 }}>External URL *</label>
                  <input
                    placeholder="External URL"
                    value={form.external_url || ''}
                    onChange={e => setForm(f => ({ ...f, external_url: e.target.value }))}
                    style={{
                      padding: 6,
                      borderRadius: 4,
                      border: formErrors.external_url ? '2px solid #e53935' : '1px solid #444',
                      background: '#131315',
                      color: '#fff',
                      marginBottom: 2
                    }}
                    aria-label="External URL"
                    required
                  />
                  <span style={{ color: '#e53935', fontSize: 13, minHeight: 18, display: 'block' }}>{formErrors.external_url || ''}</span>
                  <span style={{ color: '#bdbdbd', fontSize: 12, marginBottom: -8 }}>Required for links. Paste a valid URL.</span>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ color: '#d6d6da', fontWeight: 500 }}>File Upload</label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                    style={{ color: '#fff' }}
                    aria-label="File Upload"
                    disabled={saving}
                  />
                  {uploading && (
                    <div style={{ color: '#ff9800', fontSize: 13 }}>Uploading file, please wait...</div>
                  )}
                  {form.file_url && !uploading && (
                    <span style={{ color: '#90caf9', fontSize: 13 }}>File uploaded</span>
                  )}
                  <span style={{ color: '#bdbdbd', fontSize: 12, marginBottom: -8 }}>Upload a file for this content.</span>
                </div>
              )}

              <label style={{ color: '#d6d6da', fontWeight: 500 }}>Athlete *</label>
              <select
                value={form.athlete_id || ''}
                onChange={e => setForm(f => ({ ...f, athlete_id: e.target.value }))}
                style={{
                  padding: 6,
                  borderRadius: 4,
                  border: formErrors.athlete_id ? '2px solid #e53935' : '1px solid #444',
                  background: '#131315',
                  color: '#fff',
                  marginBottom: 2
                }}
                aria-label="Athlete"
              >
                <option value="">Select Athlete</option>
                {athleteOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
              <span style={{ color: '#e53935', fontSize: 13, minHeight: 18, display: 'block' }}>{formErrors.athlete_id || ''}</span>
              <span style={{ color: '#bdbdbd', fontSize: 12, marginBottom: -8 }}>Required. Assign to an athlete.</span>

              <label style={{ color: '#d6d6da', fontWeight: 500 }}>Contract</label>
              <select
                value={form.contract_id || ''}
                onChange={e => setForm(f => ({ ...f, contract_id: e.target.value }))}
                style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#131315', color: '#fff' }}
                aria-label="Contract"
              >
                <option value="">Select Contract</option>
                {contractOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.title}</option>
                ))}
              </select>
              <span style={{ color: '#bdbdbd', fontSize: 12, marginBottom: -8 }}>Optional. Link to a contract.</span>

              <label style={{ color: '#d6d6da', fontWeight: 500 }}>Due Period</label>
              <input
                placeholder="Due Period (e.g. 2025-12 or 2025-Q4)"
                value={form.due_period || ''}
                onChange={e => setForm(f => ({ ...f, due_period: e.target.value }))}
                style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#131315', color: '#fff' }}
                aria-label="Due Period"
              />
              <span style={{ color: '#bdbdbd', fontSize: 12, marginBottom: -8 }}>Optional. Format: YYYY-MM or YYYY-Qn.</span>

              <label style={{ color: '#d6d6da', fontWeight: 500 }}>Status *</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#131315', color: '#fff' }}
                aria-label="Status"
                required
              >
                {statusOptions.map(opt => (
                  <option key={opt} value={opt}>{opt.toUpperCase()}</option>
                ))}
              </select>
              <span style={{ color: '#bdbdbd', fontSize: 12, marginBottom: -8 }}>Required. Set the content status.</span>
            </form>
          </DialogContent>
          <DialogActions>
            <button
              type="button"
              className="modern-btn secondary"
              onClick={handleModalClose}
              aria-label="Cancel"
            >
              <Close fontSize="small" /> Cancel
            </button>
            <button
              type="button"
              className="modern-btn primary"
              onClick={() => {
                if (modalFormRef.current) {
                  modalFormRef.current.requestSubmit();
                }
              }}
              disabled={saving || uploading}
              aria-label={editingId ? 'Save content' : 'Add content'}
            >
              <Save fontSize="small" />
              {saving ? (editingId ? 'Saving...' : 'Adding...') : (editingId ? 'Save' : 'Add')}
            </button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
}
