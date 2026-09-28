'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AppShell, Modal, Icon } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { searchAddresses, AddressHit } from '@/lib/pdok';
import { OBJECT_TYPES, objectTypeLabel, objectTypeIcoon, tijdInUren } from '@/lib/sampleObjects';

const ObjectMap = dynamic(() => import('@/app/components/ObjectMap'), {
  ssr: false,
  loading: () => <div className="laden objecten-kaart-laden">Kaart laden...</div>,
});

interface User {
  userId: number;
  username: string;
  role: string;
  isLoggedIn: boolean;
}

interface SampleObject {
  id: number;
  name: string;
  region: string | null;
  objectType: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  estimatedMinutes: number | null;
  notes: string | null;
  aantalMonsters: number;
  aantalGenomen: number;
  aantalGeannuleerd: number;
}

interface Voorbeeldregel {
  naam: string;
  objectType: string;
  aantalMonsters: number;
  bestaatAl: boolean;
}

interface Voorbeeld {
  analysisYear: number;
  nieuweObjecten: number;
  bestaandeObjecten: number;
  teKoppelenMonsters: number;
  monstersZonderLocatie: number;
  voorbeeld: Voorbeeldregel[];
}

const leegFormulier = {
  name: '',
  objectType: '',
  region: '',
  address: '',
  lat: null as number | null,
  lng: null as number | null,
  uren: '',
  minuten: '',
  notes: '',
};

export default function ObjectenPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [objecten, setObjecten] = useState<SampleObject[]>([]);
  const [jaar, setJaar] = useState(2026);
  const [foutmelding, setFoutmelding] = useState('');

  // Formulier
  const [toonModal, setToonModal] = useState(false);
  const [bewerkt, setBewerkt] = useState<SampleObject | null>(null);
  const [formulier, setFormulier] = useState({ ...leegFormulier });
  const [formulierFout, setFormulierFout] = useState('');
  const [opslaan, setOpslaan] = useState(false);

  // Adreszoeker
  const [adresZoek, setAdresZoek] = useState('');
  const [adresHits, setAdresHits] = useState<AddressHit[]>([]);
  const [adresOpen, setAdresOpen] = useState(false);
  const [adresBezig, setAdresBezig] = useState(false);
  const adresGekozen = useRef(false);

  // Objecten uit de locaties halen
  const [toonOvernemen, setToonOvernemen] = useState(false);
  const [voorbeeld, setVoorbeeld] = useState<Voorbeeld | null>(null);
  const [overnemenJaar, setOvernemenJaar] = useState(2026);
  const [overnemenBezig, setOvernemenBezig] = useState(false);
  const [overnemenFout, setOvernemenFout] = useState('');
  const [overnemenKlaar, setOvernemenKlaar] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!data.isLoggedIn) { router.push('/login'); return; }
        if (data.requiresPasswordChange) { router.push('/set-password'); return; }
        // De beperkte kijker mag alleen Oliemonsters 2025 zien.
        if (data.role === 'viewer_oil2025') { router.replace('/dashboard/oliemonsters'); return; }
        setUser(data);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (user) laadObjecten();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, jaar]);

  const laadObjecten = async () => {
    try {
      const res = await fetch(`/api/sample-objects?year=${jaar}`);
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'De objecten konden niet worden opgehaald.'));
        return;
      }
      setObjecten(await res.json());
      setFoutmelding('');
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    }
  };

  // ---- Adres zoeken (met een korte pauze na het typen) ----
  useEffect(() => {
    if (!toonModal) return;
    if (adresGekozen.current) { adresGekozen.current = false; return; }
    const q = adresZoek;
    if (q.trim().length < 3) { setAdresHits([]); return; }
    const t = setTimeout(async () => {
      setAdresBezig(true);
      try {
        const hits = await searchAddresses(q);
        setAdresHits(hits);
        setAdresOpen(true);
      } catch {
        setAdresHits([]);
      } finally {
        setAdresBezig(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [adresZoek, toonModal]);

  const kiesAdres = (hit: AddressHit) => {
    adresGekozen.current = true;
    setAdresZoek(hit.label);
    setAdresHits([]);
    setAdresOpen(false);
    setFormulier((f) => ({ ...f, address: hit.label, lat: hit.lat, lng: hit.lng }));
  };

  // ---- Formulier ----
  const openNieuw = () => {
    setBewerkt(null);
    setFormulier({ ...leegFormulier });
    setAdresZoek('');
    setAdresHits([]);
    setFormulierFout('');
    setToonModal(true);
  };

  const openBewerken = (object: SampleObject) => {
    setBewerkt(object);
    setFormulier({
      name: object.name,
      objectType: object.objectType || '',
      region: object.region || '',
      address: object.address || '',
      lat: object.lat,
      lng: object.lng,
      uren: object.estimatedMinutes ? String(Math.floor(object.estimatedMinutes / 60)) : '',
      minuten: object.estimatedMinutes ? String(object.estimatedMinutes % 60) : '',
      notes: object.notes || '',
    });
    setAdresZoek(object.address || '');
    setAdresHits([]);
    setFormulierFout('');
    setToonModal(true);
  };

  const bewaar = async () => {
    if (!formulier.name.trim()) {
      setFormulierFout('Geef het object een naam.');
      return;
    }
    const uren = parseInt(formulier.uren || '0') || 0;
    const minuten = parseInt(formulier.minuten || '0') || 0;
    const totaal = uren * 60 + minuten;

    setOpslaan(true);
    setFormulierFout('');
    try {
      const res = await fetch(bewerkt ? `/api/sample-objects/${bewerkt.id}` : '/api/sample-objects', {
        method: bewerkt ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formulier.name,
          objectType: formulier.objectType || null,
          region: formulier.region,
          address: formulier.address,
          lat: formulier.lat,
          lng: formulier.lng,
          estimatedMinutes: totaal > 0 ? totaal : null,
          notes: formulier.notes,
        }),
      });
      if (!res.ok) {
        setFormulierFout(await foutTekst(res, 'Het object kon niet worden opgeslagen.'));
        return;
      }
      setToonModal(false);
      await laadObjecten();
    } catch {
      setFormulierFout(GEEN_VERBINDING);
    } finally {
      setOpslaan(false);
    }
  };

  const verwijder = async (object: SampleObject) => {
    if (!confirm(
      `Object "${object.name}" verwijderen?\n\nDe ${object.aantalMonsters} gekoppelde monsters blijven bestaan, ze raken alleen hun koppeling kwijt.`
    )) return;
    try {
      const res = await fetch(`/api/sample-objects/${object.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'Het object kon niet worden verwijderd.'));
        return;
      }
      setFoutmelding('');
      await laadObjecten();
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    }
  };

  // ---- Objecten uit de bestaande locaties ----
  const openOvernemen = async (gekozenJaar: number) => {
    setOvernemenJaar(gekozenJaar);
    setToonOvernemen(true);
    setVoorbeeld(null);
    setOvernemenFout('');
    setOvernemenKlaar('');
    await haalVoorbeeld(gekozenJaar);
  };

  const haalVoorbeeld = async (gekozenJaar: number) => {
    setOvernemenBezig(true);
    try {
      const res = await fetch('/api/sample-objects/from-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisYear: gekozenJaar }),
      });
      if (!res.ok) {
        setOvernemenFout(await foutTekst(res, 'Het voorbeeld kon niet worden opgehaald.'));
        return;
      }
      setVoorbeeld(await res.json());
      setOvernemenFout('');
    } catch {
      setOvernemenFout(GEEN_VERBINDING);
    } finally {
      setOvernemenBezig(false);
    }
  };

  const voerOvernemenUit = async () => {
    setOvernemenBezig(true);
    try {
      const res = await fetch('/api/sample-objects/from-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisYear: overnemenJaar, uitvoeren: true }),
      });
      if (!res.ok) {
        setOvernemenFout(await foutTekst(res, 'De objecten konden niet worden aangemaakt.'));
        return;
      }
      const data = await res.json();
      setOvernemenKlaar(
        `${data.aangemaakt} objecten aangemaakt en ${data.gekoppeld} monsters gekoppeld.`
      );
      setVoorbeeld(null);
      await laadObjecten();
    } catch {
      setOvernemenFout(GEEN_VERBINDING);
    } finally {
      setOvernemenBezig(false);
    }
  };

  if (loading) {
    return <div className="laadscherm">Laden...</div>;
  }

  const totaalMinuten = objecten.reduce((n, o) => n + (o.estimatedMinutes ?? 0), 0);

  return (
    <AppShell title="Objecten" wide user={user}>
      {/* Alleen pagina-lay-out; kaarten, knoppen, velden en badges komen uit globals.css. */}
      <style jsx>{`
        .objecten-kop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .objecten-kop :global(.page-subtitle) { margin-bottom: 20px; }
        .objecten-knoppen { display: flex; gap: 8px; flex-wrap: wrap; }
        .objecten-filter { display: flex; align-items: center; gap: 12px; }
        .objecten-filter :global(.label) { margin: 0; }
        .objecten-filter :global(.select) { width: auto; }
        .objecten-adres { display: block; }
        .objecten-coord { display: block; font-size: 12px; color: var(--grijs-500); }
        .objecten-formulier {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 320px);
          gap: 16px;
          align-items: start;
        }
        .objecten-velden { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
        .objecten-veld-breed { grid-column: 1 / -1; }
        .objecten-tijd { display: flex; align-items: center; gap: 8px; }
        .objecten-tijd :global(.input) { width: 72px; }
        .objecten-tijd span { font-size: 13px; color: var(--grijs-500); }
        .objecten-combo { position: relative; }
        .objecten-hits {
          list-style: none; margin: 4px 0 0; padding: 0;
          border: 1px solid var(--grijs-200); border-radius: var(--radius-md); overflow: hidden;
          position: absolute; left: 0; right: 0; top: 100%; z-index: 20;
          background: var(--wit); box-shadow: var(--shadow-lg);
          max-height: 240px; overflow-y: auto;
        }
        .objecten-hit {
          display: flex; align-items: center; min-height: 44px; padding: 8px 14px;
          cursor: pointer; font-size: 14px; border-top: 1px solid var(--grijs-200); color: var(--navy);
        }
        .objecten-hit:first-child { border-top: none; }
        .objecten-hit:hover { background: var(--blue-light); }
        .objecten-kaart :global(.hint) { margin-top: 6px; }
        .objecten-kaart-laden {
          height: 300px; display: flex; align-items: center; justify-content: center;
          background: var(--wit); border: 1px solid var(--grijs-200); border-radius: 12px;
        }

        @media (max-width: 760px) {
          .objecten-formulier { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .objecten-kop { flex-direction: column; align-items: stretch; }
          .objecten-knoppen :global(.btn) { flex: 1 1 auto; }
          .objecten-velden { grid-template-columns: 1fr; }
          .objecten-filter { flex-direction: column; align-items: stretch; gap: 6px; }
          .objecten-filter :global(.select) { width: 100%; }
          .objecten-hit { min-height: 48px; font-size: 15px; }
        }
      `}</style>

      <div className="objecten-kop">
        <div>
          <h1 className="page-title">Objecten</h1>
          <p className="page-subtitle">
            De plekken waar je monsters neemt, met adres, kaartprik en de tijd die je er kwijt bent.
            {totaalMinuten > 0 && ` Samen ${tijdInUren(totaalMinuten)} geschat.`}
          </p>
        </div>
        {isAdmin && (
          <div className="knoppenrij objecten-knoppen">
            <button type="button" className="btn" onClick={() => openOvernemen(jaar)}>
              <Icon name="copy-year" size={16} />
              Uit locaties {jaar}
            </button>
            <button type="button" className="btn btn-primary" onClick={openNieuw}>
              <Icon name="plus" size={16} />
              Nieuw object
            </button>
          </div>
        )}
      </div>

      {foutmelding && <LaadFout melding={foutmelding} onOpnieuw={laadObjecten} />}

      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="objecten-filter">
          <label className="label" htmlFor="objecten-jaar">Monsters tellen van</label>
          <select
            id="objecten-jaar"
            className="select"
            value={jaar}
            onChange={(e) => setJaar(parseInt(e.target.value))}
          >
            <option value={2026}>Analysejaar 2026</option>
            <option value={2025}>Analysejaar 2025</option>
          </select>
        </div>
      </div>

      {objecten.length === 0 ? (
        <div className="leeg">
          <Icon name="empty" size={32} />
          <p style={{ margin: '0 0 12px' }}>
            {foutmelding ? 'De objecten konden niet worden opgehaald.' : 'Nog geen objecten.'}
          </p>
          {isAdmin && !foutmelding && (
            <div className="knoppenrij" style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={openNieuw}>
                <Icon name="plus" size={16} />
                Nieuw object
              </button>
              <button type="button" className="btn btn-sm" onClick={() => openOvernemen(jaar)}>
                <Icon name="copy-year" size={16} />
                Aanmaken uit de locaties van {jaar}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="table-container">
          <div className="table-scroll">
            <table className="table table-kaarten">
              <thead>
                <tr>
                  <th>Object</th>
                  <th>Type</th>
                  <th>Regio</th>
                  <th>Adres</th>
                  <th>Monsters {jaar}</th>
                  <th>Geschatte tijd</th>
                  {isAdmin && <th>Acties</th>}
                </tr>
              </thead>
              <tbody>
                {objecten.map((object) => (
                  <tr key={object.id}>
                    <td data-label="Object" className="kaart-kop font-medium">{object.name}</td>
                    <td data-label="Type">
                      <span className="badge badge-gray">
                        <Icon name={objectTypeIcoon(object.objectType)} size={16} />
                        {objectTypeLabel(object.objectType)}
                      </span>
                    </td>
                    <td data-label="Regio">{object.region || '-'}</td>
                    <td data-label="Adres">
                      <span className="objecten-adres">
                        {object.address || '-'}
                        {object.lat !== null && object.lng !== null && (
                          <span className="objecten-coord">
                            {object.lat.toFixed(5)}, {object.lng.toFixed(5)}
                          </span>
                        )}
                      </span>
                    </td>
                    <td data-label={`Monsters ${jaar}`}>
                      {object.aantalMonsters === 0 ? (
                        '-'
                      ) : (
                        <>
                          {object.aantalGenomen} van de {object.aantalMonsters} genomen
                          {object.aantalGeannuleerd > 0 && `, ${object.aantalGeannuleerd} geannuleerd`}
                        </>
                      )}
                    </td>
                    <td data-label="Geschatte tijd" style={{ whiteSpace: 'nowrap' }}>
                      {tijdInUren(object.estimatedMinutes) || '-'}
                    </td>
                    {isAdmin && (
                      <td data-label="Acties" className="kaart-acties" style={{ whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="icon-btn sm:mr-1"
                          onClick={() => openBewerken(object)}
                          title="Bewerken"
                          aria-label={`${object.name} bewerken`}
                        >
                          <Icon name="pencil" size={16} />
                          <span className="alleen-mobiel">Bewerken</span>
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-danger icon-btn-verwijder"
                          onClick={() => verwijder(object)}
                          title="Verwijderen"
                          aria-label={`${object.name} verwijderen`}
                        >
                          <Icon name="trash" size={16} />
                          <span className="alleen-mobiel">Verwijderen</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Object toevoegen of bewerken */}
      <Modal
        open={toonModal}
        onClose={() => setToonModal(false)}
        title={bewerkt ? `${bewerkt.name} bewerken` : 'Nieuw object'}
        size="lg"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setToonModal(false)}>Annuleren</button>
            <button type="button" className="btn btn-primary" onClick={bewaar} disabled={opslaan}>
              {opslaan ? 'Bezig...' : bewerkt ? 'Bijwerken' : 'Toevoegen'}
            </button>
          </>
        }
      >
        <div className="objecten-formulier">
          <div className="objecten-velden">
            <div className="veld">
              <label className="label" htmlFor="object-naam">Naam</label>
              <input
                id="object-naam"
                className="input"
                value={formulier.name}
                onChange={(e) => setFormulier({ ...formulier, name: e.target.value })}
                placeholder="Bijv. Sluis Grave"
                autoComplete="off"
              />
            </div>

            <div className="veld">
              <label className="label" htmlFor="object-type">Type</label>
              <select
                id="object-type"
                className="select"
                value={formulier.objectType}
                onChange={(e) => setFormulier({ ...formulier, objectType: e.target.value })}
              >
                <option value="">Kies een type</option>
                {OBJECT_TYPES.map((t) => (
                  <option key={t.waarde} value={t.waarde}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="veld">
              <label className="label" htmlFor="object-regio">Regio</label>
              <input
                id="object-regio"
                className="input"
                value={formulier.region}
                onChange={(e) => setFormulier({ ...formulier, region: e.target.value })}
                placeholder="Bijv. Maas"
                autoComplete="off"
              />
            </div>

            <div className="veld">
              <label className="label" htmlFor="object-uren">Geschatte tijd op locatie</label>
              <div className="objecten-tijd">
                <input
                  id="object-uren"
                  className="input"
                  inputMode="numeric"
                  value={formulier.uren}
                  onChange={(e) => setFormulier({ ...formulier, uren: e.target.value.replace(/\D/g, '') })}
                  placeholder="0"
                  aria-label="Uren"
                />
                <span>uur</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={formulier.minuten}
                  onChange={(e) => setFormulier({ ...formulier, minuten: e.target.value.replace(/\D/g, '') })}
                  placeholder="0"
                  aria-label="Minuten"
                />
                <span>min</span>
              </div>
            </div>

            <div className="veld objecten-veld-breed">
              <label className="label" htmlFor="object-adres">Adres zoeken</label>
              <div className="objecten-combo">
                <input
                  id="object-adres"
                  className="input"
                  role="combobox"
                  aria-expanded={adresOpen && adresHits.length > 0}
                  aria-autocomplete="list"
                  autoComplete="off"
                  value={adresZoek}
                  onChange={(e) => { setAdresZoek(e.target.value); setAdresOpen(true); }}
                  onFocus={() => { if (adresHits.length > 0) setAdresOpen(true); }}
                  onBlur={() => setTimeout(() => setAdresOpen(false), 150)}
                  placeholder="Typ een adres of plaats, bijv. Sluisweg Grave"
                />
                {adresOpen && adresHits.length > 0 && (
                  <ul className="objecten-hits">
                    {adresHits.map((hit) => (
                      <li
                        key={hit.label}
                        className="objecten-hit"
                        onMouseDown={(e) => { e.preventDefault(); kiesAdres(hit); }}
                      >
                        {hit.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="hint">
                {adresBezig ? 'Zoeken...' : 'Kies een adres en versleep daarna de speld naar de plek waar je echt moet zijn.'}
              </p>
            </div>

            <div className="veld objecten-veld-breed">
              <label className="label" htmlFor="object-notities">Notities</label>
              <textarea
                id="object-notities"
                className="textarea"
                rows={2}
                value={formulier.notes}
                onChange={(e) => setFormulier({ ...formulier, notes: e.target.value })}
                placeholder="Bijv. sleutel ophalen bij de bediening"
              />
            </div>
          </div>

          <div className="objecten-kaart">
            <ObjectMap
              lat={formulier.lat}
              lng={formulier.lng}
              onChange={(lat, lng) => setFormulier((f) => ({ ...f, lat, lng }))}
              height={300}
            />
            <p className="hint">
              {formulier.lat !== null && formulier.lng !== null
                ? `Speld staat op ${formulier.lat.toFixed(5)}, ${formulier.lng.toFixed(5)}.`
                : 'Nog geen plek gekozen. Zoek een adres of tik op de kaart.'}
            </p>
          </div>
        </div>

        {formulierFout && <div className="alert alert-danger" style={{ marginTop: '12px' }}>{formulierFout}</div>}
      </Modal>

      {/* Objecten aanmaken uit de bestaande locaties */}
      <Modal
        open={toonOvernemen}
        onClose={() => setToonOvernemen(false)}
        title={`Objecten uit de locaties van ${overnemenJaar}`}
        size="lg"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setToonOvernemen(false)}>Sluiten</button>
            {voorbeeld && voorbeeld.teKoppelenMonsters > 0 && (
              <button type="button" className="btn btn-primary" onClick={voerOvernemenUit} disabled={overnemenBezig}>
                {overnemenBezig ? 'Bezig...' : `Aanmaken en koppelen (${voorbeeld.nieuweObjecten})`}
              </button>
            )}
          </>
        }
      >
        <p style={{ marginTop: 0 }}>
          Dit maakt objecten aan uit de locatieteksten van de monsters en koppelt die monsters eraan.
          Monsters die al aan een object hangen blijven met rust. Hieronder zie je eerst wat er gaat gebeuren.
        </p>

        <div className="veld" style={{ maxWidth: '260px' }}>
          <label className="label" htmlFor="overnemen-jaar">Analysejaar</label>
          <select
            id="overnemen-jaar"
            className="select"
            value={overnemenJaar}
            onChange={(e) => { const j = parseInt(e.target.value); setOvernemenJaar(j); haalVoorbeeld(j); }}
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
        </div>

        {overnemenFout && <div className="alert alert-danger" style={{ marginBottom: '12px' }}>{overnemenFout}</div>}
        {overnemenKlaar && <div className="alert alert-success" style={{ marginBottom: '12px' }}>{overnemenKlaar}</div>}
        {overnemenBezig && !voorbeeld && <p className="laden">Voorbeeld ophalen...</p>}

        {voorbeeld && (
          <>
            <p className="section-label">Voorbeeld</p>
            <p>
              {voorbeeld.nieuweObjecten} nieuwe objecten, {voorbeeld.bestaandeObjecten} bestaan al,
              {' '}{voorbeeld.teKoppelenMonsters} monsters worden gekoppeld
              {voorbeeld.monstersZonderLocatie > 0 && `, ${voorbeeld.monstersZonderLocatie} monsters hebben geen locatie en blijven los`}.
            </p>
            {voorbeeld.voorbeeld.length === 0 ? (
              <div className="leeg">
                <Icon name="empty" size={32} />
                Er zijn geen losse monsters met een locatie in {overnemenJaar}.
              </div>
            ) : (
              <div className="table-container">
                <div className="table-scroll">
                  <table className="table table-kaarten">
                    <thead>
                      <tr>
                        <th>Naam</th>
                        <th>Type</th>
                        <th>Monsters</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {voorbeeld.voorbeeld.map((regel) => (
                        <tr key={regel.naam}>
                          <td data-label="Naam" className="kaart-kop font-medium">{regel.naam}</td>
                          <td data-label="Type">
                            <span className="badge badge-gray">
                              <Icon name={objectTypeIcoon(regel.objectType)} size={16} />
                              {objectTypeLabel(regel.objectType)}
                            </span>
                          </td>
                          <td data-label="Monsters">{regel.aantalMonsters}</td>
                          <td data-label="Status" className="kaart-status">
                            <span className={`badge ${regel.bestaatAl ? 'badge-info' : 'badge-success'}`}>
                              <Icon name={regel.bestaatAl ? 'status-planned' : 'plus'} size={16} />
                              {regel.bestaatAl ? 'Bestaat al' : 'Nieuw'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
    </AppShell>
  );
}
