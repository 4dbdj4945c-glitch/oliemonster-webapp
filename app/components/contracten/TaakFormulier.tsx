'use client';

// Een terugkerende taak toevoegen of bewerken: soort, titel, object en
// installatie van de klant, interval en de eerstvolgende datum. Weghalen staat
// onderaan (klein, met Ongedaan maken op de pagina).

import { useState } from 'react';
import { Icon, Modal } from '@/app/components/ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { INTERVALLEN, TAAK_SOORTEN, TAAK_SOORT_INFO, intervalTekst, vandaagNl, type TaakSoort } from '@/lib/contracten';
import type { Contract, Taak } from './types';

export interface PlekKeuze {
  objecten: { id: number; name: string }[];
  installaties: { id: number; naam: string; code: string; object: { id: number } }[];
}

export default function TaakFormulier({
  open,
  contract,
  taak,
  plekken,
  onClose,
  onOpgeslagen,
  onWeg,
}: {
  open: boolean;
  contract: Contract;
  taak: Taak | null;
  plekken: PlekKeuze;
  onClose: () => void;
  onOpgeslagen: (contract: Contract) => void;
  onWeg?: (taak: Taak) => void;
}) {
  const [velden, setVelden] = useState({
    soort: (taak?.soort ?? 'onderhoud') as TaakSoort,
    omschrijving: taak?.omschrijving ?? '',
    objectId: taak ? String(taak.object.id) : plekken.objecten.length === 1 ? String(plekken.objecten[0].id) : '',
    installatieId: taak?.installatie ? String(taak.installatie.id) : '',
    intervalMaanden: String(taak?.intervalMaanden ?? 12),
    volgendeOp: taak?.volgendeOp ?? vandaagNl(),
    geschatteMinuten: taak?.geschatteMinuten ? String(taak.geschatteMinuten) : '',
    notities: taak?.notities ?? '',
  });
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [veldFouten, setVeldFouten] = useState<Record<string, string>>({});
  const zet = <K extends keyof typeof velden>(k: K, w: (typeof velden)[K]) => setVelden((v) => ({ ...v, [k]: w }));
  const installaties = plekken.installaties.filter((i) => String(i.object.id) === velden.objectId);
  const eigenInterval = !INTERVALLEN.includes(Number(velden.intervalMaanden));

  const opslaan = async (e: React.FormEvent) => {
    e.preventDefault();
    setBezig(true);
    setFout('');
    setVeldFouten({});
    try {
      const body = { ...velden, installatieId: velden.installatieId || null, geschatteMinuten: velden.geschatteMinuten || null };
      const res = await fetch(taak ? `/api/contract-taken/${taak.id}` : `/api/contracten/${contract.id}/taken`, {
        method: taak ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.clone().json().catch(() => null);
        if (data?.velden) setVeldFouten(data.velden);
        setFout(await foutTekst(res, 'De taak is niet opgeslagen.'));
        return;
      }
      const data = await res.json();
      onOpgeslagen(taak ? data : data.contract);
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  const veldFout = (naam: string) => veldFouten[naam] && <p className="veld-fout">{veldFouten[naam]}</p>;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={taak ? `${taak.titel} bewerken` : 'Taak toevoegen'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Annuleren</button>
          <button type="submit" form="taak-formulier" className="btn btn-primary" disabled={bezig}>
            <Icon name="check" size={16} />
            {bezig ? 'Bezig...' : taak ? 'Opslaan' : 'Taak toevoegen'}
          </button>
        </>
      }
    >
      <form id="taak-formulier" onSubmit={opslaan} className="beheer-formulier">
        <div className="veld beheer-veld-breed">
          <span className="label">Wat voor taak</span>
          <div className="keuzeknoppen keuzeknoppen-klein contract-soorten" role="group" aria-label="Soort taak">
            {TAAK_SOORTEN.map((s) => (
              <button
                key={s}
                type="button"
                className={`keuzeknop${velden.soort === s ? ' on' : ''}`}
                aria-pressed={velden.soort === s}
                onClick={() => zet('soort', s)}
              >
                <Icon name={TAAK_SOORT_INFO[s].icoon} size={16} />
                {TAAK_SOORT_INFO[s].label}
              </button>
            ))}
          </div>
          {TAAK_SOORT_INFO[velden.soort].sjabloon && (
            <p className="hint">Rond je een {TAAK_SOORT_INFO[velden.soort].label.toLowerCase()} op dit object af, dan schuift de datum vanzelf door.</p>
          )}
        </div>
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="taak-omschrijving">Titel <span className="label-bij">(mag leeg, dan de soort)</span></label>
          <input
            id="taak-omschrijving"
            className="input"
            value={velden.omschrijving}
            onChange={(e) => zet('omschrijving', e.target.value)}
            placeholder={`Bijv. Halfjaarlijks ${TAAK_SOORT_INFO[velden.soort].label.toLowerCase()}`}
          />
        </div>
        <div className="veld">
          <label className="label" htmlFor="taak-object">Object</label>
          <select
            id="taak-object"
            className={`select${veldFouten.objectId ? ' input-fout' : ''}`}
            value={velden.objectId}
            onChange={(e) => setVelden((v) => ({ ...v, objectId: e.target.value, installatieId: '' }))}
            required
          >
            <option value="">Kies een object</option>
            {plekken.objecten.map((o) => (
              <option key={o.id} value={String(o.id)}>{o.name}</option>
            ))}
          </select>
          {veldFout('objectId')}
          {plekken.objecten.length === 0 && <p className="hint">Deze klant heeft nog geen objecten. Koppel er eerst een in het klantdossier.</p>}
        </div>
        <div className="veld">
          <label className="label" htmlFor="taak-installatie">Installatie <span className="label-bij">(optioneel)</span></label>
          <select
            id="taak-installatie"
            className={`select${veldFouten.installatieId ? ' input-fout' : ''}`}
            value={velden.installatieId}
            onChange={(e) => zet('installatieId', e.target.value)}
            disabled={installaties.length === 0}
          >
            <option value="">{installaties.length === 0 ? 'Geen installaties op dit object' : 'Het hele object'}</option>
            {installaties.map((i) => (
              <option key={i.id} value={String(i.id)}>{i.naam} ({i.code})</option>
            ))}
          </select>
          {veldFout('installatieId')}
        </div>
        <div className="veld">
          <label className="label" htmlFor="taak-interval">Hoe vaak</label>
          <select
            id="taak-interval"
            className="select"
            value={eigenInterval ? 'eigen' : velden.intervalMaanden}
            onChange={(e) => zet('intervalMaanden', e.target.value === 'eigen' ? '9' : e.target.value)}
          >
            {INTERVALLEN.map((n) => (
              <option key={n} value={String(n)}>{intervalTekst(n)}</option>
            ))}
            <option value="eigen">Ander aantal maanden</option>
          </select>
          {eigenInterval && (
            <input
              className={`input contract-eigen-interval${veldFouten.intervalMaanden ? ' input-fout' : ''}`}
              inputMode="numeric"
              aria-label="Aantal maanden"
              value={velden.intervalMaanden}
              onChange={(e) => zet('intervalMaanden', e.target.value.replace(/[^0-9]/g, ''))}
            />
          )}
          {veldFout('intervalMaanden')}
        </div>
        <div className="veld">
          <label className="label" htmlFor="taak-volgende">Eerstvolgende keer</label>
          <input
            id="taak-volgende"
            type="date"
            className={`input${veldFouten.volgendeOp ? ' input-fout' : ''}`}
            value={velden.volgendeOp}
            onChange={(e) => zet('volgendeOp', e.target.value)}
            required
          />
          {veldFout('volgendeOp')}
        </div>
        <div className="veld">
          <label className="label" htmlFor="taak-minuten">Tijd op locatie (minuten)</label>
          <input
            id="taak-minuten"
            className={`input${veldFouten.geschatteMinuten ? ' input-fout' : ''}`}
            inputMode="numeric"
            value={velden.geschatteMinuten}
            placeholder={String(TAAK_SOORT_INFO[velden.soort].minuten)}
            onChange={(e) => zet('geschatteMinuten', e.target.value.replace(/[^0-9]/g, ''))}
          />
          {veldFout('geschatteMinuten')}
          <p className="hint">Voor de planning. Leeg: {TAAK_SOORT_INFO[velden.soort].minuten} minuten.</p>
        </div>
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="taak-notities">Notities (intern)</label>
          <textarea id="taak-notities" className="textarea" rows={2} value={velden.notities} onChange={(e) => zet('notities', e.target.value)} />
        </div>
      </form>

      {fout && <div className="alert alert-danger" role="alert" style={{ marginTop: '12px' }}>{fout}</div>}

      {taak && onWeg && (
        <section className="gevarenzone">
          <p className="gevarenzone-kop">
            <Icon name="trash" size={16} />
            Taak weghalen
          </p>
          <p className="gevarenzone-tekst">
            {taak.titel} verdwijnt van Vandaag, de planning en het klantportaal. Wat al is uitgevoerd blijft bewaard. Direct daarna kun je het ongedaan maken.
          </p>
          <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => onWeg(taak)}>
            <Icon name="trash" size={16} />
            Taak weghalen
          </button>
        </section>
      )}
    </Modal>
  );
}
