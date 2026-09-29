'use client';

/*
  Een bevinding toevoegen of bewerken: een lek of een arbeidsmiddel. Gemaakt
  voor de telefoon met één hand en handschoenen aan (.veldwerk: velden en
  knoppen van 56px), met de foto als groot tikvlak (FotoKiezer). Keuzes zoals
  prioriteit, uitslag en de checklist zijn grote knoppen naast elkaar, geen
  keuzelijst. Wat er per sjabloon in staat, komt uit lib/inspecties/sjablonen.ts.

  Bij een nieuwe bevinding kan Opslaan en nog een: het venster blijft open en
  het labelnummer telt door.
*/

import { useState } from 'react';
import { Icon, Modal } from '@/app/components/ui';
import FotoKiezer from '@/app/components/FotoKiezer';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { verkleinFoto } from '@/lib/fotoVerkleinen';
import {
  CHECKLIST_ANTWOORDEN,
  checklistVan,
  getal,
  leesGetal,
  luchtketelWaarschuwing,
  sjabloonVan,
  type ChecklistAntwoord,
} from '@/lib/inspecties/sjablonen';
import { berekenLek, co2Tekst, euro } from '@/lib/inspecties/rekenen';
import type { Bevinding, Inspectie, InstallatieKort } from './types';
import { vandaagInvoer } from './types';

type Velden = {
  titel: string;
  locatie: string;
  oordeel: string;
  notitie: string;
  meet: Record<string, string>;
  checklist: Record<string, ChecklistAntwoord>;
  gerepareerd: boolean;
  gerepareerdOp: string;
  volgendeOp: string;
  installatieId: string;
};

/** Het volgende labelnummer: één hoger dan het hoogste nummer tot nu toe. */
export function volgendLabel(items: Bevinding[]): string {
  const nummers = items.map((i) => Number(i.titel)).filter((n) => Number.isInteger(n) && n > 0);
  return nummers.length ? String(Math.max(...nummers) + 1) : '1';
}

function beginVelden(inspectie: Inspectie, item: Bevinding | null): Velden {
  const s = sjabloonVan(inspectie.sjabloon);
  const meet: Record<string, string> = {};
  for (const v of s.meetwaarden) {
    const n = item ? getal(item.waarden, v.sleutel) : null;
    meet[v.sleutel] = n === null ? '' : String(n).replace('.', ',');
  }
  return {
    titel: item?.titel ?? (s.item.kiesInstallatie ? '' : volgendLabel(inspectie.items)),
    locatie: item?.locatie ?? '',
    oordeel: item?.oordeel ?? s.oordeel.standaard,
    notitie: item?.notitie ?? '',
    meet,
    checklist: item ? { ...checklistVan(item.waarden) } : {},
    gerepareerd: item?.gerepareerd ?? false,
    gerepareerdOp: item?.gerepareerdOp ?? '',
    volgendeOp: item?.volgendeOp ?? inspectie.volgendeOp ?? '',
    installatieId: item?.installatieId ? String(item.installatieId) : '',
  };
}

export default function BevindingVenster({
  inspectie,
  item,
  installaties,
  onClose,
  onOpgeslagen,
  onWeghalen,
}: {
  inspectie: Inspectie;
  /** null = nieuwe bevinding */
  item: Bevinding | null;
  /** De installaties van de klant, om een arbeidsmiddel uit te kiezen */
  installaties: InstallatieKort[];
  onClose: () => void;
  /** Na opslaan: de inspectie zoals de server hem teruggeeft. */
  onOpgeslagen: (nieuw: Inspectie, sluiten: boolean) => void;
  onWeghalen?: (item: Bevinding) => void;
}) {
  const s = sjabloonVan(inspectie.sjabloon);
  const [velden, setVelden] = useState<Velden>(() => beginVelden(inspectie, item));
  const [foto, setFoto] = useState<File | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [veldFouten, setVeldFouten] = useState<Record<string, string>>({});
  const zet = <K extends keyof Velden>(k: K, w: Velden[K]) => setVelden((v) => ({ ...v, [k]: w }));
  const lekken = inspectie.sjabloon === 'persluchtlekken';

  // Live: wat kost dit lek, en is dit een ketel voor een aangewezen instelling?
  const lpm = leesGetal(velden.meet.verliesLpm ?? '');
  const lek = lekken && inspectie.totalen.soort === 'persluchtlekken' && lpm !== null && Number.isFinite(lpm) ? berekenLek(lpm, inspectie.totalen.instellingen) : null;
  const waarschuwing = !lekken
    ? luchtketelWaarschuwing({ ketelLiter: leesGetal(velden.meet.ketelLiter ?? ''), ketelBar: leesGetal(velden.meet.ketelBar ?? '') })
    : null;

  const opslaan = async (sluiten: boolean) => {
    setBezig(true);
    setFout('');
    setVeldFouten({});
    const body = {
      titel: velden.titel,
      locatie: velden.locatie,
      oordeel: velden.oordeel,
      notitie: velden.notitie,
      waarden: { ...velden.meet, ...(s.checklist.length ? { checklist: velden.checklist } : {}) },
      ...(s.reparatie ? { gerepareerd: velden.gerepareerd, gerepareerdOp: velden.gerepareerd ? velden.gerepareerdOp || null : null } : {}),
      ...(s.volgendePerItem ? { volgendeOp: velden.volgendeOp || null } : {}),
      ...(s.item.kiesInstallatie ? { installatieId: velden.installatieId || null } : {}),
    };
    try {
      const res = await fetch(item ? `/api/inspectie-items/${item.id}` : `/api/inspecties/${inspectie.id}/items`, {
        method: item ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.clone().json().catch(() => null);
        if (data?.velden) setVeldFouten(data.velden);
        setFout(await foutTekst(res, 'De bevinding is niet opgeslagen.'));
        return;
      }
      const data = await res.json();
      let nieuw: Inspectie = item ? data : data.inspectie;
      const itemId: number = item ? item.id : data.itemId;
      if (foto) {
        const form = new FormData();
        form.append('photo', await verkleinFoto(foto));
        const f = await fetch(`/api/inspectie-items/${itemId}/foto`, { method: 'POST', body: form });
        if (f.ok) {
          nieuw = await f.json();
        } else {
          // De bevinding staat er; alleen de foto niet. Het venster blijft open.
          onOpgeslagen(nieuw, false);
          setFout(`${await foutTekst(f, 'De foto is niet opgeslagen.')} De rest is wel opgeslagen.`);
          return;
        }
      }
      onOpgeslagen(nieuw, sluiten);
      if (!sluiten) {
        setVelden(beginVelden(nieuw, null));
        setFoto(null);
      }
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  const kiesInstallatie = (id: string) => {
    const i = installaties.find((x) => String(x.id) === id);
    setVelden((v) => ({ ...v, installatieId: id, titel: i ? i.naam : v.titel }));
  };

  const metingen = (
    <>
        <FotoKiezer label="Foto" bestand={foto} onKies={setFoto} bestaandeUrl={item?.fotoUrl ?? null} uitgeschakeld={bezig} />

        <div className="insp-meetwaarden">
          {s.meetwaarden.map((v) => (
            <div key={v.sleutel} className="veld">
              <label className="label" htmlFor={`bv-${v.sleutel}`}>
                {v.label}
                {v.eenheid ? ` (${v.eenheid})` : ''}
              </label>
              <input
                id={`bv-${v.sleutel}`}
                className={`input${veldFouten[v.sleutel] ? ' input-fout' : ''}`}
                inputMode="decimal"
                value={velden.meet[v.sleutel] ?? ''}
                onChange={(e) => setVelden((x) => ({ ...x, meet: { ...x.meet, [v.sleutel]: e.target.value } }))}
              />
              {veldFouten[v.sleutel] ? <p className="veld-fout">{veldFouten[v.sleutel]}</p> : v.hint ? <p className="hint">{v.hint}</p> : null}
            </div>
          ))}
        </div>
        {lek && (
          <p className="insp-live getal" aria-live="polite">
            <Icon name="euro" size={16} />
            {euro(lek.kostenPerJaar)} per jaar, {co2Tekst(lek.co2KgPerJaar)} per jaar
          </p>
        )}
        {waarschuwing && (
          <div className="alert alert-warning" role="alert">
            <Icon name="alert-warning" size={20} />
            <span>{waarschuwing}</span>
          </div>
        )}
    </>
  );

  const titel = item ? `${s.item.enkel === 'lek' ? `Lek ${item.titel}` : item.titel}` : s.item.nieuw;

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={titel}
      footer={
        <>
          <button type="button" className={`btn veldwerk-knop${item ? '' : ' insp-annuleer'}`} onClick={onClose}>Annuleren</button>
          {!item && (
            <button type="button" className="btn veldwerk-knop" onClick={() => opslaan(false)} disabled={bezig}>
              <Icon name="plus" size={16} />
              Opslaan en nog een
            </button>
          )}
          <button type="submit" form="bevinding" className="btn btn-primary veldwerk-knop" disabled={bezig}>
            <Icon name="check" size={16} />
            {bezig ? 'Bezig...' : 'Opslaan'}
          </button>
        </>
      }
    >
      <form
        id="bevinding"
        className="veldwerk"
        onSubmit={(e) => {
          e.preventDefault();
          opslaan(true);
        }}
      >
        {s.item.kiesInstallatie && installaties.length > 0 && (
          <div className="veld">
            <label className="label" htmlFor="bv-installatie">Uit de installaties</label>
            <select id="bv-installatie" className="select" value={velden.installatieId} onChange={(e) => kiesInstallatie(e.target.value)}>
              <option value="">Geen, zelf een naam invullen</option>
              {installaties.map((i) => (
                <option key={i.id} value={String(i.id)}>{i.naam} ({i.code})</option>
              ))}
            </select>
          </div>
        )}

        <div className={lekken ? 'insp-twee' : 'insp-stapel'}>
          <div className="veld">
            <label className="label" htmlFor="bv-titel">{s.item.titel}</label>
            <input
              id="bv-titel"
              className={`input${veldFouten.titel ? ' input-fout' : ''}`}
              value={velden.titel}
              onChange={(e) => zet('titel', e.target.value)}
              inputMode={lekken ? 'numeric' : undefined}
              placeholder={s.item.titelHint}
              required
            />
            {veldFouten.titel && <p className="veld-fout">{veldFouten.titel}</p>}
          </div>
          <div className="veld">
            <label className="label" htmlFor="bv-locatie">Locatie</label>
            <input id="bv-locatie" className="input" value={velden.locatie} onChange={(e) => zet('locatie', e.target.value)} placeholder={lekken ? 'Bijv. Hal 1, werkbank 3' : 'Bijv. Hal 2'} />
          </div>
        </div>

        {lekken && metingen}
        {s.checklist.length > 0 && (
          <fieldset className="insp-keuze">
            <div className="insp-checklist-kop">
              <legend className="label">Checklist</legend>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setVelden((v) => ({ ...v, checklist: Object.fromEntries(s.checklist.map((p) => [p.sleutel, v.checklist[p.sleutel] ?? 'goed'])) }))}
              >
                <Icon name="select-all" size={16} />
                Rest op goed
              </button>
            </div>
            <ul className="insp-checklist">
              {s.checklist.map((p) => (
                <li key={p.sleutel}>
                  <span className="insp-checklist-punt">{p.label}</span>
                  <span className="keuzeknoppen keuzeknoppen-klein" role="group" aria-label={p.label}>
                    {CHECKLIST_ANTWOORDEN.map((a) => (
                      <button
                        key={a.waarde}
                        type="button"
                        className={`keuzeknop${velden.checklist[p.sleutel] === a.waarde ? ` on on-${a.waarde}` : ''}`}
                        aria-pressed={velden.checklist[p.sleutel] === a.waarde}
                        onClick={() => setVelden((v) => ({ ...v, checklist: { ...v.checklist, [p.sleutel]: a.waarde } }))}
                      >
                        {a.label}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <fieldset className="insp-keuze">
          <legend className="label">{s.oordeel.label}</legend>
          <div className="keuzeknoppen">
            {s.oordeel.keuzes.map((k) => (
              <button
                key={k.waarde}
                type="button"
                className={`keuzeknop${velden.oordeel === k.waarde ? ` on on-${k.waarde}` : ''}`}
                aria-pressed={velden.oordeel === k.waarde}
                onClick={() => zet('oordeel', k.waarde)}
              >
                <Icon name={k.icoon} size={20} />
                {k.label}
              </button>
            ))}
          </div>
        </fieldset>

        {!lekken && metingen}
        {s.reparatie && (
          <fieldset className="insp-keuze">
            <legend className="label">Gerepareerd</legend>
            <div className="keuzeknoppen">
              <button type="button" className={`keuzeknop${!velden.gerepareerd ? ' on' : ''}`} aria-pressed={!velden.gerepareerd} onClick={() => zet('gerepareerd', false)}>
                Nee
              </button>
              <button
                type="button"
                className={`keuzeknop${velden.gerepareerd ? ' on on-goed' : ''}`}
                aria-pressed={velden.gerepareerd}
                onClick={() => setVelden((v) => ({ ...v, gerepareerd: true, gerepareerdOp: v.gerepareerdOp || vandaagInvoer() }))}
              >
                <Icon name="check" size={20} />
                Ja
              </button>
            </div>
            {velden.gerepareerd && (
              <div className="veld" style={{ marginTop: '10px' }}>
                <label className="label" htmlFor="bv-gerepareerd-op">Gerepareerd op</label>
                <input id="bv-gerepareerd-op" type="date" className="input" value={velden.gerepareerdOp} onChange={(e) => zet('gerepareerdOp', e.target.value)} />
              </div>
            )}
          </fieldset>
        )}

        {s.volgendePerItem && (
          <div className="veld">
            <label className="label" htmlFor="bv-volgende">Volgende inspectie</label>
            <input id="bv-volgende" type="date" className="input" value={velden.volgendeOp} onChange={(e) => zet('volgendeOp', e.target.value)} />
          </div>
        )}

        <div className="veld">
          <label className="label" htmlFor="bv-notitie">Notitie</label>
          <textarea id="bv-notitie" className="textarea" rows={2} value={velden.notitie} onChange={(e) => zet('notitie', e.target.value)} />
        </div>

        {fout && <div className="alert alert-danger" role="alert">{fout}</div>}

        {item && onWeghalen && (
          <button type="button" className="btn btn-sm btn-ghost insp-weghalen" onClick={() => onWeghalen(item)} disabled={bezig}>
            <Icon name="trash" size={16} />
            {s.item.enkel === 'lek' ? 'Lek weghalen' : 'Arbeidsmiddel weghalen'}
          </button>
        )}
      </form>
    </Modal>
  );
}
