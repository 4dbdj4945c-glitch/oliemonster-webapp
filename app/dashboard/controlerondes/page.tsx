'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api';
import { searchPlaces, getStreets, PlaceHit, StreetHit } from '@/lib/pdok';
import type { MapStreet } from '@/app/components/RouteMap';
import { AppShell, NavButton, Icons } from '@/app/components/ui';

const RouteMap = dynamic(() => import('@/app/components/RouteMap'), {
  ssr: false,
  loading: () => (
    <div
      className="laden"
      style={{ height: '100%', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--wit)', border: '1px solid var(--grijs-200)', borderRadius: 12 }}
    >
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
  geometry: string | null;
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
  routeSteps: string | null;
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
  const [placeHighlight, setPlaceHighlight] = useState(0);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const [allStreets, setAllStreets] = useState<StreetHit[]>([]);
  const [streetsLoading, setStreetsLoading] = useState(false);
  const [streetSearch, setStreetSearch] = useState('');
  const [streetHighlight, setStreetHighlight] = useState(0);
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
    // Niet opnieuw zoeken als het veld al exact de gekozen plaats bevat.
    if (selectedPlace && q.trim() === selectedPlace) return;
    const t = setTimeout(async () => {
      try {
        const hits = await searchPlaces(q);
        setPlaceHits(hits);
        setPlaceHighlight(0);
        setPlaceOpen(true);
      } catch {
        setPlaceHits([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [placeQuery, view, wizardStep, selectedPlace]);

  const onPlaceKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPlaceOpen(true);
      setPlaceHighlight((h) => Math.min(h + 1, placeHits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPlaceHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Escape') {
      setPlaceOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      let hits = placeHits;
      if (hits.length === 0 && placeQuery.trim().length >= 2) {
        try { hits = await searchPlaces(placeQuery); } catch { hits = []; }
      }
      const pick = hits[placeHighlight] || hits[0];
      if (pick) choosePlace(pick.name);
    }
  };

  const choosePlace = async (place: string) => {
    setSelectedPlace(place);
    setPlaceHits([]);
    setPlaceOpen(false);
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

  const onStreetKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setStreetHighlight((h) => Math.min(h + 1, filteredStreets.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setStreetHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filteredStreets[streetHighlight] || filteredStreets[0];
      if (pick) {
        toggleStreet(pick.street);
        setStreetSearch('');
        setStreetHighlight(0);
      }
    }
  };

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
    .map((s, i) => ({ id: i, street: s.street, lat: s.lat, lng: s.lng, isDone: false, orderIndex: i, lines: s.lines }));

  const createRound = async () => {
    setWizardError('');
    if (!roundName.trim()) { setWizardError('Geef de ronde een naam.'); return; }
    if (selectedStreets.size === 0) { setWizardError('Selecteer minstens één straat.'); return; }
    setCreating(true);
    try {
      const streets = allStreets
        .filter((s) => selectedStreets.has(s.street))
        .map((s) => ({ street: s.street, lat: s.lat, lng: s.lng, lines: s.lines, a: s.a, b: s.b }));
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
        // Automatisch afvinken zodra je dicht genoeg bij een punt van de straat komt.
        if (autoMarkRef.current) {
          const d = detailRef.current;
          if (d) {
            for (const s of d.streets) {
              if (s.isDone) continue;
              let minDist = haversine(latitude, longitude, s.lat, s.lng);
              const lines = parseLines(s.geometry);
              if (lines) {
                for (const line of lines) {
                  for (const c of line) {
                    const dist = haversine(latitude, longitude, c[1], c[0]);
                    if (dist < minDist) minDist = dist;
                  }
                }
              }
              if (minDist <= GPS_MARK_RADIUS) setStreetDone(s.id, true);
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

  const parseLines = (g: string | null): number[][][] | null => {
    if (!g) return null;
    try { return JSON.parse(g); } catch { return null; }
  };

  const detailMapStreets: MapStreet[] = detail
    ? detail.streets.map((s) => ({
        id: s.id, street: s.street, lat: s.lat, lng: s.lng,
        isDone: s.isDone, orderIndex: s.orderIndex, lines: parseLines(s.geometry),
      }))
    : [];

  // Straten in rijvolgorde; de eerste die nog niet gereden is, is de "volgende" straat.
  const rijvolgorde = detail ? [...detail.streets].sort((a, b) => a.orderIndex - b.orderIndex) : [];
  const volgende = rijvolgorde.find((s) => !s.isDone) ?? null;
  const doneCount = detail ? detail.streets.filter((s) => s.isDone).length : 0;
  const totalCount = detail ? detail.streets.length : 0;
  const voortgangBadge = totalCount > 0 && doneCount >= totalCount ? 'badge-success' : doneCount > 0 ? 'badge-warning' : 'badge-gray';

  // Gekozen straten in de wizard, in de volgorde van de stratenlijst.
  const gekozenStraten = wizardMapStreets.map((s) => s.street);

  if (loading) {
    return <div className="laadscherm">Laden…</div>;
  }

  const gpsIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>
  );
  const plusIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
  );
  const trashIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
  );
  const kruisIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
  );

  const gpsKnopTekst = gpsActive ? 'GPS aan, stop' : 'Start live GPS';

  return (
    <AppShell
      title="Controlerondes"
      rightActions={
        <>
          {user && <span className="user-badge">{user.username}</span>}
          {view !== 'list' && (
            <NavButton icon={Icons.Back} onClick={() => { stopGps(); setView('list'); loadRounds(); }}>Rondes</NavButton>
          )}
          <NavButton icon={Icons.Back} onClick={() => router.push('/dashboard')}>Dashboard</NavButton>
          <NavButton icon={Icons.Logout} danger onClick={handleLogout}>Uitloggen</NavButton>
        </>
      }
    >
      {/* Alleen pagina-lay-out; kaarten, knoppen, velden en badges komen uit globals.css.
          Mobiel (tot 640px) en gestapelde kolommen (tot 760px) staan onderaan in de media queries. */}
      <style jsx>{`
        .toprow { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
        .toprow .page-subtitle { margin-bottom: 0; }
        .toprow-tekst { min-width: 0; }
        .knoppenrij { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .ronde-knoppen { margin-top: 14px; }
        .ronde-knoppen .btn-primary { flex: 1; }
        .detail-knoppen .btn-gps { flex: 1 1 auto; }
        .detail-knoppen .btn-reset { flex: 0 0 auto; }
        .rounds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
        .round-kaart { min-height: 60px; }
        .round-kop { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
        .round-tekst { min-width: 0; }
        .round-naam { font-weight: 700; font-size: 15px; color: var(--navy); overflow-wrap: anywhere; }
        .round-plaats { font-size: 13px; color: var(--grijs-500); margin-top: 2px; }
        .round-voet { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: var(--grijs-500); flex-wrap: wrap; }
        /* Verwijderknop: tikdoel 44x44, negatieve marge zodat de kaart niet groeit */
        .verwijder { flex: none; width: 44px; height: 44px; margin: -10px -12px -10px 0; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
        .bar { height: 6px; background: var(--grijs-200); border-radius: 999px; overflow: hidden; margin-top: 14px; }
        .bar-fill { height: 100%; background: var(--groen); border-radius: 999px; transition: width .3s; }
        .combo { position: relative; }
        .hitlist {
          list-style: none; margin: 4px 0 0; padding: 0;
          border: 1px solid var(--grijs-200); border-radius: var(--radius-md); overflow: hidden;
          position: absolute; left: 0; right: 0; top: 100%; z-index: 20;
          background: var(--wit); box-shadow: var(--shadow-lg);
        }
        .hit { display: flex; align-items: center; flex-wrap: wrap; gap: 0 4px; min-height: 44px; padding: 8px 14px; cursor: pointer; font-size: 14px; border-top: 1px solid var(--grijs-200); color: var(--navy); }
        .hit:first-child { border-top: none; }
        .hit:hover, .hit-active { background: var(--blue-light); }
        .hit-label { color: var(--grijs-500); }
        .twocol { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
        .twocol-kaart { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); }
        /* Wizard: stratenlijst links over de volle hoogte, kaart en ronde-formulier rechts */
        .twocol-wizard { grid-template-areas: "straten kaart" "straten ronde"; }
        .gebied-straten { grid-area: straten; min-width: 0; }
        .gebied-kaart { grid-area: kaart; min-width: 0; }
        .gebied-ronde { grid-area: ronde; min-width: 0; }
        .kaart-wrap { height: 280px; }
        .kaart-wrap-detail { height: 440px; }
        .selectie-rij { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; color: var(--grijs-500); flex-wrap: wrap; }
        .selectie-rij strong { color: var(--navy); }
        .street-list { max-height: 46vh; overflow-y: auto; border: 1px solid var(--grijs-200); border-radius: var(--radius-md); background: var(--wit); }
        .street-list.hoog { max-height: 60vh; border: none; border-radius: 0; }
        .street-row { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 9px 14px; border-top: 1px solid var(--grijs-200); font-size: 14px; cursor: pointer; color: var(--navy); user-select: none; -webkit-user-select: none; }
        .street-row:first-child { border-top: none; }
        .street-row:hover { background: var(--grijs-50); }
        .street-row.row-active { background: var(--blue-light); }
        .street-row.done { background: var(--groen-light); }
        .street-row.done .straat { text-decoration: line-through; color: var(--grijs-500); }
        /* Volgende straat: licht blauw met een blauwe rand links, zodat je in één oogopslag ziet waar je bent */
        .street-row.volgende { background: var(--blue-light); box-shadow: inset 4px 0 0 var(--blue); }
        .street-row.volgende .straat { font-weight: 700; }
        .volgende-label { font-size: 11px; font-weight: 700; color: var(--blue); text-transform: uppercase; letter-spacing: 0.08em; }
        .straat { flex: 1; min-width: 0; overflow-wrap: anywhere; }
        .num { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; border-radius: 6px; font-size: 12px; font-weight: 700; background: var(--blue-light); color: var(--blue); flex: none; }
        .num.done { background: var(--groen-light); color: var(--groen-tekst); }
        .check { width: 18px; height: 18px; flex: none; }
        .gekozen-lijst { max-height: 32vh; overflow-y: auto; border: 1px solid var(--grijs-200); border-radius: var(--radius-md); background: var(--wit); margin-bottom: 12px; }
        .gekozen-rij { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 4px 6px 4px 14px; border-top: 1px solid var(--grijs-200); font-size: 14px; color: var(--navy); }
        .gekozen-rij:first-child { border-top: none; }
        .gekozen-rij .verwijder { margin: 0; }
        .voortgang-kop { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
        .autovink { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 6px 0 0; font-size: 13px; color: var(--grijs-500); cursor: pointer; user-select: none; -webkit-user-select: none; }
        .leeg-lijst { padding: 16px; color: var(--grijs-500); font-size: 14px; }
        /* Vaste balk onderaan tijdens het rijden: alleen op de telefoon */
        .mobiel-balk { display: none; }

        @media (max-width: 760px) {
          .twocol, .twocol-kaart { grid-template-columns: 1fr; }
          .twocol-wizard { grid-template-areas: "kaart" "straten" "ronde"; }
          .kaart-wrap { height: min(45vh, 360px); }
          .kaart-wrap-detail { height: min(48vh, 420px); }
        }

        @media (max-width: 640px) {
          .toprow { flex-direction: column; align-items: stretch; gap: 12px; margin-bottom: 16px; }
          .toprow > .btn { width: 100%; }
          /* Op de telefoon zit de GPS-knop in de vaste onderbalk; bovenaan alleen Reset */
          .detail-knoppen .btn-gps { display: none; }
          .detail-knoppen .btn { flex: 1 1 auto; }
          .rounds-grid { grid-template-columns: 1fr; gap: 10px; }
          .hit { padding: 10px 14px; font-size: 15px; }
          .selectie-knoppen { flex: 1 1 100%; }
          .street-list { max-height: 50vh; }
          /* Tijdens het rijden scrolt de pagina zelf, geen lijst-in-lijst */
          .street-list.hoog { max-height: none; overflow: visible; }
          .street-row { min-height: 52px; padding: 10px 14px; font-size: 15px; }
          .num { min-width: 28px; height: 28px; font-size: 13px; border-radius: 8px; }
          .check { width: 22px; height: 22px; }
          .gekozen-rij { min-height: 48px; font-size: 15px; }
          .voortgang-kop { gap: 4px 12px; }
          .autovink { font-size: 14px; }
          .mobiel-balk {
            display: flex; align-items: center; gap: 12px;
            position: sticky; bottom: 0; z-index: 30;
            margin: 16px -16px -32px;
            padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
            background: var(--wit); border-top: 1px solid var(--grijs-200);
            box-shadow: 0 -4px 12px rgba(12, 27, 51, 0.06);
          }
          .mobiel-balk-info { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
          .mobiel-balk-teller { font-size: 18px; font-weight: 800; color: var(--navy); line-height: 1.1; }
          .mobiel-balk-volgende { font-size: 12px; color: var(--grijs-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .mobiel-balk .btn { flex: 0 1 auto; min-height: 50px; padding-left: 18px; padding-right: 18px; }
        }
      `}</style>

      {/* ============ LIJST ============ */}
      {view === 'list' && (
        <>
          <div className="toprow">
            <div className="toprow-tekst">
              <h1 className="page-title">Controlerondes</h1>
              <p className="page-subtitle">Plan een route langs straten en houd tijdens het rijden je voortgang bij.</p>
            </div>
            <button className="btn btn-primary" onClick={startNewRound}>{plusIcon} Nieuwe ronde</button>
          </div>

          {rounds.length === 0 ? (
            <div className="leeg">Nog geen rondes. Maak er een aan om te beginnen.</div>
          ) : (
            <div className="rounds-grid">
              {rounds.map((r) => {
                const pct = r.streetsCount ? Math.round((r.doneCount / r.streetsCount) * 100) : 0;
                const klaar = r.streetsCount > 0 && r.doneCount >= r.streetsCount;
                return (
                  <div key={r.id} className="card card-interactive round-kaart" onClick={() => openRoundById(r.id)}>
                    <div className="round-kop">
                      <div className="round-tekst">
                        <div className="round-naam">{r.name}</div>
                        <div className="round-plaats">{r.place}</div>
                      </div>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger verwijder"
                        onClick={(e) => { e.stopPropagation(); deleteRound(r.id, r.name); }}
                        aria-label={`Ronde ${r.name} verwijderen`}
                      >
                        {trashIcon}
                      </button>
                    </div>
                    <div className="bar"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
                    <div className="round-voet">
                      <span className={`badge ${klaar ? 'badge-success' : r.doneCount > 0 ? 'badge-warning' : 'badge-gray'}`}>
                        {r.doneCount}/{r.streetsCount} straten gereden
                      </span>
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
          <h1 className="page-title">Nieuwe ronde</h1>
          <p className="page-subtitle">
            {wizardStep === 'place' ? 'Stap 1. Kies een plaats' : `Stap 2. Kies straten in ${selectedPlace}`}
          </p>

          {wizardStep === 'place' && (
            <div className="card card-padded" style={{ maxWidth: 560 }}>
              <p className="section-label">Plaats</p>
              <label className="label" htmlFor="plaatsnaam">Plaatsnaam</label>
              <div className="combo">
                <input
                  id="plaatsnaam"
                  className="input"
                  autoFocus
                  role="combobox"
                  aria-expanded={placeOpen && placeHits.length > 0}
                  aria-autocomplete="list"
                  autoComplete="off"
                  autoCapitalize="words"
                  enterKeyHint="search"
                  placeholder="Typ een plaatsnaam, bijv. Heeze"
                  value={placeQuery}
                  onChange={(e) => { setPlaceQuery(e.target.value); setSelectedPlace(null); setPlaceOpen(true); }}
                  onFocus={() => { if (placeHits.length > 0) setPlaceOpen(true); }}
                  onBlur={() => setTimeout(() => setPlaceOpen(false), 150)}
                  onKeyDown={onPlaceKeyDown}
                />
                {placeOpen && placeHits.length > 0 && (
                  <ul className="hitlist">
                    {placeHits.map((h, i) => (
                      <li
                        key={h.label}
                        className={`hit ${i === placeHighlight ? 'hit-active' : ''}`}
                        onMouseEnter={() => setPlaceHighlight(i)}
                        onMouseDown={(e) => { e.preventDefault(); choosePlace(h.name); }}
                        onTouchStart={() => setPlaceHighlight(i)}
                      >
                        <strong>{h.name}</strong>
                        {h.label !== h.name && <span className="hit-label">, {h.label}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="hint">Kies uit de lijst of druk op Enter voor de eerste suggestie.</p>
              {streetsLoading && <p className="laden">Straten ophalen…</p>}
              {wizardError && <div className="alert alert-danger" style={{ marginTop: 12 }}>{wizardError}</div>}
            </div>
          )}

          {wizardStep === 'streets' && (
            <div className="twocol twocol-wizard">
              <div className="card gebied-straten">
                <p className="section-label">Straten</p>
                <div style={{ marginBottom: 10 }}>
                  <input
                    className="input"
                    role="combobox"
                    aria-autocomplete="list"
                    autoComplete="off"
                    enterKeyHint="done"
                    placeholder="Typ om te zoeken, Enter voegt de bovenste toe"
                    value={streetSearch}
                    onChange={(e) => { setStreetSearch(e.target.value); setStreetHighlight(0); }}
                    onKeyDown={onStreetKeyDown}
                  />
                </div>
                <div className="selectie-rij">
                  <span>
                    <strong>{selectedStreets.size}</strong> geselecteerd, {allStreets.length} straten
                  </span>
                  <div className="knoppenrij selectie-knoppen">
                    <button type="button" className="btn btn-sm" onClick={selectAllFiltered}>Alles</button>
                    <button type="button" className="btn btn-sm" onClick={deselectAll} disabled={selectedStreets.size === 0}>Wissen</button>
                  </div>
                </div>
                <div className="street-list">
                  {filteredStreets.length === 0 ? (
                    <div className="leeg-lijst">Geen straten.</div>
                  ) : (
                    filteredStreets.map((s, i) => {
                      const sel = selectedStreets.has(s.street);
                      return (
                        <label
                          key={s.street}
                          className={`street-row ${sel ? 'done' : ''} ${i === streetHighlight ? 'row-active' : ''}`}
                          onMouseEnter={() => setStreetHighlight(i)}
                        >
                          <input type="checkbox" className="check" checked={sel} onChange={() => toggleStreet(s.street)} />
                          <span className="straat">{s.street}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="gebied-kaart">
                <div className="kaart-wrap">
                  <RouteMap streets={wizardMapStreets} height="100%" fitKey={wizardMapStreets.length} />
                </div>
                <p className="hint">De rijvolgorde en route over de wegen worden berekend zodra je de ronde aanmaakt.</p>
              </div>

              <div className="card gebied-ronde">
                <p className="section-label">Ronde</p>
                {gekozenStraten.length > 0 && (
                  <>
                    <div className="selectie-rij">
                      <span><strong>{gekozenStraten.length}</strong> gekozen {gekozenStraten.length === 1 ? 'straat' : 'straten'}</span>
                    </div>
                    <div className="gekozen-lijst">
                      {gekozenStraten.map((naam) => (
                        <div key={naam} className="gekozen-rij">
                          <span className="straat">{naam}</span>
                          <button
                            type="button"
                            className="icon-btn icon-btn-danger verwijder"
                            onClick={() => toggleStreet(naam)}
                            aria-label={`${naam} verwijderen`}
                          >
                            {kruisIcon}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="veld">
                  <label className="label" htmlFor="rondenaam">Naam van de ronde</label>
                  <input
                    id="rondenaam"
                    className="input"
                    autoComplete="off"
                    placeholder={`Bijv. Controle ${selectedPlace ?? ''}`}
                    value={roundName}
                    onChange={(e) => setRoundName(e.target.value)}
                  />
                </div>
                <div className="veld">
                  <label className="label" htmlFor="rondenotitie">Notitie (optioneel)</label>
                  <input
                    id="rondenotitie"
                    className="input"
                    autoComplete="off"
                    placeholder="Bijv. wat je precies controleert"
                    value={roundNotes}
                    onChange={(e) => setRoundNotes(e.target.value)}
                  />
                </div>
                {wizardError && <div className="alert alert-danger">{wizardError}</div>}
                <div className="knoppenrij ronde-knoppen">
                  <button type="button" className="btn" onClick={() => setWizardStep('place')}>Terug</button>
                  <button type="button" className="btn btn-primary" onClick={createRound} disabled={creating || selectedStreets.size === 0}>
                    {creating ? 'Route berekenen…' : `Ronde aanmaken (${selectedStreets.size})`}
                  </button>
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
            <div className="toprow-tekst">
              <h1 className="page-title">{detail.name}</h1>
              <p className="page-subtitle">
                {detail.place}
                {detail.routeDistance ? `, ${(detail.routeDistance / 1000).toFixed(1)} km route` : ''}
                {detail.notes ? `, ${detail.notes}` : ''}
              </p>
            </div>
            <div className="knoppenrij detail-knoppen">
              <button
                type="button"
                className={`btn btn-lg btn-gps ${gpsActive ? 'btn-success' : 'btn-primary'}`}
                onClick={() => (gpsActive ? stopGps() : startGps())}
                aria-pressed={gpsActive}
              >
                {gpsIcon}
                {gpsKnopTekst}
              </button>
              <button type="button" className="btn btn-danger-soft btn-reset" onClick={resetRound}>Reset</button>
            </div>
          </div>

          {gpsError && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{gpsError}</div>}

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="voortgang-kop">
              <span className={`badge ${voortgangBadge}`}>
                {doneCount}/{totalCount} straten gereden
              </span>
              <label className="autovink">
                <input type="checkbox" className="check" checked={autoMark} onChange={(e) => setAutoMark(e.target.checked)} />
                Automatisch afvinken via GPS
              </label>
            </div>
            <div className="bar"><div className="bar-fill" style={{ width: `${totalCount ? (doneCount / totalCount) * 100 : 0}%` }} /></div>
          </div>

          <div className="twocol twocol-kaart">
            <div className="kaart-wrap-detail">
              <RouteMap
                streets={detailMapStreets}
                geometry={geometry}
                userPos={userPos}
                onToggle={(id, next) => setStreetDone(id, next)}
                height="100%"
              />
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="card-kop">Straten in rijvolgorde</div>
              <div className="street-list hoog">
                {rijvolgorde.map((s) => {
                  const isVolgende = volgende?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      className={`street-row ${s.isDone ? 'done' : ''} ${isVolgende ? 'volgende' : ''}`}
                      onClick={() => setStreetDone(s.id, !s.isDone)}
                      role="button"
                      aria-pressed={s.isDone}
                    >
                      <span className={`num ${s.isDone ? 'done' : ''}`}>{s.orderIndex + 1}</span>
                      <span className="straat">{s.street}</span>
                      {isVolgende && <span className="volgende-label">Volgende</span>}
                      <input
                        type="checkbox"
                        className="check"
                        checked={s.isDone}
                        onChange={(e) => { e.stopPropagation(); setStreetDone(s.id, e.target.checked); }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${s.street} gereden`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Vaste balk onderaan op de telefoon: voortgang, volgende straat en de GPS-knop altijd bij de hand */}
          <div className="mobiel-balk">
            <div className="mobiel-balk-info">
              <span className="mobiel-balk-teller">{doneCount}/{totalCount}</span>
              <span className="mobiel-balk-volgende">
                {volgende ? `Volgende: ${volgende.orderIndex + 1}. ${volgende.street}` : totalCount > 0 ? 'Alle straten gereden' : 'Geen straten'}
              </span>
            </div>
            <button
              type="button"
              className={`btn btn-lg ${gpsActive ? 'btn-success' : 'btn-primary'}`}
              onClick={() => (gpsActive ? stopGps() : startGps())}
              aria-pressed={gpsActive}
            >
              {gpsIcon}
              {gpsActive ? 'Stop' : 'Start GPS'}
            </button>
          </div>
        </>
      )}
    </AppShell>
  );
}
