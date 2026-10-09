'use client';

/*
  Startscherm Vandaag voor beheerder en gebruiker. Algemeen, niet per klant of
  opdracht: je werkdag bestaat uit bezoeken (oliemonsters, onderhoud,
  inspecties), elk met de klant erbij.

  Breed scherm: links de kaart Je dag (tijdlijn met geschatte aankomsttijden
  naast de routekaart, één oranje knop naar de volgende stap), rechts Aandacht
  nodig (verlopen documenten en taken, acquisitie-acties), Deze week en
  Opdrachten (hoe ver elke opdracht is).
  Telefoon: alleen de volgende stop groot (Navigeer, Aan de slag), daaronder de
  rest van de dag en dezelfde blokken.

  Alleen echte gegevens; elk blok laadt en faalt apart. Getallen: lib/vandaag.ts.
*/

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import LaadFout from '@/app/components/LaadFout';
import ChatbotKaart from '@/app/components/chatbot/ChatbotKaart';
import { AppShell, Icon, Laden } from '@/app/components/ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { magModule, moduleVan, oliemonsterPad } from '@/lib/modules';
import { PLANNING, datumAlsInvoer, minutenAlsTekst } from '@/lib/planningInstellingen';
import type { MapStreet } from '@/app/components/RouteMap';
import { actiesVoorVandaag, type ProspectRegel } from '@/lib/prospects';
import { vervalTekst, type Geldigheid } from '@/lib/eigenDossier';
import { termijnTekst, vandaagNl, type TaakStatus } from '@/lib/contracten';
import {
  begroeting,
  bouwVandaag,
  datumTitel,
  kaartenLink,
  kmTekst,
  korteDatum,
  type VandaagDag,
  type VandaagMonster,
  type VandaagObject,
  type VandaagStop,
} from '@/lib/vandaag';

const RouteMap = dynamic(() => import('@/app/components/RouteMap'), { ssr: false });

type Stand<T> = { status: 'laden' } | { status: 'fout'; melding: string } | { status: 'ok'; data: T };

async function haal<T>(url: string, fout: string): Promise<Stand<T>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { status: 'fout', melding: await foutTekst(res, fout) };
    return { status: 'ok', data: (await res.json()) as T };
  } catch {
    return { status: 'fout', melding: GEEN_VERBINDING };
  }
}

/** "Sluis Grave", "Sluis Grave en Stuw Sambeek", "A, B en C" */
function namenVan(dag: VandaagDag): string {
  const namen = dag.stops.map((s) => s.object.name);
  if (namen.length <= 1) return namen[0] ?? 'Nog geen objecten';
  return `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`;
}

interface TaakRegel {
  id: number;
  contractId: number;
  titel: string;
  soort: string;
  klant: { id: number; naam: string };
  object: { name: string };
  volgendeOp: string;
  status: TaakStatus;
}

interface DossierRegel {
  id: number;
  titel: string;
  vervaltOp: string | null;
  geldigheid: Geldigheid;
}

/** "DO" voor donderdag. */
function dagKortHoofd(nu = new Date()): string {
  return nu.toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '').slice(0, 2).toUpperCase();
}

export default function Vandaag() {
  const user = useGebruiker();
  const jaar = new Date().getFullYear();
  const magAcquisitie = magModule(moduleVan('acquisitie'), user.role);
  const magPlanning = magModule(moduleVan('planning'), user.role);
  const magDossier = magModule(moduleVan('eigen-dossier'), user.role);
  const magContracten = magModule(moduleVan('contracten'), user.role);
  const [documenten, setDocumenten] = useState<DossierRegel[]>([]);
  const [taken, setTaken] = useState<Stand<TaakRegel[]>>({ status: 'laden' });

  const [planning, setPlanning] = useState<Stand<{ dagen: VandaagDag[]; objecten: VandaagObject[] }>>({ status: 'laden' });
  const [samples, setSamples] = useState<Stand<VandaagMonster[]>>({ status: 'laden' });
  const [prospects, setProspects] = useState<Stand<ProspectRegel[]>>({ status: 'laden' });

  // Ophalen zet de state pas na de fetch; Opnieuw proberen toont eerst weer het skelet.
  const haalWerk = useCallback(async () => {
    const monstersVerzoek = haal<VandaagMonster[]>(`/api/samples?year=${jaar}`, 'De monsters konden niet worden opgehaald.');
    try {
      const p = magPlanning
        ? await haal<{ dagen: VandaagDag[]; objecten: VandaagObject[] }>(`/api/sample-plans?year=${jaar}&tePlannen=0`, 'De planning kon niet worden opgehaald.')
        : ({ status: 'ok', data: { dagen: [], objecten: [] } } as Stand<{ dagen: VandaagDag[]; objecten: VandaagObject[] }>);
      setPlanning(p);
    } finally {
      setSamples(await monstersVerzoek);
    }
  }, [jaar, magPlanning]);

  const haalActies = useCallback(async () => {
    if (!magAcquisitie) return;
    try {
      setProspects(await haal<ProspectRegel[]>('/api/prospects', 'De acties konden niet worden opgehaald.'));
    } catch {
      setProspects({ status: 'fout', melding: GEEN_VERBINDING });
    }
  }, [magAcquisitie]);

  // Eigen dossier: alleen wat aandacht vraagt. Mislukt het, dan geen blok (het
  // staat ook op de pagina Eigen dossier).
  const haalDossier = useCallback(async () => {
    if (!magDossier) return;
    const r = await haal<DossierRegel[]>('/api/eigen-dossier', '');
    if (r.status === 'ok') setDocumenten(r.data.filter((d) => d.geldigheid === 'verloopt' || d.geldigheid === 'verlopen'));
  }, [magDossier]);

  // Onderhoud: contracttaken die verlopen zijn of binnenkort moeten.
  const haalTaken = useCallback(async () => {
    if (!magContracten) return;
    setTaken(await haal<TaakRegel[]>('/api/contract-taken?aandacht=1', 'Het onderhoud kon niet worden opgehaald.'));
  }, [magContracten]);

  useEffect(() => {
    haalWerk();
    haalActies();
    haalDossier();
    haalTaken();
  }, [haalWerk, haalActies, haalDossier, haalTaken]);

  const laadWerk = () => {
    setPlanning({ status: 'laden' });
    setSamples({ status: 'laden' });
    haalWerk();
  };
  const laadActies = () => {
    setProspects({ status: 'laden' });
    haalActies();
  };

  const overzicht =
    planning.status === 'ok' && samples.status === 'ok'
      ? bouwVandaag(planning.data.dagen, samples.data, planning.data.objecten, jaar)
      : null;
  const werkFout =
    planning.status === 'fout' ? planning.melding : samples.status === 'fout' ? samples.melding : null;
  const acties = prospects.status === 'ok' ? actiesVoorVandaag(prospects.data) : null;
  // Alles mislukt (geen verbinding, server plat): één foutblok, geen koppen zonder inhoud.
  const totaleStoring = werkFout !== null && (!magAcquisitie || prospects.status === 'fout');

  // Aandacht nodig: verlopen documenten en taken, acquisitie-acties, in één lijst.
  const aandacht: AandachtRegel[] = [
    ...documenten.map((d): AandachtRegel => ({
      sleutel: `doc-${d.id}`,
      urgent: d.geldigheid === 'verlopen',
      titel: d.titel,
      tekst: vervalTekst(d.vervaltOp),
      actie: { label: 'Bekijk', href: '/dashboard/eigen-dossier' },
    })),
    ...(taken.status === 'ok' ? taken.data : []).map((t): AandachtRegel => ({
      sleutel: `taak-${t.id}`,
      urgent: t.status === 'verlopen',
      titel: t.titel,
      tekst: `${t.klant.naam}, ${termijnTekst(t.volgendeOp, vandaagNl())}`,
      actie: { label: 'Openen', href: `/dashboard/contracten/${t.contractId}` },
    })),
    ...(acties ?? []).map(({ prospect: p, reden, urgent }): AandachtRegel => ({
      sleutel: `prospect-${p.id}`,
      urgent,
      titel: p.bedrijfsnaam,
      tekst: `${p.volgendeActie || 'Bepaal de volgende stap'}, ${reden}`,
      actie: p.telefoon
        ? { label: 'Bellen', href: `tel:${p.telefoon.replace(/\s+/g, '')}`, extern: true }
        : p.email
          ? { label: 'Mailen', href: `mailto:${p.email}`, extern: true }
          : { label: 'Openen', href: `/dashboard/acquisitie?prospect=${p.id}` },
    })),
  ].sort((a, b) => Number(b.urgent) - Number(a.urgent));
  const aandachtFout = prospects.status === 'fout' ? prospects.melding : taken.status === 'fout' ? taken.melding : null;
  const week = planning.status === 'ok' ? dezeWerkweek(planning.data.dagen) : null;
  const klantVan = (objectId: number) => (planning.status === 'ok' ? planning.data.objecten.find((o) => o.id === objectId)?.klantNaam ?? null : null);

  return (
    <AppShell user={user} wide>
      {/* Kop: datumtegel (dag afgekort, dagnummer, maand) en de begroeting */}
      <div className="paginakop vandaag-kop">
        <div className="datumtegel" aria-label={datumTitel()}>
          <span className="datumtegel-dag">{dagKortHoofd()}</span>
          <span className="datumtegel-nummer">{new Date().getDate()}</span>
          <span className="datumtegel-maand">{new Date().toLocaleDateString('nl-NL', { month: 'short' }).replace('.', '')}</span>
        </div>
        <h1 className="vandaag-groet">
          {begroeting()} {user.username}
        </h1>
      </div>

      {totaleStoring ? (
        <LaadFout
          melding={werkFout}
          onOpnieuw={() => {
            laadWerk();
            laadActies();
          }}
        />
      ) : (
        <div className="vd">
          <div className="vd-hoofd">
            {werkFout ? (
              <LaadFout melding={werkFout} onOpnieuw={laadWerk} />
            ) : !overzicht ? (
              <Laden label="Je dag laden" regels={3} />
            ) : overzicht.dag && overzicht.dag.stops.length > 0 ? (
              <DagKaart dag={overzicht.dag} klantVan={klantVan} />
            ) : (
              <section className="vd-kaart vd-leeg" aria-label="Je dag">
                <Icon name="calendar" size={32} />
                <h2>Niets gepland voor vandaag</h2>
                <p>
                  {overzicht.eerstvolgende
                    ? `Het eerstvolgende werk staat op ${korteDatum(overzicht.eerstvolgende.date)}: ${namenVan(overzicht.eerstvolgende)}.`
                    : 'Er staat verder niets in de planning.'}
                </p>
                {magPlanning && (
                  <Link prefetch={false} href="/dashboard/planning" className="btn">
                    <Icon name="calendar" size={16} />
                    {user.role === 'admin' ? 'Dag plannen' : 'Naar de planning'}
                  </Link>
                )}
              </section>
            )}

            {/* ---------- Deze week ---------- */}
            {magPlanning && week && (
              <section className="vd-kaart vd-blok" aria-labelledby="kop-week">
                <div className="vd-blok-kop">
                  <h2 id="kop-week">{week.volgende ? 'Volgende week' : 'Deze week'}</h2>
                  <Link prefetch={false} href="/dashboard/planning" className="vd-link">Planning</Link>
                </div>
                <div className="vd-week">
                  {week.dagen.map((d) => {
                    const inhoud = (
                      <>
                        <span className="vd-week-dag">{d.kort}</span>
                        <span className="vd-week-vak">
                          {d.aantal > 0 ? (
                            <>
                              <strong>{d.aantal}</strong>
                              <small>{d.aantal === 1 ? 'bezoek' : 'bezoeken'}</small>
                            </>
                          ) : (
                            <small>{d.nummer}</small>
                          )}
                        </span>
                      </>
                    );
                    const klasse = `vd-week-cel${d.vandaag ? ' vd-week-vandaag' : ''}${d.aantal > 0 ? ' vd-week-gepland' : ''}`;
                    return d.dagId ? (
                      <Link prefetch={false} key={d.datum} href={`/dashboard/planning/dag/${d.dagId}`} className={klasse} aria-label={`${d.lang}, ${d.aantal} ${d.aantal === 1 ? 'bezoek' : 'bezoeken'}`}>
                        {inhoud}
                      </Link>
                    ) : (
                      <span key={d.datum} className={klasse} aria-label={`${d.lang}, niets gepland`}>{inhoud}</span>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          <div className="vd-zij">
            {/* ---------- Aandacht nodig ---------- */}
            {(aandacht.length > 0 || aandachtFout) && (
              <section className="vd-kaart vd-blok" aria-labelledby="kop-aandacht">
                <div className="vd-blok-kop">
                  <h2 id="kop-aandacht">Aandacht nodig</h2>
                  <span className="vd-teller">{aandacht.length}</span>
                </div>
                {aandachtFout && <LaadFout melding={aandachtFout} onOpnieuw={() => { laadActies(); setTaken({ status: 'laden' }); haalTaken(); }} />}
                <ul className="vd-aandacht">
                  {aandacht.slice(0, MAX_AANDACHT).map((a) => (
                    <li key={a.sleutel}>
                      <span className={`vd-stip${a.urgent ? ' vd-stip-urgent' : ''}`} aria-label={a.urgent ? 'Te laat' : 'Binnenkort'} />
                      <span className="vd-aandacht-tekst">
                        <strong>{a.titel}</strong>
                        <span>{a.tekst}</span>
                      </span>
                      {a.actie.extern ? (
                        <a href={a.actie.href} className="vd-link">{a.actie.label}</a>
                      ) : (
                        <Link prefetch={false} href={a.actie.href} className="vd-link">{a.actie.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
                {aandacht.length > MAX_AANDACHT && <p className="vd-meer">En nog {aandacht.length - MAX_AANDACHT} andere</p>}
              </section>
            )}

            {/* ---------- Opdrachten: hoe ver ---------- */}
            {overzicht && overzicht.opdrachten.length > 0 && (
              <section className="vd-kaart vd-blok" aria-labelledby="kop-opdrachten">
                <div className="vd-blok-kop">
                  <h2 id="kop-opdrachten">Opdrachten</h2>
                  <Link prefetch={false} href={oliemonsterPad(jaar)} className="vd-link">Alle</Link>
                </div>
                <div className="vd-opdrachten">
                  {overzicht.opdrachten.map((o) => {
                    const gepland = o.vandaag + o.later;
                    return (
                      <div key={o.naam} className="vd-opdracht">
                        <span className="vd-opdracht-naam">{o.naam}</span>
                        <span className="vd-opdracht-getal">
                          <strong>{o.genomen}</strong> van {o.totaal} klaar
                          {o.open > 0 && <small>, {o.open} nog in te plannen</small>}
                        </span>
                        <div className="voortgang-balk" role="img" aria-label={`${o.genomen} van ${o.totaal} klaar, ${gepland} gepland`}>
                          <i className="voortgang-genomen" style={{ width: `${(o.genomen / o.totaal) * 100}%` }} />
                          <i className="voortgang-gepland" style={{ width: `${(gepland / o.totaal) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
      {user.role === 'admin' && <ChatbotKaart />}
    </AppShell>
  );
}

interface AandachtRegel {
  sleutel: string;
  urgent: boolean;
  titel: string;
  tekst: string;
  actie: { label: string; href: string; extern?: boolean };
}

const MAX_AANDACHT = 6;

/** Maandag tot en met vrijdag van deze week; in het weekend de volgende week. */
function dezeWerkweek(dagen: VandaagDag[]) {
  const nu = new Date();
  const weekdag = nu.getDay(); // 0 = zondag
  const volgende = weekdag === 0 || weekdag === 6;
  const maandag = new Date(nu);
  maandag.setHours(12, 0, 0, 0);
  maandag.setDate(nu.getDate() - ((weekdag + 6) % 7) + (volgende ? 7 : 0));
  const vandaag = datumAlsInvoer(nu);
  return {
    volgende,
    dagen: Array.from({ length: 5 }, (_, i) => {
      const d = new Date(maandag);
      d.setDate(maandag.getDate() + i);
      const datum = datumAlsInvoer(d);
      const plan = dagen.find((x) => datumAlsInvoer(x.date) === datum);
      return {
        datum,
        kort: d.toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '').slice(0, 2).toUpperCase(),
        lang: d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }),
        nummer: d.getDate(),
        vandaag: datum === vandaag,
        dagId: plan?.id ?? null,
        aantal: plan?.stops.length ?? 0,
      };
    }),
  };
}

/** Wat er bij een bezoek gebeurt, algemeen: oliemonsters, een taak of een inspectie. */
function bezoekTekst(s: VandaagStop): string {
  if (s.soort === 'taak' && s.taak) return s.taak.titel;
  if (s.soort === 'inspectie' && s.inspectie) return s.inspectie.naam;
  return `${s.aantalMonsters} ${s.aantalMonsters === 1 ? 'oliemonster' : 'oliemonsters'}${s.aantalGenomen > 0 && !s.isDone ? `, ${s.aantalGenomen} genomen` : ''}`;
}

/** Geschatte aankomsttijden: start van de werkdag, rijtijd gelijk verdeeld over de ritten. */
function aankomstTijden(dag: VandaagDag): string[] {
  const rit = dag.rijMinuten / (dag.stops.length + 1);
  let t = PLANNING.dagStartMinuut;
  return dag.stops.map((s) => {
    t += rit;
    const aankomst = Math.round(t / 5) * 5;
    t += s.werkMinuten;
    return `${String(Math.floor(aankomst / 60) % 24).padStart(2, '0')}:${String(aankomst % 60).padStart(2, '0')}`;
  });
}

interface KaartDag {
  routeGeometry?: string | null;
  stops: { id: number; orderIndex: number; isDone: boolean; object: { name: string; lat: number | null; lng: number | null } }[];
}

/** De routekaart, alleen op een breed scherm (op de telefoon kost hij alleen data). */
function DagRoute({ dagId }: { dagId: number }) {
  const [kaart, setKaart] = useState<{ stops: MapStreet[]; route: number[][] | null } | null>(null);
  useEffect(() => {
    if (!window.matchMedia('(min-width: 900px)').matches) return;
    let actueel = true;
    fetch(`/api/sample-plans/${dagId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: KaartDag | null) => {
        if (!actueel || !d) return;
        let route: number[][] | null = null;
        try {
          route = d.routeGeometry ? JSON.parse(d.routeGeometry) : null;
        } catch {
          route = null;
        }
        setKaart({
          route,
          stops: d.stops
            .filter((s) => s.object.lat !== null && s.object.lng !== null)
            .map((s) => ({ id: s.id, street: s.object.name, lat: s.object.lat as number, lng: s.object.lng as number, isDone: s.isDone, orderIndex: s.orderIndex })),
        });
      })
      .catch(() => {});
    return () => {
      actueel = false;
    };
  }, [dagId]);
  if (!kaart || kaart.stops.length === 0) return <div className="vd-kaartvak vd-kaartvak-leeg" aria-hidden="true" />;
  return (
    <div className="vd-kaartvak">
      <RouteMap streets={kaart.stops} geometry={kaart.route} height="100%" />
    </div>
  );
}

function DagKaart({ dag, klantVan }: { dag: VandaagDag; klantVan: (objectId: number) => string | null }) {
  const tijden = aankomstTijden(dag);
  const nu = dag.stops.findIndex((s) => !s.isDone);
  const klaar = nu === -1;
  const volgende = klaar ? null : dag.stops[nu];
  const navigeer = volgende ? kaartenLink(volgende.object) : null;
  const km = kmTekst(dag.routeDistance);
  const dagHref = `/dashboard/planning/dag/${dag.id}`;
  const nogTeGaan = dag.stops.slice(nu + 1);
  const aantal = dag.stops.length;
  const meta = [`${aantal} ${aantal === 1 ? 'bezoek' : 'bezoeken'}`, minutenAlsTekst(dag.totaalMinuten), km].filter(Boolean).join(' · ');
  const hoofdknop = klaar ? 'Dag bekijken' : nu === 0 ? 'Start je dag' : `Verder met ${volgende!.object.name}`;

  return (
    <>
      {/* ---------- Breed scherm: tijdlijn naast de kaart ---------- */}
      <section className="vd-kaart vd-dag" aria-labelledby="kop-dag">
        <div className="vd-dag-inhoud">
          <div className="vd-blok-kop">
            <h2 id="kop-dag">Je dag</h2>
            <span className="vd-meta">{meta}</span>
          </div>
          {dag.notes && <p className="vd-notitie"><Icon name="comment" size={16} />{dag.notes}</p>}
          <ol className="vd-tijdlijn">
            {dag.stops.map((s, i) => {
              const status = s.isDone ? 'klaar' : i === nu ? 'nu' : 'later';
              const klant = klantVan(s.objectId);
              return (
                <li key={s.id} className={`vd-stop vd-stop-${status}`}>
                  <span className="vd-stop-tijd" title="Geschatte aankomst">{tijden[i]}</span>
                  <span className="vd-stop-lijn" aria-hidden="true"><span className="vd-stop-punt" /></span>
                  <span className="vd-stop-tekst">
                    <strong>{s.object.name}</strong>
                    <span>{[klant, bezoekTekst(s), s.isDone ? 'klaar' : i === nu ? 'volgende' : null].filter(Boolean).join(' · ')}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="vd-voetnoot">Tijden zijn een schatting vanaf {Math.floor(PLANNING.dagStartMinuut / 60)}:00.</p>
          <div className="vd-knoppen">
            <Link prefetch={false} href={dagHref} className="btn btn-primary btn-lg">
              {hoofdknop}
              <Icon name="arrow-left" size={20} className="icoon-spiegel" />
            </Link>
            {navigeer && (
              <a href={navigeer} className="btn btn-lg" target="_blank" rel="noopener">
                <Icon name="map-pin" />
                Route
              </a>
            )}
          </div>
        </div>
        <DagRoute dagId={dag.id} />
      </section>

      {/* ---------- Telefoon: alleen de volgende stop, dan de rest ---------- */}
      <section className="vd-volgende" aria-labelledby="kop-volgende">
        <div className="vd-volgende-kop">
          <span>{klaar ? 'ALLES KLAAR' : `VOLGENDE · ${nu + 1} VAN ${aantal}`}</span>
          {!klaar && <span className="vd-volgende-tijd">{tijden[nu]}</span>}
        </div>
        <h2 id="kop-volgende">{klaar ? 'Je dag zit erop' : volgende!.object.name}</h2>
        <p>{klaar ? meta : [klantVan(volgende!.objectId), bezoekTekst(volgende!)].filter(Boolean).join(' · ')}</p>
        <div className="vd-volgende-knoppen">
          {navigeer && (
            <a href={navigeer} className="vd-volgende-knop" target="_blank" rel="noopener">
              <Icon name="map-pin" size={20} />
              Navigeer
            </a>
          )}
          <Link prefetch={false} href={dagHref} className="btn btn-primary vd-volgende-hoofd">
            {klaar ? 'Dag bekijken' : 'Aan de slag'}
          </Link>
        </div>
      </section>
      {nogTeGaan.length > 0 && (
        <section className="vd-rest" aria-labelledby="kop-rest">
          <h2 id="kop-rest" className="vd-rest-kop">Rest van de dag</h2>
          <ul className="vd-kaart vd-rest-lijst">
            {nogTeGaan.map((s) => {
              const i = dag.stops.indexOf(s);
              return (
                <li key={s.id}>
                  <Link prefetch={false} href={dagHref} className="vd-rest-regel">
                    <span className="vd-rest-nummer">{i + 1}</span>
                    <span className="vd-stop-tekst">
                      <strong>{s.object.name}</strong>
                      <span>{[klantVan(s.objectId), bezoekTekst(s)].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="vd-stop-tijd">{tijden[i]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
