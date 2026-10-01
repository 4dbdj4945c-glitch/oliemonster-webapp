/**
 * Route-planning voor de planning van de oliemonsters: de rijvolgorde langs
 * de objecten van een dag, vanaf een vast vertrekpunt (Heeze) en weer terug.
 *
 * Met die volgorde vragen we OSRM een echte auto-route op, met afstand en
 * rijtijd. Valt OSRM uit, dan rekenen we hemelsbreed met rechte lijnen.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

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

/* Puntroute: van object naar object. Gooit nooit: bij storing of te veel
   punten valt hij terug op rechte lijnen. */

export interface PointRoute {
  /** order[i] = positie van punt i in de rijvolgorde */
  order: number[];
  /** Volledig traject als GeoJSON-coords [[lng,lat],...], inclusief heen en terug */
  geometry: number[][];
  /** Totale afstand in meters (hemelsbreed bij fallback) */
  distance: number | null;
  /** Totale rijtijd in seconden; null als OSRM niets gaf */
  duration: number | null;
  /** true = via OSRM over echte wegen, false = rechte lijnen */
  followsRoads: boolean;
}

const OSRM_MAX_POINTS = 40;
// Kort: de planning doet één aanroep per dag achter elkaar, dus 20 dagen x 15 seconden zou tegen de tijdslimiet van Vercel lopen.
const OSRM_PUNT_TIMEOUT_MS = 8000;

/** Rijvolgorde van punten vanaf het vertrekpunt, dichtstbijzijnde eerst. */
function orderPoints(points: LatLng[], start: LatLng): number[] {
  const over = points.map((_, i) => i);
  const volgorde: number[] = [];
  let huidig = start;
  while (over.length > 0) {
    let besteIdx = 0;
    let besteAfstand = Infinity;
    over.forEach((idx, k) => {
      const d = haversine(huidig, points[idx]);
      if (d < besteAfstand) { besteAfstand = d; besteIdx = k; }
    });
    const gekozen = over.splice(besteIdx, 1)[0];
    volgorde.push(gekozen);
    huidig = points[gekozen];
  }
  return volgorde;
}

function puntFallback(points: LatLng[], start: LatLng, volgorde: number[]): PointRoute {
  const order = new Array(points.length).fill(0);
  volgorde.forEach((idx, pos) => { order[idx] = pos; });
  const reeks = [start, ...volgorde.map((i) => points[i]), start];
  let afstand = 0;
  for (let i = 1; i < reeks.length; i++) afstand += haversine(reeks[i - 1], reeks[i]);
  return {
    order,
    geometry: reeks.map((p) => [p.lng, p.lat]),
    distance: Math.round(afstand),
    duration: null,
    followsRoads: false,
  };
}

/**
 * Bepaalt de rijvolgorde en de route langs een reeks punten, heen en terug vanaf
 * `start`. Met `vasteVolgorde` houdt hij de meegegeven volgorde aan (dat is wat
 * er gebeurt zodra jij zelf gesleept hebt) en rekent hij alleen de route uit.
 */
export async function optimizePointRoute(
  points: LatLng[],
  start: LatLng,
  vasteVolgorde?: number[]
): Promise<PointRoute> {
  if (points.length === 0) {
    return { order: [], geometry: [], distance: null, duration: null, followsRoads: false };
  }

  const volgorde = vasteVolgorde && vasteVolgorde.length === points.length
    ? vasteVolgorde
    : orderPoints(points, start);

  const order = new Array(points.length).fill(0);
  volgorde.forEach((idx, pos) => { order[idx] = pos; });

  if (points.length > OSRM_MAX_POINTS) {
    return puntFallback(points, start, volgorde);
  }

  try {
    const reeks = [start, ...volgorde.map((i) => points[i]), start];
    const coords = reeks.map((p) => `${p.lng},${p.lat}`).join(';');
    const url =
      `https://router.project-osrm.org/route/v1/driving/${coords}` +
      `?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OSRM_PUNT_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return puntFallback(points, start, volgorde);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (data.code !== 'Ok' || !route?.geometry?.coordinates) {
      return puntFallback(points, start, volgorde);
    }

    return {
      order,
      geometry: route.geometry.coordinates,
      distance: typeof route.distance === 'number' ? route.distance : null,
      duration: typeof route.duration === 'number' ? route.duration : null,
      followsRoads: true,
    };
  } catch {
    return puntFallback(points, start, volgorde);
  }
}
