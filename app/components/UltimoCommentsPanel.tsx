'use client';

import { useEffect, useState } from 'react';

export interface UltimoComment {
  id: number;
  taskId: number;
  date: string | null;
  jobNumber: string | null;
  text: string;
  username: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  taskId: number;
  isAdmin: boolean;
  onChange?: () => void; // ververs de hoofdlijst als opmerkingen wijzigen
}

function todayISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const emptyDraft = { date: todayISO(), jobNumber: '', text: '' };

export default function UltimoCommentsPanel({ taskId, isAdmin, onChange }: Props) {
  const [comments, setComments] = useState<UltimoComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState({ ...emptyDraft });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ date: '', jobNumber: '', text: '' });

  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ultimo-tasks/${taskId}/comments`);
      if (res.ok) setComments(await res.json());
    } catch (e) {
      console.error('Error loading comments', e);
    } finally {
      setLoading(false);
    }
  };

  const notifyChange = () => { if (onChange) onChange(); };

  const handleAdd = async () => {
    if (!newDraft.text.trim()) { alert('Opmerking mag niet leeg zijn'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/ultimo-tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: newDraft.date || null,
          jobNumber: newDraft.jobNumber || null,
          text: newDraft.text,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fout bij toevoegen opmerking');
        return;
      }
      setAdding(false);
      setNewDraft({ ...emptyDraft });
      await load();
      notifyChange();
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (c: UltimoComment) => {
    setEditingId(c.id);
    setEditDraft({
      date: c.date ? c.date.split('T')[0] : '',
      jobNumber: c.jobNumber || '',
      text: c.text,
    });
  };

  const saveEdit = async (commentId: number) => {
    if (!editDraft.text.trim()) { alert('Opmerking mag niet leeg zijn'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/ultimo-tasks/${taskId}/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editDraft.date || null,
          jobNumber: editDraft.jobNumber || null,
          text: editDraft.text,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fout bij bijwerken opmerking');
        return;
      }
      setEditingId(null);
      await load();
      notifyChange();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    if (!confirm('Deze opmerking verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ultimo-tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fout bij verwijderen opmerking');
        return;
      }
      await load();
      notifyChange();
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (c: UltimoComment) => {
    try {
      await navigator.clipboard.writeText(c.text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = c.text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopiedId(c.id);
    setTimeout(() => setCopiedId((cur) => (cur === c.id ? null : cur)), 1800);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Geen datum';
    return new Date(iso).toLocaleDateString('nl-NL');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: '#f5f5f7',
    border: '1px solid rgba(0,0,0,0.15)',
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', padding: '1rem', background: '#fafafc' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '0.5rem' }}>
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1d1d1f', margin: 0 }}>Opmerkingen-historie</h3>
          <p style={{ fontSize: '0.75rem', color: '#6e6e73', margin: '2px 0 0' }}>
            {comments.length === 0
              ? 'Nog geen opmerkingen vastgelegd.'
              : `${comments.length} opmerking${comments.length === 1 ? '' : 'en'} — nieuwste bovenaan.`}
          </p>
        </div>
        {isAdmin && !adding && (
          <button
            type="button"
            onClick={() => { setAdding(true); setNewDraft({ ...emptyDraft, date: todayISO() }); }}
            disabled={busy}
            style={{ padding: '6px 12px', background: '#007AFF', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}
          >
            + Opmerking
          </button>
        )}
      </div>

      {/* Nieuw-opmerking formulier */}
      {isAdmin && adding && (
        <div style={{ background: '#fff', border: '1px solid rgba(0,122,255,0.3)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 140px' }}>
              <label style={{ fontSize: '0.72rem', color: '#6e6e73', display: 'block', marginBottom: '0.2rem' }}>Datum</label>
              <input type="date" value={newDraft.date} onChange={(e) => setNewDraft({ ...newDraft, date: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <label style={{ fontSize: '0.72rem', color: '#6e6e73', display: 'block', marginBottom: '0.2rem' }}>Jobnummer (optioneel)</label>
              <input type="text" value={newDraft.jobNumber} placeholder="bv. 2026-00831" onChange={(e) => setNewDraft({ ...newDraft, jobNumber: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: '#6e6e73', display: 'block', marginBottom: '0.2rem' }}>Opmerking</label>
            <textarea value={newDraft.text} onChange={(e) => setNewDraft({ ...newDraft, text: e.target.value })} rows={3} placeholder="De opmerking zoals je 'm in Ultimo plaatst…" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={handleAdd} disabled={busy} style={{ padding: '6px 14px', background: '#007AFF', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>Opslaan</button>
            <button type="button" onClick={() => { setAdding(false); setNewDraft({ ...emptyDraft }); }} style={{ padding: '6px 14px', background: '#f5f5f7', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' }}>Annuleren</button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: '0.875rem', color: '#6e6e73' }}>Laden...</p>
      ) : comments.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: '#6e6e73', fontStyle: 'italic' }}>Geen opmerkingen.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {comments.map((c) => {
            const isEditing = editingId === c.id;
            return (
              <li key={c.id} style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.875rem', color: '#1d1d1f', fontWeight: 600 }}>{formatDate(c.date)}</span>
                  {c.jobNumber && (
                    <span style={{ padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600, borderRadius: '9999px', background: 'rgba(0,122,255,0.1)', color: '#0040a0' }}>
                      job {c.jobNumber}
                    </span>
                  )}
                </div>

                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 140px' }}>
                        <label style={{ fontSize: '0.72rem', color: '#6e6e73', display: 'block', marginBottom: '0.2rem' }}>Datum</label>
                        <input type="date" value={editDraft.date} onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })} style={inputStyle} />
                      </div>
                      <div style={{ flex: '1 1 140px' }}>
                        <label style={{ fontSize: '0.72rem', color: '#6e6e73', display: 'block', marginBottom: '0.2rem' }}>Jobnummer</label>
                        <input type="text" value={editDraft.jobNumber} onChange={(e) => setEditDraft({ ...editDraft, jobNumber: e.target.value })} style={inputStyle} />
                      </div>
                    </div>
                    <textarea value={editDraft.text} onChange={(e) => setEditDraft({ ...editDraft, text: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" onClick={() => saveEdit(c.id)} disabled={busy} style={{ padding: '6px 12px', background: '#007AFF', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>Opslaan</button>
                      <button type="button" onClick={() => setEditingId(null)} style={{ padding: '6px 12px', background: '#f5f5f7', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' }}>Annuleren</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: '0.85rem', color: '#3c3c43', margin: '0 0 0.5rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => copyText(c)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: copiedId === c.id ? 'rgba(52,199,89,0.15)' : 'rgba(0,122,255,0.1)', color: copiedId === c.id ? '#1a7f37' : '#0040a0', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        {copiedId === c.id ? '✓ Gekopieerd' : '📋 Kopieer opmerking'}
                      </button>
                      {isAdmin && (
                        <>
                          <button type="button" onClick={() => startEdit(c)} style={{ background: 'none', border: 'none', color: '#007AFF', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', padding: 0 }}>Bewerken</button>
                          <button type="button" onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', color: '#FF3B30', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', padding: 0 }}>Verwijderen</button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
