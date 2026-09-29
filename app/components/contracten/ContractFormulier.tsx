'use client';

// Nieuw contract of een contract bewerken: klant (alleen bij nieuw), naam,
// looptijd en interne notities. De pagina geeft een key per contract mee.

import { useState } from 'react';
import { Icon, Modal } from '@/app/components/ui';
import VeiligVerwijderBlok from '@/app/components/VeiligVerwijderBlok';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import type { Contract } from './types';

export default function ContractFormulier({
  open,
  contract,
  klanten,
  vasteKlant,
  onClose,
  onOpgeslagen,
  onVerwijderd,
}: {
  open: boolean;
  contract: Contract | null;
  /** Keuze bij een nieuw contract */
  klanten: { id: number; naam: string }[];
  /** Nieuw contract vanuit een klantdossier: de klant staat vast */
  vasteKlant?: number | null;
  onClose: () => void;
  onOpgeslagen: (contract: Contract) => void;
  onVerwijderd?: (contract: Contract) => void;
}) {
  const [velden, setVelden] = useState({
    klantId: contract ? String(contract.klantId) : vasteKlant ? String(vasteKlant) : '',
    naam: contract?.naam ?? '',
    startOp: contract?.startOp ?? '',
    eindOp: contract?.eindOp ?? '',
    notities: contract?.notities ?? '',
  });
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [veldFouten, setVeldFouten] = useState<Record<string, string>>({});

  const zet = (veld: keyof typeof velden) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setVelden((v) => ({ ...v, [veld]: e.target.value }));

  const opslaan = async (e: React.FormEvent) => {
    e.preventDefault();
    setBezig(true);
    setFout('');
    setVeldFouten({});
    try {
      const { klantId, ...rest } = velden;
      const res = await fetch(contract ? `/api/contracten/${contract.id}` : '/api/contracten', {
        method: contract ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contract ? rest : { ...rest, klantId }),
      });
      if (!res.ok) {
        const data = await res.clone().json().catch(() => null);
        if (data?.velden) setVeldFouten(data.velden);
        setFout(await foutTekst(res, 'Het contract is niet opgeslagen.'));
        return;
      }
      onOpgeslagen(await res.json());
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  const verwijder = async (getypt: string): Promise<string | null> => {
    if (!contract) return null;
    try {
      const res = await fetch(`/api/contracten/${contract.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bevestigNaam: getypt }),
      });
      if (!res.ok) return foutTekst(res, 'Het contract is niet verwijderd.');
      onVerwijderd?.(contract);
      return null;
    } catch {
      return GEEN_VERBINDING;
    }
  };

  const veldFout = (naam: string) => veldFouten[naam] && <p className="veld-fout">{veldFouten[naam]}</p>;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={contract ? `${contract.naam} bewerken` : 'Nieuw contract'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Annuleren</button>
          <button type="submit" form="contract-formulier" className="btn btn-primary" disabled={bezig}>
            <Icon name="check" size={16} />
            {bezig ? 'Bezig...' : contract ? 'Opslaan' : 'Contract toevoegen'}
          </button>
        </>
      }
    >
      <form id="contract-formulier" onSubmit={opslaan} className="beheer-formulier">
        {!contract && (
          <div className="veld beheer-veld-breed">
            <label className="label" htmlFor="contract-klant">Klant</label>
            <select
              id="contract-klant"
              className={`select${veldFouten.klantId ? ' input-fout' : ''}`}
              value={velden.klantId}
              onChange={zet('klantId')}
              disabled={!!vasteKlant}
              required
            >
              <option value="">Kies een klant</option>
              {klanten.map((k) => (
                <option key={k.id} value={String(k.id)}>{k.naam}</option>
              ))}
            </select>
            {veldFout('klantId')}
          </div>
        )}
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="contract-naam">Naam</label>
          <input
            id="contract-naam"
            className={`input${veldFouten.naam ? ' input-fout' : ''}`}
            value={velden.naam}
            onChange={zet('naam')}
            placeholder="Bijv. Onderhoudscontract werkplaats"
            required
          />
          {veldFout('naam')}
        </div>
        <div className="veld">
          <label className="label" htmlFor="contract-start">Begint op</label>
          <input id="contract-start" type="date" className="input" value={velden.startOp} onChange={zet('startOp')} />
        </div>
        <div className="veld">
          <label className="label" htmlFor="contract-eind">Loopt tot</label>
          <input
            id="contract-eind"
            type="date"
            className={`input${veldFouten.eindOp ? ' input-fout' : ''}`}
            value={velden.eindOp}
            onChange={zet('eindOp')}
          />
          {veldFout('eindOp')}
          <p className="hint">Leeg: doorlopend.</p>
        </div>
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="contract-notities">Notities (intern)</label>
          <textarea id="contract-notities" className="textarea" rows={3} value={velden.notities} onChange={zet('notities')} />
          <p className="hint">De klant ziet dit nooit, ook niet in het klantportaal.</p>
        </div>
      </form>

      {fout && <div className="alert alert-danger" role="alert" style={{ marginTop: '12px' }}>{fout}</div>}

      {contract && (
        <VeiligVerwijderBlok
          id={`contract-${contract.id}`}
          kop="Contract verwijderen"
          uitleg={
            <>
              Haalt {contract.naam} met {contract.taken.length} {contract.taken.length === 1 ? 'taak' : 'taken'} uit de lijsten, van Vandaag,
              de planning en het klantportaal. Wat al is uitgevoerd blijft in het logboek. Direct daarna kun je het ongedaan maken.
            </>
          }
          bevestig={contract.naam}
          knop="Contract verwijderen"
          onVerwijder={verwijder}
        />
      )}
    </Modal>
  );
}
