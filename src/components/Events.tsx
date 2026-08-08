
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

interface EventItem {
  id: string;
  title: string;
  event_date: string;
  location: string;
  type: string;
  description: string;
  status: string;
}

interface AthleteOption { id: string; name: string; }

const statusOptions = ['upcoming', 'completed', 'cancelled'];

export default function Events() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    event_date: '',
    location: '',
    type: '',
    description: '',
    status: 'upcoming',
    athlete_ids: [] as string[],
  });
  const [athleteOptions, setAthleteOptions] = useState<AthleteOption[]>([]);
  const [search, setSearch] = useState({ title: '', type: '', status: '' });

  useEffect(() => {
    fetchAll();
    fetchAthletes();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: false });
    if (error) setError(error.message);
    else setEvents(data || []);
    setLoading(false);
  }

  async function fetchAthletes() {
    const { data, error } = await supabase.from('athletes').select('id, name');
    if (!error && data) setAthleteOptions(data);
  }

  function startAdd() {
    setEditingId(null);
    setForm({ title: '', event_date: '', location: '', type: '', description: '', status: 'upcoming', athlete_ids: [] });
    setShowModal(true);
    setError('');
  }

  function startEdit(event: EventItem) {
    setEditingId(event.id);
    setForm({
      title: event.title,
      event_date: event.event_date,
      location: event.location,
      type: event.type,
      description: event.description,
      status: event.status,
      athlete_ids: [],
    });
    setShowModal(true);
    setError('');
  }

  function handleModalClose() {
    setShowModal(false);
    setEditingId(null);
    setForm({ title: '', event_date: '', location: '', type: '', description: '', status: 'upcoming', athlete_ids: [] });
    setError('');
  }

  async function handleDelete(id: string) {
    setError('');
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) setError(error.message);
    else fetchAll();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!form.event_date) {
      setError('Date is required.');
      return;
    }
    if (editingId) {
      const { error } = await supabase.from('events').update({
        title: form.title,
        event_date: form.event_date,
        location: form.location,
        type: form.type,
        description: form.description,
        status: form.status,
      }).eq('id', editingId);
      if (error) setError(error.message);
      else {
        setShowModal(false);
        fetchAll();
      }
    } else {
      const { error } = await supabase.from('events').insert([{ ...form }]);
      if (error) setError(error.message);
      else {
        setShowModal(false);
        fetchAll();
      }
    }
  }

  const filteredEvents = events.filter(event =>
    (search.title === '' || event.title.toLowerCase().includes(search.title.toLowerCase())) &&
    (search.type === '' || event.type === search.type) &&
    (search.status === '' || event.status === search.status)
  );

  return (
    <div style={{ padding: 24, color: '#fff' }}>
      <h2 style={{ fontWeight: 700, marginBottom: 16 }}>Events</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Search Title"
          value={search.title}
          onChange={e => setSearch(s => ({ ...s, title: e.target.value }))}
          style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#232323', color: '#fff', minWidth: 120 }}
        />
        <input
          placeholder="Search Type"
          value={search.type}
          onChange={e => setSearch(s => ({ ...s, type: e.target.value }))}
          style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#232323', color: '#fff', minWidth: 120 }}
        />
        <select
          value={search.status}
          onChange={e => setSearch(s => ({ ...s, status: e.target.value }))}
          style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#232323', color: '#fff', minWidth: 120 }}
        >
          <option value="">All Status</option>
          {statusOptions.map(opt => (
            <option key={opt} value={opt}>{opt.toUpperCase()}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button
          style={{ background: '#d32f2f', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 4, padding: '8px 18px', cursor: 'pointer', marginLeft: 8 }}
          onClick={startAdd}
        >
          Add Event
        </button>
      </div>
      {error && <div style={{ color: '#d32f2f', marginBottom: 12 }}>{error}</div>}
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div style={{ background: '#232323', borderRadius: 8, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ color: '#fff', fontWeight: 700, background: '#232323', padding: 10, borderBottom: '1px solid #444', textAlign: 'center' }}>Title</th>
                <th style={{ color: '#fff', fontWeight: 700, background: '#232323', padding: 10, borderBottom: '1px solid #444', textAlign: 'center' }}>Date</th>
                <th style={{ color: '#fff', fontWeight: 700, background: '#232323', padding: 10, borderBottom: '1px solid #444', textAlign: 'center' }}>Location</th>
                <th style={{ color: '#fff', fontWeight: 700, background: '#232323', padding: 10, borderBottom: '1px solid #444', textAlign: 'center' }}>Type</th>
                <th style={{ color: '#fff', fontWeight: 700, background: '#232323', padding: 10, borderBottom: '1px solid #444', textAlign: 'center' }}>Status</th>
                <th style={{ color: '#fff', fontWeight: 700, background: '#232323', padding: 10, borderBottom: '1px solid #444', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map(event => (
                <tr key={event.id}>
                  <td style={{ color: '#fff', padding: 10, borderBottom: '1px solid #444', textAlign: 'center' }}>{event.title}</td>
                  <td style={{ color: '#fff', padding: 10, borderBottom: '1px solid #444', textAlign: 'center' }}>{event.event_date ? new Date(event.event_date).toLocaleString() : ''}</td>
                  <td style={{ color: '#fff', padding: 10, borderBottom: '1px solid #444', textAlign: 'center' }}>{event.location}</td>
                  <td style={{ color: '#fff', padding: 10, borderBottom: '1px solid #444', textAlign: 'center' }}>{event.type}</td>
                  <td style={{ color: '#fff', padding: 10, borderBottom: '1px solid #444', textAlign: 'center' }}>{event.status.toUpperCase()}</td>
                  <td style={{ color: '#fff', padding: 10, borderBottom: '1px solid #444', textAlign: 'center' }}>
                    <button style={{ marginRight: 8 }} onClick={() => startEdit(event)}>Edit</button>
                    <button style={{ color: '#d32f2f' }} onClick={() => handleDelete(event.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Add/Edit Event Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000,
        }}
          onClick={handleModalClose}
        >
          <div
            style={{
              background: '#232323',
              borderRadius: 8,
              padding: 24,
              minWidth: 320,
              maxWidth: 400,
              boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
              position: 'relative',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit Event' : 'Add Event'}</h3>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                placeholder="Title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
                style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#232323', color: '#fff' }}
              />
              <input
                type="datetime-local"
                value={form.event_date}
                onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                required
                style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#232323', color: '#fff' }}
              />
              <input
                placeholder="Location"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#232323', color: '#fff' }}
              />
              <input
                placeholder="Type (e.g. training, meeting)"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#232323', color: '#fff' }}
              />
              <textarea
                placeholder="Description"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#232323', color: '#fff', minHeight: 60 }}
              />
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#232323', color: '#fff' }}
              >
                {statusOptions.map(opt => (
                  <option key={opt} value={opt}>{opt.toUpperCase()}</option>
                ))}
              </select>
              <label style={{ color: '#fff', fontWeight: 600 }}>Athletes</label>
              <select
                multiple
                value={form.athlete_ids}
                onChange={e => {
                  const options = Array.from(e.target.selectedOptions).map(opt => opt.value);
                  setForm(f => ({ ...f, athlete_ids: options }));
                }}
                style={{ padding: 6, borderRadius: 4, border: '1px solid #444', background: '#232323', color: '#fff', minHeight: 60 }}
              >
                {athleteOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="submit" style={{ background: '#d32f2f', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 4, padding: '8px 18px', cursor: 'pointer' }}>
                  {editingId ? 'Save' : 'Add'}
                </button>
                <button type="button" onClick={handleModalClose} style={{ background: '#444', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 18px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
