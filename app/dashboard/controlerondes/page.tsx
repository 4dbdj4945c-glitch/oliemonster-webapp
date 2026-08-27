'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api';
import { searchPlaces, getStreets, PlaceHit, StreetHit } from '@/lib/pdok';
import type { MapStreet } from '@/app/components/RouteMap';

const RouteMap = dynamic(() => import('@/app/components/RouteMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', background: 'rgba(255,255,255,0.5)', borderRadius: 16 }}>
      Kaart laden…
    </div>
  ),
});

interface User {
  userId: number;
  username: string;
  role: string;
  isLoggedIn: boolean;
}

interface RoundListItem {
  id: number;
  name: string;
  place: string;
  notes: string | null;
  routeDistance: number | null;
  streetsCount: number;
  doneCount: number;
  updatedAt: string;
}

interface RoundStreet {
  id: number;
  street: string;
  lat: number;
  lng: number;
  orderIndex: number;
  isDone: boolean;
  doneAt: string | null;
}

interface RoundDetail {
  id: number;
  name: string;
  place: string;
  notes: string | null;
  routeGeometry: string | null;
  routeDistance: number | null;
  streets: RoundStreet[];
}

type View = 'list' | 'new' | 'detail';

// Afstand (meter) waarbinnen GPS een straat automatisch afvinkt.
const GPS_MARK_RADIUS = 70;

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function ControleRondesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');

  // Lijst
  const [rounds, setRounds] = useState<RoundListItem[]>([]);

  // Nieuwe ronde – wizard
  const [wizardStep, setWizardStep] = useState<'place' | 'streets'>('place');
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeHits, setPlaceHits] = useState<PlaceHit[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const [allStreets, setAllStreets] = useState<StreetHit[]>([]);
  const [streetsLoading, setStreetsLoading] = useState(false);
  const [streetSearch, setStreetSearch] = useState('');
  const [selectedStreets, setSelectedStreets] = useState<Set<string>>(new Set());
  const [roundName, setRoundName] = useState('');
  const [roundNotes, setRoundNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [wizardError, setWizardError] = useState('');

  // Detail / rijden
  const [detail, setDetail] = useState<RoundDetail | null>(null);
  const [gpsActive, setGpsActive] = useState(false);
  const [autoMark, setAutoMark] = useState(true);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState('');
  const watchIdRef = useRef<number | null>(null);
  const detailRef = useRef<RoundDetail | null>(null);
  detailRef.current = detail;
  const autoMarkRef = useRef(autoMark);
  autoMarkRef.current = autoMark;

  // ---- Auth + init ----
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/auth/session');
        const data = await res.json();
        if (!data.isLoggedIn) { router.push('/login'); return; }
        if (data.requiresPasswordChange) { router.push('/set-password'); return; }
        setUser(data);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (user) loadRounds();
  }, [user]);

  const loadRounds = async () => {
    try {
      const res = await apiFetch('/api/control-rounds');
      if (res.ok) setRounds(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  // ---- Plaats zoeken (debounced) ----
  useEffect(() => {
    if (view !== 'new' || wizardStep !== 'place') return;
    const q = placeQuery;
    if (q.trim().length < 2) { setPlaceHits([]); return; }
    const t = setTimeout(async () => {
      try {
        setPlaceHits(await searchPlaces(q));
      } catch {
        setPlaceHits([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [placeQuery, view, wizardStep]);

  const choosePlace = async (place: string) => {
    setSelectedPlace(place);
    setPlaceHits([]);
    setPlaceQuery(place);
    setStreetsLoading(true);
    setWizardError('');
    setSelectedStreets(new Set());
    try {
      const streets = await getStreets(place);
      setAllStreets(streets);
      if (streets.length === 0) {
        setWizardError('Geen straten gevonden voor deze plaats.');
      }
      setWizardStep('streets');
    } catch {
      setWizardError('Straten ophalen mislukt. Probeer het opnieuw.');
    } finally {
      setStreetsLoading(false);
    }
  };

  const startNewRound = () => {
    setWizardStep('place');
    setPlaceQuery('');
    setPlaceHits([]);
    setSelectedPlace(null);
    setAllStreets([]);
    setStreetSearch('');
    setSelectedStreets(new Set());
    setRoundName('');
    setRoundNotes('');
    setWizardError('');
    setView('new');
  };

  const toggleStreet = (name: string) => {
    setSelectedStreets((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const filteredStreets = allStreets.filter((s) =>
    s.street.toLowerCase().includes(streetSearch.toLowerCase())
  );

  const selectAllFiltered = () => {
    setSelectedStreets((prev) => {
      const next = new Set(prev);
      filteredStreets.forEach((s) => next.add(s.street));
      return next;
    });
  };
  const deselectAll = () => setSelectedStreets(new Set());

  // Kaart-preview van de selectie in de wizard
  const wizardMapStreets: MapStreet[] = allStreets
    .filter((s) => selectedStreets.has(s.street))
    .map((s, i) => ({ id: i, street: s.street, lat: s.lat, lng: s.lng, isDone: false, orderIndex: i }));

  const createRound = async () => {
    setWizardError('');
    if (!roundName.trim()) { setWizardError('Geef de ronde een naam.'); return; }
    if (selectedStreets.size === 0) { setWizardError('Selecteer minstens één straat.'); return; }
    setCreating(true);
    try {
      const streets = allStreets
        .filter((s) => selectedStreets.has(s.street))
        .map((s) => ({ street: s.street, lat: s.lat, lng: s.lng }));
      const res = await apiFetch('/api/control-rounds', {
        method: 'POST',
        body: JSON.stringify({ name: roundName, place: selectedPlace, notes: roundNotes, streets }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setWizardError(data.error || 'Aanmaken mislukt.');
        return;
      }
      const created: RoundDetail = await res.json();
      await loadRounds();
      openDetail(created);
    } catch {
      setWizardError('Aanmaken mislukt.');
    } finally {
      setCreating(false);
    }
  };

  // ---- Detail ----
  const openDetail = (round: RoundDetail) => {
    stopGps();
    setDetail(round);
    setView('detail');
  };

  const openRoundById = async (id: number) => {
    try {
      const res = await apiFetch(`/api/control-rounds/${id}`);
      if (res.ok) openDetail(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const deleteRound = async (id: number, name: string) => {
    if (!confirm(`Ronde "${name}" verwijderen?`)) return;
    try {
      const res = await apiFetch(`/api/control-rounds/${id}`, { method: 'DELETE' });
      if (res.ok) loadRounds();
    } catch (e) {
      console.error(e);
    }
  };

  const setStreetDone = useCallback(async (streetId: number, next: boolean) => {
    const d = detailRef.current;
    if (!d) return;
    // Optimistisch bijwerken
    setDetail((prev) =>
      prev
        ? { ...prev, streets: prev.streets.map((s) => (s.id === streetId ? { ...s, isDone: next } : s)) }
        : prev
    );
    try {
      await apiFetch(`/api/control-rounds/${d.id}/streets/${streetId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isDone: next }),
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  const resetRound = async () => {
    const d = detailRef.current;
    if (!d) return;
    if (!confirm('Voortgang van deze ronde resetten?')) return;
    try {
      const res = await apiFetch(`/api/control-rounds/${d.id}/reset`, { method: 'POST' });
      if (res.ok) setDetail(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  // ---- GPS ----
  const stopGps = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsActive(false);
  }, []);

  const startGps = () => {
    setGpsError('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Deze telefoon/browser ondersteunt geen locatie.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserPos({ lat: latitude, lng: longitude });
        // Automatisch afvinken van dichtbijgelegen, nog niet-gereden straten.
        if (autoMarkRef.current) {
          const d = detailRef.current;
          if (d) {
            for (const s of d.streets) {
              if (s.isDone) continue;
              if (haversine(latitude, longitude, s.lat, s.lng) <= GPS_MARK_RADIUS) {
                setStreetDone(s.id, true);
              }
            }
          }
        }
      },
      (err) => {
        setGpsError(err.code === 1 ? 'Locatietoegang geweigerd.' : 'Locatie niet beschikbaar.');
        stopGps();
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    watchIdRef.current = id;
    setGpsActive(true);
  };

  // Stop GPS bij verlaten detail / unmount
  useEffect(() => {
    if (view !== 'detail') stopGps();
  }, [view, stopGps]);
  useEffect(() => () => stopGps(), [stopGps]);

  const geometry: number[][] | null = (() => {
    if (!detail?.routeGeometry) return null;
    try { return JSON.parse(detail.routeGeometry); } catch { return null; }
  })();

  const detailMapStreets: MapStreet[] = detail
    ? detail.streets.map((s) => ({ id: s.id, street: s.street, lat: s.lat, lng: s.lng, isDone: s.isDone, orderIndex: s.orderIndex }))
    : [];

  const doneCount = detail ? detail.streets.filter((s) => s.isDone).length : 0;
  const totalCount = detail ? detail.streets.length : 0;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
        Laden…
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        .wrap { min-height: 100vh; color: #0C1B33; }
        .toolbar {
          background: rgba(255,255,255,0.72);
          backdrop-filter: saturate(180%) blur(28px);
          -webkit-backdrop-filter: saturate(180%) blur(28px);
          border-bottom: 1px solid rgba(255,255,255,0.4);
          position: sticky; top: 0; z-index: 500;
        }
        .toolbar-inner { max-width: 1100px; margin: 0 auto; height: 52px; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; }
        .tb-left { display: flex; align-items: center; gap: 12px; }
        .tb-title { color: #64748B; font-size: 13px; font-weight: 500; }
        .content { max-width: 1100px; margin: 0 auto; padding: 28px 20px 60px; }
        .nav-btn {
          display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px;
          background: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.6);
          border-radius: 8px; color: #0C1B33; font-size: 13px; font-weight: 500; cursor: pointer;
          transition: background .15s;
        }
        .nav-btn:hover { background: rgba(255,255,255,0.9); }
        .nav-btn-danger { background: rgba(220,38,38,0.08); border-color: rgba(220,38,38,0.2); color: #d93025; }
        .nav-btn-danger:hover { background: rgba(220,38,38,0.14); }
        .primary {
          background: #1D4ED8; color: #fff; border: none; border-radius: 9px;
          padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background .15s;
        }
        .primary:hover:not(:disabled) { background: #1740B8; }
        .primary:disabled { opacity: .6; cursor: default; }
        .ghost {
          background: rgba(255,255,255,0.7); border: 1px solid rgba(0,0,0,0.08);
          border-radius: 9px; padding: 10px 16px; font-size: 14px; font-weight: 600; color: #0C1B33; cursor: pointer;
        }
        .card {
          background: rgba(255,255,255,0.65);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border: 1px solid rgba(255,255,255,0.55);
          border-radius: 16px; padding: 18px;
          box-shadow: 0 10px 30px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.7);
        }
        .h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
        .sub { font-size: 14px; color: #64748B; margin: 0 0 20px; }
        .rounds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px,1fr)); gap: 14px; }
        .round-card { cursor: pointer; transition: transform .15s, box-shadow .15s; }
        .round-card:hover { transform: translateY(-2px); box-shadow: 0 16px 40px rgba(15,23,42,0.12); }
        .bar { height: 8px; background: rgba(0,0,0,0.08); border-radius: 999px; overflow: hidden; margin-top: 10px; }
        .bar-fill { height: 100%; background: #16A34A; border-radius: 999px; transition: width .3s; }
        .input {
          width: 100%; padding: 11px 14px; background: rgba(255,255,255,0.85);
          border: 1px solid rgba(0,0,0,0.1); border-radius: 9px; font-size: 15px; color: #0C1B33; outline: none;
        }
        .input:focus { border-color: #1D4ED8; box-shadow: 0 0 0 3px rgba(29,78,216,0.15); }
        .hitlist { list-style: none; margin: 6px 0 0; padding: 0; border: 1px solid rgba(0,0,0,0.08); border-radius: 10px; overflow: hidden; }
        .hit { padding: 10px 14px; cursor: pointer; font-size: 14px; border-top: 1px solid rgba(0,0,0,0.05); }
        .hit:first-child { border-top: none; }
        .hit:hover { background: rgba(29,78,216,0.08); }
        .street-list { max-height: 46vh; overflow-y: auto; border: 1px solid rgba(0,0,0,0.07); border-radius: 12px; }
        .street-row { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-top: 1px solid rgba(0,0,0,0.05); font-size: 14px; cursor: pointer; }
        .street-row:first-child { border-top: none; }
        .street-row:hover { background: rgba(255,255,255,0.6); }
        .street-row.done { background: rgba(22,163,74,0.08); }
        .num { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; border-radius: 7px; font-size: 12px; font-weight: 700; background: rgba(29,78,216,0.1); color: #1D4ED8; }
        .num.done { background: rgba(22,163,74,0.15); color: #15803D; }
        .err { color: #b91c1c; background: rgba(239,68,68,0.08); padding: 10px 12px; border-radius: 9px; font-size: 13px; margin-top: 12px; }
        .toprow { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        .pill { font-size: 12px; color: #64748B; }
        .gpsbtn { display: inline-flex; align-items: center; gap: 7px; }
        .gps-on { background: #16A34A; }
        .gps-on:hover:not(:disabled) { background: #128a3d; }
        .check { width: 20px; height: 20px; accent-color: #16A34A; cursor: pointer; }
      `}</style>

      <div className="wrap">
        {/* Toolbar */}
        <div className="toolbar">
          <div className="toolbar-inner">
            <div className="tb-left">
              <img src="/header_logo.png" alt="It's Done Services" style={{ height: 22, objectFit: 'contain' }} />
              <span style={{ width: 1, height: 16, background: 'rgba(0,0,0,0.12)' }} />
              <span className="tb-title">Controlerondes</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {view !== 'list' && (
                <button className="nav-btn" onClick={() => { stopGps(); setView('list'); loadRounds(); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/></svg>
                  Rondes
                </button>
              )}
              <button className="nav-btn" onClick={() => router.push('/dashboard')}>Dashboard</button>
              <button className="nav-btn nav-btn-danger" onClick={handleLogout}>Uitloggen</button>
            </div>
          </div>
        </div>

        <div className="content">
          {/* ============ LIJST ============ */}
          {view === 'list' && (
            <>
              <div className="toprow">
                <div>
                  <h1 className="h1">Controlerondes</h1>
                  <p className="sub" style={{ margin: 0 }}>Plan een route langs straten en houd tijdens het rijden je voortgang bij.</p>
                </div>
                <button className="primary" onClick={startNewRound}>+ Nieuwe ronde</button>
              </div>

              {rounds.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <p style={{ color: '#64748B', margin: 0 }}>Nog geen rondes. Maak er één aan om te beginnen.</p>
                </div>
              ) : (
                <div className="rounds-grid">
                  {rounds.map((r) => {
                    const pct = r.streetsCount ? Math.round((r.doneCount / r.streetsCount) * 100) : 0;
                    return (
                      <div key={r.id} className="card round-card" onClick={() => openRoundById(r.id)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 16 }}>{r.name}</div>
                            <div style={{ fontSize: 13, color: '#64748B' }}>{r.place}</div>
                          </div>
                          <button
                            className="nav-btn nav-btn-danger"
                            style={{ padding: '4px 8px' }}
                            onClick={(e) => { e.stopPropagation(); deleteRound(r.id, r.name); }}
                            aria-label="Verwijderen"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        </div>
                        <div className="bar"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: '#64748B' }}>
                          <span>{r.doneCount}/{r.streetsCount} straten gereden</span>
                          {r.routeDistance ? <span>{(r.routeDistance / 1000).toFixed(1)} km</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ============ NIEUWE RONDE ============ */}
          {view === 'new' && (
            <>
              <h1 className="h1">Nieuwe ronde</h1>
              <p className="sub">
                {wizardStep === 'place' ? 'Stap 1 · Kies een plaats' : `Stap 2 · Kies straten in ${selectedPlace}`}
              </p>

              {wizardStep === 'place' && (
                <div className="card" style={{ maxWidth: 560 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Plaatsnaam</label>
                  <input
                    className="input"
                    autoFocus
                    placeholder="Typ een plaatsnaam, bijv. Heeze"
                    value={placeQuery}
                    onChange={(e) => { setPlaceQuery(e.target.value); setSelectedPlace(null); }}
                  />
                  {placeHits.length > 0 && (
                    <ul className="hitlist">
                      {placeHits.map((h) => (
                        <li key={h.label} className="hit" onClick={() => choosePlace(h.name)}>
                          <strong>{h.name}</strong>
                          {h.label !== h.name && <span style={{ color: '#64748B' }}> — {h.label}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {streetsLoading && <p style={{ color: '#64748B', fontSize: 13, marginTop: 12 }}>Straten ophalen…</p>}
                  {wizardError && <div className="err">{wizardError}</div>}
                </div>
              )}

              {wizardStep === 'streets' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
                  <div className="card">
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <input
                        className="input"
                        placeholder="Zoek straat…"
                        value={streetSearch}
                        onChange={(e) => setStreetSearch(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, color: '#64748B' }}>
                        <strong style={{ color: '#0C1B33' }}>{selectedStreets.size}</strong> geselecteerd · {allStreets.length} straten
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="nav-btn" onClick={selectAllFiltered}>Alles</button>
                        <button className="nav-btn" onClick={deselectAll}>Wissen</button>
                      </div>
                    </div>
                    <div className="street-list">
                      {filteredStreets.length === 0 ? (
                        <div style={{ padding: 16, color: '#64748B', fontSize: 14 }}>Geen straten.</div>
                      ) : (
                        filteredStreets.map((s) => {
                          const sel = selectedStreets.has(s.street);
                          return (
                            <label key={s.street} className={`street-row ${sel ? 'done' : ''}`}>
                              <input type="checkbox" className="check" checked={sel} onChange={() => toggleStreet(s.street)} />
                              <span>{s.street}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="card" style={{ padding: 10 }}>
                      <RouteMap streets={wizardMapStreets} height={280} fitKey={wizardMapStreets.length} />
                      <p style={{ fontSize: 12, color: '#64748B', margin: '8px 4px 0' }}>
                        De rijvolgorde en route over de wegen worden berekend zodra je de ronde aanmaakt.
                      </p>
                    </div>
                    <div className="card">
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Naam van de ronde</label>
                      <input
                        className="input"
                        placeholder={`Bijv. Controle ${selectedPlace ?? ''}`}
                        value={roundName}
                        onChange={(e) => setRoundName(e.target.value)}
                      />
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', margin: '12px 0 6px' }}>Notitie (optioneel)</label>
                      <input
                        className="input"
                        placeholder="Bijv. wat je precies controleert"
                        value={roundNotes}
                        onChange={(e) => setRoundNotes(e.target.value)}
                      />
                      {wizardError && <div className="err">{wizardError}</div>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        <button className="ghost" onClick={() => setWizardStep('place')}>Terug</button>
                        <button className="primary" style={{ flex: 1 }} onClick={createRound} disabled={creating || selectedStreets.size === 0}>
                          {creating ? 'Route berekenen…' : `Ronde aanmaken (${selectedStreets.size})`}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ============ DETAIL / RIJDEN ============ */}
          {view === 'detail' && detail && (
            <>
              <div className="toprow">
                <div>
                  <h1 className="h1">{detail.name}</h1>
                  <p className="sub" style={{ margin: 0 }}>
                    {detail.place}
                    {detail.routeDistance ? ` · ${(detail.routeDistance / 1000).toFixed(1)} km route` : ''}
                    {detail.notes ? ` · ${detail.notes}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    className={`primary gpsbtn ${gpsActive ? 'gps-on' : ''}`}
                    onClick={() => (gpsActive ? stopGps() : startGps())}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>
                    {gpsActive ? 'GPS aan — stop' : 'Start live GPS'}
                  </button>
                  <button className="ghost" onClick={resetRound}>Reset</button>
                </div>
              </div>

              {gpsError && <div className="err" style={{ marginTop: 0, marginBottom: 12 }}>{gpsError}</div>}

              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{doneCount}/{totalCount} straten gereden</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748B', cursor: 'pointer' }}>
                    <input type="checkbox" className="check" checked={autoMark} onChange={(e) => setAutoMark(e.target.checked)} />
                    Automatisch afvinken via GPS
                  </label>
                </div>
                <div className="bar"><div className="bar-fill" style={{ width: `${totalCount ? (doneCount / totalCount) * 100 : 0}%` }} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
                <div className="card" style={{ padding: 10 }}>
                  <RouteMap
                    streets={detailMapStreets}
                    geometry={geometry}
                    userPos={userPos}
                    onToggle={(id, next) => setStreetDone(id, next)}
                    height={440}
                  />
                </div>

                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div className="street-list" style={{ maxHeight: '60vh', border: 'none' }}>
                    {detail.streets.map((s) => (
                      <div
                        key={s.id}
                        className={`street-row ${s.isDone ? 'done' : ''}`}
                        onClick={() => setStreetDone(s.id, !s.isDone)}
                      >
                        <span className={`num ${s.isDone ? 'done' : ''}`}>{s.orderIndex + 1}</span>
                        <span style={{ flex: 1, textDecoration: s.isDone ? 'line-through' : 'none', color: s.isDone ? '#64748B' : '#0C1B33' }}>
                          {s.street}
                        </span>
                        <input
                          type="checkbox"
                          className="check"
                          checked={s.isDone}
                          onChange={(e) => { e.stopPropagation(); setStreetDone(s.id, e.target.checked); }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
