'use client';

import { useEffect, useState } from 'react';

export interface SampleAttempt {
  id: number;
  oilSampleId: number;
  sampleDate: string | null;
  photoUrl: string | null;
  remarks: string | null;
  isTaken: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  sampleId: number;
  oNumber: string;
  isAdmin: boolean;
  onPhotoClick: (url: string, label: string) => void;
  onChange?: () => void;  // Callback als pogingen wijzigen (voor ververs hoofdlijst)
}

export default function SampleAttemptsPanel({
  sampleId,
  oNumber,
  isAdmin,
  onPhotoClick,
  onChange,
}: Props) {
  const [attempts, setAttempts] = useState<SampleAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ sampleDate: string; remarks: string; isTaken: boolean }>({
    sampleDate: '',
    remarks: '',
    isTaken: false,
  });
  const [uploadingPhotoId, setUploadingPhotoId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load();
  }, [sampleId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/samples/${sampleId}/attempts`);
      if (res.ok) {
        const data = await res.json();
        setAttempts(data);
      }
    } catch (e) {
      console.error('Error loading attempts', e);
    } finally {
      setLoading(false);
    }
  };

  const notifyChange = () => {
    if (onChange) onChange();
  };

  const handleAdd = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/samples/${sampleId}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isTaken: false }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fout bij aanmaken poging');
        return;
      }
      await load();
      notifyChange();
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (attempt: SampleAttempt) => {
    setEditingId(attempt.id);
    setDraft({
      sampleDate: attempt.sampleDate ? attempt.sampleDate.split('T')[0] : '',
      remarks: attempt.remarks || '',
      isTaken: attempt.isTaken,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (attemptId: number) => {
    if (draft.isTaken && !draft.sampleDate) {
      alert('Datum is verplicht voor genomen monsters');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/samples/${sampleId}/attempts/${attemptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleDate: draft.sampleDate || null,
          remarks: draft.remarks || null,
          isTaken: draft.isTaken,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fout bij bijwerken poging');
        return;
      }
      setEditingId(null);
      await load();
      notifyChange();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (attemptId: number) => {
    if (!confirm('Deze monstername verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/samples/${sampleId}/attempts/${attemptId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fout bij verwijderen poging');
        return;
      }
      await load();
      notifyChange();
    } finally {
      setBusy(false);
    }
  };

  const handlePhotoUpload = async (attemptId: number, file: File) => {
    setUploadingPhotoId(attemptId);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await fetch(`/api/samples/${sampleId}/attempts/${attemptId}/photo`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fout bij uploaden foto');
        return;
      }
      await load();
      notifyChange();
    } finally {
      setUploadingPhotoId(null);
    }
  };

  const handlePhotoDelete = async (attemptId: number) => {
    if (!confirm('Foto van deze monstername verwijderen?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/samples/${sampleId}/attempts/${attemptId}/photo`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fout bij verwijderen foto');
        return;
      }
      await load();
      notifyChange();
    } finally {
      setBusy(false);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Nog geen datum';
    return new Date(iso).toLocaleDateString('nl-NL');
  };

  return (
    <div style={{
      border: '1px solid rgba(0,0,0,0.1)',
      borderRadius: '10px',
      padding: '1rem',
      background: '#fafafc',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0C1B33', margin: 0 }}>
            Monsternames (pogingen)
          </h3>
          <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '2px 0 0' }}>
            {attempts.length === 0
              ? 'Nog geen monsternames vastgelegd.'
              : `${attempts.length} monstername${attempts.length === 1 ? '' : 's'} voor ${oNumber}.`}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleAdd}
            disabled={busy}
            style={{
              padding: '6px 12px',
              background: '#1D4ED8',
              color: 'white',
              border: 'none',
              borderRadius: '7px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            + Hermonstering
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ fontSize: '0.875rem', color: '#64748B' }}>Laden...</p>
      ) : attempts.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: '#64748B', fontStyle: 'italic' }}>
          Geen monsternames.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {attempts.map((attempt, idx) => {
            const isEditing = editingId === attempt.id;
            return (
              <li
                key={attempt.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: '#e5e5ea',
                        color: '#0C1B33',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}>
                        {idx + 1}
                      </span>
                      <span style={{
                        padding: '2px 8px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        borderRadius: '9999px',
                        background: attempt.isTaken ? 'rgba(22, 163, 74,0.15)' : 'rgba(220, 38, 38,0.12)',
                        color: attempt.isTaken ? '#1a7f37' : '#CC2900',
                      }}>
                        {attempt.isTaken ? 'Genomen' : 'Gepland'}
                      </span>
                      <span style={{ fontSize: '0.875rem', color: '#0C1B33', fontWeight: 500 }}>
                        {formatDate(attempt.sampleDate)}
                      </span>
                    </div>
                    {!isEditing && attempt.remarks && (
                      <p style={{ fontSize: '0.8rem', color: '#3c3c43', margin: '0.25rem 0 0', whiteSpace: 'pre-wrap' }}>
                        {attempt.remarks}
                      </p>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#3c3c43' }}>
                      <input
                        type="checkbox"
                        checked={draft.isTaken}
                        onChange={(e) => setDraft({ ...draft, isTaken: e.target.checked })}
                        style={{ accentColor: '#1D4ED8' }}
                      />
                      Monster is genomen
                    </label>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '0.25rem' }}>
                        Datum afname {!draft.isTaken && '(optioneel)'}
                      </label>
                      <input
                        type="date"
                        value={draft.sampleDate}
                        onChange={(e) => setDraft({ ...draft, sampleDate: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: '#f5f5f7',
                          border: '1px solid rgba(0,0,0,0.15)',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '0.25rem' }}>
                        Opmerking
                      </label>
                      <textarea
                        value={draft.remarks}
                        onChange={(e) => setDraft({ ...draft, remarks: e.target.value })}
                        rows={2}
                        placeholder="Bijv. reden hermonstering"
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: '#f5f5f7',
                          border: '1px solid rgba(0,0,0,0.15)',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => saveEdit(attempt.id)}
                        disabled={busy}
                        style={{
                          padding: '6px 12px',
                          background: '#1D4ED8',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        Opslaan
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        style={{
                          padding: '6px 12px',
                          background: '#f5f5f7',
                          border: '1px solid rgba(0,0,0,0.1)',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Annuleren
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      {attempt.photoUrl ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onPhotoClick(attempt.photoUrl!, `${oNumber} — poging ${idx + 1}`)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#1D4ED8',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              padding: 0,
                              textDecoration: 'underline',
                            }}
                          >
                            📷 Bekijk foto
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handlePhotoDelete(attempt.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#DC2626',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                padding: 0,
                              }}
                            >
                              Verwijder foto
                            </button>
                          )}
                        </>
                      ) : isAdmin ? (
                        <label style={{ fontSize: '0.8rem', color: '#64748B', cursor: 'pointer' }}>
                          {uploadingPhotoId === attempt.id ? '↻ Uploaden...' : '+ Foto'}
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            disabled={uploadingPhotoId === attempt.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handlePhotoUpload(attempt.id, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Geen foto</span>
                      )}
                    </div>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => startEdit(attempt)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#1D4ED8',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          Bewerken
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(attempt.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#DC2626',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          Verwijderen
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
