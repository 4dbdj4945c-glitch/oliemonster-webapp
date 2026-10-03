'use client';

/*
  Een bevinding toevoegen of bewerken: een lek, een arbeidsmiddel of een
  locatie. Gemaakt voor de telefoon met één hand en handschoenen aan
  (.veldwerk: velden en knoppen van 56px). Keuzes zoals prioriteit, uitslag en
  de checklist zijn grote knoppen naast elkaar, geen keuzelijst. Wat er per
  sjabloon in staat, komt uit lib/inspecties/sjablonen.ts.

  Foto's (BevindingFotos): zoveel als nodig, meerdere tegelijk te kiezen uit de
  camera of de fotobibliotheek, elk met een bijschrift. Bij Opslaan gaan ze
  verkleind één voor één naar de server, met voortgang. Lukt er een niet, dan
  blijft die in het venster staan (de rest is opgeslagen) en probeert Opslaan
  het opnieuw, zonder iets dubbel te maken (eigen sleutel per foto). Valt de
  verbinding weg tijdens de foto's, dan gaan de rest naar de offline wachtrij.
  Sluiten met nieuwe foto's die nog niet verstuurd zijn, vraagt eerst.

  Bij een nieuwe bevinding kan Opslaan en nog een: het venster blijft open en
  het labelnummer telt door.

  Een NIEUWE bevinding zonder verbinding (of als de verbinding wegvalt tijdens
  het versturen) gaat met de verkleinde foto's in de offline wachtrij
  (lib/wachtrij.ts). Per bevinding een eigen sleutel, zodat de server hem maar
  één keer aanmaakt. Een bestaande bevinding wijzigen kan alleen met bereik.
*/

import { useRef, useState } from 'react';
import { Icon, Modal } from '@/app/components/ui';
import BevindingFotos, { type NieuweFoto } from './BevindingFotos';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { verkleinFoto } from '@/lib/fotoVerkleinen';
import { IDEMPOTENTIE_HEADER, inWachtrij, isNetwerkFout, nieuweSleutel } from '@/lib/wachtrij';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import {
  CHECKLIST_ANTWOORDEN,
  checklistVan,
  getal,
  leesGetal,
  luchtketelWaarschuwing,
  oordeelFout,
  sjabloonVan,
  type ChecklistAntwoord,
} from '@/lib/inspecties/sjablonen';
import { berekenLek, co2Tekst, euro } from '@/lib/inspecties/rekenen';
import type { Bevinding, Inspectie, InspectieFoto, InstallatieKort } from './types';
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

/** Labelnummers tellen alleen door bij lekken; anders begint het veld leeg. */
function beginVelden(inspectie: Inspectie, item: Bevinding | null): Velden {
  const s = sjabloonVan(inspectie.sjabloon);
  const meet: Record<string, string> = {};
  for (const v of s.meetwaarden) {
    const n = item ? getal(item.waarden, v.sleutel) : null;
    meet[v.sleutel] = n === null ? '' : String(n).replace('.', ',');
  }
  return {
    titel: item?.titel ?? (inspectie.sjabloon === 'persluchtlekken' ? volgendLabel(inspectie.items) : ''),
    locatie: item?.locatie ?? '',
    oordeel: item?.oordeel ?? s.oordeel.standaard ?? '',
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
  onBewaard,
  onFotoWeg,
}: {
  inspectie: Inspectie;
  /** null = nieuwe bevinding */
  item: Bevinding | null;
  /** De installaties van de klant, om een arbeidsmiddel uit te kiezen */
  installaties: InstallatieKort[];
  onClose: () => void;
  /** Na opslaan: de inspectie zoals de server hem teruggeeft. */
  onOpgeslagen: (nieuw: Inspectie, sluiten: boolean) => void;
  /** Geeft de foutmelding terug als weghalen mislukt (die komt dan in het venster). */
  onWeghalen?: (item: Bevinding) => Promise<string | null>;
  /** Zonder bereik in de wachtrij gezet: de melding voor het scherm. */
  onBewaard?: (melding: string, sluiten: boolean) => void;
  /** Een foto is weggehaald (zacht): de pagina toont Ongedaan maken. */
  onFotoWeg?: (foto: InspectieFoto, nr: number) => void;
}) {
  const gebruiker = useGebruiker();
  const sleutel = useRef(nieuweSleutel());
  const s = sjabloonVan(inspectie.sjabloon);
  const [velden, setVelden] = useState<Velden>(() => beginVelden(inspectie, item));
  const [nieuweFotos, setNieuweFotos] = useState<NieuweFoto[]>([]);
  const [bijschriften, setBijschriften] = useState<Record<number, string>>({});
  const [voortgang, setVoortgang] = useState('');
  // Een nieuwe bevinding die al is aangemaakt terwijl een foto mislukte: opnieuw opslaan werkt hem bij.
  const [aangemaaktId, setAangemaaktId] = useState<number | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [veldFouten, setVeldFouten] = useState<Record<string, string>>({});
  const zet = <K extends keyof Velden>(k: K, w: Velden[K]) => setVelden((v) => ({ ...v, [k]: w }));
  const lekken = inspectie.sjabloon === 'persluchtlekken';
  const huidigId = item?.id ?? aangemaaktId;
  // De bevinding zoals hij nu op de server staat (na een foto erbij of eraf).
  const actueel = huidigId ? inspectie.items.find((i) => i.id === huidigId) ?? item : null;
  const bestaandeFotos: InspectieFoto[] = actueel?.fotos ?? [];

  /**
   * Foto's één voor één verkleinen en versturen. Geeft de laatste inspectie terug,
   * wat mislukte, en wat nog niet verstuurd is omdat de verbinding wegviel.
   */
  const stuurFotos = async (itemId: number): Promise<{ laatste: Inspectie | null; mislukt: NieuweFoto[]; geenBereik: NieuweFoto[] }> => {
    let laatste: Inspectie | null = null;
    const mislukt: NieuweFoto[] = [];
    const lijst = nieuweFotos;
    for (const [n, f] of lijst.entries()) {
      setVoortgang(lijst.length > 1 ? `Foto ${n + 1} van ${lijst.length} versturen...` : 'Foto versturen...');
      try {
        const form = new FormData();
        form.append('photo', await verkleinFoto(f.bestand));
        if (f.bijschrift.trim()) form.append('bijschrift', f.bijschrift.trim());
        const res = await fetch(`/api/inspectie-items/${itemId}/fotos`, { method: 'POST', headers: { [IDEMPOTENTIE_HEADER]: f.sleutel }, body: form });
        if (res.ok) laatste = await res.json();
        else mislukt.push({ ...f, fout: await foutTekst(res, 'Niet opgeslagen.') });
      } catch (e) {
        if (isNetwerkFout(e)) {
          setVoortgang('');
          return { laatste, mislukt, geenBereik: lijst.slice(n) };
        }
        mislukt.push({ ...f, fout: GEEN_VERBINDING });
      }
    }
    setVoortgang('');
    return { laatste, mislukt, geenBereik: [] };
  };

  /** Foto's voor een bevinding die al op de server staat, op de telefoon bewaren tot er bereik is. */
  const fotosInWachtrij = async (itemId: number, fotos: NieuweFoto[]) => {
    const bestanden = [];
    for (const f of fotos) {
      const klein = await verkleinFoto(f.bestand);
      bestanden.push({ veld: 'photo', naam: klein.name, blob: klein, sleutel: f.sleutel, ...(f.bijschrift.trim() ? { bijschrift: f.bijschrift.trim() } : {}) });
    }
    await inWachtrij({
      sleutel: nieuweSleutel(),
      soort: 'inspectie-item',
      gebruiker: gebruiker.username,
      titel: `${bestanden.length} ${bestanden.length === 1 ? 'foto' : "foto's"} bij ${velden.titel || s.item.enkel}, ${inspectie.nummer}`,
      inspectieId: inspectie.id,
      itemId,
      fotos: bestanden,
    });
  };

  /** Sluiten met nieuwe foto's die nog niet verstuurd zijn: eerst vragen. */
  const sluit = () => {
    if (nieuweFotos.length > 0 && !window.confirm(`${nieuweFotos.length === 1 ? 'Er staat 1 nieuwe foto' : `Er staan ${nieuweFotos.length} nieuwe foto's`} die nog niet is opgeslagen. Toch sluiten? Dan ${nieuweFotos.length === 1 ? 'gaat hij' : 'gaan ze'} verloren.`)) return;
    onClose();
  };

  /** Gewijzigde bijschriften van foto's die er al staan. */
  const stuurBijschriften = async (): Promise<{ laatste: Inspectie | null; fout: string }> => {
    let laatste: Inspectie | null = null;
    for (const f of bestaandeFotos) {
      const nieuw = bijschriften[f.id];
      if (nieuw === undefined || nieuw.trim() === (f.bijschrift ?? '')) continue;
      const res = await fetch(`/api/inspectie-fotos/${f.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bijschrift: nieuw }),
      });
      if (!res.ok) return { laatste, fout: await foutTekst(res, 'Een bijschrift is niet opgeslagen.') };
      laatste = await res.json();
    }
    return { laatste, fout: '' };
  };

  // Zacht weghalen, zonder vraag: de pagina toont meteen Ongedaan maken.
  const fotoWeghalen = async (foto: InspectieFoto, nr: number) => {
    setFout('');
    try {
      const res = await fetch(`/api/inspectie-fotos/${foto.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De foto is niet weggehaald.'));
        return;
      }
      onOpgeslagen(await res.json(), false);
      onFotoWeg?.(foto, nr);
    } catch {
      setFout(GEEN_VERBINDING);
    }
  };

  // Live: wat kost dit lek, en is dit een ketel voor een aangewezen instelling?
  const lpm = leesGetal(velden.meet.verliesLpm ?? '');
  const lek = lekken && inspectie.totalen.soort === 'persluchtlekken' && lpm !== null && Number.isFinite(lpm) ? berekenLek(lpm, inspectie.totalen.instellingen) : null;
  const waarschuwing = !lekken
    ? luchtketelWaarschuwing({ ketelLiter: leesGetal(velden.meet.ketelLiter ?? ''), ketelBar: leesGetal(velden.meet.ketelBar ?? '') })
    : null;

  const opslaan = async (sluiten: boolean) => {
    setFout('');
    setVeldFouten({});
    // In orde pas als de hele checklist is beantwoord (ook offline, vóór de wachtrij).
    const oordeelMelding = oordeelFout(s, velden.oordeel || null, { checklist: velden.checklist });
    if (oordeelMelding) {
      setVeldFouten({ oordeel: oordeelMelding });
      setFout(oordeelMelding);
      return;
    }
    setBezig(true);
    const body = {
      titel: velden.titel,
      locatie: velden.locatie,
      oordeel: velden.oordeel || null,
      notitie: velden.notitie,
      waarden: { ...velden.meet, ...(s.checklist.length ? { checklist: velden.checklist } : {}) },
      ...(s.reparatie ? { gerepareerd: velden.gerepareerd, gerepareerdOp: velden.gerepareerd ? velden.gerepareerdOp || null : null } : {}),
      ...(s.volgendePerItem ? { volgendeOp: velden.volgendeOp || null } : {}),
      ...(s.item.kiesInstallatie ? { installatieId: velden.installatieId || null } : {}),
    };
    // Een nieuwe bevinding zonder bereik: bewaren op de telefoon, met de verkleinde foto's.
    const bewaar = async () => {
      const fotos = [];
      for (const f of nieuweFotos) {
        const klein = await verkleinFoto(f.bestand);
        fotos.push({ veld: 'photo', naam: klein.name, blob: klein, ...(f.bijschrift.trim() ? { bijschrift: f.bijschrift.trim() } : {}) });
      }
      await inWachtrij({
        sleutel: sleutel.current,
        soort: 'inspectie-item',
        gebruiker: gebruiker.username,
        titel: `${s.item.enkel.charAt(0).toUpperCase()}${s.item.enkel.slice(1)} ${velden.titel || 'zonder nummer'}, ${inspectie.nummer}`,
        inspectieId: inspectie.id,
        json: body,
        fotos,
      });
      sleutel.current = nieuweSleutel();
      onBewaard?.(`${velden.titel || 'De bevinding'} is op deze telefoon bewaard en gaat vanzelf mee zodra er bereik is.`, sluiten);
      if (!sluiten) {
        setVelden(beginVelden(inspectie, null));
        setNieuweFotos([]);
      }
    };
    if (!huidigId && typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        await bewaar();
      } catch {
        setFout('Geen verbinding, en bewaren op deze telefoon lukte ook niet. Probeer het zo opnieuw.');
      } finally {
        setBezig(false);
      }
      return;
    }
    try {
      const res = await fetch(huidigId ? `/api/inspectie-items/${huidigId}` : `/api/inspecties/${inspectie.id}/items`, {
        method: huidigId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(huidigId ? {} : { [IDEMPOTENTIE_HEADER]: sleutel.current }) },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.clone().json().catch(() => null);
        if (data?.velden) setVeldFouten(data.velden);
        setFout(await foutTekst(res, 'De bevinding is niet opgeslagen.'));
        return;
      }
      const data = await res.json();
      let nieuw: Inspectie = huidigId ? data : data.inspectie;
      const itemId: number = huidigId ?? data.itemId;
      if (!huidigId) sleutel.current = nieuweSleutel();
      const b = await stuurBijschriften();
      if (b.laatste) nieuw = b.laatste;
      if (b.fout) {
        onOpgeslagen(nieuw, false);
        setFout(`${b.fout} De rest is wel opgeslagen.`);
        return;
      }
      setBijschriften({});
      if (nieuweFotos.length > 0) {
        const totaal = nieuweFotos.length;
        const { laatste, mislukt, geenBereik } = await stuurFotos(itemId);
        if (laatste) nieuw = laatste;
        if (geenBereik.length > 0) {
          // Verbinding weg tijdens de foto's: de rest gaat naar de wachtrij en komt vanzelf mee.
          try {
            await fotosInWachtrij(itemId, [...mislukt, ...geenBereik]);
          } catch {
            if (!item) setAangemaaktId(itemId);
            setNieuweFotos([...mislukt, ...geenBereik]);
            onOpgeslagen(nieuw, false);
            setFout(`${GEEN_VERBINDING} De foto's staan hieronder nog; tik op Opslaan zodra er bereik is.`);
            return;
          }
          const n = mislukt.length + geenBereik.length;
          setNieuweFotos([]);
          onOpgeslagen(nieuw, false);
          onBewaard?.(`${velden.titel || 'De bevinding'} is opgeslagen. ${n === 1 ? '1 foto staat' : `${n} foto's staan`} op deze telefoon en ${n === 1 ? 'gaat' : 'gaan'} vanzelf mee zodra er bereik is.`, sluiten);
          if (!sluiten) {
            setVelden(beginVelden(nieuw, null));
            setAangemaaktId(null);
          }
          return;
        }
        if (mislukt.length > 0) {
          // De bevinding staat er, net als de foto's die wel lukten. Het venster blijft open.
          if (!item) setAangemaaktId(itemId);
          setNieuweFotos(mislukt);
          onOpgeslagen(nieuw, false);
          setFout(
            `${mislukt.length === totaal ? (totaal === 1 ? 'De foto is' : "De foto's zijn") : `${mislukt.length} van ${totaal} foto's zijn`} niet opgeslagen: ${[...new Set(mislukt.map((f) => f.fout))].join(' ')} ` +
              `${mislukt.length === 1 ? 'Hij staat' : 'Ze staan'} hieronder nog; tik op Opslaan om het opnieuw te proberen. De rest is wel opgeslagen.`
          );
          return;
        }
      }
      onOpgeslagen(nieuw, sluiten);
      if (!sluiten) {
        setVelden(beginVelden(nieuw, null));
        setNieuweFotos([]);
        setAangemaaktId(null);
      } else {
        setNieuweFotos([]);
      }
    } catch (e) {
      // Verbinding weg tijdens het versturen van een nieuwe bevinding: met dezelfde
      // sleutel in de wachtrij. Kwam hij toch aan, dan maakt de server hem niet twee keer.
      if (!huidigId && isNetwerkFout(e)) {
        try {
          await bewaar();
        } catch {
          setFout(GEEN_VERBINDING);
        }
      } else {
        setFout(GEEN_VERBINDING);
      }
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
        <BevindingFotos
          bestaande={bestaandeFotos}
          bijschriften={bijschriften}
          onBijschrift={(id, tekst) => setBijschriften((b) => ({ ...b, [id]: tekst }))}
          onWeghalen={fotoWeghalen}
          nieuwe={nieuweFotos}
          onNieuwe={setNieuweFotos}
          voortgang={voortgang}
          uitgeschakeld={bezig}
        />

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

  const titel = item ? `${lekken ? `Lek ${item.titel}` : item.titel}` : aangemaaktId ? velden.titel || s.item.nieuw : s.item.nieuw;

  return (
    <Modal
      open
      onClose={sluit}
      size="md"
      title={titel}
      footer={
        <>
          <button type="button" className={`btn veldwerk-knop${item ? '' : ' insp-annuleer'}`} onClick={sluit}>Annuleren</button>
          {!huidigId && (
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
            <input
              id="bv-locatie"
              className="input"
              value={velden.locatie}
              onChange={(e) => zet('locatie', e.target.value)}
              placeholder={lekken ? 'Bijv. Hal 1, werkbank 3' : inspectie.sjabloon === 'markering' ? 'Bijv. Kast in technische ruimte' : 'Bijv. Hal 2'}
            />
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
          <div className={`keuzeknoppen${s.oordeel.keuzes.length > 3 ? ' keuzeknoppen-vier' : s.oordeel.keuzes.some((k) => k.label.length > 12) ? ' keuzeknoppen-lang' : ''}`}>
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
          {veldFouten.oordeel ? (
            <p className="veld-fout">{veldFouten.oordeel}</p>
          ) : (
            s.oordeel.standaard === null &&
            !velden.oordeel && (
              <p className="hint">
                {s.checklist.length > 0
                  ? 'Nog geen uitslag. In orde kan als alle controlepunten zijn beantwoord; sla je dit arbeidsmiddel over, kies dan Niet gecontroleerd.'
                  : `Nog geen ${s.oordeel.label.toLowerCase()}. Afronden kan pas als elke ${s.item.enkel} er een heeft.`}
              </p>
            )
          )}
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
          <button type="button" className="btn btn-sm btn-ghost insp-weghalen" onClick={async () => { setFout(''); const m = await onWeghalen(item); if (m) setFout(m); }} disabled={bezig}>
            <Icon name="trash" size={16} />
            {`${s.item.enkel.charAt(0).toUpperCase()}${s.item.enkel.slice(1)} weghalen`}
          </button>
        )}
      </form>
    </Modal>
  );
}
