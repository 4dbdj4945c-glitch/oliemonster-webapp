'use client';

/*
  Het klantportaal (ontwerp portaal-plan/04-ontwerp/ontwerp-klantportaal-*):
  voor een kijker met de weergave klantportaal op /dashboard, en voor de
  beheerder als voorbeeld op /dashboard/klanten/[id]/portaal.

  Alleen lezen. Eigen kop met het logo van de klant en "uitgevoerd door" It's
  Done Services, een navy band met de titel, dan voortgang, stand per object,
  planning (alleen dag en object, geen tijden of route), documenten, recente
  foto's en contact. Onder Documenten ook de afgeronde inspecties met hun
  rapport en de datum van de volgende inspectie. Onderaan de link naar de
  privacyverklaring.

  Alle getallen komen van GET /api/portaal, die ook de afscherming per klant en
  jaar doet. Statussen voor de klant zijn neutraal (lib/klantStatus.ts): geen
  rood Niet genomen, maar Gepland of Nog in te plannen.

  Opmaak: .portaal-* in globals.css.
*/

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, Laden } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import PhotoModal, { type FotoInVenster } from '@/app/components/PhotoModal';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import {
  KLANT_STATUS_BADGE,
  KLANT_STATUS_ICOON,
  KLANT_STATUS_LABELS,
  KLANT_STATUS_LEGENDA,
  KLANT_STATUSSEN,
  type KlantStatus,
  type KlantTelling,
} from '@/lib/klantStatus';
import { objectTypeIcoon } from '@/lib/sampleObjects';
import { SJABLONEN, type SjabloonSleutel } from '@/lib/inspecties/sjablonen';

interface PortaalObject {
  id: number | null;
  naam: string;
  objectType: string | null;
  telling: KlantTelling;
  volgendBezoek: string | null;
  laatsteFoto: string | null;
}

interface PortaalMonster {
  id: number;
  oNumber: string;
  description: string;
  objectId: number | null;
  installatieNaam: string | null;
  status: KlantStatus;
  datum: string | null;
  reden: string | null;
}

interface Portaal {
  klant: { id: number; naam: string; logo: string | null };
  jaar: number;
  jaren: { jaar: number; totaal: number }[];
  telling: KlantTelling;
  teNemen: number;
  bijgewerktOp: string | null;
  objecten: PortaalObject[];
  planning: { dag: string; objecten: string[]; aantal: number }[];
  recenteFotos: { id: number; oNumber: string; plek: string; datum: string | null; foto: string }[];
  monsters: PortaalMonster[];
  /** Afgeronde inspecties van de klant, met rapport en volgende inspectie. */
  inspecties?: PortaalInspectie[];
}

interface PortaalInspectie {
  id: number;
  nummer: string;
  naam: string;
  sjabloon: SjabloonSleutel;
  datum: string;
  object: string;
  uitkomst: string;
  volgende: string | null;
  rapport: string;
}

const EERSTE_OBJECTEN = 6;
const CONTACT = { naam: 'Roel Mandigers', bedrijf: "It's Done Services", telefoon: '085 060 4300', email: 'info@itsdoneservices.nl' };

/** Een monsterdag (jjjj-mm-dd) als datum om 12 uur, zodat de dag in elke tijdzone klopt. */
const dagDatum = (dag: string) => new Date(`${dag}T12:00:00`);
const kortDag = (dag: string) => dagDatum(dag).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
const datumKort = (d: string | null) => (d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '');

function groet(nu = new Date()): string {
  const uur = nu.getHours();
  if (uur < 12) return 'Goedemorgen';
  if (uur < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

function bijgewerktTekst(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const tijd = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const vandaag = new Date().toDateString() === d.toDateString();
  return vandaag
    ? ` Bijgewerkt vandaag om ${tijd}.`
    : ` Bijgewerkt op ${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })} om ${tijd}.`;
}

function hoofdletter(naam: string): string {
  return naam ? naam[0].toUpperCase() + naam.slice(1) : naam;
}

/** Een korte zin onder de objectnaam: wat er bijzonder is. */
function objectToelichting(o: PortaalObject): string {
  const t = o.telling;
  const delen: string[] = [];
  if (t['niet-bereikbaar']) delen.push(`${t['niet-bereikbaar']} niet bereikbaar`);
  if (t.geannuleerd) delen.push(`${t.geannuleerd} geannuleerd`);
  const teNemen = t.genomen + t.gepland + t['in-te-plannen'] + t['niet-bereikbaar'];
  if (delen.length === 0 && teNemen > 0 && t.genomen === teNemen) return 'alle monsters genomen';
  return delen.join(', ');
}

export default function KlantPortaal({
  gebruikersnaam,
  klantId,
  voorbeeld = false,
}: {
  gebruikersnaam: string;
  /** Alleen voor het voorbeeld door de beheerder; een kijker krijgt altijd zijn eigen klant. */
  klantId?: number;
  voorbeeld?: boolean;
}) {
  const router = useRouter();
  const [jaar, setJaar] = useState<number | null>(null);
  const [data, setData] = useState<Portaal | null>(null);
  const [fout, setFout] = useState('');
  const [alleObjecten, setAlleObjecten] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [foto, setFoto] = useState<{ fotos: FotoInVenster[]; nummer: string } | null>(null);

  const laad = useCallback(async () => {
    const params = new URLSearchParams();
    if (jaar) params.set('jaar', String(jaar));
    if (klantId) params.set('klantId', String(klantId));
    try {
      const res = await fetch(`/api/portaal?${params}`);
      if (!res.ok) {
        setFout(await foutTekst(res, 'De gegevens konden niet worden opgehaald.'));
        return;
      }
      const nieuw: Portaal = await res.json();
      setData(nieuw);
      setFout('');
    } catch {
      setFout(GEEN_VERBINDING);
    }
  }, [jaar, klantId]);

  useEffect(() => {
    laad();
  }, [laad]);

  const uitloggen = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
    }
  };

  const rapportAdres = (j: number) => `/api/rapport?jaar=${j}${klantId ? `&klantId=${klantId}` : ''}`;
  const naam = hoofdletter(gebruikersnaam);

  const kop = (
    <header className="portaal-kop">
      <div className="portaal-kop-in">
        {data?.klant.logo ? (
          <img className="portaal-klantlogo" src={data.klant.logo} alt={data.klant.naam} />
        ) : (
          <span className="portaal-klantnaam">{data?.klant.naam ?? ''}</span>
        )}
        <div className="portaal-door">
          uitgevoerd door <img src="/logo-navy.png" alt="It's Done Services" />
        </div>
        <div className="portaal-gebruiker">
          <span className="portaal-avatar" aria-hidden="true">{naam.slice(0, 1)}</span>
          <span className="portaal-gebruiker-naam">{naam}</span>
          {!voorbeeld && (
            <button type="button" className="btn btn-sm" onClick={uitloggen}>
              <Icon name="logout" size={16} />
              <span className="portaal-uitloggen-tekst">Uitloggen</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );

  const voet = (
    <footer className="portaal-voet">
      <a href="/privacy">Privacyverklaring</a>
      <span>{CONTACT.bedrijf}, Heeze</span>
    </footer>
  );

  if (!data) {
    return (
      <div className="portaal">
        {kop}
        <div className="portaal-band"><div className="portaal-band-in"><h1>Oliemonsters</h1></div></div>
        <main className="portaal-inhoud">
          {fout ? <LaadFout melding={fout} onOpnieuw={laad} /> : <Laden label="Klantportaal laden" regels={3} />}
        </main>
        {voet}
      </div>
    );
  }

  const t = data.telling;
  const alle = KLANT_STATUSSEN.reduce((som, s) => som + t[s], 0);
  const objecten = alleObjecten ? data.objecten : data.objecten.slice(0, EERSTE_OBJECTEN);
  const sleutel = (o: PortaalObject) => (o.id === null ? 'los' : String(o.id));

  return (
    <div className="portaal">
      {kop}
      {voorbeeld && (
        <div className="portaal-voorbeeld" role="note">
          <Icon name="alert-info" size={16} />
          Voorbeeld: zo ziet een kijker van {data.klant.naam} het klantportaal.
          <button type="button" className="btn-link" onClick={() => router.push(`/dashboard/klanten/${data.klant.id}`)}>
            Terug naar het dossier
          </button>
        </div>
      )}

      <div className="portaal-band">
        <div className="portaal-band-in">
          <div className="portaal-band-titel">
            <h1>Oliemonsters {data.jaar}</h1>
            <p>
              {groet()} {naam}. Zo staat de opdracht ervoor.{bijgewerktTekst(data.bijgewerktOp)}
            </p>
          </div>
          {data.jaren.length > 1 && (
            <label className="portaal-jaar">
              <span className="sr-only">Jaar</span>
              <select className="select" value={data.jaar} onChange={(e) => setJaar(Number(e.target.value))}>
                {data.jaren.map((j) => (
                  <option key={j.jaar} value={j.jaar}>{j.jaar}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <main className="portaal-inhoud">
        {fout && <LaadFout melding={fout} onOpnieuw={laad} />}

        {/* ---------- Voortgang ---------- */}
        <section className="card portaal-voortgang" aria-labelledby="portaal-voortgang-kop">
          <div>
            <h2 id="portaal-voortgang-kop" className="portaal-groot getal">
              {t.genomen}
              <small>van {data.teNemen} {data.teNemen === 1 ? 'monster' : 'monsters'} genomen</small>
            </h2>
            <div
              className="portaal-balk"
              role="img"
              aria-label={KLANT_STATUSSEN.filter((s) => t[s]).map((s) => `${t[s]} ${KLANT_STATUS_LEGENDA[s]}`).join(', ')}
            >
              {alle > 0 &&
                KLANT_STATUSSEN.filter((s) => t[s] && s !== 'in-te-plannen').map((s) => (
                  <i key={s} className={`portaal-balk-${s}`} style={{ width: `${(t[s] / alle) * 100}%` }} />
                ))}
            </div>
            <ul className="portaal-legenda getal">
              {KLANT_STATUSSEN.filter((s) => t[s]).map((s) => (
                <li key={s}>
                  <i className={`portaal-stip portaal-balk-${s}`} aria-hidden="true" />
                  <b>{t[s]}</b> {KLANT_STATUS_LEGENDA[s]}
                </li>
              ))}
            </ul>
          </div>
          <div className="portaal-rapport">
            <a className="btn btn-primary btn-lg" href={rapportAdres(data.jaar)} download>
              <Icon name="download" size={20} />
              Rapport downloaden
            </a>
            <span>PDF, stand van vandaag, met foto&apos;s</span>
          </div>
        </section>

        <div className="portaal-twee">
          {/* ---------- Per object ---------- */}
          <section className="card portaal-objecten" aria-labelledby="portaal-objecten-kop">
            <div className="sectiekop portaal-kaart-kop">
              <h2 id="portaal-objecten-kop">Per object</h2>
              <small>{data.objecten.length} {data.objecten.length === 1 ? 'object' : 'objecten'}</small>
            </div>
            {data.objecten.length === 0 ? (
              <div className="leeg">
                <Icon name="empty" size={32} />
                <p>Er staan nog geen monsters in deze opdracht.</p>
              </div>
            ) : (
              <table className="portaal-tabel getal">
                <thead>
                  <tr>
                    <th>Object</th>
                    <th>Genomen</th>
                    <th className="portaal-kol-plan">Volgende bezoek</th>
                    <th className="portaal-kol-foto">Laatste foto</th>
                  </tr>
                </thead>
                <tbody>
                  {objecten.map((o) => {
                    const teNemen = o.telling.genomen + o.telling.gepland + o.telling['in-te-plannen'] + o.telling['niet-bereikbaar'];
                    const klaar = teNemen > 0 && o.telling.genomen === teNemen;
                    const isOpen = open === sleutel(o);
                    const monsters = data.monsters.filter((m) => m.objectId === o.id);
                    return (
                      <Fragment key={sleutel(o)}>
                        <tr className={isOpen ? 'portaal-rij-open' : undefined}>
                          <td>
                            <button
                              type="button"
                              className="portaal-object"
                              aria-expanded={isOpen}
                              onClick={() => setOpen(isOpen ? null : sleutel(o))}
                            >
                              <Icon name={objectTypeIcoon(o.objectType)} size={20} />
                              <span>
                                <b>{o.naam}</b>
                                {objectToelichting(o) && <small>{objectToelichting(o)}</small>}
                              </span>
                              <Icon name="chevron-down" size={16} />
                            </button>
                          </td>
                          <td className="portaal-genomen">
                            <span className="portaal-minibalk" aria-hidden="true">
                              <i style={{ width: `${teNemen ? (o.telling.genomen / teNemen) * 100 : 0}%` }} />
                            </span>
                            {o.telling.genomen} van {teNemen}
                          </td>
                          <td className="portaal-kol-plan">
                            {o.volgendBezoek ? (
                              <span className="badge badge-info">{kortDag(o.volgendBezoek)}</span>
                            ) : klaar ? (
                              <span className="badge badge-success">klaar</span>
                            ) : teNemen > o.telling.genomen ? (
                              <span className="badge badge-gray">nog in te plannen</span>
                            ) : null}
                          </td>
                          <td className="portaal-kol-foto">
                            {o.laatsteFoto && (
                              <button
                                type="button"
                                className="portaal-mini"
                                onClick={() => setFoto({ fotos: [{ url: o.laatsteFoto!, label: 'Laatste foto' }], nummer: o.naam })}
                                aria-label={`Laatste foto van ${o.naam}`}
                              >
                                <img src={o.laatsteFoto} alt="" loading="lazy" />
                              </button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="portaal-monsters-rij">
                            <td colSpan={4}>
                              <ul className="portaal-monsters">
                                {monsters.map((m) => (
                                  <li key={m.id}>
                                    <span className="portaal-monster-nr">{m.oNumber}</span>
                                    <span className="portaal-monster-tekst">
                                      {[m.installatieNaam, m.description].filter((w, i, l) => w && l.indexOf(w) === i).join(', ')}
                                      {m.reden && <small>{m.reden}</small>}
                                    </span>
                                    <span className={`badge ${KLANT_STATUS_BADGE[m.status]}`}>
                                      <Icon name={KLANT_STATUS_ICOON[m.status]} size={16} />
                                      {KLANT_STATUS_LABELS[m.status]}
                                    </span>
                                    <span className="portaal-monster-datum">{datumKort(m.datum)}</span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {data.objecten.length > EERSTE_OBJECTEN && (
                    <tr>
                      <td colSpan={4}>
                        <button type="button" className="btn-link" onClick={() => setAlleObjecten(!alleObjecten)}>
                          {alleObjecten ? 'Minder tonen' : `Nog ${data.objecten.length - EERSTE_OBJECTEN} objecten tonen`}
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </section>

          <div className="portaal-zij">
            {/* ---------- Planning ---------- */}
            <section className="card" aria-labelledby="portaal-planning-kop">
              <div className="sectiekop portaal-kaart-kop">
                <h2 id="portaal-planning-kop">Gepland</h2>
              </div>
              {data.planning.length === 0 ? (
                <p className="portaal-leeg-tekst">Er staan nu geen monsterdagen op de planning.</p>
              ) : (
                <ul className="rijen">
                  {data.planning.map((p) => {
                    const d = dagDatum(p.dag);
                    return (
                      <li key={p.dag} className="rij portaal-dag">
                        <span className="portaal-dagvak getal" aria-hidden="true">
                          <small>{d.toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '').toUpperCase()}</small>
                          <b>{d.getDate()}</b>
                        </span>
                        <span className="rij-tekst">
                          <strong>{p.objecten.join(' en ')}</strong>
                          <span>
                            {d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}, {p.aantal}{' '}
                            {p.aantal === 1 ? 'monster' : 'monsters'}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* ---------- Documenten ---------- */}
            <section className="card" aria-labelledby="portaal-documenten-kop">
              <div className="sectiekop portaal-kaart-kop">
                <h2 id="portaal-documenten-kop">Documenten</h2>
              </div>
              <ul className="rijen">
                {data.jaren.map((j) => (
                  <li key={j.jaar} className="rij">
                    <span className="icoonvak"><Icon name="file-pdf" size={20} /></span>
                    <span className="rij-tekst">
                      <strong>Rapport {j.jaar}</strong>
                      <span>
                        {j.jaar === new Date().getFullYear() ? 'Stand van vandaag, ' : ''}
                        {j.totaal} {j.totaal === 1 ? 'monster' : 'monsters'}, met foto&apos;s
                      </span>
                    </span>
                    <a className="icon-btn" href={rapportAdres(j.jaar)} download title={`Rapport ${j.jaar} downloaden`} aria-label={`Rapport ${j.jaar} downloaden`}>
                      <Icon name="download" size={20} />
                    </a>
                  </li>
                ))}
                {(data.inspecties ?? []).map((i) => (
                  <li key={`inspectie-${i.id}`} className="rij">
                    <span className="icoonvak"><Icon name={SJABLONEN[i.sjabloon]?.icoon ?? 'module-inspecties'} size={20} /></span>
                    <span className="rij-tekst">
                      <strong>{i.naam}, {new Date(`${i.datum}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                      <span>{i.object}. {i.uitkomst}</span>
                      {i.volgende && (
                        <span className="portaal-volgende">
                          <Icon name="calendar" size={16} />
                          Volgende inspectie {new Date(`${i.volgende}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      )}
                    </span>
                    <a className="icon-btn" href={i.rapport} download title={`Rapport ${i.naam} downloaden`} aria-label={`Rapport ${i.naam} van ${i.datum} downloaden`}>
                      <Icon name="download" size={20} />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        {/* ---------- Recent genomen ---------- */}
        {data.recenteFotos.length > 0 && (
          <section className="card" aria-labelledby="portaal-fotos-kop">
            <div className="sectiekop portaal-kaart-kop">
              <h2 id="portaal-fotos-kop">Recent genomen</h2>
            </div>
            <div className="portaal-fotoraster">
              {data.recenteFotos.map((f) => (
                <figure key={f.id}>
                  <button type="button" onClick={() => setFoto({ fotos: [{ url: f.foto, label: 'Foto' }], nummer: f.oNumber })} aria-label={`Foto van ${f.oNumber} groot bekijken`}>
                    <img src={f.foto} alt="" loading="lazy" />
                  </button>
                  <figcaption>
                    <b>{f.oNumber}</b> {f.plek}
                    {f.datum ? `, ${datumKort(f.datum)}` : ''}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* ---------- Contact ---------- */}
        <section className="card portaal-contact">
          <div>
            <b>Vragen over de opdracht?</b>
            <span>{CONTACT.naam}, {CONTACT.bedrijf}</span>
          </div>
          <div className="portaal-contact-lijnen getal">
            <a href={`tel:${CONTACT.telefoon.replace(/\s/g, '')}`}><Icon name="phone" size={20} />{CONTACT.telefoon}</a>
            <a href={`mailto:${CONTACT.email}`}><Icon name="mail" size={20} />{CONTACT.email}</a>
          </div>
        </section>
      </main>

      {voet}

      {foto && <PhotoModal fotos={foto.fotos} sampleNumber={foto.nummer} onClose={() => setFoto(null)} />}
    </div>
  );
}
