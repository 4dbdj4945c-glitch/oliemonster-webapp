'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AppShell, Modal, Icon } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { searchAddresses, AddressHit } from '@/lib/pdok';
import {
  OBJECT_TYPES,
  objectTypeLabel,
  objectTypeIcoon,
  tijdInUren,
  KUNSTWERKEN,
  isKunstwerkNaam,
  raadKunstwerk,
  sorteerOpOfferte,
} from '@/lib/sampleObjects';

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
  // Monsters over alle jaren heen: dat is wat er meeverhuist bij samenvoegen.
  aantalAlleJaren: number;
}

interface Kunstwerkregel {
  naam: string;
  regio: string;
  objectType: string;
  notitie: string | null;
  bestaatAl: boolean;
}

interface KunstwerkVoorbeeld {
  nieuw: number;
  bestaandeObjecten: number;
  voorbeeld: Kunstwerkregel[];
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
  const [adresIndex, setAdresIndex] = useState(0);
  // Ligt PDOK plat, dan moet je dat zien. Anders typ je een adres en gebeurt er
  // niets, zonder dat je weet of het adres niet bestaat of de dienst eruit ligt.
  const [adresFout, setAdresFout] = useState('');
  const adresGekozen = useRef(false);

  // Opschonen: alle objecten met een voorstel in een keer samenvoegen
  const [toonOpschonen, setToonOpschonen] = useState(false);
  const [opschoonBezig, setOpschoonBezig] = useState(false);
  const [opschoonFout, setOpschoonFout] = useState('');

  // Vaste kunstwerkenlijst aanmaken
  const [toonKunstwerken, setToonKunstwerken] = useState(false);
  const [kunstwerken, setKunstwerken] = useState<KunstwerkVoorbeeld | null>(null);
  const [kunstwerkenBezig, setKunstwerkenBezig] = useState(false);
  const [kunstwerkenFout, setKunstwerkenFout] = useState('');
  const [kunstwerkenKlaar, setKunstwerkenKlaar] = useState('');

  // Objecten samenvoegen
  const [samenvoegen, setSamenvoegen] = useState<SampleObject | null>(null);
  const [samenvoegDoel, setSamenvoegDoel] = useState('');
  const [samenvoegBezig, setSamenvoegBezig] = useState(false);
  const [samenvoegFout, setSamenvoegFout] = useState('');
  const [samenvoegKlaar, setSamenvoegKlaar] = useState('');

  const isAdmin = user?.role === 'admin';

  /* Wat hoort er in de lijst en wat niet. Een object is het kunstwerk zelf (Sluis
     Belfeld); staat de naam niet in de vaste kunstwerkenlijst, dan is het een
     onderdeel uit de oude locatie-import (Belfeld Westsluis) en moet het opgaan in
     een kunstwerk. Het voorstel volgt dezelfde voorzichtige regel als het
     koppelscherm: de naam moet passen en het soortwoord moet kloppen, een sluis en
     een stuw gooien we nooit automatisch samen. */
  const gesorteerd = sorteerOpOfferte(objecten);
  const kunstwerkObjecten = objecten.filter((o) => isKunstwerkNaam(o.name));
  const nietKunstwerken = gesorteerd.filter((o) => !isKunstwerkNaam(o.name));
  const voorstellen = new Map<number, { objectId: number | null; reden: string }>(
    nietKunstwerken.map((o) => [o.id, raadKunstwerk(o.name, kunstwerkObjecten)])
  );
  const metVoorstel = nietKunstwerken.filter((o) => voorstellen.get(o.id)?.objectId);
  const zonderVoorstel = nietKunstwerken.filter((o) => !voorstellen.get(o.id)?.objectId);
  const verhuizendeMonsters = metVoorstel.reduce((n, o) => n + o.aantalAlleJaren, 0);
  const ontbrekend = KUNSTWERKEN.filter(
    (k) => !objecten.some((o) => o.name.toLowerCase() === k.naam.toLowerCase())
  );
  const naamVan = (id: number | null) =>
    objecten.find((o) => o.id === id)?.name ?? 'het kunstwerk';

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
        setAdresIndex(0);
        setAdresOpen(true);
        setAdresFout(hits.length === 0 ? 'Geen adres gevonden. Probeer een straat met plaatsnaam.' : '');
      } catch {
        setAdresHits([]);
        setAdresFout(
          'De adressendienst (PDOK) reageert niet. Probeer het zo nog eens, of zet de speld met een tik op de kaart.'
        );
      } finally {
        setAdresBezig(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [adresZoek, toonModal]);

  // Pijltjes, Enter en Escape in de adreslijst, zodat het ook zonder muis werkt.
  const adresToetsen = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (adresHits.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAdresOpen(true);
      setAdresIndex((i) => Math.min(i + 1, adresHits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAdresIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && adresOpen) {
      e.preventDefault();
      kiesAdres(adresHits[adresIndex] ?? adresHits[0]);
    } else if (e.key === 'Escape') {
      setAdresOpen(false);
    }
  };

  const kiesAdres = (hit: AddressHit) => {
    adresGekozen.current = true;
    setAdresFout('');
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
    setAdresFout('');
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
    setAdresFout('');
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
    if (object.aantalMonsters > 0) {
      setFoutmelding(
        `Aan "${object.name}" hangen nog ${object.aantalMonsters} ${
          object.aantalMonsters === 1 ? 'monster' : 'monsters'
        }. Voeg dit object eerst samen met het goede kunstwerk.`
      );
      return;
    }
    if (!confirm(
      `Object "${object.name}" verwijderen?\n\nEr hangen geen monsters aan. Staat dit object op een dag in de planning, dan verdwijnt het daar wel van.`
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

  // ---- De vaste kunstwerkenlijst ----
  const openKunstwerken = async () => {
    setToonKunstwerken(true);
    setKunstwerken(null);
    setKunstwerkenFout('');
    setKunstwerkenKlaar('');
    await haalKunstwerken();
  };

  const haalKunstwerken = async () => {
    setKunstwerkenBezig(true);
    try {
      const res = await fetch('/api/sample-objects/kunstwerken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        setKunstwerkenFout(await foutTekst(res, 'Het voorbeeld kon niet worden opgehaald.'));
        return;
      }
      setKunstwerken(await res.json());
      setKunstwerkenFout('');
    } catch {
      setKunstwerkenFout(GEEN_VERBINDING);
    } finally {
      setKunstwerkenBezig(false);
    }
  };

  const maakKunstwerken = async () => {
    setKunstwerkenBezig(true);
    try {
      const res = await fetch('/api/sample-objects/kunstwerken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uitvoeren: true }),
      });
      if (!res.ok) {
        setKunstwerkenFout(await foutTekst(res, 'De kunstwerken konden niet worden aangemaakt.'));
        return;
      }
      const data = await res.json();
      setKunstwerkenKlaar(
        `${data.aangemaakt} ${data.aangemaakt === 1 ? 'kunstwerk' : 'kunstwerken'} aangemaakt, ${data.overgeslagen} bestonden al.`
      );
      await haalKunstwerken();
      await laadObjecten();
    } catch {
      setKunstwerkenFout(GEEN_VERBINDING);
    } finally {
      setKunstwerkenBezig(false);
    }
  };

  // ---- Objecten samenvoegen ----
  const openSamenvoegen = (object: SampleObject, voorstelId?: number | null) => {
    setSamenvoegen(object);
    setSamenvoegDoel(voorstelId ? String(voorstelId) : '');
    setSamenvoegFout('');
    setSamenvoegKlaar('');
  };

  const voerSamenvoegenUit = async () => {
    if (!samenvoegen) return;
    if (!samenvoegDoel) {
      setSamenvoegFout('Kies het kunstwerk waar alles naartoe moet.');
      return;
    }
    setSamenvoegBezig(true);
    try {
      const res = await fetch(`/api/sample-objects/${samenvoegen.id}/samenvoegen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doelId: parseInt(samenvoegDoel) }),
      });
      if (!res.ok) {
        setSamenvoegFout(await foutTekst(res, 'De objecten konden niet worden samengevoegd.'));
        return;
      }
      const data = await res.json();
      const doel = objecten.find((o) => o.id === parseInt(samenvoegDoel))?.name ?? 'het andere object';
      setSamenvoegen(null);
      setSamenvoegKlaar(
        `${data.monsters} ${data.monsters === 1 ? 'monster' : 'monsters'} verhuisd naar ${doel}, ${
          data.stopsVerhuisd + data.stopsSamengevoegd
        } uit de planning bijgewerkt.`
      );
      await laadObjecten();
    } catch {
      setSamenvoegFout(GEEN_VERBINDING);
    } finally {
      setSamenvoegBezig(false);
    }
  };

  // ---- Alles met een voorstel samenvoegen ----
  // Per object roepen we dezelfde route aan als de knop Samenvoegen in de regel,
  // dus elke samenvoeging komt apart in het auditlogboek te staan.
  const voerOpschonenUit = async () => {
    setOpschoonBezig(true);
    setOpschoonFout('');
    let objectenWeg = 0;
    let monstersVerhuisd = 0;
    let verbindingWeg = false;
    const mislukt: string[] = [];

    for (const object of metVoorstel) {
      const doelId = voorstellen.get(object.id)?.objectId;
      if (!doelId) continue;
      try {
        const res = await fetch(`/api/sample-objects/${object.id}/samenvoegen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doelId }),
        });
        if (!res.ok) { mislukt.push(object.name); continue; }
        const data = await res.json();
        objectenWeg += 1;
        monstersVerhuisd += data.monsters ?? 0;
      } catch {
        verbindingWeg = true;
        break;
      }
    }

    setOpschoonBezig(false);
    if (verbindingWeg) setOpschoonFout(GEEN_VERBINDING);
    else setToonOpschonen(false);
    if (objectenWeg > 0 || mislukt.length > 0) {
      setSamenvoegKlaar(
        `${objectenWeg} ${objectenWeg === 1 ? 'object' : 'objecten'} samengevoegd, ` +
        `${monstersVerhuisd} ${monstersVerhuisd === 1 ? 'monster' : 'monsters'} verhuisd naar de kunstwerken.` +
        (mislukt.length > 0 ? ` Niet gelukt: ${mislukt.join(', ')}.` : '')
      );
    }
    await laadObjecten();
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
        .objecten-adres-fout { color: var(--rood-tekst); font-weight: 600; }
        .objecten-coord { display: block; font-size: 12px; color: var(--grijs-500); }
        .objecten-naam { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
        .objecten-voorstel { font-size: 12px; font-weight: 400; color: var(--grijs-500); }
        .objecten-opschonen :global(.section-label) { margin-top: 0; }
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
        .objecten-hits li { border-top: 1px solid var(--grijs-200); }
        .objecten-hits li:first-child { border-top: none; }
        .objecten-hit {
          display: flex; align-items: center; width: 100%; min-height: 44px; padding: 8px 14px;
          cursor: pointer; font-size: 14px; color: var(--navy); text-align: left;
          background: none; border: none; font-family: inherit;
        }
        .objecten-hit:hover, .objecten-hit-actief { background: var(--blue-light); }
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
            <button type="button" className="btn" onClick={openKunstwerken}>
              <Icon name="structure" size={16} />
              Kunstwerkenlijst
            </button>
            <button type="button" className="btn" onClick={() => router.push('/dashboard/objecten/koppelen')}>
              <Icon name="tag" size={16} />
              Locaties koppelen
            </button>
            <button type="button" className="btn btn-primary" onClick={openNieuw}>
              <Icon name="plus" size={16} />
              Nieuw object
            </button>
          </div>
        )}
      </div>

      {foutmelding && <LaadFout melding={foutmelding} onOpnieuw={laadObjecten} />}
      {samenvoegKlaar && (
        <div className="alert alert-success" style={{ marginBottom: '16px' }}>{samenvoegKlaar}</div>
      )}

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
        {!foutmelding && (
          <p className="hint" style={{ marginBottom: 0 }}>
            {kunstwerkObjecten.length} van de {KUNSTWERKEN.length} kunstwerken aangemaakt.
            {ontbrekend.length > 0 && ` Nog niet aangemaakt: ${ontbrekend.map((k) => k.naam).join(', ')}.`}
          </p>
        )}
      </div>

      {nietKunstwerken.length > 0 && (
        <div className="card objecten-opschonen" style={{ marginBottom: '16px' }}>
          <p className="section-label">Opschonen</p>
          <p style={{ marginTop: 0 }}>
            {nietKunstwerken.length === 1
              ? 'Er staat 1 object in de lijst dat niet'
              : `Er staan ${nietKunstwerken.length} objecten in de lijst die niet`}{' '}
            in de vaste kunstwerkenlijst {nietKunstwerken.length === 1 ? 'staat' : 'staan'}. Dat zijn
            onderdelen uit de oude locatie-import, bijvoorbeeld Belfeld Westsluis. Voeg ze samen met
            het kunstwerk waar ze op zitten, dan is de lijst weer gelijk aan de offerte.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            {metVoorstel.length} {metVoorstel.length === 1 ? 'heeft' : 'hebben'} een voorstel,
            {' '}bij {zonderVoorstel.length} moet je zelf kiezen.
          </p>
          {isAdmin && metVoorstel.length > 0 && (
            <div className="knoppenrij">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => { setOpschoonFout(''); setToonOpschonen(true); }}
              >
                <Icon name="copy" size={16} />
                Alles met een voorstel samenvoegen ({metVoorstel.length})
              </button>
            </div>
          )}
        </div>
      )}

      {objecten.length === 0 ? (
        // Bij een laadfout staat de melding er al boven, dan hier geen tekst.
        foutmelding ? null : (
        <div className="leeg">
          <Icon name="empty" size={32} />
          <p style={{ margin: '0 0 12px' }}>Nog geen objecten.</p>
          {isAdmin && (
            <div className="knoppenrij" style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={openNieuw}>
                <Icon name="plus" size={16} />
                Nieuw object
              </button>
              <button type="button" className="btn btn-sm" onClick={openKunstwerken}>
                <Icon name="structure" size={16} />
                Kunstwerkenlijst aanmaken
              </button>
            </div>
          )}
        </div>
        )
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
                {gesorteerd.map((object) => (
                  <tr key={object.id}>
                    <td data-label="Object" className="kaart-kop font-medium">
                      <span className="objecten-naam">
                        {object.name}
                        {!isKunstwerkNaam(object.name) && (
                          <>
                            <span className="badge badge-warning">
                              <Icon name="alert-warning" size={16} />
                              Geen kunstwerk
                            </span>
                            <span className="objecten-voorstel">
                              {object.aantalAlleJaren === 0
                                ? 'Geen monsters gekoppeld'
                                : `${object.aantalAlleJaren} ${
                                    object.aantalAlleJaren === 1 ? 'monster' : 'monsters'
                                  } gekoppeld, alle jaren`}
                              {voorstellen.get(object.id)?.objectId
                                ? `, gaat op in ${naamVan(voorstellen.get(object.id)!.objectId)}`
                                : `. ${voorstellen.get(object.id)?.reden ?? ''}`}
                            </span>
                          </>
                        )}
                      </span>
                    </td>
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
                          className="icon-btn sm:mr-1"
                          onClick={() => openSamenvoegen(object, voorstellen.get(object.id)?.objectId)}
                          title="Samenvoegen met een ander object"
                          aria-label={`${object.name} samenvoegen met een ander object`}
                        >
                          <Icon name="copy" size={16} />
                          <span className="alleen-mobiel">Samenvoegen</span>
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
                  aria-controls="object-adres-lijst"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    adresOpen && adresHits.length > 0 ? `object-adres-hit-${adresIndex}` : undefined
                  }
                  autoComplete="off"
                  value={adresZoek}
                  onChange={(e) => { setAdresZoek(e.target.value); setAdresOpen(true); }}
                  onFocus={() => { if (adresHits.length > 0) setAdresOpen(true); }}
                  onBlur={() => setTimeout(() => setAdresOpen(false), 150)}
                  onKeyDown={adresToetsen}
                  placeholder="Typ een adres of plaats, bijv. Sluisweg Grave"
                />
                <ul
                  id="object-adres-lijst"
                  className="objecten-hits"
                  role="listbox"
                  hidden={!(adresOpen && adresHits.length > 0)}
                >
                  {adresHits.map((hit, i) => (
                    <li key={hit.label} role="option" aria-selected={i === adresIndex}>
                      <button
                        type="button"
                        id={`object-adres-hit-${i}`}
                        className={`objecten-hit${i === adresIndex ? ' objecten-hit-actief' : ''}`}
                        onMouseEnter={() => setAdresIndex(i)}
                        onMouseDown={(e) => { e.preventDefault(); kiesAdres(hit); }}
                      >
                        {hit.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {adresFout ? (
                <p className="hint objecten-adres-fout" role="alert">{adresFout}</p>
              ) : (
                <p className="hint">
                  {adresBezig ? 'Zoeken...' : 'Kies een adres en versleep daarna de speld naar de plek waar je echt moet zijn.'}
                </p>
              )}
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

      {/* De vaste kunstwerkenlijst aanmaken */}
      <Modal
        open={toonKunstwerken}
        onClose={() => setToonKunstwerken(false)}
        title="Kunstwerkenlijst aanmaken"
        size="lg"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setToonKunstwerken(false)}>Sluiten</button>
            {kunstwerken && kunstwerken.nieuw > 0 && (
              <button type="button" className="btn btn-primary" onClick={maakKunstwerken} disabled={kunstwerkenBezig}>
                {kunstwerkenBezig ? 'Bezig...' : `Aanmaken (${kunstwerken.nieuw})`}
              </button>
            )}
          </>
        }
      >
        <p style={{ marginTop: 0 }}>
          Dit zet de kunstwerken uit de Mourik-offerte klaar als objecten, met regio en type.
          Een object is het kunstwerk zelf: Sluis Belfeld en Stuw Belfeld zijn dus twee objecten,
          ook al staan ze op dezelfde plaats. Wat op een monster in het veld locatie staat is het
          onderdeel daarop, bijvoorbeeld Belfeld Westsluis. Bestaat een kunstwerk met dezelfde naam
          al, dan blijft het zoals het is. Hieronder zie je eerst wat er gaat gebeuren.
        </p>

        {kunstwerkenFout && <div className="alert alert-danger" style={{ marginBottom: '12px' }}>{kunstwerkenFout}</div>}
        {kunstwerkenKlaar && <div className="alert alert-success" style={{ marginBottom: '12px' }}>{kunstwerkenKlaar}</div>}
        {kunstwerkenBezig && !kunstwerken && <p className="laden">Voorbeeld ophalen...</p>}

        {kunstwerken && (
          <>
            <p className="section-label">Voorbeeld</p>
            <p>
              {kunstwerken.nieuw === 1 ? '1 nieuw kunstwerk' : `${kunstwerken.nieuw} nieuwe kunstwerken`},
              {' '}{kunstwerken.bestaandeObjecten} {kunstwerken.bestaandeObjecten === 1 ? 'bestaat' : 'bestaan'} al.
            </p>
            <div className="table-container">
              <div className="table-scroll">
                <table className="table table-kaarten">
                  <thead>
                    <tr>
                      <th>Kunstwerk</th>
                      <th>Type</th>
                      <th>Regio</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kunstwerken.voorbeeld.map((regel) => (
                      <tr key={regel.naam}>
                        <td data-label="Kunstwerk" className="kaart-kop font-medium">
                          {regel.naam}
                          {regel.notitie && <span className="objecten-coord">{regel.notitie}</span>}
                        </td>
                        <td data-label="Type">
                          <span className="badge badge-gray">
                            <Icon name={objectTypeIcoon(regel.objectType)} size={16} />
                            {objectTypeLabel(regel.objectType)}
                          </span>
                        </td>
                        <td data-label="Regio">{regel.regio}</td>
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
          </>
        )}
      </Modal>

      {/* Object samenvoegen met een ander object */}
      <Modal
        open={samenvoegen !== null}
        onClose={() => setSamenvoegen(null)}
        title={samenvoegen ? `${samenvoegen.name} samenvoegen` : 'Samenvoegen'}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setSamenvoegen(null)}>Annuleren</button>
            <button type="button" className="btn btn-primary" onClick={voerSamenvoegenUit} disabled={samenvoegBezig}>
              {samenvoegBezig ? 'Bezig...' : 'Samenvoegen'}
            </button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>
          Alle monsters en geplande stops van <strong>{samenvoegen?.name}</strong> gaan naar het
          kunstwerk dat je hieronder kiest. Daarna verdwijnt {samenvoegen?.name}. Handig om een
          verkeerd aangemaakt object op te ruimen. Dit kun je niet terugdraaien.
        </p>

        <div className="veld">
          <label className="label" htmlFor="samenvoeg-doel">Alles naartoe</label>
          <select
            id="samenvoeg-doel"
            className="select"
            value={samenvoegDoel}
            onChange={(e) => setSamenvoegDoel(e.target.value)}
          >
            <option value="">Kies een kunstwerk</option>
            {objecten
              .filter((o) => o.id !== samenvoegen?.id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({objectTypeLabel(o.objectType)})
                </option>
              ))}
          </select>
          <p className="hint">
            Let op: een sluis en een stuw op dezelfde plaats zijn twee kunstwerken. Voeg die niet samen.
          </p>
        </div>

        {samenvoegFout && <div className="alert alert-danger" style={{ marginTop: '12px' }}>{samenvoegFout}</div>}
      </Modal>

      {/* Alles met een voorstel samenvoegen, met een voorbeeld vooraf */}
      <Modal
        open={toonOpschonen}
        onClose={() => setToonOpschonen(false)}
        title="Alles met een voorstel samenvoegen"
        size="lg"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setToonOpschonen(false)}>Annuleren</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={voerOpschonenUit}
              disabled={opschoonBezig || metVoorstel.length === 0}
            >
              {opschoonBezig ? 'Bezig...' : `Samenvoegen (${metVoorstel.length})`}
            </button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>
          Hieronder zie je eerst wat er gaat gebeuren.{' '}
          {metVoorstel.length} {metVoorstel.length === 1 ? 'object verdwijnt' : 'objecten verdwijnen'},
          {' '}{verhuizendeMonsters} {verhuizendeMonsters === 1 ? 'monster verhuist' : 'monsters verhuizen'} naar
          het kunstwerk ernaast, samen met de geplande stops. Dit kun je niet terugdraaien.
        </p>

        {opschoonFout && <div className="alert alert-danger" style={{ marginBottom: '12px' }}>{opschoonFout}</div>}

        <p className="section-label">Gaat samen</p>
        <div className="table-container">
          <div className="table-scroll">
            <table className="table table-kaarten">
              <thead>
                <tr>
                  <th>Object</th>
                  <th>Monsters</th>
                  <th>Gaat op in</th>
                </tr>
              </thead>
              <tbody>
                {metVoorstel.map((object) => (
                  <tr key={object.id}>
                    <td data-label="Object" className="kaart-kop font-medium">{object.name}</td>
                    <td data-label="Monsters">{object.aantalAlleJaren}</td>
                    <td data-label="Gaat op in">
                      <span className="badge badge-info">
                        <Icon name="structure" size={16} />
                        {naamVan(voorstellen.get(object.id)!.objectId)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {zonderVoorstel.length > 0 && (
          <>
            <p className="section-label">Blijven staan, kies zelf</p>
            <div className="table-container">
              <div className="table-scroll">
                <table className="table table-kaarten">
                  <thead>
                    <tr>
                      <th>Object</th>
                      <th>Monsters</th>
                      <th>Waarom</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zonderVoorstel.map((object) => (
                      <tr key={object.id}>
                        <td data-label="Object" className="kaart-kop font-medium">{object.name}</td>
                        <td data-label="Monsters">{object.aantalAlleJaren}</td>
                        <td data-label="Waarom">{voorstellen.get(object.id)?.reden}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </Modal>

    </AppShell>
  );
}
