'use client';

// Contactpersoon toevoegen of bewerken. Weghalen staat onderaan het venster,
// los van Opslaan; daarna kan het tien seconden terug met Ongedaan maken.

import { useState } from 'react';
import { Icon, Modal } from '@/app/components/ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import type { Contactpersoon } from './types';

export default function ContactpersoonFormulier({
  open,
  klantId,
  persoon,
  onClose,
  onOpgeslagen,
  onWeggehaald,
}: {
  open: boolean;
  klantId: number;
  persoon: Contactpersoon | null;
  onClose: () => void;
  onOpgeslagen: () => void;
  onWeggehaald: (persoon: Contactpersoon) => void;
}) {
  const [velden, setVelden] = useState({
    naam: persoon?.naam ?? '',
    functie: persoon?.functie ?? '',
    email: persoon?.email ?? '',
    telefoon: persoon?.telefoon ?? '',
  });
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  const zet = (veld: keyof typeof velden) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setVelden((v) => ({ ...v, [veld]: e.target.value }));

  const verstuur = async (url: string, method: string, body?: unknown) => {
    setBezig(true);
    setFout('');
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        setFout(await foutTekst(res, 'Dat is niet gelukt.'));
        return false;
      }
      return true;
    } catch {
      setFout(GEEN_VERBINDING);
      return false;
    } finally {
      setBezig(false);
    }
  };

  const opslaan = async (e: React.FormEvent) => {
    e.preventDefault();
    const gelukt = persoon
      ? await verstuur(`/api/contactpersonen/${persoon.id}`, 'PUT', velden)
      : await verstuur(`/api/klanten/${klantId}/contactpersonen`, 'POST', velden);
    if (gelukt) onOpgeslagen();
  };

  const weghalen = async () => {
    if (!persoon) return;
    if (await verstuur(`/api/contactpersonen/${persoon.id}`, 'DELETE')) onWeggehaald(persoon);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={persoon ? `${persoon.naam} bewerken` : 'Nieuwe contactpersoon'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Annuleren</button>
          <button type="submit" form="contact-formulier" className="btn btn-primary" disabled={bezig}>
            <Icon name="check" size={16} />
            {bezig ? 'Bezig...' : persoon ? 'Opslaan' : 'Toevoegen'}
          </button>
        </>
      }
    >
      <form id="contact-formulier" onSubmit={opslaan} className="beheer-formulier">
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="contact-naam">Naam</label>
          <input id="contact-naam" className="input" value={velden.naam} onChange={zet('naam')} required autoFocus />
        </div>
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="contact-functie">Functie</label>
          <input id="contact-functie" className="input" value={velden.functie} onChange={zet('functie')} />
        </div>
        <div className="veld">
          <label className="label" htmlFor="contact-email">E-mail</label>
          <input id="contact-email" className="input" type="email" value={velden.email} onChange={zet('email')} />
        </div>
        <div className="veld">
          <label className="label" htmlFor="contact-telefoon">Telefoon</label>
          <input id="contact-telefoon" className="input" type="tel" value={velden.telefoon} onChange={zet('telefoon')} />
        </div>
        {fout && <div className="alert alert-danger beheer-veld-breed" role="alert">{fout}</div>}
      </form>

      {persoon && (
        <section className="gevarenzone">
          <p className="gevarenzone-kop">
            <Icon name="trash" size={16} />
            Contactpersoon weghalen
          </p>
          <p className="gevarenzone-tekst">
            {persoon.naam} verdwijnt bij deze klant. Direct daarna kun je het nog ongedaan maken.
          </p>
          <button type="button" className="btn btn-sm btn-danger-soft" onClick={weghalen} disabled={bezig}>
            <Icon name="trash" size={16} />
            {persoon.naam} weghalen
          </button>
        </section>
      )}
    </Modal>
  );
}
