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
  lat: number;
  lng: number;
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

/** Haal alle straten binnen een woonplaats op, met representatieve coördinaat. */
export async function getStreets(place: string): Promise<StreetHit[]> {
  const p = place.trim();
  if (!p) return [];
  const url =
    `${BASE}?q=*` +
    `&fq=${encodeURIComponent('type:weg')}` +
    `&fq=${encodeURIComponent(`woonplaatsnaam:"${p}"`)}` +
    `&fl=${encodeURIComponent('straatnaam,centroide_ll')}` +
    `&rows=2000&sort=${encodeURIComponent('straatnaam asc')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('PDOK straten-ophalen mislukt');
  const data = await res.json();
  const docs: any[] = data?.response?.docs ?? [];

  // Een straat kan uit meerdere weg-segmenten bestaan; neem één representatief
  // punt per unieke straatnaam.
  const byStreet = new Map<string, StreetHit>();
  for (const d of docs) {
    const street: string = d.straatnaam;
    if (!street || byStreet.has(street)) continue;
    const pt = parsePoint(d.centroide_ll);
    if (!pt) continue;
    byStreet.set(street, { street, lat: pt.lat, lng: pt.lng });
  }
  return Array.from(byStreet.values()).sort((a, b) => a.street.localeCompare(b.street, 'nl'));
}
