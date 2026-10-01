'use client';

/*
  Een dagrapport invullen en laten tekenen (/dashboard/dagrapporten/[id]), in de
  vorm van het veldscherm (STIJL.md, Veldscherm): op de telefoon een eigen navy
  kop, velden van 52 tot 56 px en onderaan in duimbereik de enige oranje knop.

  Concept: wat je deed, bevindingen, uren, foto's, en de klant tekent met de
  vinger op het scherm (HandtekeningVeld). Tekenen slaat eerst de velden op en
  legt het rapport daarna vast. Getekend: alles alleen te lezen, PDF
  downloaden, en onder Beheer de handtekening wissen (dan tekent de klant
  opnieuw) of het rapport verwijderen. Een gebruiker ziet alles alleen.
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
import HandtekeningVeld, { type HandtekeningVeldRef } from './HandtekeningVeld';
import VeldOffline from '@/app/components/wachtrij/VeldOffline';
import { urenTekst, urenVeld, type Dagrapport } from './types';

interface Velden {
  datum: string;
  objectId: string;
  uitvoerder: string;
  uren: string;
  werkzaamheden: string;
  bevindingen: string;
}

function beginVelden(d: Dagrapport): Velden {
  return {
    datum: d.datum,
    objectId: d.object ? String(d.object.id) : '',
    uitvoerder: d.uitvoerder,
    uren: urenVeld(d.minuten),
    werkzaamheden: d.werkzaamheden ?? '',
    bevindingen: d.bevindingen ?? '',
  };
}

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
        setFout(await foutTekst(res, 'Het dagrapport kon niet worden opgehaald.'));
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

  const zet = (k: keyof Velden) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const w = e.target.value;
    setVelden((v) => (v ? { ...v, [k]: w } : v));
    setGewijzigd(true);
  };

  /** Slaat de velden op; geeft het rapport terug, of null bij een fout (die staat dan in beeld). */
  const opslaan = async (stil = false): Promise<Dagrapport | null> => {
    if (!rapport || !velden) return null;
    setVeldFouten({});
    setFout('');
    try {
      const res = await fetch(`/api/dagrapporten/${rapport.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...velden, objectId: velden.objectId || null }),
      });
      if (!res.ok) {
        const data = await res.clone().json().catch(() => null);
        if (data?.velden) setVeldFouten(data.velden);
        setFout(await foutTekst(res, 'Het dagrapport is niet opgeslagen.'));
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
    if (!rapport || !confirm('Deze foto uit het dagrapport halen? Dat kan niet ongedaan worden gemaakt.')) return;
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

  const tekenen = async () => {
    if (!rapport) return;
    const png = tekening.current?.alsPng();
    if (!png) {
      setFout('Laat de klant eerst tekenen.');
      return;
    }
    if (!naam.trim()) {
      setVeldFouten({ naam: 'Vul de naam in van wie tekent' });
      return;
    }
    setBezig(true);
    try {
      // Eerst wat er nog niet opgeslagen is, anders tekent de klant voor iets anders.
      if (gewijzigd && !(await opslaan(true))) return;
      const res = await fetch(`/api/dagrapporten/${rapport.id}/handtekening`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: naam.trim(), handtekening: png }),
      });
      if (!res.ok) {
        const data = await res.clone().json().catch(() => null);
        if (data?.velden) setVeldFouten(data.velden);
        setFout(await foutTekst(res, 'De handtekening is niet opgeslagen.'));
        return;
      }
      zetRapport(await res.json());
      setMelding('Getekend. Het dagrapport ligt vast en staat in het klantdossier en het klantportaal.');
      window.scrollTo({ top: 0 });
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  const handtekeningWissen = async () => {
    if (!rapport) return;
    if (!confirm('Handtekening wissen? Het dagrapport wordt weer een concept en de klant moet opnieuw tekenen. De oude handtekening staat in het logboek.')) return;
    try {
      const res = await fetch(`/api/dagrapporten/${rapport.id}/handtekening`, { method: 'DELETE' });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De handtekening is niet gewist.'));
        return;
      }
      zetRapport(await res.json());
      setNaam('');
      setMelding('De handtekening is gewist. Je kunt het dagrapport weer aanpassen.');
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
      if (!res.ok) return foutTekst(res, 'Het dagrapport is niet verwijderd.');
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
  const concept = rapport?.status !== 'getekend';
  const bewerkbaar = isAdmin && concept;
  const klantObjecten = objecten.filter((o) => o.klantId === rapport?.klant.id);
  const fout1 = (k: string) => veldFouten[k] && <p className="veld-fout">{veldFouten[k]}</p>;

  const kop = (
    <header className="veld-kop">
      <Link prefetch={false} href={terugHref} className="veld-terug" aria-label={rapport?.planId ? 'Terug naar de dag' : 'Terug naar de dagrapporten'}>
        <Icon name="arrow-left" size={24} />
      </Link>
      <div className="veld-kop-tekst">
        <h1>Dagrapport</h1>
        <p>{rapport ? `${rapport.klant.naam}, ${dagKort(rapport.datum)}, ${rapport.nummer}` : ''}</p>
      </div>
    </header>
  );

  return (
    <AppShell title="Dagrapport" wide veld user={user}>
      <VeldOffline api={`/api/dagrapporten/${dagrapportId}`} />
      <div className="veld">
        {kop}
        <GeenVerbinding tekst="Wat je invult, blijft staan. Opslaan en tekenen lukt pas weer als je bereik hebt." />

        {verwijderd ? (
          <div className="leeg">
            <Icon name="trash" size={32} />
            <p style={{ margin: '0 0 12px' }}>Dit dagrapport is verwijderd.</p>
            <Link prefetch={false} href="/dashboard/dagrapporten" className="btn btn-sm">
              <Icon name="arrow-left" size={16} />
              Naar de dagrapporten
            </Link>
          </div>
        ) : !rapport || !velden ? (
          fout ? <LaadFout melding={fout} onOpnieuw={laad} /> : <Laden label="Dagrapport laden" regels={3} />
        ) : (
          <div className="veld-indeling dr-indeling">
            <div className="veld-kolom">
              {fout && <div className="alert alert-danger" role="alert">{fout}</div>}
              {melding && <div className="alert alert-success" role="status">{melding}</div>}

              {/* ---------- Het bezoek ---------- */}
              <section className={`veld-kaart${concept ? '' : ' veld-kaart-klaar'}`} aria-label="Het bezoek">
                <span className="veld-kaart-label">
                  <Icon name={concept ? 'module-dagrapport' : 'signature'} size={16} />
                  {concept ? 'Concept, nog niet getekend' : `Getekend door ${rapport.getekendDoor}`}
                </span>
                {bewerkbaar ? (
                  <div className="veldwerk dr-velden">
                    <div className="veld">
                      <label className="label" htmlFor="dr-werk">Wat heb je gedaan</label>
                      <textarea id="dr-werk" className="textarea" rows={5} value={velden.werkzaamheden} onChange={zet('werkzaamheden')} placeholder="Bijv. hydraulische slangen hefdeur vervangen, systeem ontlucht en op druk gecontroleerd" />
                    </div>
                    <div className="veld">
                      <label className="label" htmlFor="dr-bevindingen">Bevindingen</label>
                      <textarea id="dr-bevindingen" className="textarea" rows={3} value={velden.bevindingen} onChange={zet('bevindingen')} placeholder="Wat je zag en wat er nog moet gebeuren" />
                    </div>
                    <div className="dr-twee">
                      <div className="veld">
                        <label className="label" htmlFor="dr-uren">Uren</label>
                        <input id="dr-uren" className={`input${veldFouten.uren ? ' input-fout' : ''}`} inputMode="decimal" value={velden.uren} onChange={zet('uren')} placeholder="2,5" />
                        {fout1('uren')}
                      </div>
                      <div className="veld">
                        <label className="label" htmlFor="dr-datum">Datum</label>
                        <input id="dr-datum" type="date" className={`input${veldFouten.datum ? ' input-fout' : ''}`} value={velden.datum} onChange={zet('datum')} />
                        {fout1('datum')}
                      </div>
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
                    <div className="veld">
                      <label className="label" htmlFor="dr-uitvoerder">Uitgevoerd door</label>
                      <input id="dr-uitvoerder" className={`input${veldFouten.uitvoerder ? ' input-fout' : ''}`} value={velden.uitvoerder} onChange={zet('uitvoerder')} />
                      {fout1('uitvoerder')}
                    </div>
                    <button type="button" className="btn btn-block" onClick={() => opslaan()} disabled={!gewijzigd || bezig}>
                      <Icon name="check" size={16} />
                      {gewijzigd ? 'Opslaan' : 'Opgeslagen'}
                    </button>
                  </div>
                ) : (
                  <>
                    <dl className="veld-gegevens">
                      <dt>Klant</dt>
                      <dd>{rapport.klant.naam}</dd>
                      <dt>Plek</dt>
                      <dd>{rapport.object?.name ?? 'Geen vaste plek'}</dd>
                      <dt>Datum</dt>
                      <dd>{dagKort(rapport.datum)}</dd>
                      <dt>Uren</dt>
                      <dd>{urenTekst(rapport.minuten)}</dd>
                      <dt>Door</dt>
                      <dd>{rapport.uitvoerder}</dd>
                    </dl>
                    <h2 className="dr-kop">Wat er gedaan is</h2>
                    <p className="dr-tekst">{rapport.werkzaamheden || 'Niet ingevuld.'}</p>
                    <h2 className="dr-kop">Bevindingen</h2>
                    <p className="dr-tekst">{rapport.bevindingen || 'Geen bijzonderheden.'}</p>
                  </>
                )}
              </section>

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
              {/* ---------- Handtekening ---------- */}
              <section className="card dr-teken" aria-labelledby="dr-teken-kop">
                <h2 id="dr-teken-kop" className="dr-kop">
                  <Icon name="signature" size={20} />
                  Akkoord van de klant
                </h2>
                {!concept ? (
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
                ) : bewerkbaar ? (
                  <div className="veldwerk">
                    <p className="dr-uitleg">Geef de telefoon aan de klant. Met de handtekening bevestigt de klant dat het werk is gedaan zoals hierboven staat.</p>
                    <div className="veld">
                      <label className="label" htmlFor="dr-naam">Naam van wie tekent</label>
                      <input
                        id="dr-naam"
                        className={`input${veldFouten.naam ? ' input-fout' : ''}`}
                        value={naam}
                        onChange={(e) => setNaam(e.target.value)}
                        autoComplete="off"
                        placeholder="Voor- en achternaam"
                      />
                      {fout1('naam')}
                    </div>
                    <HandtekeningVeld ref={tekening} uitgeschakeld={bezig} onVerander={setTekeningLeeg} />
                  </div>
                ) : (
                  <p className="dr-uitleg">Nog niet getekend.</p>
                )}
              </section>

              {isAdmin && (
                <details className="veld-beheer">
                  <summary>Beheer</summary>
                  {!concept && (
                    <section className="gevarenzone">
                      <p className="gevarenzone-kop">
                        <Icon name="reset" size={16} />
                        Handtekening wissen
                      </p>
                      <p className="gevarenzone-tekst">Nodig als er nog iets moet veranderen. Het rapport wordt weer een concept en de klant tekent opnieuw.</p>
                      <button type="button" className="btn btn-sm btn-danger-soft" onClick={handtekeningWissen}>
                        <Icon name="reset" size={16} />
                        Handtekening wissen
                      </button>
                    </section>
                  )}
                  <VeiligVerwijderBlok
                    id={`dagrapport-${rapport.id}`}
                    kop="Dagrapport verwijderen"
                    uitleg={<>Haalt {rapport.nummer} uit het klantdossier en het klantportaal, met de foto&apos;s en de handtekening. Direct daarna kun je het ongedaan maken.</>}
                    bevestig={rapport.nummer}
                    knop="Dagrapport verwijderen"
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
              <button type="button" className="btn btn-primary veld-hoofdknop" onClick={tekenen} disabled={bezig || tekeningLeeg || !naam.trim()}>
                <Icon name="signature" size={24} />
                {bezig ? 'Bezig...' : 'Tekenen en afronden'}
              </button>
            ) : (
              <a className="btn btn-primary veld-hoofdknop" href={rapport.pdf} download>
                <Icon name="file-pdf" size={24} />
                PDF downloaden
              </a>
            )}
            <p>{concept ? (tekeningLeeg || !naam.trim() ? 'Eerst de naam en de handtekening van de klant' : 'Slaat alles op en legt het rapport vast') : 'Ook te vinden in het klantdossier en het klantportaal'}</p>
          </div>
        )}
      </div>

      {groot && <PhotoModal fotos={groot.fotos} startIndex={groot.start} sampleNumber={rapport?.nummer ?? ''} onClose={() => setGroot(null)} />}
      <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />
    </AppShell>
  );
}
