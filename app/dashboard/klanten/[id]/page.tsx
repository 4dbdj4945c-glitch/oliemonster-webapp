'use client';

// Klantdossier (alleen admin, ontwerp portaal-plan/04-ontwerp/ontwerp-klantdossier-*):
// kop met de klant, Mail opstellen, Rapport maken en Klantportaal bekijken,
// kerncijfers, en drie tabs:
// - Objecten en installaties: per object en installatie een tijdlijn van
//   monsters (status en foto's), niet bereikbaar, annuleringen (DossierTijdlijn).
//   Filter op jaar.
// - Onderhoud: de contracten met terugkerende taken (fase 5), met bovenaan het
//   dossier een melding als er een taak verlopen is of binnen 30 dagen moet.
// - Contactpersonen, met Mail opstellen per persoon.
// - Gegevens: adres, logo, meekijkers, objecten koppelen en verwijderen.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { AppShell, Icon, Laden } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import OngedaanMelding, { type OngedaanInhoud } from '@/app/components/OngedaanMelding';
import VeiligVerwijderBlok from '@/app/components/VeiligVerwijderBlok';
import KlantFormulier from '@/app/components/klanten/KlantFormulier';
import ContactpersoonFormulier from '@/app/components/klanten/ContactpersoonFormulier';
import InstallatieFormulier from '@/app/components/klanten/InstallatieFormulier';
import DossierTijdlijn, { type DossierKeuze } from '@/app/components/klanten/DossierTijdlijn';
import OnderhoudTab from '@/app/components/klanten/OnderhoudTab';
import NieuwDagrapport from '@/app/components/dagrapport/NieuwDagrapport';
import { termijnTekst, vandaagNl } from '@/lib/contracten';
import {
  adresTekst,
  type Contactpersoon,
  type Dossier,
  type KlantDetail,
  type KlantObject,
  type ObjectKeuze,
} from '@/app/components/klanten/types';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { objectTypeIcoon, objectTypeLabel } from '@/lib/sampleObjects';
import { ROLE_LABELS, WEERGAVE_LABELS, leesWeergave } from '@/lib/roles';
import { mailOpstellenAdres } from '@/lib/mailOpstellen';

type Tab = 'dossier' | 'onderhoud' | 'contact' | 'gegevens';

interface AandachtTaak {
  id: number;
  titel: string;
  volgendeOp: string;
  status: string;
  object: { name: string };
}

export default function KlantPagina() {
  const user = useGebruiker();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [klant, setKlant] = useState<KlantDetail | null>(null);
  const [alleObjecten, setAlleObjecten] = useState<ObjectKeuze[]>([]);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [bewerken, setBewerken] = useState(false);
  const [contact, setContact] = useState<{ persoon: Contactpersoon | null } | null>(null);
  const [nieuweInstallatie, setNieuweInstallatie] = useState<KlantObject | null>(null);
  const [koppelObject, setKoppelObject] = useState('');
  const [bezig, setBezig] = useState(false);
  const [ongedaan, setOngedaan] = useState<OngedaanInhoud | null>(null);
  const [verwijderd, setVerwijderd] = useState(false);
  const [tab, setTab] = useState<Tab>('dossier');
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierFout, setDossierFout] = useState('');
  const [jaar, setJaar] = useState<number | null>(null);
  const [jaarGekozen, setJaarGekozen] = useState(false);
  const [keuze, setKeuze] = useState<DossierKeuze | null>(null);
  const [logoBezig, setLogoBezig] = useState(false);
  const [aandacht, setAandacht] = useState<AandachtTaak[]>([]);
  const [nieuwDagrapport, setNieuwDagrapport] = useState(false);

  const laad = useCallback(async () => {
    try {
      const res = await fetch(`/api/klanten/${id}`);
      if (!res.ok) {
        setFout(await foutTekst(res, 'De klant kon niet worden opgehaald.'));
        return;
      }
      setKlant(await res.json());
      setFout('');
    } catch {
      setFout(GEEN_VERBINDING);
    }
  }, [id]);

  useEffect(() => {
    laad();
  }, [laad]);

  // Alle objecten zijn alleen nodig voor Object koppelen op de tab Gegevens:
  // pas ophalen als die tab open gaat (en na koppelen of loskoppelen).
  const laadObjecten = useCallback(async () => {
    try {
      const obj = await fetch('/api/sample-objects');
      if (obj.ok) setAlleObjecten(await obj.json());
    } catch {
      // Zonder lijst geen koppelkeuze; de rest van het dossier werkt gewoon.
    }
  }, []);

  useEffect(() => {
    if (tab === 'gegevens') laadObjecten();
  }, [tab, laadObjecten]);

  // Contracttaken van deze klant die verlopen zijn of binnenkort moeten. Mislukt
  // het, dan geen melding (de tab Onderhoud toont de fout zelf).
  useEffect(() => {
    let actueel = true;
    fetch(`/api/contract-taken?aandacht=1&klantId=${id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: AandachtTaak[]) => { if (actueel) setAandacht(d); })
      .catch(() => {});
    return () => { actueel = false; };
  }, [id]);

  // Het dossier van één jaar (of alle jaren). De eerste keer het jongste jaar
  // met monsters (de server kiest het, ?jaar=nieuwste: één verzoek in plaats
  // van eerst alles en dan dat jaar); daarna wat Roel kiest.
  const geladenJaar = useRef<string | null>(null);
  const laadDossier = useCallback(async () => {
    try {
      const vraag = !jaarGekozen ? '?jaar=nieuwste' : jaar ? `?jaar=${jaar}` : '';
      const res = await fetch(`/api/klanten/${id}/dossier${vraag}`);
      if (!res.ok) {
        setDossierFout(await foutTekst(res, 'Het dossier kon niet worden opgehaald.'));
        return;
      }
      const d: Dossier = await res.json();
      geladenJaar.current = String(d.jaar);
      if (!jaarGekozen) {
        setJaarGekozen(true);
        setJaar(d.jaar);
      }
      setDossier(d);
      setDossierFout('');
    } catch {
      setDossierFout(GEEN_VERBINDING);
    }
  }, [id, jaar, jaarGekozen]);

  useEffect(() => {
    // Net geladen voor dit jaar (de eerste keer zet de server het jaar): niet nog eens.
    if (jaarGekozen && geladenJaar.current === String(jaar)) return;
    laadDossier();
  }, [laadDossier, jaarGekozen, jaar]);

  // Zonder keuze: het eerste object.
  const gekozen: DossierKeuze | null =
    keuze ?? (dossier?.objecten[0] ? { soort: 'object', id: dossier.objecten[0].id } : dossier?.heeftLosseMonsters ? { soort: 'los' } : null);

  const kerncijfers = useMemo(() => {
    if (!dossier) return null;
    const perMonster = new Map<number, string>();
    for (const m of dossier.momenten) {
      if (m.monsterId === null) continue;
      const oud = perMonster.get(m.monsterId);
      if (m.soort === 'monster' || !oud) perMonster.set(m.monsterId, m.soort);
      if (m.soort === 'geannuleerd') perMonster.set(m.monsterId, 'geannuleerd');
    }
    const soorten = [...perMonster.values()];
    const volgende = dossier.momenten
      .filter((m) => m.soort === 'open' && m.gepland && m.datum)
      .map((m) => m.datum!)
      .sort()[0] ?? null;
    return {
      installaties: dossier.objecten.reduce((som, o) => som + o.installaties.length, 0),
      genomen: soorten.filter((x) => x === 'monster').length,
      teNemen: soorten.filter((x) => x !== 'geannuleerd').length,
      nietBereikbaar: dossier.momenten.filter((m) => m.soort === 'niet-bereikbaar').length,
      volgende,
    };
  }, [dossier]);

  const uploadLogo = async (bestand: File) => {
    setLogoBezig(true);
    try {
      const form = new FormData();
      form.append('photo', bestand);
      const res = await fetch(`/api/klanten/${id}/logo`, { method: 'POST', body: form });
      if (!res.ok) {
        setFout(await foutTekst(res, 'Het logo is niet opgeslagen.'));
        return;
      }
      setMelding('Het logo is opgeslagen.');
      await laad();
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setLogoBezig(false);
    }
  };

  const verwijderLogo = async () => {
    if (!confirm('Het logo van deze klant verwijderen? Het klantportaal en het rapport tonen dan de naam.')) return;
    setLogoBezig(true);
    try {
      const res = await fetch(`/api/klanten/${id}/logo`, { method: 'DELETE' });
      if (!res.ok) {
        setFout(await foutTekst(res, 'Het logo is niet verwijderd.'));
        return;
      }
      setMelding('Het logo is verwijderd.');
      await laad();
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setLogoBezig(false);
    }
  };

  // Object aan deze klant koppelen of ervan loskoppelen (PUT op het object).
  const zetKlantVanObject = async (objectId: number, klantId: number | null, tekst: string) => {
    setBezig(true);
    try {
      const res = await fetch(`/api/sample-objects/${objectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ klantId }),
      });
      if (!res.ok) {
        setFout(await foutTekst(res, 'Het object is niet bijgewerkt.'));
        return;
      }
      setMelding(tekst);
      setKoppelObject('');
      await Promise.all([laad(), laadObjecten()]);
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  const herstelContact = async (persoon: Contactpersoon) => {
    const res = await fetch(`/api/contactpersonen/${persoon.id}/herstellen`, { method: 'POST' });
    if (!res.ok) return false;
    await laad();
    return true;
  };

  const verwijderKlant = async (getypt: string): Promise<string | null> => {
    if (!klant) return null;
    try {
      const res = await fetch(`/api/klanten/${klant.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bevestigNaam: getypt }),
      });
      if (!res.ok) return foutTekst(res, 'De klant is niet verwijderd.');
      setVerwijderd(true);
      setOngedaan({
        sleutel: `klant-${klant.id}`,
        tekst: `${klant.naam} verwijderd`,
        onOngedaan: async () => {
          const terug = await fetch(`/api/klanten/${klant.id}/herstellen`, { method: 'POST' });
          if (!terug.ok) return false;
          setVerwijderd(false);
          await laad();
          return true;
        },
      });
      return null;
    } catch {
      return GEEN_VERBINDING;
    }
  };

  const terug = (
    <button type="button" className="btn-link terug-link" onClick={() => router.push('/dashboard/klanten')}>
      <Icon name="arrow-left" size={16} />
      Klanten
    </button>
  );

  if (verwijderd && klant) {
    return (
      <AppShell title="Klanten" wide user={user}>
        {terug}
        <div className="leeg">
          <Icon name="empty" size={32} />
          <p style={{ margin: '0 0 12px' }}>{klant.naam} is verwijderd.</p>
          <button type="button" className="btn btn-sm" onClick={() => router.push('/dashboard/klanten')}>
            <Icon name="arrow-left" size={16} />
            Naar de klanten
          </button>
        </div>
        <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />
      </AppShell>
    );
  }

  const kanKoppelen = alleObjecten.filter((o) => o.klantId !== klant?.id);
  // Mail opstellen in de kop: de eerste contactpersoon met een e-mailadres.
  const eersteContact = klant?.contactpersonen.find((p) => p.email) ?? klant?.contactpersonen[0] ?? null;
  const rapportJaar = dossier?.jaar ?? dossier?.jaren[0]?.jaar ?? null;
  const klantSinds = klant ? new Date(klant.prospect?.klantSindsOp ?? klant.createdAt) : null;
  const kortDag = (dag: string) =>
    new Date(`${dag}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <AppShell title="Klanten" wide user={user}>
      {terug}
      {fout && <LaadFout melding={fout} onOpnieuw={laad} />}
      {!klant ? (
        fout ? null : <Laden regels={2} />
      ) : (
        <>
          {/* ---------- Kop met kerncijfers ---------- */}
          <section className="card dossier-kop">
            <div className="dossier-kop-boven">
              <div className="dossier-kop-tekst">
                <h1 className="page-title">{klant.naam}</h1>
                <div className="dossier-meta">
                  {adresTekst(klant) && (
                    <span><Icon name="map-pin" size={16} />{adresTekst(klant)}</span>
                  )}
                  {eersteContact && (
                    <span><Icon name="user" size={16} />{eersteContact.naam}{eersteContact.functie ? `, ${eersteContact.functie}` : ''}</span>
                  )}
                  {klantSinds && (
                    <span>
                      <Icon name="handshake" size={16} />
                      Klant sinds {klantSinds.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
              <div className="dossier-kop-knoppen">
                <a
                  className="btn"
                  href={mailOpstellenAdres({ email: eersteContact?.email, naam: eersteContact?.naam, bedrijf: klant.naam })}
                  target="_blank"
                  rel="noopener"
                >
                  <Icon name="mail" size={16} />
                  Mail opstellen
                </a>
                {rapportJaar ? (
                  <a className="btn" href={`/api/rapport?jaar=${rapportJaar}&klantId=${klant.id}`} download>
                    <Icon name="file-pdf" size={16} />
                    Rapport {rapportJaar} maken
                  </a>
                ) : (
                  <button type="button" className="btn" disabled title="Nog geen monsters">
                    <Icon name="file-pdf" size={16} />
                    Rapport maken
                  </button>
                )}
                <button type="button" className="btn" onClick={() => setNieuwDagrapport(true)}>
                  <Icon name="module-dagrapport" size={16} />
                  Dagrapport
                </button>
                <button type="button" className="btn" onClick={() => router.push(`/dashboard/klanten/${klant.id}/portaal`)}>
                  <Icon name="external-link" size={16} />
                  Klantportaal bekijken
                </button>
              </div>
            </div>
            {kerncijfers && (
              <div className="dossier-kerncijfers getallen">
                <div>
                  <b>{kerncijfers.installaties}</b>
                  <span>{kerncijfers.installaties === 1 ? 'installatie' : 'installaties'} op {klant.objecten.length} {klant.objecten.length === 1 ? 'object' : 'objecten'}</span>
                </div>
                <div>
                  <b>{kerncijfers.genomen} van {kerncijfers.teNemen}</b>
                  <span>monsters genomen{dossier?.jaar ? ` in ${dossier.jaar}` : ''}</span>
                </div>
                <div>
                  <b>{kerncijfers.volgende ? kortDag(kerncijfers.volgende) : 'geen'}</b>
                  <span>volgende monsterdag</span>
                </div>
                <div>
                  <b>{kerncijfers.nietBereikbaar}</b>
                  <span>niet bereikbaar, staat nog open</span>
                </div>
              </div>
            )}
          </section>

          {melding && (
            <div className="alert alert-success" role="status" style={{ marginBottom: '16px' }}>{melding}</div>
          )}

          {aandacht.length > 0 && (
            <div className="alert alert-warning dossier-aandacht" role="status">
              <Icon name="alert-warning" size={16} />
              <div>
                <strong>
                  {aandacht.length === 1 ? 'Eén contracttaak vraagt aandacht' : `${aandacht.length} contracttaken vragen aandacht`}
                </strong>
                <ul>
                  {aandacht.map((t) => (
                    <li key={t.id}>
                      {t.titel}, {t.object.name}: {termijnTekst(t.volgendeOp, vandaagNl())}
                    </li>
                  ))}
                </ul>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setTab('onderhoud')}>Onderhoud</button>
            </div>
          )}

          {/* ---------- Tabs ---------- */}
          <div className="dossier-tabbalk">
            <div className="dossier-tabs" role="tablist" aria-label="Klantdossier">
              {([
                ['dossier', 'Objecten en installaties', klant.objecten.length],
                ['onderhoud', 'Onderhoud', null],
                ['contact', 'Contactpersonen', klant.contactpersonen.length],
                ['gegevens', 'Gegevens', null],
              ] as const).map(([sleutel, naam, aantal]) => (
                <button
                  key={sleutel}
                  type="button"
                  role="tab"
                  aria-selected={tab === sleutel}
                  className={tab === sleutel ? 'on' : ''}
                  onClick={() => setTab(sleutel)}
                >
                  {naam}
                  {aantal !== null && <small>{aantal}</small>}
                </button>
              ))}
            </div>
            {tab === 'dossier' && dossier && (dossier.jaren.length > 0 || (dossier.inspectieJaren ?? []).length > 0) && (
              <label className="dossier-jaar">
                <span className="label">Jaar</span>
                <select
                  className="select"
                  value={jaar ?? ''}
                  onChange={(e) => {
                    setJaarGekozen(true);
                    setJaar(e.target.value ? Number(e.target.value) : null);
                  }}
                >
                  {[...new Set([...dossier.jaren.map((j) => j.jaar), ...(dossier.inspectieJaren ?? [])])]
                    .sort((a, b) => b - a)
                    .map((j) => (
                      <option key={j} value={j}>{j}</option>
                    ))}
                  <option value="">Alle jaren</option>
                </select>
              </label>
            )}
          </div>

          {tab === 'dossier' && (
            <>
              {dossierFout && <LaadFout melding={dossierFout} onOpnieuw={laadDossier} />}
              {!dossier ? (
                dossierFout ? null : <Laden regels={3} soort="lijst" />
              ) : (
                <DossierTijdlijn
                  klantId={klant.id}
                  dossier={dossier}
                  keuze={gekozen}
                  onKies={setKeuze}
                  onNieuweInstallatie={(o) =>
                    setNieuweInstallatie({ id: o.id, name: o.name, objectType: o.objectType, region: o.region, address: o.address, aantalMonsters: 0, installaties: [] })
                  }
                />
              )}
            </>
          )}

          {tab === 'onderhoud' && <OnderhoudTab klant={{ id: klant.id, naam: klant.naam }} />}
          {nieuwDagrapport && <NieuwDagrapport vasteKlant={{ id: klant.id, naam: klant.naam }} onClose={() => setNieuwDagrapport(false)} />}

          {tab === 'contact' && (
            <section className="card beheer-kaart">
              <div className="beheer-kaart-kop">
                <h2 className="section-label">Contactpersonen</h2>
                <button type="button" className="btn btn-sm" onClick={() => setContact({ persoon: null })}>
                  <Icon name="user-plus" size={16} />
                  Toevoegen
                </button>
              </div>
              {klant.contactpersonen.length === 0 ? (
                <p className="hint">Nog geen contactpersonen.</p>
              ) : (
                <ul className="beheer-lijst">
                  {klant.contactpersonen.map((p) => (
                    <li key={p.id} className="beheer-lijst-regel">
                      <div className="beheer-lijst-tekst">
                        <strong>{p.naam}</strong>
                        {p.functie && <span className="beheer-bijzaak">{p.functie}</span>}
                        <span className="beheer-contact">
                          {p.email && (
                            <a href={`mailto:${p.email}`} className="btn-link">
                              <Icon name="mail" size={16} />
                              {p.email}
                            </a>
                          )}
                          {p.telefoon && (
                            <a href={`tel:${p.telefoon.replace(/\s/g, '')}`} className="btn-link">
                              <Icon name="phone" size={16} />
                              {p.telefoon}
                            </a>
                          )}
                        </span>
                      </div>
                      <div className="rij-knoppen">
                        <a
                          className="btn btn-sm"
                          href={mailOpstellenAdres({ email: p.email, naam: p.naam, bedrijf: klant.naam })}
                          target="_blank"
                          rel="noopener"
                        >
                          <Icon name="module-email" size={16} />
                          Mail opstellen
                        </a>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setContact({ persoon: p })}
                          title="Bewerken"
                          aria-label={`${p.naam} bewerken`}
                        >
                          <Icon name="pencil" size={16} />
                          <span className="alleen-mobiel">Bewerken</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'gegevens' && (
            <>
              <div className="beheer-grid">
                <div className="beheer-kolom">
                  <section className="card beheer-kaart">
                    <div className="beheer-kaart-kop">
                      <h2 className="section-label">Gegevens</h2>
                      <button type="button" className="btn btn-sm" onClick={() => setBewerken(true)}>
                        <Icon name="pencil" size={16} />
                        Bewerken
                      </button>
                    </div>
                    <dl className="gegevens-lijst">
                      <dt>Adres</dt>
                      <dd>{adresTekst(klant) || '-'}</dd>
                      <dt>KvK-nummer</dt>
                      <dd>{klant.kvkNummer || '-'}</dd>
                      {klant.notities && (
                        <>
                          <dt>Notities</dt>
                          <dd className="gegevens-notitie">{klant.notities}</dd>
                        </>
                      )}
                      {klant.prospect && (
                        <>
                          <dt>Acquisitie</dt>
                          <dd>
                            <a className="btn-link" href="/dashboard/acquisitie">
                              <Icon name="module-acquisitie" size={16} />
                              Klant geworden via de acquisitie
                              {klant.prospect.klantSindsOp ? `, ${new Date(klant.prospect.klantSindsOp).toLocaleDateString('nl-NL')}` : ''}
                            </a>
                          </dd>
                        </>
                      )}
                      <dt>Kijkt mee</dt>
                      <dd>
                        {klant.gebruikers.length === 0
                          ? 'Niemand'
                          : klant.gebruikers
                              .map(
                                (g) =>
                                  `${g.username} (${ROLE_LABELS[g.role] ?? g.role}${g.viewYear ? `, ${g.viewYear}` : ''}, ${WEERGAVE_LABELS[leesWeergave(g.portaalWeergave)].toLowerCase()})`
                              )
                              .join(', ')}
                      </dd>
                    </dl>
                    <p className="hint">Wie meekijkt en hoe, stel je in bij Instellingen, Gebruikers.</p>
                  </section>

                  <section className="card beheer-kaart">
                    <h2 className="section-label">Logo</h2>
                    {klant.logoUrl ? (
                      <img src={klant.logoUrl} alt={`Logo van ${klant.naam}`} className="dossier-logo" />
                    ) : (
                      <p className="hint">Nog geen logo. Het klantportaal en het rapport tonen dan de naam.</p>
                    )}
                    <div className="knoppenrij" style={{ marginTop: '10px' }}>
                      <label className={`btn btn-sm${logoBezig ? ' is-bezig' : ''}`}>
                        <Icon name="image-upload" size={16} />
                        {logoBezig ? 'Bezig...' : klant.logoUrl ? 'Ander logo' : 'Logo toevoegen'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          style={{ display: 'none' }}
                          disabled={logoBezig}
                          onChange={(e) => {
                            const bestand = e.target.files?.[0];
                            if (bestand) uploadLogo(bestand);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {klant.logoUrl && (
                        <button type="button" className="btn btn-sm btn-ghost" onClick={verwijderLogo} disabled={logoBezig}>
                          <Icon name="image-remove" size={16} />
                          Logo verwijderen
                        </button>
                      )}
                    </div>
                  </section>
                </div>

                <div className="beheer-kolom">
                  <section className="card beheer-kaart">
                    <h2 className="section-label">Objecten</h2>
                    {klant.objecten.length === 0 && <p className="hint">Nog geen objecten bij deze klant.</p>}
                    {klant.objecten.map((o) => (
                      <div key={o.id} className="object-blok">
                        <div className="object-blok-kop">
                          <span className="beheer-naam" title={objectTypeLabel(o.objectType)}>
                            <Icon name={objectTypeIcoon(o.objectType)} size={16} />
                            {o.name}
                          </span>
                          <span className="beheer-bijzaak">
                            {o.aantalMonsters} {o.aantalMonsters === 1 ? 'monster' : 'monsters'}, {o.installaties.length}{' '}
                            {o.installaties.length === 1 ? 'installatie' : 'installaties'}
                          </span>
                        </div>
                        <div className="knoppenrij object-blok-knoppen">
                          <button type="button" className="btn btn-sm" onClick={() => setNieuweInstallatie(o)}>
                            <Icon name="plus" size={16} />
                            Installatie toevoegen
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            disabled={bezig}
                            onClick={() => {
                              if (confirm(`${o.name} loskoppelen van ${klant.naam}?\n\nHet object, de monsters en de installaties blijven bestaan; het object hoort daarna bij geen klant.`)) {
                                zetKlantVanObject(o.id, null, `${o.name} hoort niet meer bij ${klant.naam}.`);
                              }
                            }}
                          >
                            Loskoppelen
                          </button>
                        </div>
                      </div>
                    ))}

                    {kanKoppelen.length > 0 && (
                      <div className="object-koppelen">
                        <label className="label" htmlFor="koppel-object">Bestaand object koppelen</label>
                        <div className="object-koppelen-rij">
                          <select id="koppel-object" className="select" value={koppelObject} onChange={(e) => setKoppelObject(e.target.value)}>
                            <option value="">Kies een object</option>
                            {kanKoppelen.map((o) => (
                              <option key={o.id} value={String(o.id)}>
                                {o.name}{o.klant ? ` (nu bij ${o.klant.naam})` : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn"
                            disabled={!koppelObject || bezig}
                            onClick={() => {
                              const o = kanKoppelen.find((x) => String(x.id) === koppelObject);
                              if (o) zetKlantVanObject(o.id, klant.id, `${o.name} hoort nu bij ${klant.naam}.`);
                            }}
                          >
                            <Icon name="plus" size={16} />
                            Koppelen
                          </button>
                        </div>
                        <p className="hint">Een nieuw object maak je aan bij Beheer, Objecten.</p>
                      </div>
                    )}
                  </section>
                </div>
              </div>

              <VeiligVerwijderBlok
                id={`klant-${klant.id}`}
                kop="Klant verwijderen"
                uitleg={
                  <p style={{ margin: 0 }}>
                    {klant.naam} verdwijnt uit de lijst, met {klant.contactpersonen.length === 1 ? 'de contactpersoon' : `de ${klant.contactpersonen.length} contactpersonen`}.
                    Dat kan alleen als er geen objecten en geen meekijkers meer aan hangen. De gegevens blijven bewaard en
                    direct daarna kun je het ongedaan maken.
                  </p>
                }
                bevestig={klant.naam}
                knop={`${klant.naam} verwijderen`}
                onVerwijder={verwijderKlant}
              />
            </>
          )}

          {bewerken && (
            <KlantFormulier
              open
              klant={klant}
              onClose={() => setBewerken(false)}
              onOpgeslagen={() => {
                setBewerken(false);
                setMelding('De gegevens zijn opgeslagen.');
                laad();
              }}
            />
          )}

          {contact && (
            <ContactpersoonFormulier
              key={contact.persoon?.id ?? 'nieuw'}
              open
              klantId={klant.id}
              persoon={contact.persoon}
              onClose={() => setContact(null)}
              onOpgeslagen={() => {
                setContact(null);
                laad();
              }}
              onWeggehaald={(p) => {
                setContact(null);
                laad();
                setOngedaan({ sleutel: `contact-${p.id}`, tekst: `${p.naam} weggehaald`, onOngedaan: () => herstelContact(p) });
              }}
            />
          )}

          {nieuweInstallatie && (
            <InstallatieFormulier
              open
              installatie={null}
              vastObject={{ id: nieuweInstallatie.id, name: nieuweInstallatie.name }}
              onClose={() => setNieuweInstallatie(null)}
              onOpgeslagen={(i) => {
                setNieuweInstallatie(null);
                setMelding(`${i.naam} is toegevoegd, met code ${i.code}.`);
                laad();
                laadDossier();
              }}
            />
          )}

          <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />
        </>
      )}
    </AppShell>
  );
}
