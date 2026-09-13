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
    <div className="card" style={{ background: 'var(--grijs-50)', padding: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div>
          <p className="section-label" style={{ margin: 0 }}>Monsternames (pogingen)</p>
          <p className="hint" style={{ margin: '3px 0 0' }}>
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
            className="btn btn-sm btn-blue"
          >
            + Hermonstering
          </button>
        )}
      </div>

      {loading ? (
        <p className="laden" style={{ padding: '8px 0' }}>Laden...</p>
      ) : attempts.length === 0 ? (
        <p className="text-secondary" style={{ fontSize: '13px', fontStyle: 'italic', margin: 0 }}>
          Geen monsternames.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {attempts.map((attempt, idx) => {
            const isEditing = editingId === attempt.id;
            return (
              <li key={attempt.id} className="card" style={{ padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: 'var(--grijs-200)',
                        color: 'var(--navy)',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}>
                        {idx + 1}
                      </span>
                      <span className={`badge ${attempt.isTaken ? 'badge-success' : 'badge-danger'}`}>
                        {attempt.isTaken ? 'Genomen' : 'Gepland'}
                      </span>
                      <span style={{ fontSize: '14px', color: 'var(--navy)', fontWeight: 500 }}>
                        {formatDate(attempt.sampleDate)}
                      </span>
                    </div>
                    {!isEditing && attempt.remarks && (
                      <p style={{ fontSize: '13px', color: 'var(--grijs-700)', margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                        {attempt.remarks}
                      </p>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--navy)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={draft.isTaken}
                        onChange={(e) => setDraft({ ...draft, isTaken: e.target.checked })}
                      />
                      Monster is genomen
                    </label>
                    <div>
                      <label className="label">
                        Datum afname {!draft.isTaken && '(optioneel)'}
                      </label>
                      <input
                        type="date"
                        value={draft.sampleDate}
                        onChange={(e) => setDraft({ ...draft, sampleDate: e.target.value })}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Opmerking</label>
                      <textarea
                        value={draft.remarks}
                        onChange={(e) => setDraft({ ...draft, remarks: e.target.value })}
                        rows={2}
                        placeholder="Bijv. reden hermonstering"
                        className="textarea"
                        style={{ minHeight: '60px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => saveEdit(attempt.id)}
                        disabled={busy}
                        className="btn btn-sm btn-blue"
                      >
                        Opslaan
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="btn btn-sm"
                      >
                        Annuleren
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {attempt.photoUrl ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onPhotoClick(attempt.photoUrl!, `${oNumber}, poging ${idx + 1}`)}
                            className="btn-link"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                            Bekijk foto
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handlePhotoDelete(attempt.id)}
                              className="btn-link btn-link-danger"
                            >
                              Verwijder foto
                            </button>
                          )}
                        </>
                      ) : isAdmin ? (
                        <label className="btn-link" style={{ color: 'var(--grijs-500)', cursor: 'pointer' }}>
                          {uploadingPhotoId === attempt.id ? 'Uploaden...' : '+ Foto'}
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
                        <span className="text-tertiary" style={{ fontSize: '13px' }}>Geen foto</span>
                      )}
                    </div>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                          type="button"
                          onClick={() => startEdit(attempt)}
                          className="btn-link"
                        >
                          Bewerken
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(attempt.id)}
                          className="btn-link btn-link-danger"
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
