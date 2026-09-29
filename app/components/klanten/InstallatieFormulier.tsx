'use client';

// Nieuwe installatie of gegevens van een installatie bewerken. Het object komt
// uit een keuzelijst (gegroepeerd per klant), of staat vast als je vanaf een
// object op het klantscherm begint.

import { useState } from 'react';
import { Icon, Modal } from '@/app/components/ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { INSTALLATIE_SOORTEN } from '@/lib/installaties';
import type { Installatie, ObjectKeuze } from './types';

export default function InstallatieFormulier({
  open,
  installatie,
  objecten,
  vastObject,
  onClose,
  onOpgeslagen,
}: {
  open: boolean;
  installatie: Installatie | null;
  /** Keuzelijst van objecten; niet nodig als vastObject gezet is */
  objecten?: ObjectKeuze[];
  /** Het object staat vast (nieuwe installatie vanaf het klantscherm) */
  vastObject?: { id: number; name: string };
  onClose: () => void;
  onOpgeslagen: (installatie: Installatie) => void;
}) {
  const [velden, setVelden] = useState({
    objectId: String(installatie?.objectId ?? vastObject?.id ?? ''),
    naam: installatie?.naam ?? '',
    soort: installatie?.soort ?? INSTALLATIE_SOORTEN[0].waarde,
    merk: installatie?.merk ?? '',
    typenummer: installatie?.typenummer ?? '',
    bouwjaar: installatie?.bouwjaar ? String(installatie.bouwjaar) : '',
    serienummer: installatie?.serienummer ?? '',
    notities: installatie?.notities ?? '',
  });
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  const zet = (veld: keyof typeof velden) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setVelden((v) => ({ ...v, [veld]: e.target.value }));

  // Objecten per klant; objecten zonder klant onderaan.
  const groepen = new Map<string, ObjectKeuze[]>();
  for (const o of objecten ?? []) {
    const kop = o.klant?.naam ?? 'Zonder klant';
    groepen.set(kop, [...(groepen.get(kop) ?? []), o]);
  }

  const opslaan = async (e: React.FormEvent) => {
    e.preventDefault();
    setBezig(true);
    setFout('');
    try {
      const res = await fetch(installatie ? `/api/installaties/${installatie.id}` : '/api/installaties', {
        method: installatie ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(velden),
      });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De installatie is niet opgeslagen.'));
        return;
      }
      onOpgeslagen(await res.json());
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={installatie ? `${installatie.naam} bewerken` : vastObject ? `Nieuwe installatie op ${vastObject.name}` : 'Nieuwe installatie'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Annuleren</button>
          <button type="submit" form="installatie-formulier" className="btn btn-primary" disabled={bezig}>
            <Icon name="check" size={16} />
            {bezig ? 'Bezig...' : installatie ? 'Opslaan' : 'Installatie toevoegen'}
          </button>
        </>
      }
    >
      <form id="installatie-formulier" onSubmit={opslaan} className="beheer-formulier">
        {!vastObject && (
          <div className="veld beheer-veld-breed">
            <label className="label" htmlFor="inst-object">Object</label>
            <select id="inst-object" className="select" value={velden.objectId} onChange={zet('objectId')} required>
              <option value="">Kies een object</option>
              {[...groepen.entries()].map(([kop, lijst]) => (
                <optgroup key={kop} label={kop}>
                  {lijst.map((o) => (
                    <option key={o.id} value={String(o.id)}>{o.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="inst-naam">Naam</label>
          <input id="inst-naam" className="input" value={velden.naam} onChange={zet('naam')} placeholder="Bijv. Aggregaat hefdeur boven" required />
        </div>
        <div className="veld">
          <label className="label" htmlFor="inst-soort">Soort</label>
          <select id="inst-soort" className="select" value={velden.soort} onChange={zet('soort')}>
            {INSTALLATIE_SOORTEN.map((s) => (
              <option key={s.waarde} value={s.waarde}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="veld">
          <label className="label" htmlFor="inst-merk">Merk</label>
          <input id="inst-merk" className="input" value={velden.merk} onChange={zet('merk')} />
        </div>
        <div className="veld">
          <label className="label" htmlFor="inst-type">Typenummer</label>
          <input id="inst-type" className="input" value={velden.typenummer} onChange={zet('typenummer')} />
        </div>
        <div className="veld">
          <label className="label" htmlFor="inst-bouwjaar">Bouwjaar</label>
          <input id="inst-bouwjaar" className="input" inputMode="numeric" value={velden.bouwjaar} onChange={zet('bouwjaar')} />
        </div>
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="inst-serie">Serienummer</label>
          <input id="inst-serie" className="input" value={velden.serienummer} onChange={zet('serienummer')} />
        </div>
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="inst-notities">Notities</label>
          <textarea id="inst-notities" className="textarea" rows={3} value={velden.notities} onChange={zet('notities')} />
        </div>
        {!installatie && (
          <p className="hint beheer-veld-breed">De installatie krijgt vanzelf een korte code, voor een latere QR-sticker.</p>
        )}
        {fout && <div className="alert alert-danger beheer-veld-breed" role="alert">{fout}</div>}
      </form>
    </Modal>
  );
}
