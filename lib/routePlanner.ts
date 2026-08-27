/**
 * Route-planning voor controlerondes.
 *
 * Elke geselecteerde straat moet in z'n geheel gereden worden. We behandelen
 * een straat daarom als een te rijden segment met twee uiteinden (A en B).
 * De volgorde en rijrichting bepalen we met een nearest-neighbour-heuristiek:
 * vanaf het vorige eindpunt rijden we telkens naar het dichtstbijzijnde uiteinde
 * van een nog niet gereden straat en rijden die straat helemaal door. Zo wordt
 * er niet onnodig gekeerd en ontstaat een logische ronde.
 *
 * Met die volgorde vragen we OSRM een echte auto-route over de wegen op,
 * inclusief stap-voor-stap navigatie (afslag + straatnaam + afstand). Als OSRM
 * niet beschikbaar is, vallen we terug op rechte verbindingen zonder navigatie.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStreet {
  street: string;
  a: LatLng; // eindpunt A
  b: LatLng; // eindpunt B
}

export interface RouteStep {
  text: string; // leesbare instructie in het Nederlands
  name: string; // straatnaam waar de manoeuvre op slaat
  distance: number; // meters te rijden na deze instructie
}

export interface OptimizedRoute {
  /** order[i] = positie van straat i in de rijvolgorde */
  order: number[];
  /** Rij-traject als GeoJSON-coördinaten [[lng, lat], ...] */
  geometry: number[][];
  /** Totale afstand in meters (null bij fallback) */
  distance: number | null;
  /** Stap-voor-stap routebeschrijving (null bij fallback) */
  steps: RouteStep[] | null;
  /** true = via OSRM over echte wegen, false = fallback met rechte lijnen */
  followsRoads: boolean;
}

const OSRM_MAX_STREETS = 60; // ~2 waypoints per straat; boven dit: fallback
const OSRM_TIMEOUT_MS = 15000;

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface Leg {
  index: number; // straat-index
  enter: LatLng;
  exit: LatLng;
}

/**
 * Bepaal rijvolgorde + rijrichting per straat (nearest-neighbour arc routing).
 * Start bij het meest zuidwestelijke uiteinde voor een voorspelbaar beginpunt.
 */
function orderStreets(streets: RouteStreet[]): Leg[] {
  const n = streets.length;
  const used = new Array(n).fill(false);
  const legs: Leg[] = [];

  // Kies startpunt: zuidwestelijkste uiteinde.
  let current: LatLng = streets[0].a;
  let bestScore = Infinity;
  for (const s of streets) {
    for (const end of [s.a, s.b]) {
      const score = end.lat + end.lng;
      if (score < bestScore) { bestScore = score; current = end; }
    }
  }

  for (let step = 0; step < n; step++) {
    let bestIdx = -1;
    let enterAtA = true;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const dA = haversine(current, streets[i].a);
      const dB = haversine(current, streets[i].b);
      if (dA < bestDist) { bestDist = dA; bestIdx = i; enterAtA = true; }
      if (dB < bestDist) { bestDist = dB; bestIdx = i; enterAtA = false; }
    }
    if (bestIdx === -1) break;
    used[bestIdx] = true;
    const s = streets[bestIdx];
    const enter = enterAtA ? s.a : s.b;
    const exit = enterAtA ? s.b : s.a;
    legs.push({ index: bestIdx, enter, exit });
    current = exit;
  }
  return legs;
}

function maneuverText(type: string, modifier: string | undefined, name: string): string {
  const straat = name ? ` ${name}` : '';
  const dir = (() => {
    switch (modifier) {
      case 'left': return 'linksaf';
      case 'slight left': return 'iets naar links';
      case 'sharp left': return 'scherp linksaf';
      case 'right': return 'rechtsaf';
      case 'slight right': return 'iets naar rechts';
      case 'sharp right': return 'scherp rechtsaf';
      case 'straight': return 'rechtdoor';
      case 'uturn': return 'keren';
      default: return '';
    }
  })();
  switch (type) {
    case 'depart': return `Vertrek${straat ? ` op${straat}` : ''}`;
    case 'arrive': return 'Aankomst — ronde compleet';
    case 'turn': return `Sla ${dir || 'af'}${straat ? ` naar${straat}` : ''}`;
    case 'new name': return `Ga verder${straat ? ` op${straat}` : ''}`;
    case 'continue': return `Ga rechtdoor${straat ? ` op${straat}` : ''}`;
    case 'merge': return `Voeg in${straat ? ` op${straat}` : ''}`;
    case 'roundabout':
    case 'rotary': return `Neem de rotonde${straat ? ` naar${straat}` : ''}`;
    case 'fork': return `Houd ${dir || 'aan'}${straat ? ` naar${straat}` : ''}`;
    case 'end of road': return `Sla ${dir || 'af'}${straat ? ` naar${straat}` : ''}`;
    default: return `${dir ? `Ga ${dir}` : 'Rijd verder'}${straat ? ` op${straat}` : ''}`;
  }
}

function fallback(streets: RouteStreet[], legs: Leg[]): OptimizedRoute {
  const order = new Array(streets.length).fill(0);
  legs.forEach((leg, pos) => { order[leg.index] = pos; });
  const geometry: number[][] = [];
  legs.forEach((leg) => {
    geometry.push([leg.enter.lng, leg.enter.lat]);
    geometry.push([leg.exit.lng, leg.exit.lat]);
  });
  return { order, geometry, distance: null, steps: null, followsRoads: false };
}

/** Bepaal de route. Gooit nooit; valt terug op rechte lijnen bij problemen. */
export async function optimizeRoute(streets: RouteStreet[]): Promise<OptimizedRoute> {
  if (streets.length === 0) {
    return { order: [], geometry: [], distance: null, steps: null, followsRoads: false };
  }

  const legs = orderStreets(streets);
  const order = new Array(streets.length).fill(0);
  legs.forEach((leg, pos) => { order[leg.index] = pos; });

  if (streets.length > OSRM_MAX_STREETS) {
    return fallback(streets, legs);
  }

  // Waypoints: per straat enter->exit; sluit de ronde door terug te keren naar start.
  const waypoints: LatLng[] = [];
  legs.forEach((leg) => { waypoints.push(leg.enter); waypoints.push(leg.exit); });
  if (legs.length > 0) waypoints.push(legs[0].enter);

  try {
    const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
    const url =
      `https://router.project-osrm.org/route/v1/driving/${coords}` +
      `?overview=full&geometries=geojson&steps=true&continue_straight=false`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return fallback(streets, legs);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (data.code !== 'Ok' || !route?.geometry?.coordinates) {
      return fallback(streets, legs);
    }

    const geometry: number[][] = route.geometry.coordinates;
    const distance: number | null = typeof route.distance === 'number' ? route.distance : null;

    const steps: RouteStep[] = [];
    for (const leg of route.legs ?? []) {
      for (const st of leg.steps ?? []) {
        const m = st.maneuver ?? {};
        const text = maneuverText(m.type, m.modifier, st.name || '');
        // Sla nul-afstand 'new name'-ruis over, behalve vertrek/aankomst.
        if (st.distance < 5 && m.type !== 'depart' && m.type !== 'arrive') continue;
        steps.push({ text, name: st.name || '', distance: Math.round(st.distance || 0) });
      }
    }

    return { order, geometry, distance, steps: steps.length ? steps : null, followsRoads: true };
  } catch {
    return fallback(streets, legs);
  }
}
