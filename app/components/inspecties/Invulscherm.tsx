'use client';

/*
  Een inspectie invullen (/dashboard/inspecties/[id]), in de vorm van het
  veldscherm (STIJL.md, Veldscherm): op de telefoon een eigen navy kop, grote
  regels van 64px en onderaan in duimbereik de enige oranje knop, Lek toevoegen,
  Arbeidsmiddel toevoegen of Locatie toevoegen. Een tik op een regel opent de
  bevinding. Met Lijst plakken komt een hele werklijst er in één keer in
  (PlakVenster).

  Links (op de telefoon bovenaan): uitkomst in kengetallen, doorverwijzingen en
  de bevindingen. Rechts (op de telefoon eronder): gegevens, rekeninstellingen,
  rapport en afronden, en onderaan het blok om de inspectie te verwijderen.
  De beheerder vult in; een gebruiker ziet alles alleen.
*/

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { AppShell, Icon, Laden } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import OngedaanMelding, { type OngedaanInhoud } from '@/app/components/OngedaanMelding';
import VeiligVerwijderBlok from '@/app/components/VeiligVerwijderBlok';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { INSPECTIE_STATUS_BADGE, INSPECTIE_STATUS_LABELS, oordeelVan, sjabloonVan, type InstellingVeld } from '@/lib/inspecties/sjablonen';
import { aantalNietGoed, berekenLek, co2Tekst, euro, nl } from '@/lib/inspecties/rekenen';
import { ROLE_ADMIN } from '@/lib/roles';
import BevindingVenster from './BevindingVenster';
import PlakVenster from './PlakVenster';
import WachtrijOverzicht from '@/app/components/wachtrij/WachtrijOverzicht';
import { useWachtrij } from '@/app/components/wachtrij/useWachtrij';
import VeldOffline from '@/app/components/wachtrij/VeldOffline';
import GeenVerbinding from '@/app/components/GeenVerbinding';
import { dagKort, type Bevinding, type Inspectie, type InstallatieKort } from './types';

export default function Invulscherm({ inspectieId }: { inspectieId: number }) {
  const user = useGebruiker();
  const router = useRouter();
  const isAdmin = user.role === ROLE_ADMIN;
  const [insp, setInsp] = useState<Inspectie | null>(null);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [venster, setVenster] = useState<{ item: Bevinding | null } | null>(null);
  const [plakken, setPlakken] = useState(false);
  const [installaties, setInstallaties] = useState<InstallatieKort[]>([]);
  const [ongedaan, setOngedaan] = useState<OngedaanInhoud | null>(null);
  const [verwijderd, setVerwijderd] = useState(false);
  const wachtrij = useWachtrij(isAdmin ? user.username : '').filter((i) => i.soort === 'inspectie-item' && i.inspectieId === inspectieId);
  const inWachtrij = wachtrij.length;
  const vorigInWachtrij = useRef(inWachtrij);

  const laad = useCallback(async () => {
    try {
      const res = await fetch(`/api/inspecties/${inspectieId}`);
      if (!res.ok) {
        setFout(await foutTekst(res, 'De inspectie kon niet worden opgehaald.'));
        return;
      }
      const data: Inspectie = await res.json();
      setInsp(data);
      setFout('');
    } catch {
      setFout(GEEN_VERBINDING);
    }
  }, [inspectieId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laad();
  }, [laad]);

  // Is er een bevinding uit de wachtrij verstuurd, dan de inspectie opnieuw ophalen.
  useEffect(() => {
    if (inWachtrij < vorigInWachtrij.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMelding((m) => (m.includes('op deze telefoon bewaard') ? '' : m));
      if (navigator.onLine) laad();
    }
    vorigInWachtrij.current = inWachtrij;
  }, [inWachtrij, laad]);

  // De arbeidsmiddelen kies je uit de installaties van de klant.
  const klantId = insp?.klantId;
  const kiesUitInstallaties = insp ? sjabloonVan(insp.sjabloon).item.kiesInstallatie : false;
  useEffect(() => {
    if (!isAdmin || !klantId || !kiesUitInstallaties) return;
    let actief = true;
    fetch(`/api/installaties?klantId=${klantId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (actief) setInstallaties(d); })
      .catch(() => {});
    return () => { actief = false; };
  }, [isAdmin, klantId, kiesUitInstallaties]);

  const bewaar = async (body: Record<string, unknown>, gelukt: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/inspecties/${inspectieId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De inspectie is niet opgeslagen.'));
        return false;
      }
      setInsp(await res.json());
      setFout('');
      setMelding(gelukt);
      return true;
    } catch {
      setFout(GEEN_VERBINDING);
      return false;
    }
  };

  const weghalen = async (item: Bevinding) => {
    try {
      const res = await fetch(`/api/inspectie-items/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De bevinding is niet weggehaald.'));
        return;
      }
      setInsp(await res.json());
      setVenster(null);
      setOngedaan({
        sleutel: `bevinding-${item.id}`,
        tekst: `${item.titel} weggehaald`,
        onOngedaan: async () => {
          const terug = await fetch(`/api/inspectie-items/${item.id}/herstellen`, { method: 'POST' });
          if (!terug.ok) return false;
          setInsp(await terug.json());
          return true;
        },
      });
    } catch {
      setFout(GEEN_VERBINDING);
    }
  };

  const verwijder = async (getypt: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/inspecties/${inspectieId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bevestig: getypt }),
      });
      if (!res.ok) return foutTekst(res, 'De inspectie is niet verwijderd.');
      setVerwijderd(true);
      setOngedaan({
        sleutel: `inspectie-${inspectieId}`,
        tekst: `${insp?.nummer ?? 'Inspectie'} verwijderd`,
        onOngedaan: async () => {
          const terug = await fetch(`/api/inspecties/${inspectieId}/herstellen`, { method: 'POST' });
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

  const s = insp ? sjabloonVan(insp.sjabloon) : null;

  const kop = (
    <header className="veld-kop">
      <Link prefetch={false} href="/dashboard/inspecties" className="veld-terug" aria-label="Terug naar de inspecties">
        <Icon name="arrow-left" />
      </Link>
      <div className="veld-kop-tekst">
        <h1>{s?.naam ?? 'Inspectie'}</h1>
        <p>{insp ? `${insp.klant.naam}, ${insp.object.name}, ${dagKort(insp.datum)}` : ' '}</p>
      </div>
    </header>
  );

  if (verwijderd) {
    return (
      <AppShell title="Inspecties" wide veld user={user}>
        <div className="veld">
          {kop}
          <div className="leeg">
            <Icon name="empty" size={32} />
            <p style={{ margin: '0 0 12px' }}>De inspectie is verwijderd.</p>
            <button type="button" className="btn btn-sm" onClick={() => router.push('/dashboard/inspecties')}>
              <Icon name="arrow-left" size={16} />
              Naar de inspecties
            </button>
          </div>
        </div>
        <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />
      </AppShell>
    );
  }

  return (
    <AppShell title="Inspecties" wide veld user={user}>
      <VeldOffline api={`/api/inspecties/${inspectieId}`} />
      <div className="veld">
        {kop}
        <GeenVerbinding tekst="Een nieuwe bevinding wordt op deze telefoon bewaard en gaat vanzelf mee zodra er bereik is. Wijzigen en afronden lukken pas weer met bereik." />
        {fout && <LaadFout melding={fout} onOpnieuw={laad} />}
        {!insp || !s ? (
          fout ? null : <Laden regels={3} soort="lijst" />
        ) : (
          <div className="veld-indeling">
            <div className="veld-kolom">
              <div className="insp-statusregel">
                <span className={`badge ${INSPECTIE_STATUS_BADGE[insp.status]}`}>
                  <Icon name={insp.status === 'afgerond' ? 'status-taken' : 'pencil'} size={16} />
                  {INSPECTIE_STATUS_LABELS[insp.status]}
                </span>
                <span className="badge badge-gray code-badge">{insp.nummer}</span>
                <span className="insp-statusregel-tekst">
                  {insp.installatie ? `${insp.installatie.naam}, ` : ''}door {insp.uitvoerder}
                </span>
              </div>

              {melding && <div className="alert alert-success" role="status">{melding}</div>}
              <WachtrijOverzicht lijst={wachtrij} gebruiker={user.username} />

              <Uitkomst insp={insp} />

              {insp.items.filter((i) => i.waarschuwing).map((i) => (
                <div key={i.id} className="alert alert-warning" role="note">
                  <Icon name="alert-warning" size={20} />
                  <span><b>{i.titel}.</b> {i.waarschuwing}</span>
                </div>
              ))}

              <section className="veld-sectie" aria-labelledby="kop-bevindingen">
                <div className="sectiekop">
                  <h2 id="kop-bevindingen">{s.item.meervoud[0].toUpperCase() + s.item.meervoud.slice(1)}</h2>
                  <small>{insp.items.length}</small>
                </div>
                {insp.items.length === 0 ? (
                  <div className="card leeg">
                    <Icon name={s.icoon} size={32} />
                    <p style={{ margin: 0 }}>
                      Nog geen {s.item.meervoud}.{isAdmin ? ` Tik op ${s.item.nieuw} om te beginnen.` : ''}
                    </p>
                  </div>
                ) : (
                  <ul className="veld-lijst">
                    {insp.items.map((i) => (
                      <li key={i.id}>
                        <Regel insp={insp} item={i} onOpen={isAdmin && insp.status !== 'afgerond' ? () => setVenster({ item: i }) : undefined} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {isAdmin && insp.status !== 'afgerond' && (
                <div className="knoppenrij">
                  <button type="button" className="btn" onClick={() => setPlakken(true)}>
                    <Icon name="copy" size={16} />
                    Lijst plakken
                  </button>
                </div>
              )}

              {isAdmin && insp.status !== 'afgerond' && (
                <div className="veld-actiebalk">
                  <button type="button" className="btn btn-primary veld-hoofdknop" onClick={() => setVenster({ item: null })}>
                    <Icon name="plus" />
                    {s.item.nieuw}
                  </button>
                </div>
              )}
            </div>

            <div className="veld-kolom">
              <Gegevens insp={insp} isAdmin={isAdmin} onBewaar={bewaar} />
              {s.instellingen.length > 0 && <Instellingen insp={insp} isAdmin={isAdmin} onBewaar={bewaar} />}

              <section className="card insp-kaart" aria-labelledby="kop-rapport">
                <h2 id="kop-rapport" className="insp-kaart-kop">Rapport</h2>
                <p className="hint" style={{ marginTop: 0 }}>
                  {insp.status === 'afgerond'
                    ? `Afgerond${insp.afgerondDoor ? ` door ${insp.afgerondDoor}` : ''}. De klant ziet het rapport in het klantportaal.`
                    : 'Concept: de klant ziet deze inspectie pas als hij is afgerond.'}
                </p>
                <div className="knoppenrij">
                  <a className="btn" href={`/api/inspecties/${insp.id}/rapport`} download>
                    <Icon name="file-pdf" size={16} />
                    Rapport downloaden
                  </a>
                  {isAdmin &&
                    (insp.status === 'concept' ? (
                      <button type="button" className="btn" onClick={() => bewaar({ status: 'afgerond' }, 'De inspectie is afgerond.')}>
                        <Icon name="status-taken" size={16} />
                        Afronden
                      </button>
                    ) : (
                      <button type="button" className="btn btn-ghost" onClick={() => bewaar({ status: 'concept' }, 'De inspectie staat weer op concept.')}>
                        <Icon name="reset" size={16} />
                        Terug naar concept
                      </button>
                    ))}
                </div>
              </section>

              {isAdmin && (
                <VeiligVerwijderBlok
                  id={`inspectie-${insp.id}`}
                  kop="Inspectie verwijderen"
                  uitleg={
                    <p style={{ margin: 0 }}>
                      {insp.nummer} met {insp.items.length} {insp.items.length === 1 ? s.item.enkel : s.item.meervoud} verdwijnt uit de lijsten, het dossier en het klantportaal.
                      De gegevens blijven bewaard en direct daarna kun je het ongedaan maken.
                    </p>
                  }
                  bevestig={insp.nummer}
                  knop={`${insp.nummer} verwijderen`}
                  onVerwijder={verwijder}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {venster && insp && (
        <BevindingVenster
          key={venster.item?.id ?? 'nieuw'}
          inspectie={insp}
          item={venster.item}
          installaties={installaties}
          onClose={() => setVenster(null)}
          onOpgeslagen={(nieuw, sluiten) => {
            setInsp(nieuw);
            setMelding('');
            if (sluiten) setVenster(null);
          }}
          onWeghalen={weghalen}
          onBewaard={(tekst, sluiten) => {
            setMelding(tekst);
            if (sluiten) setVenster(null);
          }}
        />
      )}
      {plakken && insp && (
        <PlakVenster
          inspectie={insp}
          onClose={() => setPlakken(false)}
          onOpgeslagen={(nieuw, aantal) => {
            setInsp(nieuw);
            setPlakken(false);
            setMelding(`${aantal} ${aantal === 1 ? sjabloonVan(nieuw.sjabloon).item.enkel : sjabloonVan(nieuw.sjabloon).item.meervoud} toegevoegd.`);
          }}
        />
      )}
      <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />
    </AppShell>
  );
}

function Uitkomst({ insp }: { insp: Inspectie }) {
  const t = insp.totalen;
  if (t.soort === 'persluchtlekken') {
    return (
      <section className="card insp-uitkomst" aria-label="Uitkomst">
        <div className="kengetallen insp-kengetallen">
          <Kengetal waarde={nl(t.aantal)} label={t.aantal === 1 ? 'lek' : 'lekken'} />
          <Kengetal waarde={`${nl(t.verliesLpm, 1)}`} label="l/min verlies" />
          <Kengetal waarde={euro(t.kostenPerJaar)} label="per jaar" />
          <Kengetal waarde={co2Tekst(t.co2KgPerJaar).replace(' CO2', '')} label="CO2 per jaar" />
        </div>
        <p className="insp-besparing">
          <Icon name="status-taken" size={16} />
          {t.gerepareerd > 0
            ? `Besparing na reparatie ${euro(t.besparingKosten)} per jaar (${t.gerepareerd} van ${t.aantal}). Nog te halen: ${euro(t.openKosten)}.`
            : t.aantal > 0
              ? `Alles gerepareerd scheelt ${euro(t.kostenPerJaar)} en ${co2Tekst(t.co2KgPerJaar)} per jaar.`
              : 'Nog geen lekken ingevuld.'}
        </p>
      </section>
    );
  }
  if (t.soort === 'markering') {
    return (
      <section className="card insp-uitkomst" aria-label="Uitkomst">
        <div className="kengetallen insp-kengetallen">
          <Kengetal waarde={nl(t.aantal)} label={t.aantal === 1 ? 'locatie' : 'locaties'} />
          <Kengetal waarde={nl(t.gemarkeerd)} label="gemarkeerd" />
          <Kengetal waarde={nl(t['niet-bereikbaar'] + t['niet-aangetroffen'])} label="niet bereikbaar of aangetroffen" />
          <Kengetal waarde={nl(t.stickers)} label={t.stickers === 1 ? 'sticker' : 'stickers'} />
        </div>
        {t.zonderUitslag > 0 && (
          <p className="insp-besparing insp-neutraal">
            <Icon name="status-round-open" size={16} />
            Nog {t.zonderUitslag} {t.zonderUitslag === 1 ? 'locatie' : 'locaties'} zonder uitslag. Afronden kan pas als elke locatie er een heeft.
          </p>
        )}
      </section>
    );
  }
  return (
    <section className="card insp-uitkomst" aria-label="Uitkomst">
      <div className="kengetallen insp-kengetallen">
        <Kengetal waarde={nl(t.aantal)} label={t.aantal === 1 ? 'arbeidsmiddel' : 'arbeidsmiddelen'} />
        <Kengetal waarde={nl(t['in-orde'])} label="in orde" />
        <Kengetal waarde={nl(t['actie-nodig'])} label="actie nodig" />
        <Kengetal waarde={nl(t['buiten-gebruik'])} label="buiten gebruik" />
      </div>
      {insp.volgende && (
        <p className="insp-besparing">
          <Icon name="calendar" size={16} />
          Eerstvolgende inspectie {dagKort(insp.volgende)}
        </p>
      )}
    </section>
  );
}

function Kengetal({ waarde, label }: { waarde: string; label: string }) {
  return (
    <div className="kengetal">
      <span className="kengetal-waarde">{waarde}</span>
      <span className="kengetal-label">{label}</span>
    </div>
  );
}

function Regel({ insp, item, onOpen }: { insp: Inspectie; item: Bevinding; onOpen?: () => void }) {
  const s = sjabloonVan(insp.sjabloon);
  const oordeel = oordeelVan(s, item.oordeel);
  let onder: string;
  if (insp.totalen.soort === 'markering') {
    const stickers = typeof item.waarden?.stickers === 'number' ? item.waarden.stickers : null;
    onder = [item.locatie, stickers !== null ? `${nl(stickers)} ${stickers === 1 ? 'sticker' : 'stickers'}` : null].filter(Boolean).join(', ');
  } else if (insp.totalen.soort === 'persluchtlekken') {
    const lpm = typeof item.waarden?.verliesLpm === 'number' ? item.waarden.verliesLpm : null;
    const b = berekenLek(lpm, insp.totalen.instellingen);
    onder = [lpm !== null ? `${nl(lpm, 1)} l/min` : 'verlies onbekend', `${euro(b.kostenPerJaar)} per jaar`].join(', ');
  } else {
    const niet = aantalNietGoed(item.waarden);
    onder = [item.locatie, niet > 0 ? `${niet} ${niet === 1 ? 'punt' : 'punten'} niet goed` : null, item.volgendeOp ? `volgende ${dagKort(item.volgendeOp)}` : null]
      .filter(Boolean)
      .join(', ');
  }
  const lek = insp.sjabloon === 'persluchtlekken';
  const inhoud = (
    <>
      {lek ? (
        <span className={`insp-label getal${item.gerepareerd ? ' insp-label-klaar' : ''}`}>{item.titel}</span>
      ) : (
        <span className="icoonvak" aria-hidden="true"><Icon name={item.waarschuwing ? 'alert-warning' : s.icoon} size={20} /></span>
      )}
      <span className="veld-lijst-tekst">
        <strong>{lek ? item.locatie || 'Zonder locatie' : item.titel}</strong>
        <span>{onder || 'Nog niets ingevuld'}</span>
      </span>
      {item.fotos.length > 0 && (
        <span className="insp-fototal" title={`${item.fotos.length} foto's`} aria-label={`${item.fotos.length} ${item.fotos.length === 1 ? 'foto' : "foto's"}`}>
          <Icon name="camera" size={16} />
          {item.fotos.length > 1 && <small className="getal">{item.fotos.length}</small>}
        </span>
      )}
      {lek && item.gerepareerd ? (
        <span className="badge badge-success"><Icon name="check" size={16} />Gerepareerd</span>
      ) : oordeel ? (
        <span className={`badge ${oordeel.badge}`}><Icon name={oordeel.icoon} size={16} />{oordeel.label}</span>
      ) : !lek ? (
        <span className="badge badge-gray"><Icon name="status-round-open" size={16} />Nog geen uitslag</span>
      ) : null}
    </>
  );
  return onOpen ? (
    <button type="button" className="veld-lijst-regel" onClick={onOpen} aria-label={`${lek ? `Lek ${item.titel}` : item.titel} openen`}>
      {inhoud}
    </button>
  ) : (
    <div className="veld-lijst-regel">{inhoud}</div>
  );
}

function Gegevens({ insp, isAdmin, onBewaar }: { insp: Inspectie; isAdmin: boolean; onBewaar: (b: Record<string, unknown>, m: string) => Promise<boolean> }) {
  const s = sjabloonVan(insp.sjabloon);
  const [velden, setVelden] = useState({ datum: insp.datum, uitvoerder: insp.uitvoerder, samenvatting: insp.samenvatting ?? '', volgendeOp: insp.volgendeOp ?? '' });
  const [bezig, setBezig] = useState(false);
  const zet = (k: keyof typeof velden) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setVelden((v) => ({ ...v, [k]: e.target.value }));

  if (!isAdmin) {
    return (
      <section className="card insp-kaart" aria-labelledby="kop-gegevens">
        <h2 id="kop-gegevens" className="insp-kaart-kop">Gegevens</h2>
        <dl className="gegevens-lijst">
          <dt>Datum</dt><dd>{dagKort(insp.datum)}</dd>
          <dt>Uitgevoerd door</dt><dd>{insp.uitvoerder}</dd>
          {s.heeftVolgende && (<><dt>Volgende inspectie</dt><dd>{dagKort(insp.volgende)}</dd></>)}
          {insp.samenvatting && (<><dt>Samenvatting</dt><dd className="gegevens-notitie">{insp.samenvatting}</dd></>)}
        </dl>
      </section>
    );
  }

  return (
    <section className="card insp-kaart" aria-labelledby="kop-gegevens">
      <h2 id="kop-gegevens" className="insp-kaart-kop">Gegevens</h2>
      <form
        className="veldwerk"
        onSubmit={async (e) => {
          e.preventDefault();
          setBezig(true);
          const { volgendeOp, ...rest } = velden;
          await onBewaar(s.heeftVolgende ? { ...rest, volgendeOp: volgendeOp || null } : rest, 'De gegevens zijn opgeslagen.');
          setBezig(false);
        }}
      >
        <div className="insp-twee">
          <div className="veld">
            <label className="label" htmlFor="ig-datum">Datum</label>
            <input id="ig-datum" type="date" className="input" value={velden.datum} onChange={zet('datum')} required />
          </div>
          {s.heeftVolgende && (
            <div className="veld">
              <label className="label" htmlFor="ig-volgende">{s.volgendePerItem ? 'Volgende inspectie (geheel)' : 'Volgende inspectie'}</label>
              <input id="ig-volgende" type="date" className="input" value={velden.volgendeOp} onChange={zet('volgendeOp')} />
            </div>
          )}
        </div>
        <div className="veld">
          <label className="label" htmlFor="ig-uitvoerder">Uitgevoerd door</label>
          <input id="ig-uitvoerder" className="input" value={velden.uitvoerder} onChange={zet('uitvoerder')} required />
        </div>
        <div className="veld">
          <label className="label" htmlFor="ig-samenvatting">Samenvatting voor de klant</label>
          <textarea id="ig-samenvatting" className="textarea" rows={3} value={velden.samenvatting} onChange={zet('samenvatting')} />
        </div>
        {s.volgendePerItem && <p className="hint" style={{ margin: 0 }}>Elk arbeidsmiddel heeft een eigen datum; de vroegste telt als volgende inspectie.</p>}
        <div className="knoppenrij">
          <button type="submit" className="btn" disabled={bezig}>
            <Icon name="check" size={16} />
            {bezig ? 'Bezig...' : 'Opslaan'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Instellingen({ insp, isAdmin, onBewaar }: { insp: Inspectie; isAdmin: boolean; onBewaar: (b: Record<string, unknown>, m: string) => Promise<boolean> }) {
  const s = sjabloonVan(insp.sjabloon);
  const begin = Object.fromEntries(s.instellingen.map((v) => [v.sleutel, insp.instellingen[v.sleutel] === null || insp.instellingen[v.sleutel] === undefined ? '' : String(insp.instellingen[v.sleutel]).replace('.', ',')]));
  const [velden, setVelden] = useState<Record<string, string>>(begin);
  const [bezig, setBezig] = useState(false);
  const lek = insp.totalen.soort === 'persluchtlekken' ? insp.totalen.instellingen : null;

  const zichtbaar = (v: InstellingVeld) => {
    if (v.sleutel === 'prijsKwh') return velden.prijsmodel !== 'm3';
    if (v.sleutel === 'prijsM3') return velden.prijsmodel === 'm3';
    return true;
  };

  return (
    <section className="card insp-kaart" aria-labelledby="kop-instellingen">
      <h2 id="kop-instellingen" className="insp-kaart-kop">
        <Icon name="gauge" size={16} />
        {insp.sjabloon === 'persluchtlekken' ? 'Uitgangspunten voor de berekening' : insp.sjabloon === 'markering' ? 'Gegevens voor het rapport' : 'Verklaring in het rapport'}
      </h2>
      <form
        className="veldwerk"
        onSubmit={async (e) => {
          e.preventDefault();
          setBezig(true);
          const body = Object.fromEntries(s.instellingen.map((v) => [v.sleutel, velden[v.sleutel] === '' ? null : velden[v.sleutel]]));
          await onBewaar({ instellingen: body }, insp.sjabloon === 'persluchtlekken' ? 'De uitgangspunten zijn opgeslagen.' : 'De gegevens voor het rapport zijn opgeslagen.');
          setBezig(false);
        }}
      >
        <div className="insp-twee">
          {s.instellingen.filter(zichtbaar).map((v) => (
            <div key={v.sleutel} className={`veld${v.soort === 'tekst' ? ' insp-breed' : ''}`}>
              <label className="label" htmlFor={`in-${v.sleutel}`}>
                {v.label}
                {v.soort === 'getal' && v.eenheid ? ` (${v.eenheid})` : ''}
              </label>
              {v.soort === 'keuze' ? (
                <select id={`in-${v.sleutel}`} className="select" value={velden[v.sleutel]} disabled={!isAdmin} onChange={(e) => setVelden((x) => ({ ...x, [v.sleutel]: e.target.value }))}>
                  {v.keuzes.map((k) => (
                    <option key={k.waarde} value={k.waarde}>{k.label}</option>
                  ))}
                </select>
              ) : v.soort === 'tekst' ? (
                <textarea id={`in-${v.sleutel}`} className="textarea" rows={2} value={velden[v.sleutel]} disabled={!isAdmin} onChange={(e) => setVelden((x) => ({ ...x, [v.sleutel]: e.target.value }))} />
              ) : (
                <input
                  id={`in-${v.sleutel}`}
                  className="input"
                  inputMode="decimal"
                  value={velden[v.sleutel]}
                  disabled={!isAdmin}
                  placeholder={v.sleutel === 'kwhPerM3' && lek ? `${nl(lek.kwhPerM3, 3)} uit de netdruk` : undefined}
                  onChange={(e) => setVelden((x) => ({ ...x, [v.sleutel]: e.target.value }))}
                />
              )}
              {v.hint && <p className="hint">{v.hint}</p>}
            </div>
          ))}
        </div>
        {isAdmin && (
          <div className="knoppenrij">
            <button type="submit" className="btn" disabled={bezig}>
              <Icon name="check" size={16} />
              {bezig ? 'Bezig...' : insp.sjabloon === 'persluchtlekken' ? 'Opslaan en opnieuw rekenen' : 'Opslaan'}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
