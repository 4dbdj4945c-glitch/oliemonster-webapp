'use client';

// Nieuwe inspectie: eerst het sjabloon (grote vlakken naast elkaar), dan het object
// (per klant gegroepeerd, alleen objecten met een klant), optioneel de
// installatie, de datum en wie hem uitvoert. Daarna meteen naar het invulscherm.

import { useState } from 'react';
import { Icon, Modal } from '@/app/components/ui';
import type { ObjectKeuze } from '@/app/components/klanten/types';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { SJABLONEN, SJABLOON_SLEUTELS, type SjabloonSleutel } from '@/lib/inspecties/sjablonen';
import { vandaagInvoer } from './types';

export interface InstallatieKeuze {
  id: number;
  naam: string;
  code: string;
  object: { id: number };
}

/** Wie de inspectie uitvoert, als voorstel. */
export const STANDAARD_UITVOERDER = 'Roel Mandigers';

export default function NieuweInspectie({
  objecten,
  installaties,
  onClose,
  onGemaakt,
}: {
  objecten: ObjectKeuze[];
  installaties: InstallatieKeuze[];
  onClose: () => void;
  onGemaakt: (id: number) => void;
}) {
  const [sjabloon, setSjabloon] = useState<SjabloonSleutel>('persluchtlekken');
  const [objectId, setObjectId] = useState('');
  const [installatieId, setInstallatieId] = useState('');
  const [datum, setDatum] = useState(vandaagInvoer());
  const [uitvoerder, setUitvoerder] = useState(STANDAARD_UITVOERDER);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  const groepen = new Map<string, ObjectKeuze[]>();
  for (const o of objecten.filter((x) => x.klant)) {
    const kop = o.klant!.naam;
    groepen.set(kop, [...(groepen.get(kop) ?? []), o]);
  }
  const opObject = installaties.filter((i) => String(i.object.id) === objectId);

  const maak = async (e: React.FormEvent) => {
    e.preventDefault();
    setBezig(true);
    setFout('');
    try {
      const res = await fetch('/api/inspecties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sjabloon, objectId, installatieId: installatieId || null, datum, uitvoerder }),
      });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De inspectie is niet aangemaakt.'));
        return;
      }
      onGemaakt((await res.json()).id);
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Nieuwe inspectie"
      footer={
        <>
          <button type="button" className="btn veldwerk-knop" onClick={onClose}>Annuleren</button>
          <button type="submit" form="nieuwe-inspectie" className="btn btn-primary veldwerk-knop" disabled={bezig}>
            <Icon name="check" size={16} />
            {bezig ? 'Bezig...' : 'Beginnen'}
          </button>
        </>
      }
    >
      <form id="nieuwe-inspectie" className="veldwerk" onSubmit={maak}>
        <div className="insp-sjabloonkeuze" role="radiogroup" aria-label="Soort inspectie">
          {SJABLOON_SLEUTELS.map((k) => {
            const s = SJABLONEN[k];
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={sjabloon === k}
                className={`insp-sjabloon${sjabloon === k ? ' on' : ''}`}
                onClick={() => setSjabloon(k)}
              >
                <Icon name={s.icoon} size={24} />
                <b>{s.naam}</b>
                <small>{s.beschrijving}</small>
              </button>
            );
          })}
        </div>
        <div className="veld">
          <label className="label" htmlFor="ni-object">Object</label>
          <select id="ni-object" className="select" value={objectId} onChange={(e) => { setObjectId(e.target.value); setInstallatieId(''); }} required>
            <option value="">Kies een object</option>
            {[...groepen.entries()].map(([kop, lijst]) => (
              <optgroup key={kop} label={kop}>
                {lijst.map((o) => (
                  <option key={o.id} value={String(o.id)}>{o.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="hint">De inspectie hoort bij de klant van het object.</p>
        </div>
        {opObject.length > 0 && (
          <div className="veld">
            <label className="label" htmlFor="ni-installatie">Installatie (niet verplicht)</label>
            <select id="ni-installatie" className="select" value={installatieId} onChange={(e) => setInstallatieId(e.target.value)}>
              <option value="">Het hele object</option>
              {opObject.map((i) => (
                <option key={i.id} value={String(i.id)}>{i.naam} ({i.code})</option>
              ))}
            </select>
          </div>
        )}
        <div className="veld">
          <label className="label" htmlFor="ni-datum">Datum</label>
          <input id="ni-datum" type="date" className="input" value={datum} onChange={(e) => setDatum(e.target.value)} required />
        </div>
        <div className="veld">
          <label className="label" htmlFor="ni-uitvoerder">Uitgevoerd door</label>
          <input id="ni-uitvoerder" className="input" value={uitvoerder} onChange={(e) => setUitvoerder(e.target.value)} required />
        </div>
        {fout && <div className="alert alert-danger" role="alert">{fout}</div>}
      </form>
    </Modal>
  );
}
