'use client';

/*
  Een werkbon invullen en afronden (/dashboard/dagrapporten/[id]; in de code nog
  dagrapport), in de vorm van het veldscherm (STIJL.md, Veldscherm): op de
  telefoon een eigen navy kop, velden van 52 tot 56 px en onderaan in
  duimbereik de enige oranje knop.

  Concept: opdracht (soort werk, referentie, plek, contactpersoon), tijd (uren,
  begin en eind, of n.v.t.), wat je deed, bevindingen, materialen, vervolg en
  foto's. Afronden kan op twee manieren: de klant tekent met de vinger op het
  scherm (HandtekeningVeld), of zonder handtekening als de klant daar niet om
  vraagt (standaard per klant, per werkbon te veranderen). Afronden slaat eerst
  de velden op. Daarna ligt de werkbon vast: alleen lezen, PDF downloaden, en
  onder Beheer heropenen of de handtekening wissen, of verwijderen. Een
  gebruiker ziet alles alleen.
*/

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { AppShell, Icon, Laden } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import GeenVerbinding from '@/app/components/GeenVerbinding';
import FotoKiezer from '@/app/components/FotoKiezer';
import PhotoModal, { type FotoInVenster } from '@/app/components/PhotoModal';
import OngedaanMelding, { type OngedaanInhoud } from '@/app/components/OngedaanMelding';
import VeiligVerwijderBlok from '@/app/components/VeiligVerwijderBlok';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { verkleinFoto } from '@/lib/fotoVerkleinen';
import { dagKort } from '@/lib/contracten';
import { ROLE_ADMIN } from '@/lib/roles';
import { SOORTEN_WERK, aantalTekst, duurTekst, minutenUitTijden, soortWerkLabel, werktijdTekst, type Tijdsoort } from '@/lib/werkbon';
import HandtekeningVeld, { type HandtekeningVeldRef } from './HandtekeningVeld';
import VeldOffline from '@/app/components/wachtrij/VeldOffline';
import { urenVeld, type Dagrapport } from './types';

interface MateriaalRegel {
  sleutel: number;
  omschrijving: string;
  aantal: string;
  eenheid: string;
  artikelnummer: string;
}

interface Velden {
  datum: string;
  objectId: string;
  uitvoerder: string;
  soortWerk: string;
  referentie: string;
  contactpersoon: string;
  tijdsoort: Tijdsoort;
  uren: string;
  beginTijd: string;
  eindTijd: string;
  pauzeMinuten: string;
  reisMinuten: string;
  kilometers: string;
  werkzaamheden: string;
  bevindingen: string;
  materialen: MateriaalRegel[];
  vervolgNodig: boolean;
  vervolgActie: string;
  handtekeningVragen: boolean;
}

let volgendeSleutel = 1;
const legeRegel = (): MateriaalRegel => ({ sleutel: volgendeSleutel++, omschrijving: '', aantal: '', eenheid: '', artikelnummer: '' });

const getal = (n: number | null) => (n === null ? '' : String(n));

function beginVelden(d: Dagrapport): Velden {
  return {
    datum: d.datum,
    objectId: d.object ? String(d.object.id) : '',
    uitvoerder: d.uitvoerder,
    soortWerk: d.soortWerk ?? '',
    referentie: d.referentie ?? '',
    contactpersoon: d.contactpersoon ?? '',
    tijdsoort: d.tijdsoort,
    uren: urenVeld(d.minuten),
    beginTijd: d.beginTijd ?? '',
    eindTijd: d.eindTijd ?? '',
    pauzeMinuten: getal(d.pauzeMinuten),
    reisMinuten: getal(d.reisMinuten),
    kilometers: getal(d.kilometers),
    werkzaamheden: d.werkzaamheden ?? '',
    bevindingen: d.bevindingen ?? '',
    materialen: d.materialen.map((m) => ({
      sleutel: volgendeSleutel++,
      omschrijving: m.omschrijving,
      aantal: m.aantal === null ? '' : m.aantal.toLocaleString('nl-NL'),
      eenheid: m.eenheid ?? '',
      artikelnummer: m.artikelnummer ?? '',
    })),
    vervolgNodig: d.vervolgNodig,
    vervolgActie: d.vervolgActie ?? '',
    handtekeningVragen: d.handtekeningVragen,
  };
}

/** Wat naar de server gaat: lege materiaalregels vallen weg. */
function alsInvoer(v: Velden) {
  return {
    datum: v.datum,
    objectId: v.objectId || null,
    uitvoerder: v.uitvoerder,
    soortWerk: v.soortWerk || null,
    referentie: v.referentie,
    contactpersoon: v.contactpersoon,
    tijdsoort: v.tijdsoort,
    ...(v.tijdsoort === 'uren' ? { uren: v.uren } : {}),
    beginTijd: v.beginTijd,
    eindTijd: v.eindTijd,
    pauzeMinuten: v.pauzeMinuten,
    reisMinuten: v.reisMinuten,
    kilometers: v.kilometers,
    werkzaamheden: v.werkzaamheden,
    bevindingen: v.bevindingen,
    materialen: v.materialen
      .filter((m) => m.omschrijving.trim() || m.aantal.trim() || m.artikelnummer.trim())
      .map(({ omschrijving, aantal, eenheid, artikelnummer }) => ({ omschrijving, aantal, eenheid, artikelnummer })),
    vervolgNodig: v.vervolgNodig,
    vervolgActie: v.vervolgActie,
    handtekeningVragen: v.handtekeningVragen,
  };
}

const TIJD_KEUZES: { waarde: Tijdsoort; label: string; icoon: 'clock' | 'calendar' | 'close' }[] = [
  { waarde: 'uren', label: 'Uren', icoon: 'clock' },
  { waarde: 'tijden', label: 'Begin en eind', icoon: 'calendar' },
  { waarde: 'nvt', label: 'N.v.t.', icoon: 'close' },
];

export default function Dagrapportscherm({ dagrapportId }: { dagrapportId: number }) {
  const user = useGebruiker();
  const isAdmin = user.role === ROLE_ADMIN;
  const [rapport, setRapport] = useState<Dagrapport | null>(null);
  const [velden, setVelden] = useState<Velden | null>(null);
  const [gewijzigd, setGewijzigd] = useState(false);
  const [objecten, setObjecten] = useState<{ id: number; name: string; klantId: number | null }[]>([]);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [veldFouten, setVeldFouten] = useState<Record<string, string>>({});
  const [bezig, setBezig] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [bijschrift, setBijschrift] = useState('');
  const [naam, setNaam] = useState('');
  const [tekeningLeeg, setTekeningLeeg] = useState(true);
  const [groot, setGroot] = useState<{ fotos: FotoInVenster[]; start: number } | null>(null);
  const [ongedaan, setOngedaan] = useState<OngedaanInhoud | null>(null);
  const [verwijderd, setVerwijderd] = useState(false);
  const tekening = useRef<HandtekeningVeldRef>(null);

  const zetRapport = (d: Dagrapport) => {
    setRapport(d);
    setVelden(beginVelden(d));
    setGewijzigd(false);
  };

  const laad = useCallback(async () => {
    try {
      const res = await fetch(`/api/dagrapporten/${dagrapportId}`);
      if (!res.ok) {
        setFout(await foutTekst(res, 'De werkbon kon niet worden opgehaald.'));
        return;
      }
      const d: Dagrapport = await res.json();
      setRapport(d);
      setVelden(beginVelden(d));
      setGewijzigd(false);
      setFout('');
    } catch {
      setFout(GEEN_VERBINDING);
    }
  }, [dagrapportId]);

  useEffect(() => {
    laad();
  }, [laad]);

  useEffect(() => {
    if (!isAdmin) return;
    let actueel = true;
    fetch('/api/sample-objects')
      .then((r) => (r.ok ? r.json() : []))
      .then((o) => { if (actueel) setObjecten(o); })
      .catch(() => {});
    return () => { actueel = false; };
  }, [isAdmin]);

  const wijzig = (deel: Partial<Velden>) => {
    setVelden((v) => (v ? { ...v, ...deel } : v));
    setGewijzigd(true);
    setMelding('');
  };

  const zet = (k: keyof Velden) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    wijzig({ [k]: e.target.value } as Partial<Velden>);

  const zetMateriaal = (sleutel: number, deel: Partial<MateriaalRegel>) => {
    setVelden((v) => (v ? { ...v, materialen: v.materialen.map((m) => (m.sleutel === sleutel ? { ...m, ...deel } : m)) } : v));
    setGewijzigd(true);
  };

  /** Slaat de velden op; geeft de werkbon terug, of null bij een fout (die staat dan in beeld). */
  const opslaan = async (stil = false): Promise<Dagrapport | null> => {
    if (!rapport || !velden) return null;
    setVeldFouten({});
    setFout('');
    try {
      const res = await fetch(`/api/dagrapporten/${rapport.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alsInvoer(velden)),
      });
      if (!res.ok) {
        const data = await res.clone().json().catch(() => null);
        if (data?.velden) setVeldFouten(data.velden);
        setFout(await foutTekst(res, 'De werkbon is niet opgeslagen.'));
        return null;
      }
      const d: Dagrapport = await res.json();
      zetRapport(d);
      if (!stil) setMelding('Opgeslagen.');
      return d;
    } catch {
      setFout(GEEN_VERBINDING);
      return null;
    }
  };

  const fotoToevoegen = async () => {
    if (!rapport || !foto) return;
    setBezig(true);
    setFout('');
    try {
      const form = new FormData();
      form.append('photo', await verkleinFoto(foto));
      if (bijschrift.trim()) form.append('bijschrift', bijschrift.trim());
      const res = await fetch(`/api/dagrapporten/${rapport.id}/fotos`, { method: 'POST', body: form });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De foto is niet opgeslagen.'));
        return;
      }
      const d: Dagrapport = await res.json();
      setRapport(d);
      setFoto(null);
      setBijschrift('');
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  const fotoWeg = async (fotoId: number) => {
    if (!rapport || !confirm('Deze foto uit de werkbon halen? Dat kan niet ongedaan worden gemaakt.')) return;
    try {
      const res = await fetch(`/api/dagrapport-fotos/${fotoId}`, { method: 'DELETE' });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De foto is niet weggehaald.'));
        return;
      }
      setRapport(await res.json());
    } catch {
      setFout(GEEN_VERBINDING);
    }
  };

  /** Afronden: met handtekening (tekenen) of zonder. Slaat eerst op wat nog niet opgeslagen is. */
  const afronden = async () => {
    if (!rapport || !velden) return;
    const metHandtekening = velden.handtekeningVragen;
    let body: string | undefined;
    if (metHandtekening) {
      const png = tekening.current?.alsPng();
      if (!png) {
        setFout('Laat de klant eerst tekenen.');
        return;
      }
      if (!naam.trim()) {
        setVeldFouten({ naam: 'Vul de naam in van wie tekent' });
        return;
      }
      body = JSON.stringify({ naam: naam.trim(), handtekening: png });
    }
    setBezig(true);
    try {
      // Eerst wat er nog niet opgeslagen is, anders tekent de klant voor iets anders.
      if (gewijzigd && !(await opslaan(true))) return;
      const res = await fetch(`/api/dagrapporten/${rapport.id}/${metHandtekening ? 'handtekening' : 'afronden'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) {
        const data = await res.clone().json().catch(() => null);
        if (data?.velden) setVeldFouten(data.velden);
        setFout(await foutTekst(res, metHandtekening ? 'De handtekening is niet opgeslagen.' : 'De werkbon is niet afgerond.'));
        return;
      }
      zetRapport(await res.json());
      setMelding(`${metHandtekening ? 'Getekend' : 'Afgerond'}. De werkbon ligt vast en staat in het klantdossier en het klantportaal.`);
      window.scrollTo({ top: 0 });
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  /** Weer een concept maken: handtekening wissen (getekend) of heropenen (afgerond). */
  const heropenen = async () => {
    if (!rapport) return;
    const getekend = rapport.status === 'getekend';
    const vraag = getekend
      ? 'Handtekening wissen? De werkbon wordt weer een concept en de klant moet opnieuw tekenen. De oude handtekening staat in het logboek.'
      : 'Werkbon heropenen? Hij wordt weer een concept en verdwijnt uit het klantportaal tot je hem opnieuw afrondt.';
    if (!confirm(vraag)) return;
    try {
      const res = await fetch(`/api/dagrapporten/${rapport.id}/${getekend ? 'handtekening' : 'afronden'}`, { method: 'DELETE' });
      if (!res.ok) {
        setFout(await foutTekst(res, getekend ? 'De handtekening is niet gewist.' : 'De werkbon is niet heropend.'));
        return;
      }
      zetRapport(await res.json());
      setNaam('');
      setMelding(getekend ? 'De handtekening is gewist. Je kunt de werkbon weer aanpassen.' : 'De werkbon is heropend. Je kunt hem weer aanpassen.');
    } catch {
      setFout(GEEN_VERBINDING);
    }
  };

  const verwijder = async (getypt: string): Promise<string | null> => {
    if (!rapport) return null;
    try {
      const res = await fetch(`/api/dagrapporten/${rapport.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bevestig: getypt }),
      });
      if (!res.ok) return foutTekst(res, 'De werkbon is niet verwijderd.');
      setVerwijderd(true);
      setOngedaan({
        sleutel: `dagrapport-${rapport.id}`,
        tekst: `${rapport.nummer} verwijderd`,
        onOngedaan: async () => {
          const r = await fetch(`/api/dagrapporten/${rapport.id}/herstellen`, { method: 'POST' });
          if (!r.ok) return false;
          zetRapport(await r.json());
          setVerwijderd(false);
          return true;
        },
      });
      return null;
    } catch {
      return GEEN_VERBINDING;
    }
  };

  const terugHref = rapport?.planId ? `/dashboard/planning/dag/${rapport.planId}` : '/dashboard/dagrapporten';
  const concept = rapport?.status === 'concept';
  const bewerkbaar = isAdmin && concept;
  const klantObjecten = objecten.filter((o) => o.klantId === rapport?.klant.id);
  const fout1 = (k: string) => veldFouten[k] && <p className="veld-fout">{veldFouten[k]}</p>;
  const invoerKlasse = (k: string) => `input${veldFouten[k] ? ' input-fout' : ''}`;
  const berekend = velden && velden.tijdsoort === 'tijden' ? minutenUitTijden(velden.beginTijd, velden.eindTijd, velden.pauzeMinuten ? Number(velden.pauzeMinuten) : null) : null;
  const metHandtekening = velden?.handtekeningVragen ?? true;
  const klaarOmAfTeRonden = metHandtekening ? !tekeningLeeg && !!naam.trim() : !!velden?.werkzaamheden.trim();

  const kop = (
    <header className="veld-kop">
      <Link prefetch={false} href={terugHref} className="veld-terug" aria-label={rapport?.planId ? 'Terug naar de dag' : 'Terug naar de werkbonnen'}>
        <Icon name="arrow-left" size={24} />
      </Link>
      <div className="veld-kop-tekst">
        <h1>Werkbon</h1>
        <p>{rapport ? `${rapport.klant.naam}, ${dagKort(rapport.datum)}, ${rapport.nummer}` : ''}</p>
      </div>
    </header>
  );

  const statusLabel = !rapport
    ? ''
    : rapport.status === 'getekend'
      ? `Getekend door ${rapport.getekendDoor}`
      : rapport.status === 'afgerond'
        ? 'Afgerond zonder handtekening'
        : 'Concept, nog niet afgerond';

  return (
    <AppShell title="Werkbon" wide veld user={user}>
      <VeldOffline api={`/api/dagrapporten/${dagrapportId}`} />
      <div className="veld">
        {kop}
        <GeenVerbinding tekst="Wat je invult, blijft staan. Opslaan en afronden lukt pas weer als je bereik hebt." />

        {verwijderd ? (
          <div className="leeg">
            <Icon name="trash" size={32} />
            <p style={{ margin: '0 0 12px' }}>Deze werkbon is verwijderd.</p>
            <Link prefetch={false} href="/dashboard/dagrapporten" className="btn btn-sm">
              <Icon name="arrow-left" size={16} />
              Naar de werkbonnen
            </Link>
          </div>
        ) : !rapport || !velden ? (
          fout ? <LaadFout melding={fout} onOpnieuw={laad} /> : <Laden label="Werkbon laden" regels={3} />
        ) : (
          <div className="veld-indeling dr-indeling">
            <div className="veld-kolom">
              {fout && <div className="alert alert-danger" role="alert">{fout}</div>}
              {melding && <div className="alert alert-success" role="status">{melding}</div>}

              {bewerkbaar ? (
                <>
                  {/* ---------- Opdracht ---------- */}
                  <section className="veld-kaart" aria-labelledby="dr-opdracht-kop">
                    <span className="veld-kaart-label">
                      <Icon name="module-dagrapport" size={16} />
                      {statusLabel}
                    </span>
                    <h2 id="dr-opdracht-kop" className="dr-sectie">Opdracht</h2>
                    <div className="veldwerk">
                      <div className="dr-twee">
                        <div className="veld">
                          <label className="label" htmlFor="dr-soort">Soort werk</label>
                          <select id="dr-soort" className="select" value={velden.soortWerk} onChange={zet('soortWerk')}>
                            <option value="">Kies...</option>
                            {SOORTEN_WERK.map((s) => (
                              <option key={s.waarde} value={s.waarde}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="veld">
                          <label className="label" htmlFor="dr-datum">Datum</label>
                          <input id="dr-datum" type="date" className={invoerKlasse('datum')} value={velden.datum} onChange={zet('datum')} />
                          {fout1('datum')}
                        </div>
                      </div>
                      <div className="veld">
                        <label className="label" htmlFor="dr-referentie">Werkorder- of ordernummer klant <span className="label-bij">(mag leeg)</span></label>
                        <input id="dr-referentie" className={invoerKlasse('referentie')} value={velden.referentie} onChange={zet('referentie')} placeholder="Bijv. WO-2026-0412 of PO 45001234" autoComplete="off" />
                        {fout1('referentie')}
                      </div>
                      <div className="veld">
                        <label className="label" htmlFor="dr-plek">Plek</label>
                        <select id="dr-plek" className="select" value={velden.objectId} onChange={zet('objectId')}>
                          <option value="">Geen vaste plek</option>
                          {klantObjecten.map((o) => (
                            <option key={o.id} value={String(o.id)}>{o.name}</option>
                          ))}
                          {rapport.object && !klantObjecten.some((o) => o.id === rapport.object!.id) && (
                            <option value={String(rapport.object.id)}>{rapport.object.name}</option>
                          )}
                        </select>
                      </div>
                      <div className="dr-twee">
                        <div className="veld">
                          <label className="label" htmlFor="dr-contact">Contactpersoon klant <span className="label-bij">(mag leeg)</span></label>
                          <input id="dr-contact" className={invoerKlasse('contactpersoon')} value={velden.contactpersoon} onChange={zet('contactpersoon')} placeholder="Wie was er namens de klant" />
                          {fout1('contactpersoon')}
                        </div>
                        <div className="veld">
                          <label className="label" htmlFor="dr-uitvoerder">Uitgevoerd door</label>
                          <input id="dr-uitvoerder" className={invoerKlasse('uitvoerder')} value={velden.uitvoerder} onChange={zet('uitvoerder')} />
                          {fout1('uitvoerder')}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* ---------- Tijd ---------- */}
                  <section className="card dr-blok" aria-labelledby="dr-tijd-kop">
                    <h2 id="dr-tijd-kop" className="dr-sectie">Tijd</h2>
                    <div className="veldwerk">
                      <div className="keuzeknoppen keuzeknoppen-klein" role="group" aria-label="Hoe leg je de tijd vast">
                        {TIJD_KEUZES.map((k) => (
                          <button key={k.waarde} type="button" className={`keuzeknop${velden.tijdsoort === k.waarde ? ' on' : ''}`} aria-pressed={velden.tijdsoort === k.waarde} onClick={() => wijzig({ tijdsoort: k.waarde })}>
                            <Icon name={k.icoon} size={16} />
                            {k.label}
                          </button>
                        ))}
                      </div>
                      {velden.tijdsoort === 'uren' && (
                        <div className="veld">
                          <label className="label" htmlFor="dr-uren">Gewerkte uren</label>
                          <input id="dr-uren" className={invoerKlasse('uren')} inputMode="decimal" value={velden.uren} onChange={zet('uren')} placeholder="2,5" />
                          {fout1('uren')}
                        </div>
                      )}
                      {velden.tijdsoort === 'tijden' && (
                        <>
                          <div className="dr-drie">
                            <div className="veld">
                              <label className="label" htmlFor="dr-begin">Begin</label>
                              <input id="dr-begin" type="time" className={invoerKlasse('beginTijd')} value={velden.beginTijd} onChange={zet('beginTijd')} />
                              {fout1('beginTijd')}
                            </div>
                            <div className="veld">
                              <label className="label" htmlFor="dr-eind">Eind</label>
                              <input id="dr-eind" type="time" className={invoerKlasse('eindTijd')} value={velden.eindTijd} onChange={zet('eindTijd')} />
                              {fout1('eindTijd')}
                            </div>
                            <div className="veld">
                              <label className="label" htmlFor="dr-pauze">Pauze (min)</label>
                              <input id="dr-pauze" className={invoerKlasse('pauzeMinuten')} inputMode="numeric" value={velden.pauzeMinuten} onChange={zet('pauzeMinuten')} placeholder="30" />
                              {fout1('pauzeMinuten')}
                            </div>
                          </div>
                          <p className="dr-totaal">
                            <Icon name="clock" size={16} />
                            {berekend !== null ? `Gewerkt: ${duurTekst(berekend)}` : 'Vul begin en eind in, dan rekent de werkbon de uren uit.'}
                          </p>
                        </>
                      )}
                      {velden.tijdsoort === 'nvt' && <p className="dr-uitleg">Geen urenafspraak bij dit werk. Op de werkbon staat bij tijd n.v.t.</p>}
                      <div className="dr-twee">
                        <div className="veld">
                          <label className="label" htmlFor="dr-reis">Reistijd (min) <span className="label-bij">(mag leeg)</span></label>
                          <input id="dr-reis" className={invoerKlasse('reisMinuten')} inputMode="numeric" value={velden.reisMinuten} onChange={zet('reisMinuten')} placeholder="45" />
                          {fout1('reisMinuten')}
                        </div>
                        <div className="veld">
                          <label className="label" htmlFor="dr-km">Kilometers <span className="label-bij">(mag leeg)</span></label>
                          <input id="dr-km" className={invoerKlasse('kilometers')} inputMode="numeric" value={velden.kilometers} onChange={zet('kilometers')} placeholder="62" />
                          {fout1('kilometers')}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* ---------- Werk ---------- */}
                  <section className="card dr-blok" aria-labelledby="dr-werk-kop">
                    <h2 id="dr-werk-kop" className="dr-sectie">Werkzaamheden</h2>
                    <div className="veldwerk">
                      <div className="veld">
                        <label className="label" htmlFor="dr-werk">Wat heb je gedaan</label>
                        <textarea id="dr-werk" className={`textarea${veldFouten.werkzaamheden ? ' input-fout' : ''}`} rows={5} value={velden.werkzaamheden} onChange={zet('werkzaamheden')} placeholder="Bijv. hydraulische slangen hefdeur vervangen, systeem ontlucht en op druk gecontroleerd" />
                        {fout1('werkzaamheden')}
                      </div>
                      <div className="veld">
                        <label className="label" htmlFor="dr-bevindingen">Bevindingen</label>
                        <textarea id="dr-bevindingen" className="textarea" rows={3} value={velden.bevindingen} onChange={zet('bevindingen')} placeholder="Wat je zag, staat van de installatie" />
                      </div>
                    </div>
                  </section>

                  {/* ---------- Materialen ---------- */}
                  <section className="card dr-blok" aria-labelledby="dr-mat-kop">
                    <h2 id="dr-mat-kop" className="dr-sectie">Materialen en onderdelen</h2>
                    {velden.materialen.length === 0 ? (
                      <p className="dr-uitleg">Geen materialen gebruikt. Voeg een regel toe voor elk onderdeel dat je plaatste of verbruikte.</p>
                    ) : (
                      <ul className="dr-materialen">
                        {velden.materialen.map((m, i) => (
                          <li key={m.sleutel} className="dr-materiaal">
                            <div className="veld dr-mat-omschrijving">
                              <label className="label" htmlFor={`dr-mat-${m.sleutel}`}>Omschrijving</label>
                              <input id={`dr-mat-${m.sleutel}`} className="input" value={m.omschrijving} onChange={(e) => zetMateriaal(m.sleutel, { omschrijving: e.target.value })} placeholder="Bijv. hydraulische slang 1/2 inch" />
                            </div>
                            <div className="veld">
                              <label className="label" htmlFor={`dr-mat-aantal-${m.sleutel}`}>Aantal</label>
                              <input id={`dr-mat-aantal-${m.sleutel}`} className="input" inputMode="decimal" value={m.aantal} onChange={(e) => zetMateriaal(m.sleutel, { aantal: e.target.value })} placeholder="1" />
                            </div>
                            <div className="veld">
                              <label className="label" htmlFor={`dr-mat-eenheid-${m.sleutel}`}>Eenheid</label>
                              <input id={`dr-mat-eenheid-${m.sleutel}`} className="input" value={m.eenheid} onChange={(e) => zetMateriaal(m.sleutel, { eenheid: e.target.value })} placeholder="st" list="dr-eenheden" />
                            </div>
                            <div className="veld">
                              <label className="label" htmlFor={`dr-mat-art-${m.sleutel}`}>Artikelnr. <span className="label-bij">(mag leeg)</span></label>
                              <input id={`dr-mat-art-${m.sleutel}`} className="input" value={m.artikelnummer} onChange={(e) => zetMateriaal(m.sleutel, { artikelnummer: e.target.value })} />
                            </div>
                            <button
                              type="button"
                              className="icon-btn icon-btn-verwijder dr-mat-weg"
                              onClick={() => wijzig({ materialen: velden.materialen.filter((x) => x.sleutel !== m.sleutel) })}
                              aria-label={`Regel ${i + 1} weghalen`}
                              title="Regel weghalen"
                            >
                              <Icon name="close" size={16} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <datalist id="dr-eenheden">
                      {['st', 'm', 'l', 'kg', 'set', 'doos'].map((e) => <option key={e} value={e} />)}
                    </datalist>
                    <button type="button" className="btn btn-sm" onClick={() => wijzig({ materialen: [...velden.materialen, legeRegel()] })}>
                      <Icon name="plus" size={16} />
                      Materiaal toevoegen
                    </button>
                    {fout1('materialen')}
                  </section>

                  {/* ---------- Vervolg ---------- */}
                  <section className="card dr-blok" aria-labelledby="dr-vervolg-kop">
                    <h2 id="dr-vervolg-kop" className="dr-sectie">Vervolg</h2>
                    <div className="veldwerk">
                      <label className="keuze">
                        <input type="checkbox" checked={velden.vervolgNodig} onChange={(e) => wijzig({ vervolgNodig: e.target.checked })} />
                        <span>
                          <strong>Er is vervolgwerk nodig</strong>
                          <small>Het werk is nog niet helemaal klaar, of je raadt de klant iets aan.</small>
                        </span>
                      </label>
                      {(velden.vervolgNodig || velden.vervolgActie) && (
                        <div className="veld">
                          <label className="label" htmlFor="dr-vervolg">Wat moet er nog gebeuren</label>
                          <textarea id="dr-vervolg" className="textarea" rows={3} value={velden.vervolgActie} onChange={zet('vervolgActie')} placeholder="Bijv. verdeelblok hal 2 vervangen, onderdeel besteld, terugkomen in week 42" />
                        </div>
                      )}
                    </div>
                  </section>

                  <button type="button" className="btn btn-block" onClick={() => opslaan()} disabled={!gewijzigd || bezig}>
                    <Icon name="check" size={16} />
                    {gewijzigd ? 'Opslaan' : 'Opgeslagen'}
                  </button>
                </>
              ) : (
                <section className={`veld-kaart${concept ? '' : ' veld-kaart-klaar'}`} aria-label="De werkbon">
                  <span className="veld-kaart-label">
                    <Icon name={rapport.status === 'getekend' ? 'signature' : rapport.status === 'afgerond' ? 'check' : 'module-dagrapport'} size={16} />
                    {statusLabel}
                  </span>
                  <dl className="veld-gegevens">
                    <dt>Klant</dt>
                    <dd>{rapport.klant.naam}</dd>
                    <dt>Plek</dt>
                    <dd>{rapport.object?.name ?? 'Geen vaste plek'}</dd>
                    <dt>Datum</dt>
                    <dd>{dagKort(rapport.datum)}</dd>
                    {rapport.soortWerk && (<><dt>Soort werk</dt><dd>{soortWerkLabel(rapport.soortWerk)}</dd></>)}
                    {rapport.referentie && (<><dt>Werkorder</dt><dd>{rapport.referentie}</dd></>)}
                    {rapport.contactpersoon && (<><dt>Contact</dt><dd>{rapport.contactpersoon}</dd></>)}
                    <dt>Tijd</dt>
                    <dd>{werktijdTekst(rapport)}</dd>
                    {(rapport.reisMinuten !== null || rapport.kilometers !== null) && (
                      <>
                        <dt>Reis</dt>
                        <dd>{[rapport.reisMinuten !== null ? duurTekst(rapport.reisMinuten) : null, rapport.kilometers !== null ? `${rapport.kilometers} km` : null].filter(Boolean).join(', ')}</dd>
                      </>
                    )}
                    <dt>Door</dt>
                    <dd>{rapport.uitvoerder}</dd>
                  </dl>
                  <h2 className="dr-kop">Wat er gedaan is</h2>
                  <p className="dr-tekst">{rapport.werkzaamheden || 'Niet ingevuld.'}</p>
                  <h2 className="dr-kop">Bevindingen</h2>
                  <p className="dr-tekst">{rapport.bevindingen || 'Geen bijzonderheden.'}</p>
                  {rapport.materialen.length > 0 && (
                    <>
                      <h2 className="dr-kop">Materialen en onderdelen</h2>
                      <ul className="dr-mat-lijst">
                        {rapport.materialen.map((m, i) => (
                          <li key={i}>
                            <span>{m.omschrijving}{m.artikelnummer && <small> {m.artikelnummer}</small>}</span>
                            <strong>{aantalTekst(m)}</strong>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {(rapport.vervolgNodig || rapport.vervolgActie) && (
                    <>
                      <h2 className="dr-kop">Vervolg</h2>
                      <p className="dr-tekst">{rapport.vervolgActie || 'Er is vervolgwerk nodig.'}</p>
                    </>
                  )}
                </section>
              )}

              {/* ---------- Foto's ---------- */}
              <section className="veld-sectie" aria-labelledby="dr-fotos-kop">
                <div className="sectiekop">
                  <h2 id="dr-fotos-kop">Foto&apos;s</h2>
                  <small>{rapport.fotos.length === 0 ? 'nog geen' : rapport.fotos.length}</small>
                </div>
                {rapport.fotos.length > 0 && (
                  <ul className="dr-fotos">
                    {rapport.fotos.map((f, i) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          className="dr-foto"
                          onClick={() => setGroot({ fotos: rapport.fotos.map((x) => ({ url: x.url, label: x.bijschrift ?? 'Foto' })), start: i })}
                          aria-label={`${f.bijschrift ?? 'Foto'} groot bekijken`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.url} alt="" loading="lazy" />
                        </button>
                        <span className="dr-foto-onder">
                          <span>{f.bijschrift ?? ''}</span>
                          {bewerkbaar && (
                            <button type="button" className="icon-btn icon-btn-verwijder" onClick={() => fotoWeg(f.id)} aria-label="Foto weghalen" title="Foto weghalen">
                              <Icon name="trash" size={16} />
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {bewerkbaar && (
                  <div className="veldwerk dr-foto-nieuw">
                    <FotoKiezer label="Foto toevoegen" bestand={foto} onKies={setFoto} uitgeschakeld={bezig} />
                    {foto && (
                      <>
                        <div className="veld">
                          <label className="label" htmlFor="dr-bijschrift">Bijschrift <span className="label-bij">(mag leeg)</span></label>
                          <input id="dr-bijschrift" className="input" value={bijschrift} onChange={(e) => setBijschrift(e.target.value)} placeholder="Bijv. nieuwe slang hefdeur" />
                        </div>
                        <button type="button" className="btn btn-block" onClick={fotoToevoegen} disabled={bezig}>
                          <Icon name="image-upload" size={16} />
                          {bezig ? 'Bezig...' : 'Foto opslaan'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </section>
            </div>

            <div className="veld-kolom">
              {/* ---------- Afronden ---------- */}
              <section className="card dr-teken" aria-labelledby="dr-teken-kop">
                <h2 id="dr-teken-kop" className="dr-kop">
                  <Icon name={rapport.status === 'afgerond' || (concept && !metHandtekening) ? 'check' : 'signature'} size={20} />
                  {rapport.status === 'getekend' ? 'Akkoord van de klant' : rapport.status === 'afgerond' ? 'Afgerond' : 'Afronden'}
                </h2>
                {rapport.status === 'getekend' ? (
                  <>
                    {rapport.handtekening && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="dr-handtekening" src={rapport.handtekening} alt={`Handtekening van ${rapport.getekendDoor}`} />
                    )}
                    <p className="dr-getekend">
                      <strong>{rapport.getekendDoor}</strong>
                      <span>
                        Getekend op{' '}
                        {rapport.getekendOp &&
                          new Date(rapport.getekendOp).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </p>
                  </>
                ) : rapport.status === 'afgerond' ? (
                  <p className="dr-uitleg">
                    Afgerond zonder handtekening van de klant
                    {rapport.afgerondOp &&
                      ` op ${new Date(rapport.afgerondOp).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                    .
                  </p>
                ) : bewerkbaar ? (
                  <div className="veldwerk">
                    <label className="keuze">
                      <input type="checkbox" checked={velden.handtekeningVragen} onChange={(e) => wijzig({ handtekeningVragen: e.target.checked })} />
                      <span>
                        <strong>Handtekening van de klant vragen</strong>
                        <small>Uit als de klant geen handtekening nodig heeft; je rondt de werkbon dan zelf af.</small>
                      </span>
                    </label>
                    {velden.handtekeningVragen ? (
                      <>
                        <p className="dr-uitleg">Geef de telefoon aan de klant. Met de handtekening bevestigt de klant dat het werk is gedaan zoals hierboven staat.</p>
                        <div className="veld">
                          <label className="label" htmlFor="dr-naam">Naam van wie tekent</label>
                          <input
                            id="dr-naam"
                            className={`input${veldFouten.naam ? ' input-fout' : ''}`}
                            value={naam}
                            onChange={(e) => setNaam(e.target.value)}
                            autoComplete="off"
                            placeholder={velden.contactpersoon || 'Voor- en achternaam'}
                          />
                          {fout1('naam')}
                        </div>
                        <HandtekeningVeld ref={tekening} uitgeschakeld={bezig} onVerander={setTekeningLeeg} />
                      </>
                    ) : (
                      <p className="dr-uitleg">De werkbon wordt afgerond zonder handtekening. Hij komt daarna in het klantdossier en het klantportaal.</p>
                    )}
                  </div>
                ) : (
                  <p className="dr-uitleg">Nog niet afgerond.</p>
                )}
              </section>

              {isAdmin && (
                <details className="veld-beheer">
                  <summary>Beheer</summary>
                  {!concept && (
                    <section className="gevarenzone">
                      <p className="gevarenzone-kop">
                        <Icon name="reset" size={16} />
                        {rapport.status === 'getekend' ? 'Handtekening wissen' : 'Heropenen'}
                      </p>
                      <p className="gevarenzone-tekst">
                        {rapport.status === 'getekend'
                          ? 'Nodig als er nog iets moet veranderen. De werkbon wordt weer een concept en de klant tekent opnieuw.'
                          : 'Nodig als er nog iets moet veranderen. De werkbon wordt weer een concept tot je hem opnieuw afrondt.'}
                      </p>
                      <button type="button" className="btn btn-sm btn-danger-soft" onClick={heropenen}>
                        <Icon name="reset" size={16} />
                        {rapport.status === 'getekend' ? 'Handtekening wissen' : 'Heropenen'}
                      </button>
                    </section>
                  )}
                  <VeiligVerwijderBlok
                    id={`dagrapport-${rapport.id}`}
                    kop="Werkbon verwijderen"
                    uitleg={<>Haalt {rapport.nummer} uit het klantdossier en het klantportaal, met de foto&apos;s en de handtekening. Direct daarna kun je het ongedaan maken.</>}
                    bevestig={rapport.nummer}
                    knop="Werkbon verwijderen"
                    onVerwijder={verwijder}
                  />
                </details>
              )}
            </div>
          </div>
        )}

        {/* ---------- De hoofdactie, onderaan in duimbereik ---------- */}
        {rapport && !verwijderd && (bewerkbaar || !concept) && (
          <div className="veld-actiebalk">
            {concept ? (
              <button type="button" className="btn btn-primary veld-hoofdknop" onClick={afronden} disabled={bezig || !klaarOmAfTeRonden}>
                <Icon name={metHandtekening ? 'signature' : 'check'} size={24} />
                {bezig ? 'Bezig...' : metHandtekening ? 'Tekenen en afronden' : 'Werkbon afronden'}
              </button>
            ) : (
              <a className="btn btn-primary veld-hoofdknop" href={rapport.pdf} download>
                <Icon name="file-pdf" size={24} />
                PDF downloaden
              </a>
            )}
            <p>
              {concept
                ? klaarOmAfTeRonden
                  ? 'Slaat alles op en legt de werkbon vast'
                  : metHandtekening
                    ? 'Eerst de naam en de handtekening van de klant'
                    : 'Eerst invullen wat je gedaan hebt'
                : 'Ook te vinden in het klantdossier en het klantportaal'}
            </p>
          </div>
        )}
      </div>

      {groot && <PhotoModal fotos={groot.fotos} startIndex={groot.start} sampleNumber={rapport?.nummer ?? ''} onClose={() => setGroot(null)} />}
      <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />
    </AppShell>
  );
}
