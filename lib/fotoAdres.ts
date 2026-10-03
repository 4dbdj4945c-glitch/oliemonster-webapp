// Het adres waarop de browser een foto ophaalt: altijd via de eigen route
// /api/fotos/..., nooit meer het echte opslagadres.
//
//   /api/fotos/monster/12/potje?v=k3j9a      foto van het monsterpotje
//   /api/fotos/monster/12/onderdeel?v=...    foto van het onderdeel
//   /api/fotos/monster/12/onbereikbaar?v=... bewijsfoto bij Niet bereikbaar
//   /api/fotos/poging/5/potje?v=...          foto's van een poging (ook onderdeel)
//   /api/fotos/installatie/3?v=...           foto van een installatie
//   /api/fotos/klantlogo/2?v=...             logo van een klant
//   /api/fotos/inspectiefoto/9?v=...         foto bij een bevinding van een inspectie (id van de foto)
//   /api/fotos/inspectie/7?v=...             oud adres: de eerste foto van bevinding 7 (blijft werken)
//   /api/fotos/dagrapport/4?v=...            foto bij een dagrapport (id van de foto)
//
// De route (app/api/fotos/[...pad]/route.ts) controleert of de gebruiker het
// monster, de installatie of de klant mag zien (lib/afscherming.ts) en haalt de
// foto pas dan op. `v` verandert als de foto verandert, zodat de browser hem
// lang mag bewaren en toch nooit een oude foto laat zien.
//
// Geen server-imports: dit bestand draait ook in de browser (tests, typen).

export type FotoBron = 'monster' | 'poging' | 'installatie' | 'klantlogo' | 'inspectie' | 'inspectiefoto' | 'dagrapport';

/** Monsterfoto's per veld op OilSample. */
export const MONSTER_FOTO_VELDEN = {
  potje: 'photoUrl',
  onderdeel: 'partPhotoUrl',
  onbereikbaar: 'unreachablePhotoUrl',
} as const;
export type MonsterFotoVeld = keyof typeof MONSTER_FOTO_VELDEN;

/** Pogingfoto's per veld op SampleAttempt. */
export const POGING_FOTO_VELDEN = { potje: 'photoUrl', onderdeel: 'partPhotoUrl' } as const;
export type PogingFotoVeld = keyof typeof POGING_FOTO_VELDEN;

/** Korte, stabiele vingerafdruk van het opslagadres (geen geheim, alleen voor de cache). */
export function versieVan(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Het adres via de eigen route, of null als er geen foto is. */
export function fotoAdres(bron: FotoBron, id: number, veld: string | null, url: string | null | undefined): string | null {
  if (!url) return null;
  return `/api/fotos/${bron}/${id}${veld ? `/${veld}` : ''}?v=${versieVan(url)}`;
}

type MetMonsterFotos = {
  id: number;
  photoUrl?: string | null;
  partPhotoUrl?: string | null;
  unreachablePhotoUrl?: string | null;
};

/** Zet de foto's van een monster om naar adressen via de eigen route. Velden die er niet zijn, blijven weg. */
export function metMonsterFotos<T extends MetMonsterFotos>(m: T): T {
  const uit: T = { ...m };
  for (const [veld, kolom] of Object.entries(MONSTER_FOTO_VELDEN) as [MonsterFotoVeld, keyof MetMonsterFotos][]) {
    if (kolom in m) (uit as Record<string, unknown>)[kolom] = fotoAdres('monster', m.id, veld, m[kolom] as string | null);
  }
  return uit;
}

type MetPogingFotos = { id: number; photoUrl?: string | null; partPhotoUrl?: string | null };

/** Zet de foto's van een poging om naar adressen via de eigen route. */
export function metPogingFotos<T extends MetPogingFotos>(a: T): T {
  const uit: T = { ...a };
  if ('photoUrl' in a) (uit as Record<string, unknown>).photoUrl = fotoAdres('poging', a.id, 'potje', a.photoUrl);
  if ('partPhotoUrl' in a) (uit as Record<string, unknown>).partPhotoUrl = fotoAdres('poging', a.id, 'onderdeel', a.partPhotoUrl);
  return uit;
}

/** De foto van een installatie via de eigen route. */
export function metInstallatieFoto<T extends { id: number; fotoUrl?: string | null }>(i: T): T {
  if (!('fotoUrl' in i)) return i;
  return { ...i, fotoUrl: fotoAdres('installatie', i.id, null, i.fotoUrl) };
}

/** Het logo van een klant via de eigen route. */
export function klantLogoAdres(klant: { id: number; logoUrl?: string | null }): string | null {
  return fotoAdres('klantlogo', klant.id, null, klant.logoUrl);
}

export interface InspectieFotoJson {
  id: number;
  /** Via /api/fotos/inspectiefoto/... */
  url: string;
  bijschrift: string | null;
}

/** De foto's bij een bevinding van een inspectie via de eigen route. */
export function inspectieFotosAlsJson(fotos: { id: number; url: string; bijschrift: string | null }[]): InspectieFotoJson[] {
  return fotos.map((f) => ({ id: f.id, url: fotoAdres('inspectiefoto', f.id, null, f.url)!, bijschrift: f.bijschrift }));
}
