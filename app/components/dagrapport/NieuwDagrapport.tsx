'use client';

// Een dagrapport beginnen voor een losse klant (vanuit Dagrapporten of het
// klantdossier). Vanuit het veldscherm maakt de knop Dagrapport het rapport
// meteen, met de klant en de dag van de stop.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, Modal } from '@/app/components/ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { vandaagNl } from '@/lib/contracten';
import { STANDAARD_UITVOERDER, type Dagrapport } from './types';

interface Keuzes {
  klanten: { id: number; naam: string }[];
  objecten: { id: number; name: string; klantId: number | null }[];
}

export default function NieuwDagrapport({ vasteKlant, onClose }: { vasteKlant?: { id: number; naam: string } | null; onClose: () => void }) {
  const router = useRouter();
  const [keuzes, setKeuzes] = useState<Keuzes>({ klanten: vasteKlant ? [vasteKlant] : [], objecten: [] });
  const [klantId, setKlantId] = useState(vasteKlant ? String(vasteKlant.id) : '');
  const [objectId, setObjectId] = useState('');
  const [datum, setDatum] = useState(vandaagNl());
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  useEffect(() => {
    let actueel = true;
    Promise.all([vasteKlant ? Promise.resolve(null) : fetch('/api/klanten'), fetch('/api/sample-objects')])
      .then(async ([k, o]) => {
        const klanten = k && k.ok ? await k.json() : null;
        const objecten = o.ok ? await o.json() : [];
        if (actueel) setKeuzes((v) => ({ klanten: klanten ?? v.klanten, objecten }));
      })
      .catch(() => {});
    return () => {
      actueel = false;
    };
  }, [vasteKlant]);

  const objecten = keuzes.objecten.filter((o) => String(o.klantId) === klantId);

  const maak = async () => {
    setBezig(true);
    setFout('');
    try {
      const res = await fetch('/api/dagrapporten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ klantId, objectId: objectId || null, datum, uitvoerder: STANDAARD_UITVOERDER }),
      });
      if (!res.ok) {
        setFout(await foutTekst(res, 'Het dagrapport is niet aangemaakt.'));
        return;
      }
      const d: Dagrapport = await res.json();
      router.push(`/dashboard/dagrapporten/${d.id}`);
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
      title="Nieuw dagrapport"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={bezig}>Annuleren</button>
          <button type="button" className="btn btn-primary" onClick={maak} disabled={bezig || !klantId}>
            <Icon name="module-dagrapport" size={16} />
            {bezig ? 'Bezig...' : 'Beginnen'}
          </button>
        </>
      }
    >
      <div className="veld">
        <label className="label" htmlFor="dr-klant">Klant</label>
        <select id="dr-klant" className="select" value={klantId} onChange={(e) => { setKlantId(e.target.value); setObjectId(''); }} disabled={!!vasteKlant}>
          <option value="">Kies een klant</option>
          {keuzes.klanten.map((k) => (
            <option key={k.id} value={String(k.id)}>{k.naam}</option>
          ))}
        </select>
      </div>
      <div className="veld">
        <label className="label" htmlFor="dr-object">Plek <span className="label-bij">(optioneel)</span></label>
        <select id="dr-object" className="select" value={objectId} onChange={(e) => setObjectId(e.target.value)} disabled={objecten.length === 0}>
          <option value="">{objecten.length === 0 ? 'Geen objecten bij deze klant' : 'Geen vaste plek'}</option>
          {objecten.map((o) => (
            <option key={o.id} value={String(o.id)}>{o.name}</option>
          ))}
        </select>
      </div>
      <div className="veld">
        <label className="label" htmlFor="dr-datum">Datum van het bezoek</label>
        <input id="dr-datum" type="date" className="input" value={datum} onChange={(e) => setDatum(e.target.value)} />
      </div>
      {fout && <div className="alert alert-danger" role="alert">{fout}</div>}
    </Modal>
  );
}
