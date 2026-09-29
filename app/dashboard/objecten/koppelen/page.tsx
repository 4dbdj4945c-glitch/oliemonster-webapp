'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, Icon } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { objectTypeIcoon, objectTypeLabel } from '@/lib/sampleObjects';
import { isAlleenLezen, kijkersPagina } from '@/lib/roles';

/*
  Locaties koppelen. Het veld locatie op een monster is het onderdeel op het
  kunstwerk ("Belfeld Westsluis"); het object is het kunstwerk zelf (Sluis
  Belfeld). Hier hang je elke locatietekst van een analysejaar in een klik aan
  het juiste kunstwerk. Een voorstel doen we alleen als het zeker is: een sluis
  en een stuw gooien we nooit automatisch samen.
*/

interface User {
  userId: number;
  username: string;
  role: string;
  isLoggedIn: boolean;
}

interface KoppelObject {
  id: number;
  name: string;
  objectType: string | null;
  region: string | null;
}

interface Regel {
  locatie: string;
  aantalMonsters: number;
  huidigeObjecten: { id: number; naam: string; aantal: number }[];
  aantalZonderObject: number;
  voorstelObjectId: number | null;
  voorstelReden: string;
}

export default function KoppelenPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [jaar, setJaar] = useState(2026);
  const [objecten, setObjecten] = useState<KoppelObject[]>([]);
  const [regels, setRegels] = useState<Regel[]>([]);
  const [keuzes, setKeuzes] = useState<Record<string, string>>({});
  const [foutmelding, setFoutmelding] = useState('');
  const [bezig, setBezig] = useState('');
  const [klaar, setKlaar] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!data.isLoggedIn) { router.push('/login'); return; }
        if (data.requiresPasswordChange) { router.push('/set-password'); return; }
        // De beperkte kijker mag alleen Oliemonsters 2025 zien.
        if (isAlleenLezen(data.role)) { router.replace(kijkersPagina(data.viewYear)); return; }
        setUser(data);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const laad = useCallback(async () => {
    try {
      const res = await fetch(`/api/sample-objects/locaties?year=${jaar}`);
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'De locaties konden niet worden opgehaald.'));
        return;
      }
      const data = await res.json();
      setObjecten(data.objecten ?? []);
      setRegels(data.regels ?? []);
      // Staat alles al aan een object, dan die keuze; anders het voorstel.
      const start: Record<string, string> = {};
      for (const r of data.regels ?? []) {
        const eenObject = r.huidigeObjecten.length === 1 && r.aantalZonderObject === 0;
        const id = eenObject ? r.huidigeObjecten[0].id : r.voorstelObjectId;
        start[r.locatie] = id ? String(id) : '';
      }
      setKeuzes(start);
      setFoutmelding('');
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    }
  }, [jaar]);

  useEffect(() => {
    if (user) laad();
  }, [user, laad]);

  const koppel = async (regel: Regel) => {
    const keuze = keuzes[regel.locatie] ?? '';
    if (!keuze) {
      setFoutmelding(`Kies eerst een kunstwerk voor "${regel.locatie || 'zonder locatie'}".`);
      return;
    }
    setBezig(regel.locatie);
    setKlaar('');
    try {
      const res = await fetch('/api/sample-objects/locaties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisYear: jaar, location: regel.locatie, objectId: parseInt(keuze) }),
      });
      if (!res.ok) {
        setFoutmelding(await foutTekst(res, 'De locatie kon niet worden gekoppeld.'));
        return;
      }
      const data = await res.json();
      const naam = objecten.find((o) => o.id === parseInt(keuze))?.name ?? 'het kunstwerk';
      setKlaar(
        `${data.bijgewerkt} ${data.bijgewerkt === 1 ? 'monster' : 'monsters'} van "${regel.locatie}" hangen nu aan ${naam}.`
      );
      setFoutmelding('');
      await laad();
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    } finally {
      setBezig('');
    }
  };

  if (loading) {
    return <div className="laadscherm">Laden...</div>;
  }

  const nogLos = regels.filter((r) => r.huidigeObjecten.length === 0).length;
  const zonderVoorstel = regels.filter(
    (r) => r.huidigeObjecten.length === 0 && !r.voorstelObjectId
  ).length;

  return (
    <AppShell title="Locaties koppelen" wide user={user}>
      {/* Alleen pagina-lay-out; kaarten, knoppen, velden en badges komen uit globals.css. */}
      <style jsx>{`
        .koppel-kop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .koppel-kop :global(.page-subtitle) { margin-bottom: 20px; }
        .koppel-filter { display: flex; align-items: center; gap: 12px; }
        .koppel-filter :global(.label) { margin: 0; }
        .koppel-filter :global(.select) { width: auto; }
        .koppel-kiezer { display: flex; flex-direction: column; gap: 4px; min-width: 220px; }
        .koppel-kiezer :global(.select) { width: 100%; }
        .koppel-reden { font-size: 12px; color: var(--grijs-500); }
        .koppel-reden-let { color: var(--geel-tekst); font-weight: 600; }
        .koppel-nu { display: flex; flex-direction: column; gap: 2px; }
        .koppel-nu-sub { font-size: 12px; color: var(--grijs-500); }

        @media (max-width: 640px) {
          .koppel-kop { flex-direction: column; align-items: stretch; }
          .koppel-filter { flex-direction: column; align-items: stretch; gap: 6px; }
          .koppel-filter :global(.select) { width: 100%; }
          .koppel-kiezer { min-width: 0; }
          .koppel-kiezer :global(.select) { min-height: 44px; }
        }
      `}</style>

      <div className="koppel-kop">
        <div>
          <h1 className="page-title">Locaties koppelen</h1>
          <p className="page-subtitle">
            De locatietekst van een monster is het onderdeel op het kunstwerk, bijvoorbeeld
            Belfeld Westsluis. Het kunstwerk zelf is het object: Sluis Belfeld. Hang hier elke
            locatietekst aan het juiste kunstwerk. Een sluis en een stuw op dezelfde plaats
            blijven twee kunstwerken, die voegen we nooit automatisch samen.
          </p>
        </div>
        <div className="knoppenrij">
          <button type="button" className="btn" onClick={() => router.push('/dashboard/objecten')}>
            <Icon name="map-pin" size={16} />
            Naar objecten
          </button>
        </div>
      </div>

      {foutmelding && <LaadFout melding={foutmelding} onOpnieuw={laad} />}
      {klaar && <div className="alert alert-success" style={{ marginBottom: '16px' }}>{klaar}</div>}

      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="koppel-filter">
          <label className="label" htmlFor="koppel-jaar">Analysejaar</label>
          <select
            id="koppel-jaar"
            className="select"
            value={jaar}
            onChange={(e) => setJaar(parseInt(e.target.value))}
          >
            <option value={2026}>Analysejaar 2026</option>
            <option value={2025}>Analysejaar 2025</option>
          </select>
        </div>
        {regels.length > 0 && (
          <p className="hint" style={{ marginBottom: 0 }}>
            {regels.length} {regels.length === 1 ? 'locatietekst' : 'locatieteksten'} in {jaar},
            {' '}{nogLos} nog zonder kunstwerk
            {zonderVoorstel > 0 && `, waarvan ${zonderVoorstel} zonder voorstel`}.
          </p>
        )}
      </div>

      {regels.length === 0 ? (
        foutmelding ? null : (
          <div className="leeg">
            <Icon name="empty" size={32} />
            Er zijn geen monsters in {jaar}.
          </div>
        )
      ) : (
        <div className="table-container">
          <div className="table-scroll">
            <table className="table table-kaarten">
              <thead>
                <tr>
                  <th>Locatie op het monster</th>
                  <th>Monsters</th>
                  <th>Nu gekoppeld aan</th>
                  <th>Kunstwerk</th>
                  {isAdmin && <th>Actie</th>}
                </tr>
              </thead>
              <tbody>
                {regels.map((regel) => {
                  const keuze = keuzes[regel.locatie] ?? '';
                  const eenObject = regel.huidigeObjecten.length === 1 && regel.aantalZonderObject === 0;
                  const klaarMetDeze = eenObject && String(regel.huidigeObjecten[0].id) === keuze;
                  return (
                    <tr key={regel.locatie || '(zonder locatie)'}>
                      <td data-label="Locatie op het monster" className="kaart-kop font-medium">
                        {regel.locatie || 'Zonder locatie'}
                      </td>
                      <td data-label="Monsters">{regel.aantalMonsters}</td>
                      <td data-label="Nu gekoppeld aan">
                        {regel.huidigeObjecten.length === 0 ? (
                          <span className="badge badge-gray">
                            <Icon name="status-not-taken" size={16} />
                            Nog los
                          </span>
                        ) : (
                          <span className="koppel-nu">
                            {regel.huidigeObjecten.map((o) => (
                              <span key={o.id}>
                                {o.naam}
                                {regel.huidigeObjecten.length > 1 && ` (${o.aantal})`}
                              </span>
                            ))}
                            {regel.aantalZonderObject > 0 && (
                              <span className="koppel-nu-sub">
                                {regel.aantalZonderObject} nog los
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td data-label="Kunstwerk">
                        <span className="koppel-kiezer">
                          <select
                            className="select"
                            value={keuze}
                            aria-label={`Kunstwerk voor ${regel.locatie || 'zonder locatie'}`}
                            disabled={!isAdmin}
                            onChange={(e) =>
                              setKeuzes((k) => ({ ...k, [regel.locatie]: e.target.value }))
                            }
                          >
                            <option value="">Kies een kunstwerk</option>
                            {objecten.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name} ({objectTypeLabel(o.objectType)})
                              </option>
                            ))}
                          </select>
                          {!keuze && regel.voorstelReden && (
                            <span className="koppel-reden koppel-reden-let">{regel.voorstelReden}</span>
                          )}
                          {keuze && !eenObject && regel.voorstelObjectId === parseInt(keuze) && (
                            <span className="koppel-reden">
                              Voorstel op naam. Controleer het even voordat je koppelt.
                            </span>
                          )}
                        </span>
                      </td>
                      {isAdmin && (
                        <td data-label="Actie" className="kaart-acties" style={{ whiteSpace: 'nowrap' }}>
                          {klaarMetDeze ? (
                            <span className="badge badge-success">
                              <Icon name="check" size={16} />
                              Gekoppeld
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => koppel(regel)}
                              disabled={!keuze || bezig === regel.locatie}
                            >
                              <Icon name="tag" size={16} />
                              {bezig === regel.locatie ? 'Bezig...' : 'Koppelen'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
