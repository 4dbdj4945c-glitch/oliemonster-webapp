'use client';

import { useEffect, useState } from 'react';
import Icon from './ui/Icon';

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

// Kaartje voor een opmerking of het invoerformulier: grijze rand, lichtgrijze achtergrond
const kaartStyle: React.CSSProperties = {
  background: 'var(--grijs-50)',
  border: '1px solid var(--grijs-200)',
  borderRadius: 'var(--radius-md)',
  padding: '12px',
};

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

  return (
    <div>
      <style jsx>{`
        .opm-kop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .opm-tekst {
          min-height: 100px;
        }
        .opm-acties {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        /* Telefoon: kopieren is de hoofdactie, dus volle breedte en 44px hoog */
        @media (max-width: 640px) {
          .opm-acties .opm-kopieer {
            flex: 1 1 100%;
            justify-content: center;
            min-height: 44px;
            font-size: 14px;
          }
          .opm-acties :global(.icon-btn) {
            flex: 1 1 auto;
            min-height: 40px;
            justify-content: center;
            font-size: 13px;
          }
        }
      `}</style>

      <div className="opm-kop">
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Opmerkingen-historie</h3>
          <p style={{ fontSize: '12px', color: 'var(--grijs-500)', margin: '2px 0 0' }}>
            {comments.length === 0
              ? 'Nog geen opmerkingen vastgelegd.'
              : `${comments.length} opmerking${comments.length === 1 ? '' : 'en'}, nieuwste bovenaan.`}
          </p>
        </div>
        {isAdmin && !adding && (
          <button
            type="button"
            className="btn btn-blue btn-sm"
            onClick={() => { setAdding(true); setNewDraft({ ...emptyDraft, date: todayISO() }); }}
            disabled={busy}
          >
            <Icon name="plus" size={16} />
            Opmerking
          </button>
        )}
      </div>

      {/* Nieuw-opmerking formulier */}
      {isAdmin && adding && (
        <div style={{ ...kaartStyle, marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="rij2">
            <div>
              <label className="label">Datum</label>
              <input className="input" type="date" value={newDraft.date} onChange={(e) => setNewDraft({ ...newDraft, date: e.target.value })} />
            </div>
            <div>
              <label className="label">Jobnummer (optioneel)</label>
              <input className="input" type="text" inputMode="text" autoComplete="off" value={newDraft.jobNumber} placeholder="bv. 2026-00831" onChange={(e) => setNewDraft({ ...newDraft, jobNumber: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Opmerking</label>
            <textarea className="textarea opm-tekst" value={newDraft.text} onChange={(e) => setNewDraft({ ...newDraft, text: e.target.value })} rows={3} placeholder="De opmerking zoals je 'm in Ultimo plaatst" />
          </div>
          <div className="knoppenrij" style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-blue btn-sm" onClick={handleAdd} disabled={busy}>Opslaan</button>
            <button type="button" className="btn btn-sm" onClick={() => { setAdding(false); setNewDraft({ ...emptyDraft }); }}>Annuleren</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="laden" style={{ padding: '8px 0' }}>Laden...</p>
      ) : comments.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--grijs-500)', margin: 0 }}>Geen opmerkingen.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {comments.map((c) => {
            const isEditing = editingId === c.id;
            const copied = copiedId === c.id;
            return (
              <li key={c.id} style={kaartStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--grijs-500)' }}>
                  <span style={{ fontWeight: 600 }}>{formatDate(c.date)}</span>
                  {c.jobNumber && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>job {c.jobNumber}</span>
                    </>
                  )}
                </div>

                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div className="rij2">
                      <div>
                        <label className="label">Datum</label>
                        <input className="input" type="date" value={editDraft.date} onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Jobnummer</label>
                        <input className="input" type="text" inputMode="text" autoComplete="off" value={editDraft.jobNumber} onChange={(e) => setEditDraft({ ...editDraft, jobNumber: e.target.value })} />
                      </div>
                    </div>
                    <textarea className="textarea opm-tekst" value={editDraft.text} onChange={(e) => setEditDraft({ ...editDraft, text: e.target.value })} rows={3} />
                    <div className="knoppenrij" style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="btn btn-blue btn-sm" onClick={() => saveEdit(c.id)} disabled={busy}>Opslaan</button>
                      <button type="button" className="btn btn-sm" onClick={() => setEditingId(null)}>Annuleren</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: '14px', color: 'var(--navy)', margin: '0 0 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</p>
                    <div className="opm-acties">
                      <button
                        type="button"
                        className="btn btn-sm opm-kopieer"
                        onClick={() => copyText(c)}
                        style={copied ? { color: 'var(--groen-tekst)', borderColor: '#BBF7D0', background: 'var(--groen-light)' } : undefined}
                      >
                        <Icon name={copied ? 'check' : 'copy'} size={16} />
                        {copied ? 'Gekopieerd' : 'Kopieer opmerking'}
                      </button>
                      {isAdmin && (
                        <>
                          <button type="button" className="icon-btn" onClick={() => startEdit(c)} disabled={busy}>
                            <Icon name="pencil" size={16} />
                            Bewerken
                          </button>
                          <button type="button" className="icon-btn icon-btn-danger" onClick={() => handleDelete(c.id)} disabled={busy}>
                            <Icon name="trash" size={16} />
                            Verwijderen
                          </button>
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
