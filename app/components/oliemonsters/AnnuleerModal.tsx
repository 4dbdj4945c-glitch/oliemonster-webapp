'use client';

// Annuleren met reden: één monster, of alle openstaande monsters van een object.
// De pagina geeft een key per doel mee, zodat het formulier bij elk nieuw doel leeg begint.

import { useState } from 'react';
import { Icon, Modal } from '@/app/components/ui';
import { ANNULEER_REDENEN } from '@/lib/cancelReasons';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import type { OilSample } from './types';

export type AnnuleerDoel =
  | { soort: 'monster'; sample: OilSample }
  | { soort: 'object'; objectId: number; objectNaam: string; jaar: number };

interface Props {
  doel: AnnuleerDoel | null;
  onClose: () => void;
  /** Na het annuleren, met de melding voor boven de lijst */
  onKlaar: (melding: string) => void;
}

export default function AnnuleerModal({ doel, onClose, onKlaar }: Props) {
  const [reden, setReden] = useState(ANNULEER_REDENEN[0].waarde);
  const [toelichting, setToelichting] = useState('');
  const [inPdf, setInPdf] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  const bulk = doel?.soort === 'object';

  const bevestig = async () => {
    if (!doel) return;
    setBezig(true);
    setFout('');
    try {
      const body = { reason: reden, toelichting, cancelReasonInPdf: inPdf };
      const response =
        doel.soort === 'object'
          ? await fetch('/api/samples/cancel-bulk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...body, objectId: doel.objectId, analysisYear: doel.jaar }),
            })
          : await fetch(`/api/samples/${doel.sample.id}/cancel`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
      if (!response.ok) {
        setFout(await foutTekst(response, 'Het annuleren is niet gelukt.'));
        return;
      }
      // De bulkactie zegt hoeveel monsters er geannuleerd zijn, of dat er niets
      // openstond. Zonder die melding lijkt er niets te gebeuren.
      const uitkomst = await response.json().catch(() => ({}));
      onKlaar(
        doel.soort === 'object'
          ? uitkomst?.melding || 'De monsters zijn bijgewerkt.'
          : `${doel.sample.oNumber} is geannuleerd.`
      );
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  return (
    <Modal
      open={doel !== null}
      onClose={onClose}
      title={
        doel?.soort === 'object'
          ? `Alle monsters van ${doel.objectNaam} annuleren`
          : `${doel?.sample.oNumber ?? ''} annuleren`
      }
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Terug</button>
          <button type="button" className="btn btn-danger" onClick={bevestig} disabled={bezig}>
            <Icon name="status-cancelled" size={16} />
            {bezig ? 'Bezig...' : 'Annuleren bevestigen'}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0, marginBottom: '14px' }}>
        {bulk && doel?.soort === 'object'
          ? `Alle nog niet genomen monsters van ${doel.objectNaam} krijgen deze reden. Al genomen monsters blijven staan.`
          : 'Het monster blijft in de lijst staan, telt niet mee in de planning en je kunt dit terugdraaien.'}
      </p>

      <div className="veld">
        <label className="label" htmlFor="annuleer-reden">Reden</label>
        <select
          id="annuleer-reden"
          className="select"
          value={reden}
          onChange={(e) => setReden(e.target.value)}
        >
          {ANNULEER_REDENEN.map((r) => (
            <option key={r.waarde} value={r.waarde}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="veld">
        <label className="label" htmlFor="annuleer-toelichting">
          Toelichting {ANNULEER_REDENEN.find((r) => r.waarde === reden)?.toelichtingNodig ? '' : '(optioneel)'}
        </label>
        <textarea
          id="annuleer-toelichting"
          className="textarea"
          rows={2}
          value={toelichting}
          onChange={(e) => setToelichting(e.target.value)}
        />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--navy)' }}>
        <input
          type="checkbox"
          checked={inPdf}
          onChange={(e) => setInPdf(e.target.checked)}
          style={{ width: '18px', height: '18px' }}
        />
        Reden ook in de PDF voor de klant
      </label>

      {fout && <div className="alert alert-danger" style={{ marginTop: '12px' }}>{fout}</div>}
    </Modal>
  );
}
