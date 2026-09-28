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

/* ============================================================
   DE VASTE KUNSTWERKENLIJST
   ============================================================
   Een object is het kunstwerk zelf: Sluis Belfeld. Wat op een monster in het
   veld `location` staat is het onderdeel daarop, bijvoorbeeld "Belfeld
   Westsluis". Een sluis en een stuw op dezelfde plaats zijn dus twee objecten,
   nooit een.

   Deze lijst komt uit de offerte voor Mourik (19 objecten). Stuw Grave staat er
   als twintigste bij: die is nog niet zeker, dat staat in zijn notitie. */

export interface Kunstwerk {
  naam: string;
  regio: string;
  type: string;
  notitie?: string;
}

export const KUNSTWERKEN: Kunstwerk[] = [
  { naam: 'Sint Servaasbrug', regio: 'Maastricht', type: 'brug' },
  { naam: 'Stuw Borgharen', regio: 'Maastricht', type: 'stuw' },
  { naam: 'Sluis Bosscherveld', regio: 'Maastricht', type: 'sluis' },

  { naam: 'Sluis Born', regio: 'Midden-Limburg', type: 'sluis' },
  { naam: 'Sluis Maasbracht', regio: 'Midden-Limburg', type: 'sluis' },
  { naam: 'Sluis Heel', regio: 'Midden-Limburg', type: 'sluis' },
  { naam: 'Sluis Linne', regio: 'Midden-Limburg', type: 'sluis' },
  { naam: 'Stuw Linne', regio: 'Midden-Limburg', type: 'stuw' },
  { naam: 'Sluis Roermond', regio: 'Midden-Limburg', type: 'sluis' },
  { naam: 'Stuw Roermond', regio: 'Midden-Limburg', type: 'stuw' },

  { naam: 'Sluis Belfeld', regio: 'Noord-Limburg', type: 'sluis' },
  { naam: 'Stuw Belfeld', regio: 'Noord-Limburg', type: 'stuw' },
  { naam: 'Sluis Sambeek', regio: 'Noord-Limburg', type: 'sluis' },
  { naam: 'Stuw Sambeek', regio: 'Noord-Limburg', type: 'stuw' },

  { naam: 'Sluis Grave', regio: 'Brabant / Gelderland', type: 'sluis' },
  { naam: 'Sluis Lith', regio: 'Brabant / Gelderland', type: 'sluis' },
  { naam: 'Stuw Lith', regio: 'Brabant / Gelderland', type: 'stuw' },
  { naam: 'Sluis Sint Andries', regio: 'Brabant / Gelderland', type: 'sluis' },
  { naam: 'Wilhelminasluis', regio: 'Brabant / Gelderland', type: 'sluis' },

  {
    naam: 'Stuw Grave',
    regio: 'Brabant / Gelderland',
    type: 'stuw',
    notitie: 'Nog niet zeker of dit kunstwerk in de opdracht zit. Nagaan bij Mourik.',
  },
];

/** De regio's in de volgorde van de offerte. */
export const REGIO_VOLGORDE = [
  'Maastricht',
  'Midden-Limburg',
  'Noord-Limburg',
  'Brabant / Gelderland',
] as const;

/** Staat dit object in de vaste kunstwerkenlijst? Hoofdletterongevoelig. */
export function isKunstwerkNaam(naam: string): boolean {
  const n = naam.trim().toLowerCase();
  return KUNSTWERKEN.some((k) => k.naam.toLowerCase() === n);
}

/**
 * Sorteersleutel voor de regio: eerst de regio's van de offerte in die volgorde,
 * daarna een eigen regio, en helemaal onderaan de objecten zonder regio. Die
 * laatste groep zijn meestal de resten van de oude locatie-import.
 */
export function regioIndex(regio?: string | null): number {
  const r = (regio || '').trim();
  if (!r) return 99;
  const i = (REGIO_VOLGORDE as readonly string[]).indexOf(r);
  return i === -1 ? 90 : i;
}

/** Objecten op regio (offertevolgorde) en daarbinnen op naam. */
export function sorteerOpOfferte<T extends { name: string; region: string | null }>(lijst: T[]): T[] {
  return [...lijst].sort((a, b) => {
    const verschil = regioIndex(a.region) - regioIndex(b.region);
    if (verschil !== 0) return verschil;
    const regio = (a.region || '').localeCompare(b.region || '', 'nl');
    if (regio !== 0) return regio;
    return a.name.localeCompare(b.name, 'nl');
  });
}

/* ============================================================
   LOCATIETEKST AAN EEN KUNSTWERK KNOPEN
   ============================================================ */

// De woorden waaraan je het soort kunstwerk herkent. Sluis en stuw mogen nooit
// door elkaar lopen, dus als de tekst niet zegt welke van de twee het is, doen
// we geen voorstel en kiest Roel zelf.
const TYPE_WOORDEN = ['sluis', 'stuw', 'brug', 'gemaal'] as const;

/** "Sluis Belfeld" wordt "belfeld"; "Wilhelminasluis" blijft heel. */
export function plaatsDeel(naam: string): string {
  const woorden = naam.toLowerCase().trim().split(/\s+/);
  if (woorden.length > 1 && (TYPE_WOORDEN as readonly string[]).includes(woorden[0])) {
    return woorden.slice(1).join(' ');
  }
  return woorden.join(' ');
}

export interface KunstwerkObject {
  id: number;
  name: string;
  objectType: string | null;
}

export interface KunstwerkVoorstel {
  objectId: number | null;
  reden: string;
}

/**
 * Raadt bij welk kunstwerk een locatietekst hoort. `tekst` is de locatie plus de
 * omschrijvingen van de monsters op die locatie. Bij de minste twijfel komt er
 * geen voorstel terug, maar een reden waarom Roel zelf moet kiezen.
 */
export function raadKunstwerk(tekst: string, objecten: KunstwerkObject[]): KunstwerkVoorstel {
  const t = tekst.toLowerCase();

  // Stap 1: welke kunstwerken hebben een naam die in de tekst voorkomt.
  const kandidaten = objecten.filter((o) => {
    const plaats = plaatsDeel(o.name);
    return plaats.length >= 4 && t.includes(plaats);
  });
  if (kandidaten.length === 0) {
    return { objectId: null, reden: 'Geen kunstwerk met deze naam gevonden, kies zelf.' };
  }

  // Stap 2: zegt de tekst welk soort kunstwerk het is? Dan moet het type kloppen.
  const woordenInTekst = TYPE_WOORDEN.filter((w) => t.includes(w));
  if (woordenInTekst.length > 0) {
    const passend = kandidaten.filter((o) => o.objectType && woordenInTekst.includes(o.objectType as typeof TYPE_WOORDEN[number]));
    if (passend.length === 1) {
      return { objectId: passend[0].id, reden: '' };
    }
    if (passend.length === 0) {
      return {
        objectId: null,
        reden: 'De naam past, maar het soort kunstwerk niet. Kies zelf.',
      };
    }
    return {
      objectId: null,
      reden: 'Er passen meerdere kunstwerken bij deze tekst, kies zelf.',
    };
  }

  // Stap 3: geen soortwoord in de tekst. Alleen een voorstel als er precies een
  // kandidaat is en die geen sluis of stuw is, want die twee gooien we nooit
  // automatisch samen.
  if (kandidaten.length === 1 && !['sluis', 'stuw'].includes(kandidaten[0].objectType ?? '')) {
    return { objectId: kandidaten[0].id, reden: '' };
  }
  return {
    objectId: null,
    reden: 'Er staat niet in de tekst of dit de sluis of de stuw is. Kies zelf.',
  };
}
