/**
 * Route-optimalisatie voor controlerondes.
 *
 * Gegeven een set straten (met representatieve coördinaat) bepalen we een
 * logische rijvolgorde en, waar mogelijk, een route-traject over de echte
 * wegen. Primair via de publieke OSRM "trip"-service (lost een TSP-achtige
 * rondrit op en geeft geometrie langs het wegennet). Wanneer OSRM niet
 * beschikbaar is of te veel punten krijgt, valt de functie terug op een
 * nearest-neighbour-volgorde met rechte verbindingslijnen, zodat de ronde
 * altijd bruikbaar blijft.
 */

export interface RoutePoint {
  street: string;
  lat: number;
  lng: number;
}

export interface OptimizedRoute {
  /** orderIndex per invoer-punt: order[i] = positie van punt i in de rijvolgorde */
  order: number[];
  /** Route-traject als GeoJSON-coördinaten [[lng, lat], ...] voor tekenen op de kaart */
  geometry: number[][];
  /** Totale afstand in meters (null bij fallback zonder wegdata) */
  distance: number | null;
  /** true = via OSRM over echte wegen, false = fallback met rechte lijnen */
  followsRoads: boolean;
}

// OSRM raakt bij heel veel punten traag/onbetrouwbaar; boven deze grens
// gebruiken we meteen de fallback.
const OSRM_MAX_POINTS = 100;
const OSRM_TIMEOUT_MS = 12000;

function haversine(a: RoutePoint, b: RoutePoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nearest-neighbour-volgorde vanaf het eerste punt. */
function nearestNeighbourOrder(points: RoutePoint[]): number[] {
  const n = points.length;
  const visited = new Array(n).fill(false);
  const sequence: number[] = [];
  let current = 0;
  visited[0] = true;
  sequence.push(0);
  for (let step = 1; step < n; step++) {
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const d = haversine(points[current], points[j]);
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    if (best === -1) break;
    visited[best] = true;
    sequence.push(best);
    current = best;
  }
  // sequence = volgorde van punt-indices; zet om naar order[i] = positie van i
  const order = new Array(n).fill(0);
  sequence.forEach((pointIndex, position) => {
    order[pointIndex] = position;
  });
  return order;
}

function fallbackRoute(points: RoutePoint[]): OptimizedRoute {
  const order = nearestNeighbourOrder(points);
  // Bouw geometrie als rechte lijnen in de bepaalde volgorde.
  const sequence = points
    .map((_, i) => i)
    .sort((a, b) => order[a] - order[b]);
  const geometry = sequence.map((i) => [points[i].lng, points[i].lat]);
  return { order, geometry, distance: null, followsRoads: false };
}

/**
 * Bepaal de optimale rijvolgorde + route-traject. Gooit nooit; valt bij
 * problemen terug op de rechte-lijn-variant.
 */
export async function optimizeRoute(points: RoutePoint[]): Promise<OptimizedRoute> {
  if (points.length === 0) {
    return { order: [], geometry: [], distance: null, followsRoads: false };
  }
  if (points.length === 1) {
    return {
      order: [0],
      geometry: [[points[0].lng, points[0].lat]],
      distance: 0,
      followsRoads: false,
    };
  }

  if (points.length > OSRM_MAX_POINTS) {
    return fallbackRoute(points);
  }

  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
    const url =
      `https://router.project-osrm.org/trip/v1/driving/${coords}` +
      `?source=first&roundtrip=false&geometries=geojson&overview=full`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return fallbackRoute(points);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.trips?.[0] || !data.waypoints) {
      return fallbackRoute(points);
    }

    const order: number[] = points.map((_, i) => {
      const wp = data.waypoints[i];
      return typeof wp?.waypoint_index === 'number' ? wp.waypoint_index : i;
    });

    const geometry: number[][] = data.trips[0].geometry?.coordinates ?? [];
    const distance: number | null =
      typeof data.trips[0].distance === 'number' ? data.trips[0].distance : null;

    if (geometry.length === 0) return fallbackRoute(points);

    return { order, geometry, distance, followsRoads: true };
  } catch {
    return fallbackRoute(points);
  }
}
