'use client';

/*
  Startscherm Vandaag voor beheerder en gebruiker (zie ontwerp-vandaag en
  STIJL.md, "Vandaag"). Wat je vandaag moet doen, in drie lagen:

  1. Vandaag: de monsterdag uit de planning als één grote kaart met Start dag,
     en de acquisitie-acties van vandaag en eerder.
  2. Deze week: de volgende monsterdagen.
  3. Voortgang: openstaande monsters en per opdracht x van y genomen.

  Alleen echte gegevens: blokken waarvoor nog geen module bestaat (keuringen,
  contracten, rapporten) staan er niet. Elk blok laadt en faalt apart, met een
  skelet tijdens het laden en een foutmelding in plaats van nullen.
  Getallen en indeling: lib/vandaag.ts.
*/

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import LaadFout from '@/app/components/LaadFout';
import { AppShell, Icon, Laden } from '@/app/components/ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { magModule, moduleVan, oliemonsterPad } from '@/lib/modules';
import { minutenAlsTekst } from '@/lib/planningInstellingen';
import { actiesVoorVandaag, type ProspectRegel } from '@/lib/prospects';
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
} from '@/lib/vandaag';

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

function monsters(n: number) {
  return `${n} ${n === 1 ? 'monster' : 'monsters'}`;
}

/** "Sluis Grave", "Sluis Grave en Stuw Sambeek", "A, B en C" */
function namenVan(dag: VandaagDag): string {
  const namen = dag.stops.map((s) => s.object.name);
  if (namen.length <= 1) return namen[0] ?? 'Nog geen objecten';
  return `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`;
}

const MAX_ACTIES = 5;

export default function Vandaag() {
  const user = useGebruiker();
  const jaar = new Date().getFullYear();
  const magAcquisitie = magModule(moduleVan('acquisitie'), user.role);
  const magPlanning = magModule(moduleVan('planning'), user.role);

  const [planning, setPlanning] = useState<Stand<{ dagen: VandaagDag[]; objecten: VandaagObject[] }>>({ status: 'laden' });
  const [samples, setSamples] = useState<Stand<VandaagMonster[]>>({ status: 'laden' });
  const [prospects, setProspects] = useState<Stand<ProspectRegel[]>>({ status: 'laden' });

  // Ophalen zet de state pas na de fetch; Opnieuw proberen toont eerst weer het skelet.
  const haalWerk = useCallback(async () => {
    const monstersVerzoek = haal<VandaagMonster[]>(`/api/samples?year=${jaar}`, 'De monsters konden niet worden opgehaald.');
    try {
      const p = magPlanning
        ? await haal<{ dagen: VandaagDag[]; objecten: VandaagObject[] }>(`/api/sample-plans?year=${jaar}`, 'De planning kon niet worden opgehaald.')
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

  useEffect(() => {
    haalWerk();
    haalActies();
  }, [haalWerk, haalActies]);

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

  const samenvatting = (() => {
    if (!overzicht) return '';
    const delen: string[] = [];
    if (overzicht.dag) delen.push(`Monsterdag langs ${namenVan(overzicht.dag)}`);
    else delen.push('Vandaag staat er geen monsterdag gepland');
    if (acties && acties.length > 0) delen.push(`${acties.length} ${acties.length === 1 ? 'actie wacht' : 'acties wachten'} op je`);
    return `${delen.join(', en ')}.`;
  })();

  return (
    <AppShell user={user} wide>
      <div className="paginakop">
        <div>
          <h1 className="page-title">{datumTitel()}</h1>
          <p className="page-subtitle">
            {begroeting()} {user.username}. {samenvatting}
          </p>
        </div>
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
      <div className="vandaag">
        <div className="vandaag-hoofd">
          {/* ---------- De monsterdag ---------- */}
          {werkFout ? (
            <LaadFout melding={werkFout} onOpnieuw={laadWerk} />
          ) : !overzicht ? (
            <Laden label="Monsterdag laden" regels={1} />
          ) : overzicht.dag ? (
            <MonsterdagKaart dag={overzicht.dag} jaar={jaar} />
          ) : (
            <section className="card vandaag-leeg" aria-label="Monsterdag">
              <Icon name="calendar" size={32} />
              <h2>Nog niets gepland voor vandaag</h2>
              <p>
                {overzicht.eerstvolgende
                  ? `De eerstvolgende monsterdag is ${korteDatum(overzicht.eerstvolgende.date)}: ${namenVan(overzicht.eerstvolgende)}.`
                  : `Er staan geen monsterdagen meer in de planning van ${jaar}.`}
              </p>
              {magPlanning && (
                <Link href="/dashboard/planning" className="btn">
                  <Icon name="calendar" size={16} />
                  {user.role === 'admin' ? 'Dag plannen' : 'Naar de planning'}
                </Link>
              )}
            </section>
          )}

          {/* ---------- Acties uit Acquisitie ---------- */}
          {magAcquisitie && (
            <section className="vandaag-sectie" aria-labelledby="kop-acties">
              <div className="sectiekop">
                <h2 id="kop-acties">Acties</h2>
                <small>acquisitie, vandaag en eerder</small>
              </div>
              {prospects.status === 'fout' ? (
                <LaadFout melding={prospects.melding} onOpnieuw={laadActies} />
              ) : !acties ? (
                <Laden label="Acties laden" regels={2} soort="lijst" />
              ) : acties.length === 0 ? (
                <div className="card vandaag-regel-leeg">Geen acties voor vandaag. Alles is bij.</div>
              ) : (
                <ul className="card rijen">
                  {acties.slice(0, MAX_ACTIES).map(({ prospect: p, reden, urgent }) => (
                    <li key={p.id} className="rij">
                      <span className="icoonvak" aria-hidden="true">
                        <Icon name={p.telefoon ? 'phone' : p.email ? 'mail' : 'module-acquisitie'} />
                      </span>
                      <span className="rij-tekst">
                        <strong>{p.bedrijfsnaam}</strong>
                        <span>
                          {p.volgendeActie || 'Bepaal de volgende stap'}.{' '}
                          <span className={urgent ? 'tekst-te-laat' : undefined}>{reden}</span>
                        </span>
                      </span>
                      <span className="rij-knoppen">
                        {p.telefoon && (
                          <a className="btn btn-sm" href={`tel:${p.telefoon.replace(/\s+/g, '')}`} aria-label={`${p.bedrijfsnaam} bellen`}>
                            <Icon name="phone" size={16} />
                            <span className="alleen-desktop">Bellen</span>
                          </a>
                        )}
                        {!p.telefoon && p.email && (
                          <a className="btn btn-sm" href={`mailto:${p.email}`} aria-label={`${p.bedrijfsnaam} mailen`}>
                            <Icon name="mail" size={16} />
                            <span className="alleen-desktop">Mailen</span>
                          </a>
                        )}
                        <Link className="btn btn-sm" href={`/dashboard/acquisitie?prospect=${p.id}`} aria-label={`${p.bedrijfsnaam} openen`}>
                          <Icon name="pencil" size={16} />
                          <span className="alleen-desktop">Openen</span>
                        </Link>
                      </span>
                    </li>
                  ))}
                  {acties.length > MAX_ACTIES && (
                    <li className="rij rij-meer">
                      <Link href="/dashboard/acquisitie">Alle {acties.length} acties in Acquisitie</Link>
                    </li>
                  )}
                </ul>
              )}
            </section>
          )}

          {/* ---------- Deze week ---------- */}
          {magPlanning && overzicht && (
            <section className="vandaag-sectie" aria-labelledby="kop-week">
              <div className="sectiekop">
                <h2 id="kop-week">Deze week</h2>
                <Link href="/dashboard/planning">Planning</Link>
              </div>
              {overzicht.dezeWeek.length === 0 ? (
                <div className="card vandaag-regel-leeg">
                  Geen monsterdagen in de komende zeven dagen.
                  {overzicht.eerstvolgende && ` De volgende is ${korteDatum(overzicht.eerstvolgende.date)}.`}
                </div>
              ) : (
                <div className="card week">
                  {overzicht.dezeWeek.map((d) => (
                    <Link key={d.id} href={`/dashboard/planning/dag/${d.id}`} className="week-dag">
                      <span className="week-datum">{korteDatum(d.date)}</span>
                      <strong>{namenVan(d)}</strong>
                      <span>
                        {monsters(d.stops.reduce((n, s) => n + s.aantalMonsters, 0))}, {minutenAlsTekst(d.totaalMinuten)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <div className="vandaag-zij">
          {/* ---------- Openstaande monsters ---------- */}
          {!werkFout && (
          <section className="vandaag-sectie" aria-labelledby="kop-open">
            <div className="sectiekop">
              <h2 id="kop-open">Openstaande monsters {jaar}</h2>
              <Link href={oliemonsterPad(jaar)}>Alle</Link>
            </div>
            {!overzicht ? (
              <Laden label="Tellingen laden" regels={4} soort="tegels" />
            ) : (
              <div className="card kengetallen">
                <Kengetal waarde={overzicht.open.vandaag} label="vandaag gepland" />
                <Kengetal waarde={overzicht.open.later} label="later gepland" />
                <Kengetal waarde={overzicht.open.nietIngepland} label="nog niet ingepland" />
                <Kengetal waarde={overzicht.open.nietBereikbaar} label="niet bereikbaar" />
              </div>
            )}
          </section>
          )}

          {/* ---------- Voortgang per opdracht ---------- */}
          {overzicht && overzicht.opdrachten.length > 0 && (
            <section className="vandaag-sectie" aria-labelledby="kop-voortgang">
              <div className="sectiekop">
                <h2 id="kop-voortgang">Voortgang</h2>
              </div>
              <div className="card voortgang">
                {overzicht.opdrachten.map((o) => {
                  const gepland = o.vandaag + o.later;
                  const delen = [
                    o.vandaag > 0 && `${o.vandaag} vandaag`,
                    o.later > 0 && `${o.later} later gepland`,
                    o.open > 0 && `${o.open} nog niet ingepland`,
                  ].filter(Boolean);
                  return (
                    <div key={o.naam} className="voortgang-regel">
                      <div className="voortgang-kop">
                        <strong>{o.naam}</strong>
                        <span className="getal">
                          <strong>{o.genomen}</strong> van {o.totaal}
                        </span>
                      </div>
                      <div className="voortgang-balk" role="img" aria-label={`${o.genomen} van ${o.totaal} genomen, ${gepland} gepland`}>
                        <i className="voortgang-genomen" style={{ width: `${(o.genomen / o.totaal) * 100}%` }} />
                        <i className="voortgang-gepland" style={{ width: `${(gepland / o.totaal) * 100}%` }} />
                      </div>
                      <p className="voortgang-sub">{delen.length > 0 ? delen.join(', ') : 'Alles genomen'}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
      )}
    </AppShell>
  );
}

function Kengetal({ waarde, label }: { waarde: number; label: string }) {
  return (
    <div className="kengetal">
      <span className="kengetal-waarde">{waarde}</span>
      <span className="kengetal-label">{label}</span>
    </div>
  );
}

function MonsterdagKaart({ dag, jaar }: { dag: VandaagDag; jaar: number }) {
  const totaal = dag.stops.reduce((n, s) => n + s.aantalMonsters, 0);
  const open = dag.stops.reduce((n, s) => n + s.aantalMonsters - s.aantalGenomen, 0);
  const eersteOpen = dag.stops.find((s) => !s.isDone) ?? dag.stops[0];
  const route = eersteOpen ? kaartenLink(eersteOpen.object) : null;
  const km = kmTekst(dag.routeDistance);

  return (
    <section className="card monsterdag" aria-labelledby="kop-monsterdag">
      <div className="monsterdag-labels">
        <span className="badge badge-navy">Monsterdag</span>
        <span className="badge badge-gray">Oliemonsters {jaar}</span>
      </div>
      <h2 id="kop-monsterdag" className="monsterdag-titel">{namenVan(dag)}</h2>
      <p className="monsterdag-meta">
        <span><Icon name="oil-sample" size={16} />{monsters(totaal)}{open < totaal ? `, ${open} open` : ''}</span>
        <span><Icon name="clock" size={16} />{minutenAlsTekst(dag.totaalMinuten)}</span>
        {km && <span><Icon name="route" size={16} />{km}</span>}
      </p>
      {dag.notes && <p className="monsterdag-notitie"><Icon name="comment" size={16} />{dag.notes}</p>}
      {dag.stops.length > 0 && (
        <ol className="monsterdag-stops">
          {dag.stops.map((s, i) => (
            <li key={s.id}>
              <span className={`plan-nummer${s.isDone ? ' plan-nummer-klaar' : ''}`}>{i + 1}</span>
              <span className="rij-tekst">
                <strong>{s.object.name}</strong>
                <span>
                  {monsters(s.aantalMonsters)}, ca. {minutenAlsTekst(s.werkMinuten)}
                  {s.isDone ? ', klaar' : s.aantalGenomen > 0 ? `, ${s.aantalGenomen} genomen` : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="monsterdag-knoppen">
        <Link href={`/dashboard/planning/dag/${dag.id}`} className="btn btn-primary btn-lg">
          <Icon name="gps-live" />
          Start dag
        </Link>
        {route && (
          <a href={route} className="btn btn-lg" target="_blank" rel="noopener">
            <Icon name="map-pin" />
            Route in Kaarten
          </a>
        )}
      </div>
    </section>
  );
}
