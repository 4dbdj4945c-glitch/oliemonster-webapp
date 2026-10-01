'use client';

/*
  Het dagscherm van een monsterdag: het veldscherm (zie ontwerp-veld en STIJL.md,
  "Veldscherm"). Gemaakt voor de telefoon, met handschoenen aan, in de zon:

  - bovenaan een eigen navy kop met terug naar de planning en waar je bent
  - een melding als er geen verbinding is
  - de voortgang van de dag
  - één grote kaart: het monster dat nu aan de beurt is
  - grote knoppen (60 px) voor Niet bereikbaar, Navigeer, Object klaar en GPS
  - de andere monsters op deze stop en de stops van de rest van de dag
  - onderaan, in duimbereik, de enige oranje knop: Monster nemen

  Op desktop staan de kaart en de route er rechts naast. De GPS start de tijd op
  een object vanzelf zodra je binnen 70 meter komt; afvinken doe je zelf.
  Een gebruiker (alleen kijken) ziet de dag, maar geen knoppen die iets wijzigen.
*/

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import GeenVerbinding from '@/app/components/GeenVerbinding';
import LaadFout from '@/app/components/LaadFout';
import MonsterNemenModal, { type NeemDoel } from '@/app/components/MonsterNemenModal';
import OnbereikbaarModal, { type OnbereikbaarDoel } from '@/app/components/OnbereikbaarModal';
import { AppShell, Icon, Laden } from '@/app/components/ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { objectTypeIcoon } from '@/lib/sampleObjects';
import { datumAlsInvoer, datumAlsTekst, minutenAlsTekst } from '@/lib/planningInstellingen';
import { magModule, moduleVan } from '@/lib/modules';
import { STANDAARD_UITVOERDER, type DagrapportInLijst } from '@/app/components/dagrapport/types';
import WachtrijOverzicht from '@/app/components/wachtrij/WachtrijOverzicht';
import { useWachtrij } from '@/app/components/wachtrij/useWachtrij';
import VeldOffline from '@/app/components/wachtrij/VeldOffline';
import { kaartenLink, korteDatum } from '@/lib/vandaag';
import type { MapStreet } from '@/app/components/RouteMap';
import type { OilSample } from '@/app/components/oliemonsters/types';
import { isMonsterStop, stopNaam, type PlanDag, type PlanMonster, type PlanStop } from './types';
import { dagKort, intervalTekst, taakSoortInfo } from '@/lib/contracten';
import { sjabloonVan } from '@/lib/inspecties/sjablonen';
import type { IconNaam } from '@/app/components/ui';

const RouteMap = dynamic(() => import('@/app/components/RouteMap'), {
  ssr: false,
  loading: () => <div className="laden plan-kaart-laden">Kaart laden...</div>,
});

// Afstand (meter) waarbinnen GPS je op een object plaatst.
const GPS_STRAAL = 70;

function afstandMeter(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Het icoon van een stop: het objecttype, of de soort taak of inspectie. */
function stopIcoon(stop: PlanStop): IconNaam {
  if (stop.soort === 'taak' && stop.taak) return taakSoortInfo(stop.taak.soort).icoon;
  if (stop.soort === 'inspectie' && stop.inspectie) return sjabloonVan(stop.inspectie.sjabloon).icoon;
  return objectTypeIcoon(stop.object.objectType);
}

function monsters(aantal: number): string {
  return `${aantal} ${aantal === 1 ? 'monster' : 'monsters'}`;
}

/**
 * Het monster dat op deze stop nu aan de beurt is: eerst een open monster dat
 * bereikbaar is. Een monster dat al in de wachtrij staat (genomen zonder bereik)
 * is niet meer aan de beurt.
 */
function volgendMonster(stop: PlanStop | null, wachtend: Set<number>): PlanMonster | null {
  if (!stop) return null;
  const open = stop.samples.filter((m) => !m.isTaken && !wachtend.has(m.id));
  return open.find((m) => !m.isUnreachable) ?? open[0] ?? null;
}

function StatusBadge({ m, wacht }: { m: PlanMonster; wacht?: boolean }) {
  if (wacht && !m.isTaken) {
    return (
      <span className="badge badge-info">
        <Icon name="verzenden" size={16} />
        Wacht op verzending
      </span>
    );
  }
  if (m.isTaken) {
    return (
      <span className="badge badge-success">
        <Icon name="status-taken" size={16} />
        Genomen
      </span>
    );
  }
  if (m.isUnreachable) {
    return (
      <span className="badge badge-warning">
        <Icon name="alert-warning" size={16} />
        Niet bereikbaar
      </span>
    );
  }
  return (
    <span className="badge badge-danger">
      <Icon name="status-not-taken" size={16} />
      Niet genomen
    </span>
  );
}

export default function Dagscherm({ dagId }: { dagId: number }) {
  const user = useGebruiker();
  const router = useRouter();
  const isAdmin = user.role === 'admin';

  const [dag, setDag] = useState<PlanDag | null>(null);
  const [laden, setLaden] = useState(true);
  const [foutmelding, setFoutmelding] = useState('');
  const [melding, setMelding] = useState('');
  // Zelf gekozen stop en monster; zonder keuze de eerste stop die nog niet klaar is.
  const [gekozenStop, setGekozenStop] = useState<number | null>(null);
  const [gekozenMonster, setGekozenMonster] = useState<number | null>(null);
  const [neemDoel, setNeemDoel] = useState<NeemDoel | null>(null);
  const [onbereikbaarDoel, setOnbereikbaarDoel] = useState<OnbereikbaarDoel | null>(null);
  const magDagrapport = magModule(moduleVan('dagrapporten'), user.role);
  const [dagrapporten, setDagrapporten] = useState<DagrapportInLijst[]>([]);
  const [rapportBezig, setRapportBezig] = useState(false);
  // Offline wachtrij: wat hier zonder bereik genomen is, telt als genomen tot het verstuurd is.
  const wachtrij = useWachtrij(isAdmin ? user.username : '');
  const wachtend = new Set(wachtrij.filter((i) => i.soort === 'monster-nemen' && i.monsterId).map((i) => i.monsterId as number));
  const aantalInWachtrij = wachtrij.length;
  const vorigAantal = useRef(aantalInWachtrij);

  const [gpsAan, setGpsAan] = useState(false);
  const [positie, setPositie] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsFout, setGpsFout] = useState('');
  const watchId = useRef<number | null>(null);
  const dagRef = useRef<PlanDag | null>(null);
  // Welke stops de GPS al gestart heeft; watchPosition komt elke seconde terug.
  const gestart = useRef<Set<number>>(new Set());

  useEffect(() => {
    dagRef.current = dag;
  }, [dag]);

  const laadDag = useCallback(async () => {
    try {
      const res = await fetch(`/api/sample-plans/${dagId}`);
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'Deze dag kon niet worden opgehaald.'));
        return;
      }
      setDag(await res.json());
      setFoutmelding('');
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    } finally {
      setLaden(false);
    }
  }, [dagId]);

  useEffect(() => {
    laadDag();
  }, [laadDag]);

  // Is er iets uit de wachtrij verstuurd, dan de dag opnieuw ophalen, en de
  // melding "op deze telefoon bewaard" klopt dan niet meer.
  useEffect(() => {
    if (aantalInWachtrij < vorigAantal.current) {
      setMelding((m) => (m.includes('op deze telefoon bewaard') ? '' : m));
      if (navigator.onLine) laadDag();
    }
    vorigAantal.current = aantalInWachtrij;
  }, [aantalInWachtrij, laadDag]);

  // De dagrapporten van deze dag. Mislukt het (geen verbinding), dan geen lijst.
  useEffect(() => {
    if (!magDagrapport) return;
    let actueel = true;
    fetch(`/api/dagrapporten?planId=${dagId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: DagrapportInLijst[]) => { if (actueel) setDagrapporten(d); })
      .catch(() => {});
    return () => { actueel = false; };
  }, [dagId, magDagrapport]);

  // Een dagrapport voor de klant van de stop: de dag, de plek en de gemeten tijd
  // van zijn stops op deze dag staan er al in.
  const maakDagrapport = async (s: PlanStop) => {
    if (!dag || !s.object.klantId) return;
    setRapportBezig(true);
    try {
      const gemeten = dag.stops
        .filter((x) => x.object.klantId === s.object.klantId && x.werkelijkeMinuten !== null)
        .reduce((n, x) => n + (x.werkelijkeMinuten ?? 0), 0);
      const res = await fetch('/api/dagrapporten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          klantId: s.object.klantId,
          planId: dag.id,
          objectId: s.objectId,
          datum: datumAlsInvoer(dag.date),
          uitvoerder: STANDAARD_UITVOERDER,
          uren: gemeten > 0 ? Math.round((gemeten / 60) * 100) / 100 : null,
        }),
      });
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'Het dagrapport is niet aangemaakt.'));
        return;
      }
      const nieuw = await res.json();
      router.push(`/dashboard/dagrapporten/${nieuw.id}`);
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    } finally {
      setRapportBezig(false);
    }
  };

  const stopActie = useCallback(
    async (stop: PlanStop, body: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/sample-plans/${dagId}/stops/${stop.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          setFoutmelding(`${stopNaam(stop)} is niet bijgewerkt: ${await foutTekst(res, 'de server gaf geen reden.')}`);
          return;
        }
        // Een contracttaak afgevinkt: de volgende datum staat erin.
        const uitkomst = await res.json().catch(() => null);
        if (stop.soort === 'taak' && body.isDone === true && uitkomst?.volgendeOp) {
          setMelding(`${stopNaam(stop)} is klaar. De volgende keer staat op ${dagKort(uitkomst.volgendeOp)}.`);
        } else if (stop.soort === 'taak' && body.isDone === false) {
          setMelding(
            uitkomst?.taakTerug === false
              ? `${stopNaam(stop)} staat weer open, maar de volgende datum bleef staan: er is intussen een latere uitvoering vastgelegd. Kijk het na bij Contracten.`
              : `${stopNaam(stop)} staat weer open; de volgende datum is teruggezet.`
          );
        }
        setFoutmelding('');
        // De dag zoals hij nu is staat in het antwoord; anders opnieuw ophalen.
        if (uitkomst?.dag) setDag(uitkomst.dag);
        else await laadDag();
      } catch {
        setFoutmelding(`${stopNaam(stop)} is niet opgeslagen: geen verbinding met de server.`);
      }
    },
    [dagId, laadDag]
  );

  const stopGps = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setGpsAan(false);
  }, []);

  const startGps = () => {
    setGpsFout('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsFout('Deze telefoon of browser ondersteunt geen locatie.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setPositie({ lat: latitude, lng: longitude });
        const huidig = dagRef.current;
        if (!huidig || !isAdmin) return;
        for (const stop of huidig.stops) {
          if (stop.isDone || stop.startedAt || gestart.current.has(stop.id)) continue;
          if (stop.object.lat === null || stop.object.lng === null) continue;
          if (afstandMeter(latitude, longitude, stop.object.lat, stop.object.lng) <= GPS_STRAAL) {
            gestart.current.add(stop.id);
            stopActie(stop, { actie: 'start' });
          }
        }
      },
      (err) => {
        setGpsFout(err.code === 1 ? 'Locatietoegang geweigerd.' : 'Locatie niet beschikbaar.');
        stopGps();
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    watchId.current = id;
    setGpsAan(true);
  };

  useEffect(() => () => stopGps(), [stopGps]);

  const verwijderDag = async (d: PlanDag) => {
    const gemeten = d.stops.filter((st) => st.startedAt || st.endedAt || st.isDone).length;
    const tekst =
      `Dag ${datumAlsTekst(d.date)} verwijderen?\n\n` +
      (d.stops.length > 0
        ? `Daarmee gaan ${d.stops.length} ${d.stops.length === 1 ? 'object' : 'objecten'} van deze dag weg, met hun volgorde en de route` +
          (gemeten > 0 ? `, en de afgevinkte bezoeken en gemeten tijden (${gemeten})` : '') +
          '. Dat komt niet terug.\n\n'
        : '') +
      'De monsters zelf blijven bestaan en staan daarna weer bij de ongeplande objecten.';
    if (!confirm(tekst)) return;
    try {
      const res = await fetch(`/api/sample-plans/${d.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'De dag kon niet worden verwijderd.'));
        return;
      }
      router.push(`/dashboard/planning?jaar=${d.analysisYear}`);
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    }
  };

  const naVeldwerk = async (tekst: string, bijgewerkt?: OilSample | null) => {
    setNeemDoel(null);
    setOnbereikbaarDoel(null);
    setGekozenMonster(null);
    setMelding(tekst);
    // Monster nemen geeft het monster terug: alleen dat monster bijwerken in
    // plaats van de hele dag opnieuw op te halen.
    if (bijgewerkt && dag) {
      const naarPlan = (m: PlanMonster): PlanMonster =>
        m.id !== bijgewerkt.id
          ? m
          : {
              ...m,
              isTaken: bijgewerkt.isTaken,
              sampleDate: bijgewerkt.sampleDate,
              oilType: bijgewerkt.oilType ?? null,
              remarks: bijgewerkt.remarks ?? null,
              photoUrl: bijgewerkt.photoUrl ?? null,
              partPhotoUrl: bijgewerkt.partPhotoUrl ?? null,
              isUnreachable: bijgewerkt.isUnreachable ?? false,
              unreachableReason: bijgewerkt.unreachableReason ?? null,
            };
      setDag({
        ...dag,
        stops: dag.stops.map((s) => {
          const samples = s.samples.map(naarPlan);
          return { ...s, samples, aantalGenomen: samples.filter((m) => m.isTaken).length };
        }),
      });
      return;
    }
    // Zonder bereik lukt ophalen toch niet; de wachtrij toont wat er klaarstaat.
    if (navigator.onLine) await laadDag();
  };

  const terugHref = dag ? `/dashboard/planning?jaar=${dag.analysisYear}` : '/dashboard/planning';

  /* ---------- Afgeleide waarden ---------- */

  const stops = dag?.stops ?? [];
  const volgendeStop = stops.find((s) => !s.isDone) ?? null;
  const stop = stops.find((s) => s.id === gekozenStop) ?? volgendeStop ?? stops[stops.length - 1] ?? null;
  const stopNummer = stop ? stops.indexOf(stop) + 1 : 0;
  const monster =
    (stop && stop.samples.find((m) => m.id === gekozenMonster && !m.isTaken && !wachtend.has(m.id))) ?? volgendMonster(stop, wachtend);
  const totaal = stops.reduce((n, s) => n + s.aantalMonsters, 0);
  const genomen = stops.reduce((n, s) => n + s.aantalGenomen, 0);
  const nogTeVersturen = stops.reduce((n, s) => n + s.samples.filter((m) => !m.isTaken && wachtend.has(m.id)).length, 0);
  const bezoeken = stops.filter((s) => !isMonsterStop(s));
  // Het veldscherm van een andere dag zegt niet Vandaag, maar de datum.
  const isVandaag = !!dag && datumAlsInvoer(dag.date) === datumAlsInvoer(new Date());
  const dagWoord = dag ? (isVandaag ? 'vandaag' : korteDatum(dag.date)) : 'vandaag';
  const bezoekStop = stop && !isMonsterStop(stop) ? stop : null;
  const loopt = !!stop?.startedAt && !stop?.endedAt;
  const navigeer = stop ? kaartenLink(stop.object) : null;
  const overigOpStop = stop ? stop.samples.filter((m) => m.id !== monster?.id) : [];

  const kaartStops: MapStreet[] = stops
    .filter((s) => s.object.lat !== null && s.object.lng !== null)
    .map((s) => ({
      id: s.id,
      street: s.object.name,
      lat: s.object.lat as number,
      lng: s.object.lng as number,
      isDone: s.isDone,
      orderIndex: s.orderIndex,
    }));
  const kaartRoute: number[][] | null = (() => {
    if (!dag?.routeGeometry) return null;
    try {
      return JSON.parse(dag.routeGeometry);
    } catch {
      return null;
    }
  })();

  const neem = (m: PlanMonster) =>
    setNeemDoel({
      id: m.id,
      oNumber: m.oNumber,
      location: m.location,
      description: m.description,
      oilType: m.oilType ?? null,
      remarks: m.remarks ?? null,
      photoUrl: m.photoUrl ?? null,
      partPhotoUrl: m.partPhotoUrl ?? null,
    });

  const kop = (
    <header className="veld-kop">
      <Link prefetch={false} href={terugHref} className="veld-terug" aria-label="Terug naar de planning">
        <Icon name="arrow-left" size={24} />
      </Link>
      <div className="veld-kop-tekst">
        <h1>{stop ? stopNaam(stop) : 'Monsterdag'}</h1>
        <p>
          {stop && `stop ${stopNummer} van ${stops.length}, `}
          monsterdag {dag ? korteDatum(dag.date) : ''}
        </p>
      </div>
    </header>
  );

  return (
    <AppShell title="Dagscherm" wide veld user={user}>
      <VeldOffline api={`/api/sample-plans/${dagId}`} />
      <div className="veld">
        {kop}
        <GeenVerbinding />

        {laden ? (
          <Laden label="Dag laden" regels={3} />
        ) : foutmelding && !dag ? (
          <LaadFout melding={foutmelding} onOpnieuw={laadDag} />
        ) : dag ? (
          <div className={`veld-indeling${kaartStops.length === 0 ? ' veld-indeling-smal' : ''}`}>
            <div className="veld-kolom">
              {foutmelding && <LaadFout melding={foutmelding} onOpnieuw={laadDag} />}
              {melding && (
                <div className="alert alert-success" role="status">
                  {melding}
                </div>
              )}
              {gpsFout && <div className="alert alert-danger" role="alert">{gpsFout}</div>}
              <WachtrijOverzicht lijst={wachtrij} gebruiker={user.username} />

              <div className="veld-voortgang">
                <div className="veld-voortgang-tekst">
                  <span>{isVandaag ? 'Vandaag' : dagWoord.charAt(0).toUpperCase() + dagWoord.slice(1)}</span>
                  <span>
                    <strong>{genomen}</strong> van {totaal} genomen
                  </span>
                </div>
                <div className="voortgang-balk" role="img" aria-label={`${genomen} van ${totaal} monsters genomen`}>
                  <i className="voortgang-genomen" style={{ width: `${totaal ? (genomen / totaal) * 100 : 0}%` }} />
                </div>
                {nogTeVersturen > 0 && (
                  <p className="veld-wachtend">
                    En {nogTeVersturen} genomen op deze telefoon, {nogTeVersturen === 1 ? 'wacht' : 'wachten'} op verzending
                  </p>
                )}
                {bezoeken.length > 0 && (
                  <p className="veld-voortgang-bezoeken">
                    {bezoeken.filter((b) => b.isDone).length} van {bezoeken.length}{' '}
                    {bezoeken.length === 1 ? 'taak of inspectie' : 'taken en inspecties'} klaar
                  </p>
                )}
              </div>

              {stops.length === 0 ? (
                <div className="leeg">
                  <Icon name="empty" size={32} />
                  <p style={{ margin: '0 0 12px' }}>Nog geen objecten op deze dag.</p>
                  <Link prefetch={false} href={terugHref} className="btn">
                    <Icon name="arrow-left" size={16} />
                    Naar de planning
                  </Link>
                </div>
              ) : (
                <>
                  {/* De grote kaart: wat nu aan de beurt is */}
                  {bezoekStop ? (
                    <section className={`veld-kaart${bezoekStop.isDone ? ' veld-kaart-klaar' : ''}`} aria-label="Aan de beurt">
                      <span className="veld-kaart-label">
                        <Icon name={bezoekStop.isDone ? 'status-taken' : stopIcoon(bezoekStop)} size={16} />
                        {bezoekStop.isDone ? 'Klaar' : bezoekStop.soort === 'taak' ? 'Contracttaak' : 'Inspectiebezoek'}
                      </span>
                      <p className="veld-omschrijving veld-bezoek-titel">{stopNaam(bezoekStop)}</p>
                      <dl className="veld-gegevens">
                        <dt>Klant</dt>
                        <dd>{(bezoekStop.taak ?? bezoekStop.inspectie)?.klant.naam}</dd>
                        <dt>Plek</dt>
                        <dd>{[bezoekStop.object.name, bezoekStop.object.address].filter(Boolean).join(', ')}</dd>
                        {bezoekStop.taak?.installatie && (
                          <>
                            <dt>Installatie</dt>
                            <dd>{bezoekStop.taak.installatie.naam}</dd>
                          </>
                        )}
                        {bezoekStop.taak && (
                          <>
                            <dt>Terugkerend</dt>
                            <dd>{bezoekStop.taak.soortLabel}, {intervalTekst(bezoekStop.taak.intervalMaanden)}</dd>
                          </>
                        )}
                        <dt>Tijd</dt>
                        <dd>{minutenAlsTekst(bezoekStop.werkMinuten)} gepland</dd>
                      </dl>
                    </section>
                  ) : monster ? (
                    <section className="veld-kaart" aria-label="Aan de beurt">
                      <span className="veld-kaart-label">
                        <Icon name="map-pin" size={16} />
                        {monster.isUnreachable ? 'Nog open, eerder niet bereikbaar' : 'Volgende'}
                      </span>
                      <p className="veld-onummer">{monster.oNumber}</p>
                      <p className="veld-omschrijving">{monster.description || 'Geen omschrijving'}</p>
                      <dl className="veld-gegevens">
                        <dt>Plek</dt>
                        <dd>{monster.location || stop?.object.name}</dd>
                        <dt>Olie</dt>
                        <dd>{monster.oilType || 'Niet ingevuld'}</dd>
                        {monster.isUnreachable && monster.unreachableReason && (
                          <>
                            <dt>Vorige keer</dt>
                            <dd>Niet bereikbaar: {monster.unreachableReason}</dd>
                          </>
                        )}
                      </dl>
                    </section>
                  ) : (
                    <section className="veld-kaart veld-kaart-klaar" aria-label="Deze stop">
                      <span className="veld-kaart-label">
                        <Icon name="status-taken" size={16} />
                        {stop?.isDone ? 'Object klaar' : 'Alles genomen'}
                      </span>
                      <p className="veld-omschrijving">
                        {stop?.isDone
                          ? `${stop.object.name} is afgevinkt.`
                          : `Alle monsters op ${stop?.object.name} zijn genomen. Vink het object af en ga door naar de volgende stop.`}
                      </p>
                    </section>
                  )}

                  {/* Grote knoppen, twee naast elkaar */}
                  <div className="veld-knoppen">
                    {isAdmin && monster && (
                      <button
                        type="button"
                        className="btn veld-knop"
                        onClick={() => setOnbereikbaarDoel({ id: monster.id, oNumber: monster.oNumber })}
                      >
                        <Icon name="alert-warning" size={24} />
                        Niet bereikbaar
                      </button>
                    )}
                    {navigeer && (
                      <a className="btn veld-knop" href={navigeer} target="_blank" rel="noopener">
                        <Icon name="route" size={24} />
                        Navigeer
                      </a>
                    )}
                    {/* Bij een taak die nog open staat, is Taak klaar de hoofdknop onderaan. */}
                    {isAdmin && stop && !(bezoekStop?.soort === 'taak' && !bezoekStop.isDone) && (
                      <button
                        type="button"
                        className={`btn veld-knop${!monster && !stop.isDone && !bezoekStop ? ' btn-primary' : ''}`}
                        onClick={() => stopActie(stop, { isDone: !stop.isDone })}
                        aria-pressed={stop.isDone}
                      >
                        <Icon name={stop.isDone ? 'reset' : 'check'} size={24} />
                        {stop.isDone ? 'Toch niet klaar' : bezoekStop ? 'Bezoek klaar' : 'Object klaar'}
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        className={`btn veld-knop${gpsAan ? ' veld-knop-aan' : ''}`}
                        onClick={() => (gpsAan ? stopGps() : startGps())}
                        aria-pressed={gpsAan}
                      >
                        <Icon name="gps-live" size={24} />
                        {gpsAan ? 'GPS aan, stop' : 'Start GPS'}
                      </button>
                    )}
                  </div>

                  {/* De andere monsters op deze stop */}
                  {overigOpStop.length > 0 && (
                    <section className="veld-sectie">
                      <h2 className="sectiekop">Op deze stop</h2>
                      <ul className="veld-lijst">
                        {overigOpStop.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              className="veld-lijst-regel"
                              onClick={() => !m.isTaken && !wachtend.has(m.id) && setGekozenMonster(m.id)}
                              disabled={m.isTaken || wachtend.has(m.id)}
                              title={m.isTaken ? `${m.oNumber} is genomen` : `${m.oNumber} als volgende kiezen`}
                            >
                              <span className="veld-lijst-tekst">
                                <strong>{m.oNumber}</strong>
                                <span>{[m.description, m.location].filter(Boolean).join(', ')}</span>
                              </span>
                              <StatusBadge m={m} wacht={wachtend.has(m.id)} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Tijd op dit object: automatisch met GPS, of met de hand */}
                  {isAdmin && stop && (
                    <div className="veld-tijd">
                      <span>
                        <Icon name="clock" size={16} />
                        {minutenAlsTekst(stop.werkMinuten)} gepland
                        {stop.werkelijkeMinuten !== null && `, werkelijk ${minutenAlsTekst(stop.werkelijkeMinuten)}`}
                        {loopt && ', tijd loopt'}
                      </span>
                      <span className="veld-tijd-knoppen">
                        {!stop.startedAt || stop.endedAt ? (
                          <button type="button" className="btn btn-sm" onClick={() => stopActie(stop, { actie: 'start' })}>
                            {stop.endedAt ? 'Opnieuw starten' : 'Tijd starten'}
                          </button>
                        ) : (
                          <button type="button" className="btn btn-sm" onClick={() => stopActie(stop, { actie: 'stop' })}>
                            Tijd stoppen
                          </button>
                        )}
                        {stop.startedAt && (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => {
                              gestart.current.delete(stop.id);
                              stopActie(stop, { actie: 'wis-tijden' });
                            }}
                          >
                            Tijden wissen
                          </button>
                        )}
                      </span>
                    </div>
                  )}

                  {/* De hele dag */}
                  <section className="veld-sectie">
                    <h2 className="sectiekop">De stops van {dagWoord}</h2>
                    <ol className="veld-lijst">
                      {stops.map((s, i) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className={`veld-lijst-regel${s.id === stop?.id ? ' on' : ''}`}
                            onClick={() => {
                              setGekozenStop(s.id);
                              setGekozenMonster(null);
                            }}
                            aria-current={s.id === stop?.id ? 'step' : undefined}
                          >
                            <span className={`plan-nummer${s.isDone ? ' plan-nummer-klaar' : ''}`}>{i + 1}</span>
                            <span className="veld-lijst-tekst">
                              <strong>
                                <Icon name={stopIcoon(s)} size={16} /> {stopNaam(s)}
                              </strong>
                              <span>
                                {isMonsterStop(s)
                                  ? `${s.aantalGenomen} van ${monsters(s.aantalMonsters)} genomen, ${minutenAlsTekst(s.werkMinuten)}`
                                  : `${s.soort === 'taak' ? 'Contracttaak' : 'Inspectie'} bij ${s.object.name}, ${minutenAlsTekst(s.werkMinuten)}`}
                              </span>
                            </span>
                            {s.isDone ? (
                              <span className="badge badge-success">Klaar</span>
                            ) : s.id === volgendeStop?.id ? (
                              <span className="badge badge-info">Volgende</span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ol>
                  </section>
                </>
              )}

              {/* Dagrapport: bewijs van het bezoek met de handtekening van de klant */}
              {magDagrapport && stops.length > 0 && (
                <section className="veld-sectie" aria-labelledby="veld-dagrapport-kop">
                  <h2 className="sectiekop" id="veld-dagrapport-kop">Dagrapport</h2>
                  {dagrapporten.length > 0 && (
                    <ul className="veld-lijst">
                      {dagrapporten.map((r) => (
                        <li key={r.id}>
                          <Link prefetch={false} href={`/dashboard/dagrapporten/${r.id}`} className="veld-lijst-regel">
                            <span className="veld-lijst-tekst">
                              <strong><Icon name="module-dagrapport" size={16} /> {r.nummer}, {r.klant.naam}</strong>
                              <span>{r.object?.name ?? 'Geen vaste plek'}</span>
                            </span>
                            {r.status === 'getekend' ? (
                              <span className="badge badge-success">Getekend</span>
                            ) : (
                              <span className="badge badge-gray">Concept</span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {isAdmin && stop && (
                    stop.object.klantId ? (
                      <button type="button" className="btn btn-block veld-knop dr-veldknop" onClick={() => maakDagrapport(stop)} disabled={rapportBezig}>
                        <Icon name="module-dagrapport" size={24} />
                        {rapportBezig ? 'Bezig...' : `Dagrapport voor ${stop.object.klantNaam ?? stop.object.name}`}
                      </button>
                    ) : (
                      <p className="hint">{stop.object.name} hoort nog niet bij een klant; koppel het object eerst in het klantdossier.</p>
                    )
                  )}
                </section>
              )}

              {/* Dag verwijderen: helemaal onderaan en ingeklapt, in het veld wil je dat niet zien */}
              {isAdmin && (
                <details className="veld-beheer">
                  <summary>Dag beheren</summary>
                  <section className="gevarenzone plan-dag-verwijderen">
                    <p className="gevarenzone-kop">
                      <Icon name="trash" size={16} />
                      Dag verwijderen
                    </p>
                    <p className="gevarenzone-tekst">
                      Haalt {datumAlsTekst(dag.date)} uit de planning, met de volgorde, de route en de gemeten tijden van
                      deze dag. De monsters blijven bestaan en komen weer bij de ongeplande objecten.
                    </p>
                    <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => verwijderDag(dag)}>
                      <Icon name="trash" size={16} />
                      Dag verwijderen...
                    </button>
                  </section>
                </details>
              )}
            </div>

            {kaartStops.length > 0 && (
              <div className="veld-kaartvak">
                <RouteMap streets={kaartStops} geometry={kaartRoute} userPos={positie} height="100%" />
              </div>
            )}
          </div>
        ) : null}

        {/* De hoofdactie, onderaan in duimbereik */}
        {isAdmin && bezoekStop && !bezoekStop.isDone && (
          <div className="veld-actiebalk">
            {bezoekStop.soort === 'inspectie' && bezoekStop.inspectie ? (
              <Link prefetch={false} href={`/dashboard/inspecties/${bezoekStop.inspectie.id}`} className="btn btn-primary veld-hoofdknop">
                <Icon name="module-inspecties" size={24} />
                Inspectie openen
              </Link>
            ) : (
              <button type="button" className="btn btn-primary veld-hoofdknop" onClick={() => stopActie(bezoekStop, { isDone: true })}>
                <Icon name="check" size={24} />
                Taak klaar
              </button>
            )}
            <p>
              {bezoekStop.soort === 'taak'
                ? 'De volgende datum van deze taak schuift vanzelf door'
                : 'Afronden in de inspectie zet het contract door'}
            </p>
          </div>
        )}
        {isAdmin && !bezoekStop && monster && (
          <div className="veld-actiebalk">
            <button type="button" className="btn btn-primary veld-hoofdknop" onClick={() => neem(monster)}>
              <Icon name="camera" size={24} />
              Monster nemen
            </button>
            <p>
              {monster.oNumber}: datum, olie en twee foto&apos;s
            </p>
          </div>
        )}
      </div>

      <MonsterNemenModal
        key={`dag-nemen-${neemDoel?.id ?? 'geen'}`}
        doel={neemDoel}
        onClose={() => setNeemDoel(null)}
        onKlaar={naVeldwerk}
      />
      <OnbereikbaarModal
        key={`dag-onbereikbaar-${onbereikbaarDoel?.id ?? 'geen'}`}
        doel={onbereikbaarDoel}
        onClose={() => setOnbereikbaarDoel(null)}
        onKlaar={naVeldwerk}
      />
    </AppShell>
  );
}
