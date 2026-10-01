/**
 * Client-side helper voor de PDOK Locatieserver (gratis, officiële NL-data):
 * een adres zoeken bij het vastleggen van een object.
 */

const BASE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';

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

export interface AddressHit {
  label: string; // volledige weergavenaam, bijv. "Sluisweg 1, 5361 HK Grave"
  lat: number;
  lng: number;
}

/**
 * Zoek een adres, weg of plaats en geef er een coördinaat bij. Gebruikt voor het
 * vastleggen van een object: je zoekt het bezoekadres en versleept daarna de
 * speld naar de plek waar je echt moet zijn.
 */
export async function searchAddresses(query: string): Promise<AddressHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url =
    `${BASE}?q=${encodeURIComponent(q)}` +
    `&fq=${encodeURIComponent('type:(adres OR weg OR woonplaats)')}` +
    `&fl=${encodeURIComponent('weergavenaam,centroide_ll')}` +
    `&rows=8`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('PDOK adres-zoekopdracht mislukt');
  const data = await res.json();
  const docs: Array<{ weergavenaam?: string; centroide_ll?: string }> = data?.response?.docs ?? [];
  const hits: AddressHit[] = [];
  const gezien = new Set<string>();
  for (const d of docs) {
    const punt = parsePoint(d.centroide_ll);
    const label = d.weergavenaam;
    if (!punt || !label || gezien.has(label)) continue;
    gezien.add(label);
    hits.push({ label, lat: punt.lat, lng: punt.lng });
  }
  return hits;
}
