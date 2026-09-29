'use client';

// Met de hand vastleggen dat een taak is gedaan. De datum staat op vandaag; de
// volgende keer telt vanaf die dag (lib/contracten.ts).

import { useState } from 'react';
import { Icon, Modal } from '@/app/components/ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { dagKort, intervalTekst, volgendeNaUitvoering, vandaagNl } from '@/lib/contracten';
import type { Contract, Taak } from './types';

export default function UitgevoerdVenster({
  taak,
  onClose,
  onKlaar,
}: {
  taak: Taak | null;
  onClose: () => void;
  onKlaar: (contract: Contract, taak: Taak, bron: string, volgendeOp: string, doorgezet: boolean) => void;
}) {
  const [datum, setDatum] = useState(vandaagNl());
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  let voorspelling: string | null = null;
  try {
    voorspelling = taak && /^\d{4}-\d{2}-\d{2}$/.test(datum) ? volgendeNaUitvoering(datum, taak.intervalMaanden) : null;
  } catch {
    voorspelling = null;
  }

  const opslaan = async () => {
    if (!taak) return;
    setBezig(true);
    setFout('');
    try {
      const res = await fetch(`/api/contract-taken/${taak.id}/uitgevoerd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datum }),
      });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De uitvoering is niet vastgelegd.'));
        return;
      }
      const data = await res.json();
      onKlaar(data.contract, taak, data.bron, data.volgendeOp, data.doorgezet);
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  return (
    <Modal
      open={taak !== null}
      onClose={onClose}
      title={taak ? `${taak.titel} uitgevoerd` : 'Uitgevoerd'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={bezig}>Annuleren</button>
          <button type="button" className="btn btn-primary" onClick={opslaan} disabled={bezig || !voorspelling || datum > vandaagNl()}>
            <Icon name="check" size={16} />
            {bezig ? 'Bezig...' : 'Vastleggen'}
          </button>
        </>
      }
    >
      {taak && (
        <>
          <div className="veld">
            <label className="label" htmlFor="uitgevoerd-datum">Uitgevoerd op</label>
            <input id="uitgevoerd-datum" type="date" className="input" value={datum} max={vandaagNl()} onChange={(e) => setDatum(e.target.value)} />
          </div>
          {taak.laatstUitgevoerdOp && datum < taak.laatstUitgevoerdOp ? (
            <p className="hint">Deze datum ligt voor de laatste uitvoering ({dagKort(taak.laatstUitgevoerdOp)}). Hij komt in de geschiedenis, maar de volgende keer blijft {dagKort(taak.volgendeOp)}.</p>
          ) : datum > vandaagNl() ? (
            <p className="veld-fout">Een uitvoering kan niet in de toekomst liggen.</p>
          ) : voorspelling && (
            <p className="hint">
              {intervalTekst(taak.intervalMaanden).replace(/^e/, 'E')}: de volgende keer wordt {dagKort(voorspelling)}.
            </p>
          )}
          {fout && <div className="alert alert-danger" role="alert">{fout}</div>}
        </>
      )}
    </Modal>
  );
}
