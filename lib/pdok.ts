/**
 * Client-side helpers voor de PDOK Locatieserver (gratis, officiële NL-data).
 * Wordt gebruikt om woonplaatsen te zoeken en alle straten binnen een
 * woonplaats op te halen, inclusief een representatieve coördinaat per straat.
 */

const BASE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';

export interface PlaceHit {
  name: string; // woonplaatsnaam
  label: string; // weergavenaam (incl. gemeente/provincie)
}

export interface StreetHit {
  street: string;
  lat: number; // representatief midpunt
  lng: number;
  lines: number[][][]; // volledige straatlijn(en): [ [ [lng,lat], ... ], ... ]
  a: { lat: number; lng: number }; // eindpunt A
  b: { lat: number; lng: number }; // eindpunt B
}

// "POINT(5.5601 51.3835)" -> { lng, lat }
function parsePoint(wkt: string | undefined): { lat: number; lng: number } | null {
  if (!wkt) return null;
  const m = wkt.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!m) return null;
  const lng = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

// "x y, x y, ..." -> [[lng,lat], ...]
function parseCoordPairs(body: string): number[][] {
  return body
    .split(',')
    .map((pair) => pair.trim().split(/\s+/).map(Number))
    .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [c[0], c[1]]);
}

// LINESTRING(...) of MULTILINESTRING((...),(...)) -> array van lijnen [[lng,lat],...]
function parseLines(wkt: string | undefined): number[][][] {
  if (!wkt) return [];
  if (wkt.startsWith('MULTILINESTRING')) {
    const inner = wkt.slice(wkt.indexOf('(') + 1, wkt.lastIndexOf(')'));
    const groups = inner.match(/\(([^)]*)\)/g) || [];
    return groups.map((g) => parseCoordPairs(g.slice(1, -1))).filter((l) => l.length > 0);
  }
  if (wkt.startsWith('LINESTRING')) {
    const inner = wkt.slice(wkt.indexOf('(') + 1, wkt.lastIndexOf(')'));
    const line = parseCoordPairs(inner);
    return line.length ? [line] : [];
  }
  return [];
}

function haversine(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// De twee verst-uiteenliggende punten van een straat = de uiteinden (entry/exit).
function farthestPair(lines: number[][][]): { a: number[]; b: number[] } | null {
  const pts = lines.flat();
  if (pts.length === 0) return null;
  if (pts.length === 1) return { a: pts[0], b: pts[0] };
  let best = 0;
  let a = pts[0];
  let b = pts[pts.length - 1];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = haversine(pts[i][0], pts[i][1], pts[j][0], pts[j][1]);
      if (d > best) { best = d; a = pts[i]; b = pts[j]; }
    }
  }
  return { a, b };
}

/** Zoek woonplaatsen op (voor de autocomplete). */
export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url =
    `${BASE}?q=${encodeURIComponent(q)}` +
    `&fq=${encodeURIComponent('type:woonplaats')}` +
    `&fl=${encodeURIComponent('weergavenaam,woonplaatsnaam')}` +
    `&rows=8`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('PDOK plaats-zoekopdracht mislukt');
  const data = await res.json();
  const docs: any[] = data?.response?.docs ?? [];
  const seen = new Set<string>();
  const hits: PlaceHit[] = [];
  for (const d of docs) {
    const name: string = d.woonplaatsnaam || d.weergavenaam;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    hits.push({ name, label: d.weergavenaam || name });
  }
  return hits;
}

/**
 * Haal alle straten binnen een woonplaats op, met representatieve coördinaat.
 * De PDOK-endpoint geeft maximaal 100 records per aanroep, dus pagineren we
 * met `start` tot alle straten binnen zijn.
 */
export async function getStreets(place: string): Promise<StreetHit[]> {
  const p = place.trim();
  if (!p) return [];

  const PAGE = 100;
  const MAX_RECORDS = 3000; // veiligheidsgrens tegen extreem grote plaatsen

  // Een straat kan uit meerdere weg-records/segmenten bestaan; verzamel alle
  // lijnen per unieke straatnaam en onthoud een centroïde als midpunt.
  const linesByStreet = new Map<string, number[][][]>();
  const centroidByStreet = new Map<string, { lat: number; lng: number }>();
  let start = 0;
  let numFound = Infinity;

  while (start < numFound && start < MAX_RECORDS) {
    const url =
      `${BASE}?q=*` +
      `&fq=${encodeURIComponent('type:weg')}` +
      `&fq=${encodeURIComponent(`woonplaatsnaam:"${p}"`)}` +
      `&fl=${encodeURIComponent('straatnaam,centroide_ll,geometrie_ll')}` +
      `&rows=${PAGE}&start=${start}` +
      `&sort=${encodeURIComponent('straatnaam asc')}`;

    const res = await fetch(url);
    if (!res.ok) {
      // Eerste pagina mislukt = echte fout; latere pagina: gebruik wat we hebben.
      if (start === 0) throw new Error('PDOK straten-ophalen mislukt');
      break;
    }

    const data = await res.json();
    numFound = data?.response?.numFound ?? 0;
    const docs: any[] = data?.response?.docs ?? [];
    if (docs.length === 0) break;

    for (const d of docs) {
      const street: string = d.straatnaam;
      if (!street) continue;
      const lines = parseLines(d.geometrie_ll);
      if (lines.length) {
        const existing = linesByStreet.get(street) || [];
        linesByStreet.set(street, existing.concat(lines));
      }
      if (!centroidByStreet.has(street)) {
        const pt = parsePoint(d.centroide_ll);
        if (pt) centroidByStreet.set(street, pt);
      }
    }

    start += PAGE;
  }

  const hits: StreetHit[] = [];
  for (const [street, lines] of linesByStreet.entries()) {
    const ends = farthestPair(lines);
    if (!ends) continue;
    const centroid = centroidByStreet.get(street);
    const mid = centroid ?? {
      lng: (ends.a[0] + ends.b[0]) / 2,
      lat: (ends.a[1] + ends.b[1]) / 2,
    };
    hits.push({
      street,
      lat: mid.lat,
      lng: mid.lng,
      lines,
      a: { lat: ends.a[1], lng: ends.a[0] },
      b: { lat: ends.b[1], lng: ends.b[0] },
    });
  }

  return hits.sort((a, b) => a.street.localeCompare(b.street, 'nl'));
}
