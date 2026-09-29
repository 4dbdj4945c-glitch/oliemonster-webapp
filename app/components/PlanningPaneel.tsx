'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Icon from './ui/Icon';
import { useVenster } from './ui/Modal';
import Laden from './ui/Laden';
import LaadFout from './LaadFout';
import OngedaanMelding, { type OngedaanInhoud } from './OngedaanMelding';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { objectTypeIcoon } from '@/lib/sampleObjects';
import {
  PLANNING,
  isWerkdag,
  minutenAlsTekst,
  datumAlsTekst,
} from '@/lib/planningInstellingen';

/*
  Planning van de oliemonsters: de pagina Planning en de tab binnen
  Oliemonsters. Eén component voor elk analysejaar. Het dagscherm van een dag
  is een eigen pagina (/dashboard/planning/dag/[id], planning/Dagscherm.tsx). Stijl staat in globals.css (.plan-*); losse componenten
  kunnen geen styled-jsx gebruiken, zie STIJL.md.
*/

import type { PlanDag, PlanMonster, PlanObject, PlanStop } from './planning/types';

export type { PlanMonster };

/** "1 monster" of "3 monsters" */
function monsters(aantal: number): string {
  return `${aantal} ${aantal === 1 ? 'monster' : 'monsters'}`;
}

/** "1 object" of "3 objecten" */
function objectenWoord(aantal: number): string {
  return `${aantal} ${aantal === 1 ? 'object' : 'objecten'}`;
}

/** "1 dag" of "3 dagen" */
function dagenWoord(aantal: number): string {
  return `${aantal} ${aantal === 1 ? 'dag' : 'dagen'}`;
}

/**
 * Waar komt de rijtijd van deze dag vandaan? Null als de route gewoon over de weg
 * is uitgerekend. Drie andere gevallen, allemaal af te leiden uit wat er bewaard
 * is, dus zonder extra kolom:
 *  - geen enkel object met coordinaat: er valt niets te routeren
 *  - geen traject bewaard: de route is nog niet berekend
 *  - wel een traject, geen rijtijd: de routedienst viel uit en de terugval heeft
 *    hemelsbreed gerekend, dus afstand en tijd zijn allebei een ondergrens
 */
function routeHerkomst(dag: PlanDag): { achtervoegsel: string; titel: string } | null {
  if (dag.stops.length === 0) return null;
  const metPunt = dag.stops.filter((s) => s.object.lat !== null && s.object.lng !== null);
  if (metPunt.length === 0) {
    return {
      achtervoegsel: 'geen object op de kaart',
      titel:
        'Geen van deze objecten heeft coordinaten, dus er valt geen route te berekenen. Vul ze aan bij Beheer, Objecten.',
    };
  }
  if (dag.routeGeometry === null) {
    return {
      achtervoegsel: 'route nog niet berekend',
      titel: 'Druk op "Route berekenen" om de afstand en de rijtijd van deze dag op te halen.',
    };
  }
  if (dag.routeDuration === null) {
    return {
      achtervoegsel: 'hemelsbreed',
      titel:
        'De routedienst was niet bereikbaar. Afstand en rijtijd zijn hemelsbreed gerekend en vallen over de weg hoger uit, dus deze dag kan voller zijn dan het totaal laat zien.',
    };
  }
  return null;
}

export default function PlanningPaneel({
  analysisYear,
  isAdmin,
}: {
  analysisYear: number;
  isAdmin: boolean;
}) {
  const [dagen, setDagen] = useState<PlanDag[]>([]);
  const [objecten, setObjecten] = useState<PlanObject[]>([]);
  const [laden, setLaden] = useState(true);
  const [foutmelding, setFoutmelding] = useState('');
  const [melding, setMelding] = useState('');
  // Pas true als de planning echt geladen is. Bij een fout of offline alleen de
  // foutmelding: geen "nog geen objecten", geen nultellers, geen Dag toevoegen.
  const [geladen, setGeladen] = useState(false);
  // Na een object van een dag halen: tien seconden Ongedaan maken
  const [ongedaan, setOngedaan] = useState<OngedaanInhoud | null>(null);

  const [weergave, setWeergave] = useState<'dagen' | 'tijd'>('dagen');

  const [nieuweDatum, setNieuweDatum] = useState('');
  // Invoerfouten (datum vergeten, dag bestaat al) horen niet in het laadfoutvak:
  // daar staat een knop Opnieuw proberen die er niets mee te maken heeft.
  const [invoerFout, setInvoerFout] = useState('');
  const [bezig, setBezig] = useState(false);

  // Object op een dag zetten
  const [kiesObject, setKiesObject] = useState<PlanObject | null>(null);
  const [kiesDag, setKiesDag] = useState<number | null>(null);
  const [kiesMonsters, setKiesMonsters] = useState<number[]>([]);
  const [kiesAlles, setKiesAlles] = useState(true);
  const kiesPaneel = useVenster<HTMLDivElement>(kiesObject !== null, () => setKiesObject(null));

  // Slepen (desktop)
  const sleepStop = useRef<number | null>(null);

  const laadPlanning = useCallback(async () => {
    try {
      const res = await fetch(`/api/sample-plans?year=${analysisYear}`);
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'De planning kon niet worden opgehaald.'));
        return;
      }
      const data = await res.json();
      setDagen(data.dagen ?? []);
      setObjecten(data.objecten ?? []);
      setGeladen(true);
      setFoutmelding('');
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    } finally {
      setLaden(false);
    }
  }, [analysisYear]);

  useEffect(() => {
    laadPlanning();
  }, [laadPlanning]);

  /* ---------- Dagen ---------- */

  const nieuweDag = async () => {
    if (!nieuweDatum) {
      setInvoerFout('Kies eerst een datum.');
      return;
    }
    setBezig(true);
    try {
      const res = await fetch('/api/sample-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: nieuweDatum, analysisYear }),
      });
      if (!res.ok) {
        setInvoerFout(await foutTekst(res, 'De dag kon niet worden toegevoegd.'));
        return;
      }
      setNieuweDatum('');
      setInvoerFout('');
      await laadPlanning();
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  /* ---------- Stops ---------- */

  const openKiesDag = (object: PlanObject) => {
    setKiesObject(object);
    setKiesDag(dagen[0]?.id ?? null);
    setKiesMonsters(object.ongeplandeMonsters.map((m) => m.id));
    setKiesAlles(true);
  };

  const planIn = async () => {
    if (!kiesObject || !kiesDag) return;
    setBezig(true);
    try {
      const res = await fetch(`/api/sample-plans/${kiesDag}/stops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectId: kiesObject.id,
          // Staat er al een deel van dit object op een andere dag, dan sturen we
          // de ids expliciet mee. "Leeg" betekent namelijk alle monsters van het
          // object, en dan zouden ze op twee dagen tegelijk staan.
          sampleIds: kiesAlles
            ? kiesObject.aantalOngepland < kiesObject.aantalMonsters
              ? kiesObject.ongeplandeMonsters.map((m) => m.id)
              : null
            : kiesMonsters,
        }),
      });
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'Het object kon niet worden ingepland.'));
        return;
      }
      const uitkomst = await res.json().catch(() => ({}));
      setMelding(
        uitkomst?.samengevoegd
          ? `${kiesObject.name} stond al op die dag; de monsters zijn bij dat bezoek gevoegd.`
          : ''
      );
      setKiesObject(null);
      setFoutmelding('');
      await laadPlanning();
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  // Een object van een dag halen is klein en makkelijk opnieuw te doen: geen
  // vraag vooraf, wel tien seconden Ongedaan maken. Alleen als er al gemeten of
  // afgevinkt is, eerst een bevestiging, want die tijden komen niet terug.
  const verwijderStop = async (d: PlanDag, stop: PlanStop) => {
    const gemeten = stop.startedAt || stop.endedAt || stop.isDone;
    if (
      gemeten &&
      !confirm(
        `${stop.object.name} van ${datumAlsTekst(d.date)} halen?\n\nDit bezoek is al gestart of afgevinkt. De gemeten tijd en het vinkje gaan verloren, ook als je het daarna terugzet.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/sample-plans/${d.id}/stops/${stop.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'Het object kon niet van de dag worden gehaald.'));
        return;
      }
      await laadPlanning();
      const volgorde = d.stops.map((st) => st.id);
      setOngedaan({
        sleutel: `stop-${stop.id}`,
        tekst: `${stop.object.name} van ${datumAlsTekst(d.date)} gehaald`,
        onOngedaan: () => zetStopTerug(d, stop, volgorde),
      });
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    }
  };

  // Ongedaan maken: het object komt terug op dezelfde dag, met dezelfde monsters
  // en inschatting. Stond de volgorde met de hand vast, dan ook weer op zijn plek.
  const zetStopTerug = async (d: PlanDag, stop: PlanStop, volgorde: number[]): Promise<boolean> => {
    try {
      const res = await fetch(`/api/sample-plans/${d.id}/stops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectId: stop.objectId,
          sampleIds: stop.sampleIds,
          plannedMinutes: stop.plannedMinutes,
        }),
      });
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, `${stop.object.name} kon niet worden teruggezet.`));
        return false;
      }
      const nieuw = await res.json().catch(() => null);
      if (d.manualOrder && nieuw?.id && !nieuw.samengevoegd) {
        await fetch(`/api/sample-plans/${d.id}/volgorde`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stopIds: volgorde.map((id) => (id === stop.id ? nieuw.id : id)) }),
        });
      }
      await laadPlanning();
      return true;
    } catch {
      setFoutmelding(GEEN_VERBINDING);
      return false;
    }
  };

  const zetVolgorde = async (d: PlanDag, stopIds: number[]) => {
    try {
      const res = await fetch(`/api/sample-plans/${d.id}/volgorde`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stopIds }),
      });
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'De volgorde kon niet worden opgeslagen.'));
        return;
      }
      setFoutmelding('');
      await laadPlanning();
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    }
  };

  // Een dag waarvan jij de volgorde hebt gezet doet niet meer mee met de
  // automatische berekening. Hiermee geef je hem weer vrij.
  const geefVolgordeVrij = async (d: PlanDag) => {
    try {
      const res = await fetch(`/api/sample-plans/${d.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualOrder: false }),
      });
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'De volgorde kon niet worden vrijgegeven.'));
        return;
      }
      setFoutmelding('');
      await laadPlanning();
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    }
  };

  const verschuif = (d: PlanDag, stop: PlanStop, richting: -1 | 1) => {
    const ids = d.stops.map((s) => s.id);
    const van = ids.indexOf(stop.id);
    const naar = van + richting;
    if (naar < 0 || naar >= ids.length) return;
    ids.splice(naar, 0, ids.splice(van, 1)[0]);
    zetVolgorde(d, ids);
  };

  const sleepNaar = (d: PlanDag, doelStop: PlanStop) => {
    const bron = sleepStop.current;
    sleepStop.current = null;
    if (bron === null || bron === doelStop.id) return;
    const ids = d.stops.map((s) => s.id);
    const van = ids.indexOf(bron);
    const naar = ids.indexOf(doelStop.id);
    if (van < 0 || naar < 0) return;
    ids.splice(naar, 0, ids.splice(van, 1)[0]);
    zetVolgorde(d, ids);
  };

  /* ---------- Volgorde en route berekenen ---------- */

  const berekenVolgorde = async (herverdeel: boolean) => {
    setBezig(true);
    setMelding('');
    try {
      const res = await fetch('/api/sample-plans/route-berekenen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisYear, herverdeel }),
      });
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'De route kon niet worden uitgerekend.'));
        return;
      }
      const data = await res.json();
      setMelding(
        `${dagenWoord(data.dagen)} uitgerekend.` +
          (herverdeel ? ` ${objectenWoord(data.verplaatst)} verschoven.` : '') +
          (data.nietGeplaatst
            ? ` ${objectenWoord(data.nietGeplaatst)} ${data.nietGeplaatst === 1 ? 'paste' : 'pasten'} er niet meer bij en ${data.nietGeplaatst === 1 ? 'staat' : 'staan'} op de laatste dag.`
            : '') +
          (data.opgeruimd
            ? ` ${objectenWoord(data.opgeruimd)} zonder monsters ${data.opgeruimd === 1 ? 'is' : 'zijn'} van de dag gehaald.`
            : '') +
          (data.gebleven
            ? ` ${objectenWoord(data.gebleven)} ${data.gebleven === 1 ? 'kon' : 'konden'} nergens meer bij en ${data.gebleven === 1 ? 'blijft' : 'blijven'} op de oude dag staan; die dag kan daardoor boven de werkdag uitkomen.`
            : '') +
          (data.overDeWerkdag
            ? ` ${dagenWoord(data.overDeWerkdag)} ${data.overDeWerkdag === 1 ? 'komt' : 'komen'} boven de ${minutenAlsTekst(PLANNING.werkdagMinuten)} uit.`
            : '') +
          (data.dagenHemelsbreed
            ? ` ${dagenWoord(data.dagenHemelsbreed)} ${data.dagenHemelsbreed === 1 ? 'kon' : 'konden'} niet bij de routedienst terecht en ${data.dagenHemelsbreed === 1 ? 'staat' : 'staan'} op een hemelsbrede schatting.`
            : '') +
          (data.zonderCoordinaat
            ? ` ${objectenWoord(data.zonderCoordinaat)} ${data.zonderCoordinaat === 1 ? 'heeft' : 'hebben'} nog geen plek op de kaart, ${data.zonderCoordinaat === 1 ? 'die' : 'hun'} rijtijd is niet meegerekend.`
            : '')
      );
      setFoutmelding('');
      await laadPlanning();
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  /* ---------- Afgeleide waarden ---------- */

  const totaalWerk = dagen.reduce((n, d) => n + d.werkMinuten, 0);
  const totaalRij = dagen.reduce((n, d) => n + d.rijMinuten, 0);
  const totaalKm = dagen.reduce((n, d) => n + (d.routeDistance ?? 0), 0) / 1000;
  const ongepland = objecten.filter((o) => o.aantalOngepland > 0);
  const teVolDagen = dagen.filter((d) => d.teVol).length;

  if (laden) {
    return <Laden label="Planning laden" regels={3} />;
  }

  return (
    <div className="plan">
      {foutmelding && <LaadFout melding={foutmelding} onOpnieuw={laadPlanning} />}
      {melding && <div className="alert alert-info plan-melding">{melding}</div>}

      {geladen && (<>

      {/* ============ DAGEN ============ */}
      {weergave === 'dagen' && (
        <>
          <div className="plan-balk">
            <div className="plan-totalen">
              <span><strong>{dagen.length}</strong> dagen</span>
              <span><strong>{minutenAlsTekst(totaalWerk)}</strong> werk</span>
              <span><strong>{minutenAlsTekst(totaalRij)}</strong> rijden</span>
              {totaalKm > 0 && <span><strong>{Math.round(totaalKm).toLocaleString('nl-NL')} km</strong></span>}
              {teVolDagen > 0 && (
                <span className="badge badge-warning">
                  <Icon name="alert-warning" size={16} />
                  {teVolDagen} {teVolDagen === 1 ? 'dag' : 'dagen'} te vol
                </span>
              )}
            </div>
            {isAdmin && (
              <div className="knoppenrij plan-knoppen">
                <button type="button" className="btn btn-sm" onClick={() => setWeergave('tijd')}>
                  <Icon name="clock" size={16} />
                  Tijd
                </button>
                <button type="button" className="btn btn-sm" onClick={() => berekenVolgorde(false)} disabled={bezig}>
                  <Icon name="route" size={16} />
                  Route berekenen
                </button>
                <button type="button" className="btn btn-sm" onClick={() => berekenVolgorde(true)} disabled={bezig}>
                  <Icon name="route" size={16} />
                  Volgorde en verdeling berekenen
                </button>
              </div>
            )}
          </div>

          <div className="plan-kolommen">
            {/* Objecten die nog ingepland moeten worden */}
            <div className="card plan-objecten">
              <div className="card-kop">Nog in te plannen</div>
              <div className="plan-objecten-lijst">
                {ongepland.length === 0 ? (
                  <p className="plan-leeg-regel">
                    {objecten.length === 0
                      ? 'Er zijn nog geen objecten. Maak ze eerst aan bij Beheer, Objecten.'
                      : 'Alle monsters staan op een dag.'}
                  </p>
                ) : (
                  ongepland.map((o) => (
                    <div key={o.id} className="plan-object">
                      <div className="plan-object-tekst">
                        <span className="plan-object-naam">
                          <Icon name={objectTypeIcoon(o.objectType)} size={16} />
                          {o.name}
                        </span>
                        <span className="plan-object-sub">
                          {o.aantalOngepland} van de {monsters(o.aantalMonsters)} open,
                          {' '}{minutenAlsTekst(o.werkMinuten)} geschat
                        </span>
                      </div>
                      {isAdmin && dagen.length > 0 && (
                        <button type="button" className="btn btn-sm" onClick={() => openKiesDag(o)}>
                          <Icon name="calendar" size={16} />
                          Inplannen
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* De dagen */}
            <div className="plan-dagen">
              {isAdmin && (
                <div className="card plan-nieuwe-dag">
                  <label className="label" htmlFor="plan-datum">Dag toevoegen</label>
                  <div className="plan-datumrij">
                    <input
                      id="plan-datum"
                      type="date"
                      className="input"
                      value={nieuweDatum}
                      onChange={(e) => setNieuweDatum(e.target.value)}
                    />
                    <button type="button" className="btn btn-primary" onClick={nieuweDag} disabled={bezig}>
                      <Icon name="plus" size={16} />
                      Toevoegen
                    </button>
                  </div>
                  {nieuweDatum && !isWerkdag(new Date(`${nieuweDatum}T00:00:00`)) && (
                    <p className="hint">Let op: dit is geen werkdag (maandag tot en met vrijdag).</p>
                  )}
                  {invoerFout && (
                    <div className="alert alert-danger" role="alert" style={{ marginTop: '10px' }}>
                      {invoerFout}
                    </div>
                  )}
                </div>
              )}

              {dagen.length === 0 ? (
                <div className="leeg">
                  <Icon name="empty" size={32} />
                  Nog geen dagen gepland voor {analysisYear}.
                </div>
              ) : (
                dagen.map((d) => (
                  <div key={d.id} className={`card plan-dag${d.teVol ? ' plan-dag-vol' : ''}`}>
                    <div className="plan-dag-kop">
                      <div>
                        <div className="plan-dag-datum">{datumAlsTekst(d.date)}</div>
                        <div className="plan-dag-sub">
                          {d.stops.length} {d.stops.length === 1 ? 'object' : 'objecten'},
                          {' '}{monsters(d.stops.reduce((n, s) => n + s.aantalMonsters, 0))}
                          {d.manualOrder && ', volgorde met de hand gezet'}
                        </div>
                        {isAdmin && d.manualOrder && (
                          <button type="button" className="btn-link plan-vrijgeven" onClick={() => geefVolgordeVrij(d)}>
                            <Icon name="reset" size={16} />
                            Volgorde vrijgeven
                          </button>
                        )}
                      </div>
                      <div className="knoppenrij plan-dag-knoppen">
                        <Link href={`/dashboard/planning/dag/${d.id}`} className="btn btn-sm">
                          <Icon name="gps-live" size={16} />
                          Dag openen
                        </Link>
                      </div>
                    </div>

                    <div className="plan-dag-tijden">
                      <span><Icon name="clock" size={16} />{minutenAlsTekst(d.werkMinuten)} werk</span>
                      {(() => {
                // Voorbehoud op de hele span: bij een terugval is niet alleen de
                // rijtijd een schatting, de kilometers ook.
                const herkomst = routeHerkomst(d);
                return (
                  <span title={herkomst?.titel}>
                    <Icon name="route" size={16} />
                    {minutenAlsTekst(d.rijMinuten)} rijden
                    {d.routeDistance ? `, ${(d.routeDistance / 1000).toFixed(0)} km` : ''}
                    {herkomst && <span className="plan-voorbehoud">({herkomst.achtervoegsel})</span>}
                  </span>
                );
              })()}
                      <span className={d.teVol ? 'plan-totaal-vol' : 'plan-totaal'}>
                        {minutenAlsTekst(d.totaalMinuten)} totaal
                        {d.teVol && ` (over de ${minutenAlsTekst(PLANNING.werkdagMinuten)} heen)`}
                      </span>
                    </div>

                    {d.stops.length === 0 ? (
                      <p className="plan-leeg-regel">Nog geen objecten op deze dag.</p>
                    ) : (
                      <ol className="plan-stops">
                        {d.stops.map((stop, i) => (
                          <li
                            key={stop.id}
                            className="plan-stop"
                            draggable={isAdmin}
                            onDragStart={() => { sleepStop.current = stop.id; }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => sleepNaar(d, stop)}
                          >
                            <span className={`plan-nummer${stop.isDone ? ' plan-nummer-klaar' : ''}`}>{i + 1}</span>
                            <span className="plan-stop-tekst">
                              <span className="plan-stop-naam">
                                <Icon name={objectTypeIcoon(stop.object.objectType)} size={16} />
                                {stop.object.name}
                              </span>
                              <span className="plan-stop-sub">
                                {monsters(stop.aantalMonsters)}, {minutenAlsTekst(stop.werkMinuten)}
                                {stop.sampleIds && ', deel van het object'}
                                {stop.werkelijkeMinuten !== null && `, werkelijk ${minutenAlsTekst(stop.werkelijkeMinuten)}`}
                                {(stop.object.lat === null || stop.object.lng === null) &&
                                  ', geen plek op de kaart, rijtijd hierheen niet meegerekend'}
                                {stop.aantalMonsters === 0 &&
                                  ', geen monsters meer, je kunt dit object van de dag halen'}
                              </span>
                            </span>
                            {isAdmin && (
                              <span className="plan-stop-knoppen">
                                <button
                                  type="button"
                                  className="icon-btn"
                                  onClick={() => verschuif(d, stop, -1)}
                                  disabled={i === 0}
                                  aria-label={`${stop.object.name} naar boven`}
                                  title="Naar boven"
                                >
                                  <Icon name="chevron-down" size={16} className="plan-omhoog" />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  onClick={() => verschuif(d, stop, 1)}
                                  disabled={i === d.stops.length - 1}
                                  aria-label={`${stop.object.name} naar beneden`}
                                  title="Naar beneden"
                                >
                                  <Icon name="chevron-down" size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn icon-btn-danger icon-btn-verwijder"
                                  onClick={() => verwijderStop(d, stop)}
                                  aria-label={`${stop.object.name} van deze dag halen`}
                                  title="Van deze dag halen"
                                >
                                  <Icon name="close" size={16} />
                                </button>
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ============ TIJD: geschat tegenover werkelijk ============ */}
      {weergave === 'tijd' && (
        <PlanningTijd dagen={dagen} onTerug={() => setWeergave('dagen')} />
      )}

      {/* Object op een dag zetten */}
      {kiesObject && (
        <div className="modal-backdrop" onClick={() => setKiesObject(null)}>
          <div
            ref={kiesPaneel}
            className="modal-content modal-content-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-kies-titel"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title" id="plan-kies-titel">{kiesObject.name} inplannen</h2>
              <button type="button" className="icon-btn modal-sluit" onClick={() => setKiesObject(null)} aria-label="Sluiten">
                <Icon name="close" />
              </button>
            </div>
            <div className="modal-body">
              <div className="veld">
                <label className="label" htmlFor="plan-kies-dag">Op welke dag</label>
                <select
                  id="plan-kies-dag"
                  className="select"
                  value={kiesDag ?? ''}
                  onChange={(e) => setKiesDag(parseInt(e.target.value))}
                >
                  {dagen.map((d) => (
                    <option key={d.id} value={d.id}>
                      {datumAlsTekst(d.date)} ({minutenAlsTekst(d.totaalMinuten)} gepland)
                    </option>
                  ))}
                </select>
              </div>

              <p className="section-label">Welke monsters</p>
              <label className="plan-keuze">
                <input type="checkbox" checked={kiesAlles} onChange={(e) => setKiesAlles(e.target.checked)} />
                Alle openstaande monsters van dit object ({kiesObject.aantalOngepland})
              </label>
              {!kiesAlles && (
                <>
                  <p className="hint">
                    Kies welke monsters je deze dag meeneemt. De rest plan je op een andere dag, zo
                    splits je een groot object over twee dagen.
                  </p>
                  <ul className="plan-keuzelijst">
                    {kiesObject.ongeplandeMonsters.map((m) => (
                      <li key={m.id}>
                        <label className="plan-keuze">
                          <input
                            type="checkbox"
                            checked={kiesMonsters.includes(m.id)}
                            onChange={(e) =>
                              setKiesMonsters((vorig) =>
                                e.target.checked ? [...vorig, m.id] : vorig.filter((id) => id !== m.id)
                              )
                            }
                          />
                          <strong>{m.oNumber}</strong>
                          <span className="plan-monster-sub">{m.description}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setKiesObject(null)}>Annuleren</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={planIn}
                disabled={bezig || !kiesDag || (!kiesAlles && kiesMonsters.length === 0)}
              >
                {bezig ? 'Bezig...' : 'Op de dag zetten'}
              </button>
            </div>
          </div>
        </div>
      )}
      <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />

      </>)}
    </div>
  );
}

/* ============ Werkelijke tijd tegenover de inschatting ============ */

function PlanningTijd({ dagen, onTerug }: { dagen: PlanDag[]; onTerug: () => void }) {
  // Per object optellen over alle dagen, zodat een object dat over twee dagen
  // verdeeld is ook als één regel te lezen is.
  const perObject = new Map<number, { naam: string; type: string | null; gepland: number; geplandGemeten: number; werkelijk: number; monsters: number; metTijd: number; bezoeken: number }>();
  for (const d of dagen) {
    for (const s of d.stops) {
      const r = perObject.get(s.objectId) ?? { naam: s.object.name, type: s.object.objectType, gepland: 0, geplandGemeten: 0, werkelijk: 0, monsters: 0, metTijd: 0, bezoeken: 0 };
      r.gepland += s.werkMinuten;
      r.monsters += s.aantalMonsters;
      r.bezoeken += 1;
      if (s.werkelijkeMinuten !== null) {
        r.werkelijk += s.werkelijkeMinuten;
        // Alleen de inschatting van de gemeten bezoeken, anders vergelijk je bij
        // een object over twee dagen een halve meting met een hele inschatting.
        r.geplandGemeten += s.werkMinuten;
        r.metTijd += 1;
      }
      perObject.set(s.objectId, r);
    }
  }
  const regels = [...perObject.values()].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  const totaalGepland = regels.reduce((n, r) => n + r.gepland, 0);
  const totaalWerkelijk = regels.reduce((n, r) => n + r.werkelijk, 0);
  const gemetenRegels = regels.filter((r) => r.metTijd > 0);
  // Alleen de gemeten objecten met elkaar vergelijken, anders zet je de
  // werkelijke tijd van twee objecten naast de inschatting van alle drie.
  const geplandVanGemeten = gemetenRegels.reduce((n, r) => n + r.geplandGemeten, 0);
  const verschilGemeten = totaalWerkelijk - geplandVanGemeten;

  return (
    <>
      <div className="plan-balk">
        <div>
          <div className="plan-dag-datum">Tijd: geschat tegenover werkelijk</div>
          <div className="plan-dag-sub">
            Wat je op locatie start en stopt komt hier naast je inschatting te staan. Handig als
            onderbouwing bij een volgende offerte.
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={onTerug}>
          <Icon name="arrow-left" size={16} />
          Terug naar de dagen
        </button>
      </div>

      {regels.length === 0 ? (
        <div className="leeg">
          <Icon name="empty" size={32} />
          Nog niets ingepland, dus ook nog niets te vergelijken.
        </div>
      ) : (
        <div className="table-container">
          <div className="table-scroll">
            <table className="table table-kaarten">
              <thead>
                <tr>
                  <th>Object</th>
                  <th>Monsters</th>
                  <th>Geschat</th>
                  <th>Werkelijk</th>
                  <th>Verschil</th>
                </tr>
              </thead>
              <tbody>
                {regels.map((r) => {
                  const verschil = r.metTijd > 0 ? r.werkelijk - r.geplandGemeten : null;
                  return (
                    <tr key={r.naam}>
                      <td data-label="Object" className="kaart-kop font-medium">
                        <Icon name={objectTypeIcoon(r.type)} size={16} /> {r.naam}
                      </td>
                      <td data-label="Monsters">{r.monsters}</td>
                      <td data-label="Geschat">{minutenAlsTekst(r.gepland)}</td>
                      <td data-label="Werkelijk">
                        {r.metTijd === 0
                          ? 'nog niet gemeten'
                          : r.metTijd < r.bezoeken
                          ? `${minutenAlsTekst(r.werkelijk)} over ${r.metTijd} van de ${r.bezoeken} bezoeken`
                          : minutenAlsTekst(r.werkelijk)}
                      </td>
                      <td data-label="Verschil">
                        {verschil === null ? (
                          '-'
                        ) : (
                          <span className={`badge ${verschil > 0 ? 'badge-warning' : 'badge-success'}`}>
                            {verschil > 0 ? '+' : '-'}{minutenAlsTekst(Math.abs(verschil))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td data-label="Object" className="kaart-kop font-medium">Totaal</td>
                  <td data-label="Monsters">{regels.reduce((n, r) => n + r.monsters, 0)}</td>
                  <td data-label="Geschat">{minutenAlsTekst(totaalGepland)}</td>
                  <td data-label="Werkelijk">
                    {gemetenRegels.length > 0
                      ? `${minutenAlsTekst(totaalWerkelijk)} over ${gemetenRegels.length} van de ${regels.length} objecten`
                      : 'nog niet gemeten'}
                  </td>
                  <td data-label="Verschil">
                    {gemetenRegels.length === 0 ? (
                      '-'
                    ) : (
                      <span className={`badge ${verschilGemeten > 0 ? 'badge-warning' : 'badge-success'}`}>
                        {verschilGemeten > 0 ? '+' : '-'}{minutenAlsTekst(Math.abs(verschilGemeten))}
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
