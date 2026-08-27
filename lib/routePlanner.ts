/**
 * Route-planning voor controlerondes.
 *
 * Elke geselecteerde straat moet in z'n geheel gereden worden. We behandelen
 * een straat als een te rijden segment met twee uiteinden (A en B). De volgorde
 * en rijrichting bepalen we met een nearest-neighbour-heuristiek: vanaf het
 * vorige eindpunt rijden we telkens naar het dichtstbijzijnde uiteinde van een
 * nog niet gereden straat en rijden die straat helemaal door. Zo wordt er niet
 * onnodig gekeerd en ontstaat een logische ronde.
 *
 * Met die volgorde vragen we OSRM een echte auto-route op. Belangrijk: OSRM
 * geeft het wegdek nauwkeurig terug (volgt bochten), terwijl de PDOK-geometrie
 * grof vereenvoudigd is. We halen daarom per straat het bijbehorende wegtraject
 * uit de OSRM-route en gebruiken dát voor het inkleuren van de straat.
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

export interface OptimizedRoute {
  /** order[i] = positie van straat i in de rijvolgorde */
  order: number[];
  /** Volledig rij-traject als GeoJSON-coords [[lng,lat],...] (incl. verbindingen) */
  geometry: number[][];
  /** Per straat (originele index) het wegtraject uit OSRM, of null bij fallback */
  streetGeometries: (number[][] | null)[];
  /** Totale afstand in meters (null bij fallback) */
  distance: number | null;
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
  index: number; // originele straat-index
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
    legs.push({
      index: bestIdx,
      enter: enterAtA ? s.a : s.b,
      exit: enterAtA ? s.b : s.a,
    });
    current = legs[legs.length - 1].exit;
  }
  return legs;
}

function fallback(streets: RouteStreet[], legs: Leg[]): OptimizedRoute {
  const order = new Array(streets.length).fill(0);
  legs.forEach((leg, pos) => { order[leg.index] = pos; });
  const geometry: number[][] = [];
  legs.forEach((leg) => {
    geometry.push([leg.enter.lng, leg.enter.lat]);
    geometry.push([leg.exit.lng, leg.exit.lat]);
  });
  return {
    order,
    geometry,
    streetGeometries: new Array(streets.length).fill(null),
    distance: null,
    followsRoads: false,
  };
}

/** Bepaal de route. Gooit nooit; valt terug op rechte lijnen bij problemen. */
export async function optimizeRoute(streets: RouteStreet[]): Promise<OptimizedRoute> {
  if (streets.length === 0) {
    return { order: [], geometry: [], streetGeometries: [], distance: null, followsRoads: false };
  }

  const legs = orderStreets(streets);
  const order = new Array(streets.length).fill(0);
  legs.forEach((leg, pos) => { order[leg.index] = pos; });

  if (streets.length > OSRM_MAX_STREETS) {
    return fallback(streets, legs);
  }

  // Waypoints: per straat enter->exit; sluit de ronde door terug te keren.
  // Dit maakt de OSRM-legs voorspelbaar: even legs (0,2,4,...) = straat rijden,
  // oneven legs = verbinding naar de volgende straat.
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
    if (data.code !== 'Ok' || !route?.geometry?.coordinates || !route.legs) {
      return fallback(streets, legs);
    }

    const geometry: number[][] = route.geometry.coordinates;
    const distance: number | null = typeof route.distance === 'number' ? route.distance : null;

    // Haal per straat het wegtraject uit de bijbehorende (even) OSRM-leg.
    const streetGeometries: (number[][] | null)[] = new Array(streets.length).fill(null);
    for (let k = 0; k < legs.length; k++) {
      const osrmLeg = route.legs[2 * k];
      if (!osrmLeg?.steps) continue;
      const coordsOut: number[][] = [];
      for (const st of osrmLeg.steps) {
        const c = st.geometry?.coordinates;
        if (!Array.isArray(c)) continue;
        for (const pt of c) {
          const last = coordsOut[coordsOut.length - 1];
          if (!last || last[0] !== pt[0] || last[1] !== pt[1]) coordsOut.push(pt);
        }
      }
      if (coordsOut.length >= 2) streetGeometries[legs[k].index] = coordsOut;
    }

    return { order, geometry, streetGeometries, distance, followsRoads: true };
  } catch {
    return fallback(streets, legs);
  }
}
