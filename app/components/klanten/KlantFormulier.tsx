'use client';

// Nieuwe klant of gegevens van een klant bewerken. De pagina geeft een key per
// klant mee, zodat het formulier bij openen de actuele gegevens heeft.

import { useState } from 'react';
import { Icon, Modal } from '@/app/components/ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import type { Klant } from './types';

export default function KlantFormulier({
  open,
  klant,
  onClose,
  onOpgeslagen,
}: {
  open: boolean;
  klant: Klant | null;
  onClose: () => void;
  onOpgeslagen: (klant: Klant) => void;
}) {
  const [velden, setVelden] = useState({
    naam: klant?.naam ?? '',
    adres: klant?.adres ?? '',
    postcode: klant?.postcode ?? '',
    plaats: klant?.plaats ?? '',
    kvkNummer: klant?.kvkNummer ?? '',
    notities: klant?.notities ?? '',
  });
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  const zet = (veld: keyof typeof velden) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setVelden((v) => ({ ...v, [veld]: e.target.value }));

  const opslaan = async (e: React.FormEvent) => {
    e.preventDefault();
    setBezig(true);
    setFout('');
    try {
      const res = await fetch(klant ? `/api/klanten/${klant.id}` : '/api/klanten', {
        method: klant ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(velden),
      });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De klant is niet opgeslagen.'));
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
      title={klant ? `${klant.naam} bewerken` : 'Nieuwe klant'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Annuleren</button>
          <button type="submit" form="klant-formulier" className="btn btn-primary" disabled={bezig}>
            <Icon name="check" size={16} />
            {bezig ? 'Bezig...' : klant ? 'Opslaan' : 'Klant toevoegen'}
          </button>
        </>
      }
    >
      <form id="klant-formulier" onSubmit={opslaan} className="beheer-formulier">
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="klant-naam">Naam</label>
          <input id="klant-naam" className="input" value={velden.naam} onChange={zet('naam')} required autoFocus />
        </div>
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="klant-adres">Adres</label>
          <input id="klant-adres" className="input" value={velden.adres} onChange={zet('adres')} placeholder="Straat en huisnummer" />
        </div>
        <div className="veld">
          <label className="label" htmlFor="klant-postcode">Postcode</label>
          <input id="klant-postcode" className="input" value={velden.postcode} onChange={zet('postcode')} />
        </div>
        <div className="veld">
          <label className="label" htmlFor="klant-plaats">Plaats</label>
          <input id="klant-plaats" className="input" value={velden.plaats} onChange={zet('plaats')} />
        </div>
        <div className="veld">
          <label className="label" htmlFor="klant-kvk">KvK-nummer (optioneel)</label>
          <input id="klant-kvk" className="input" inputMode="numeric" value={velden.kvkNummer} onChange={zet('kvkNummer')} />
        </div>
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="klant-notities">Notities</label>
          <textarea id="klant-notities" className="textarea" rows={3} value={velden.notities} onChange={zet('notities')} />
        </div>
        {fout && <div className="alert alert-danger beheer-veld-breed" role="alert">{fout}</div>}
      </form>
    </Modal>
  );
}
