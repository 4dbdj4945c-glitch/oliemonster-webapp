// Objecttypen van de planningsmodule: de plekken waar oliemonsters vandaan komen.
// Elk type heeft een icoon uit de IDS-set (zie STIJL.md, Iconen). Deze lijst wordt
// zowel door de API (validatie) als door de schermen (keuzelijst, icoon) gebruikt.

import type { IconNaam } from '@/app/components/ui';

export interface ObjectType {
  waarde: string;
  label: string;
  icoon: IconNaam;
}

export const OBJECT_TYPES: ObjectType[] = [
  { waarde: 'sluis', label: 'Sluis', icoon: 'ship-lock' },
  { waarde: 'stuw', label: 'Stuw', icoon: 'weir' },
  { waarde: 'brug', label: 'Brug', icoon: 'structure' },
  { waarde: 'gemaal', label: 'Gemaal', icoon: 'pump' },
  { waarde: 'kunstwerk', label: 'Kunstwerk', icoon: 'structure' },
  { waarde: 'pomp', label: 'Pompinstallatie', icoon: 'pump' },
  { waarde: 'afsluiter', label: 'Afsluiter', icoon: 'valve' },
  { waarde: 'cilinder', label: 'Hydraulische cilinder', icoon: 'hydraulic-cylinder' },
  { waarde: 'aftappunt', label: 'Aftappunt', icoon: 'sample-point' },
  { waarde: 'overig', label: 'Overig', icoon: 'map-pin' },
];

export function isObjectType(waarde: unknown): boolean {
  return typeof waarde === 'string' && OBJECT_TYPES.some((t) => t.waarde === waarde);
}

export function objectTypeLabel(waarde?: string | null): string {
  if (!waarde) return 'Onbekend';
  return OBJECT_TYPES.find((t) => t.waarde === waarde)?.label ?? waarde;
}

export function objectTypeIcoon(waarde?: string | null): IconNaam {
  if (!waarde) return 'map-pin';
  return OBJECT_TYPES.find((t) => t.waarde === waarde)?.icoon ?? 'map-pin';
}

/** "5 uur 30" van 330 minuten; leeg als er geen inschatting is. */
export function tijdInUren(minuten?: number | null): string {
  if (!minuten || minuten <= 0) return '';
  const uren = Math.floor(minuten / 60);
  const rest = minuten % 60;
  if (uren === 0) return `${rest} min`;
  if (rest === 0) return `${uren} uur`;
  return `${uren} uur ${rest}`;
}

/**
 * Raadt het objecttype uit een locatietekst, zodat objecten die uit de bestaande
 * locaties worden aangemaakt meteen het juiste icoon hebben. Bij twijfel: overig.
 */
export function raadObjectType(locatie: string): string {
  const t = locatie.toLowerCase();
  if (t.includes('sluis')) return 'sluis';
  if (t.includes('stuw')) return 'stuw';
  if (t.includes('gemaal')) return 'gemaal';
  if (t.includes('brug')) return 'brug';
  if (t.includes('pomp')) return 'pomp';
  if (t.includes('cilinder')) return 'cilinder';
  if (t.includes('afsluiter')) return 'afsluiter';
  return 'overig';
}

/** Leest en controleert de velden van een object uit de request-body. */
export function leesObject(
  body: Record<string, unknown>,
  nieuw: boolean
): { data: Record<string, unknown> } | { fout: string } {
  const data: Record<string, unknown> = {};

  if (nieuw || 'name' in body) {
    const naam = typeof body.name === 'string' ? body.name.trim() : '';
    if (!naam) return { fout: 'Geef het object een naam' };
    data.name = naam;
  }

  for (const veld of ['region', 'address', 'notes'] as const) {
    if (!(veld in body)) continue;
    const waarde = typeof body[veld] === 'string' ? (body[veld] as string).trim() : '';
    data[veld] = waarde === '' ? null : waarde;
  }

  if ('objectType' in body) {
    const type = body.objectType;
    if (type === null || type === '') data.objectType = null;
    else if (!isObjectType(type)) return { fout: 'Onbekend objecttype' };
    else data.objectType = type;
  }

  for (const veld of ['lat', 'lng'] as const) {
    if (!(veld in body)) continue;
    const n = getal(body[veld]);
    if (n === null) { data[veld] = null; continue; }
    if (veld === 'lat' && (n < -90 || n > 90)) return { fout: 'Breedtegraad ligt buiten het bereik' };
    if (veld === 'lng' && (n < -180 || n > 180)) return { fout: 'Lengtegraad ligt buiten het bereik' };
    data[veld] = n;
  }

  if ('estimatedMinutes' in body) {
    const n = getal(body.estimatedMinutes);
    if (n === null) data.estimatedMinutes = null;
    else if (n < 0 || n > 24 * 60) return { fout: 'De geschatte tijd moet tussen 0 en 24 uur liggen' };
    else data.estimatedMinutes = Math.round(n);
  }

  return { data };
}

function getal(waarde: unknown): number | null {
  if (waarde === null || waarde === undefined || waarde === '') return null;
  const n = typeof waarde === 'number' ? waarde : parseFloat(String(waarde).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}
