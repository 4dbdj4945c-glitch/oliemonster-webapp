'use client';

import { useEffect, useState } from 'react';
import Icon from './ui/Icon';
import LaadFout from './LaadFout';
import AfnameOngedaanModal, { type AfnameDoel } from './AfnameOngedaanModal';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { FOTO_SOORTEN, type FotoSoort } from '@/lib/samplePhotos';
import { verkleinFoto } from '@/lib/fotoVerkleinen';

export interface SampleAttempt {
  id: number;
  oilSampleId: number;
  sampleDate: string | null;
  photoUrl: string | null;
  /** Foto van het onderdeel; photoUrl is het monsterpotje */
  partPhotoUrl?: string | null;
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
  /** Na Afname ongedaan maken, zodat het bewerkvenster zijn vinkje en datum bijwerkt */
  onAfnameOngedaan?: () => void;
}

export default function SampleAttemptsPanel({
  sampleId,
  oNumber,
  isAdmin,
  onPhotoClick,
  onChange,
  onAfnameOngedaan,
}: Props) {
  const [attempts, setAttempts] = useState<SampleAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ sampleDate: string; remarks: string; isTaken: boolean }>({
    sampleDate: '',
    remarks: '',
    isTaken: false,
  });
  // Welke foto staat te uploaden: "pogingId-soort", want elke poging heeft twee foto's.
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [foutmelding, setFoutmelding] = useState('');
  // Pas true als de lijst echt geladen is; bij een fout geen "Nog geen ..." en geen knop om toe te voegen.
  const [geladen, setGeladen] = useState(false);
  // Afname ongedaan maken van de laatste monstername (bevestiging met wat er verdwijnt)
  const [afnameDoel, setAfnameDoel] = useState<AfnameDoel | null>(null);

  useEffect(() => {
    load();
  }, [sampleId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/samples/${sampleId}/attempts`);
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'De monsternames konden niet worden opgehaald.'));
        return;
      }
      setAttempts(await res.json());
      setGeladen(true);
      setFoutmelding('');
    } catch (e) {
      setFoutmelding(GEEN_VERBINDING);
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

  // Een poging verwijderen is niet terug te draaien. De bevestiging noemt dus wat
  // er weggaat, en wijst op Afname ongedaan maken als je alleen terug wilt naar
  // niet genomen.
  const handleDelete = async (attempt: SampleAttempt, nummer: number) => {
    const attemptId = attempt.id;
    const fotos = [attempt.partPhotoUrl, attempt.photoUrl].filter(Boolean).length;
    const weg = [
      attempt.sampleDate ? `de datum ${formatDate(attempt.sampleDate)}` : null,
      attempt.remarks ? 'de opmerking' : null,
      fotos === 1 ? 'de foto' : fotos > 1 ? `de ${fotos} foto's` : null,
    ].filter(Boolean);
    const tekst =
      `Monstername ${nummer} van ${oNumber} helemaal verwijderen?` +
      (weg.length ? `\n\nDaarmee verdwijnen ook: ${weg.join(', ')}.` : '') +
      '\n\nDit kan niet ongedaan worden gemaakt.' +
      (attempt.isTaken ? ' Wil je alleen terug naar niet genomen? Kies dan Afname ongedaan maken.' : '');
    if (!confirm(tekst)) return;
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

  const handlePhotoUpload = async (attemptId: number, file: File, soort: FotoSoort) => {
    setUploadingPhotoId(`${attemptId}-${soort}`);
    try {
      const fd = new FormData();
      fd.append('photo', await verkleinFoto(file));
      fd.append('soort', soort);
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

  const handlePhotoDelete = async (attemptId: number, soort: FotoSoort, label: string) => {
    if (!confirm(`${label} van deze monstername verwijderen?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/samples/${sampleId}/attempts/${attemptId}/photo?soort=${soort}`, {
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ marginBottom: '12px' }}>
        <div>
          <p className="section-label" style={{ margin: 0 }}>Monsternames (pogingen)</p>
          <p className="hint" style={{ margin: '3px 0 0' }}>
            {!geladen
              ? ''
              : attempts.length === 0
              ? 'Nog geen monsternames vastgelegd.'
              : `${attempts.length} monstername${attempts.length === 1 ? '' : 's'} voor ${oNumber}.`}
          </p>
        </div>
        {isAdmin && geladen && (
          <div className="knoppenrij">
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy}
              className="btn btn-sm"
            >
              <Icon name="resample" size={16} />
              Hermonstering
            </button>
          </div>
        )}
      </div>

      {foutmelding && <LaadFout melding={foutmelding} onOpnieuw={load} bezig={loading} />}

      {loading ? (
        <p className="laden" style={{ padding: '8px 0' }}>Laden...</p>
      ) : foutmelding ? null : attempts.length === 0 ? (
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
                      <span className={`badge ${attempt.isTaken ? 'badge-success' : 'badge-info'}`}>
                        <Icon name={attempt.isTaken ? 'status-taken' : 'status-planned'} size={16} />
                        {attempt.isTaken ? 'Genomen' : 'Gepland'}
                      </span>
                      <span style={{ fontSize: '14px', color: 'var(--navy)', fontWeight: 500 }}>
                        {formatDate(attempt.sampleDate)}
                      </span>
                    </div>
                    {!isEditing && attempt.remarks && (
                      <p style={{ fontSize: '13px', color: 'var(--grijs-700)', margin: '4px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
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
                    <div className="knoppenrij" style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => saveEdit(attempt.id)}
                        disabled={busy}
                        className="btn btn-sm"
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
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2" style={{ marginTop: '8px' }}>
                    {/* Twee foto's per poging: het onderdeel en het monsterpotje */}
                    <div className="knoppenrij" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {FOTO_SOORTEN.map((soort) => {
                        const url = soort.veld === 'photoUrl' ? attempt.photoUrl : attempt.partPhotoUrl;
                        const sleutel = `${attempt.id}-${soort.soort}`;
                        if (url) {
                          return (
                            <span key={soort.soort} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => onPhotoClick(url, `${oNumber}, poging ${idx + 1}, ${soort.label.toLowerCase()}`)}
                                className="btn-link"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px' }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  alt=""
                                  loading="lazy"
                                  style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--grijs-200)', display: 'block', flex: 'none' }}
                                />
                                {soort.label}
                              </button>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handlePhotoDelete(attempt.id, soort.soort, soort.label)}
                                  className="btn-link btn-link-danger"
                                  aria-label={`${soort.label} verwijderen`}
                                  title={`${soort.label} verwijderen`}
                                >
                                  <Icon name="image-remove" size={16} />
                                </button>
                              )}
                            </span>
                          );
                        }
                        if (!isAdmin) {
                          return (
                            <span key={soort.soort} className="text-tertiary" style={{ fontSize: '13px' }}>
                              Geen {soort.label.toLowerCase()}
                            </span>
                          );
                        }
                        return (
                          <label key={soort.soort} className="btn-link" style={{ color: 'var(--grijs-500)', cursor: 'pointer' }}>
                            {uploadingPhotoId === sleutel ? 'Uploaden...' : <><Icon name="image-upload" size={16} />{soort.label}</>}
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              disabled={uploadingPhotoId === sleutel}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoUpload(attempt.id, file, soort.soort);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                    {isAdmin && (
                      <div className="knoppenrij" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => startEdit(attempt)}
                          className="btn-link"
                        >
                          <Icon name="pencil" size={16} />
                          Bewerken
                        </button>
                        {/* Alleen bij de laatste monstername, en alleen als die genomen is */}
                        {attempt.isTaken && idx === attempts.length - 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setAfnameDoel({
                                sampleId,
                                oNumber,
                                sampleDate: attempt.sampleDate,
                                heeftFotoPotje: !!attempt.photoUrl,
                                heeftFotoOnderdeel: !!attempt.partPhotoUrl,
                                aantalPogingen: attempts.length,
                              })
                            }
                            className="btn-link"
                          >
                            <Icon name="reset" size={16} />
                            Afname ongedaan maken
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(attempt, idx + 1)}
                          className="btn-link btn-link-danger"
                        >
                          <Icon name="trash" size={16} />
                          Monstername verwijderen
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
      <AfnameOngedaanModal
        key={afnameDoel ? `afname-${afnameDoel.sampleId}` : 'afname-geen'}
        doel={afnameDoel}
        onClose={() => setAfnameDoel(null)}
        onKlaar={async () => {
          setAfnameDoel(null);
          await load();
          notifyChange();
          if (onAfnameOngedaan) onAfnameOngedaan();
        }}
      />
    </div>
  );
}
