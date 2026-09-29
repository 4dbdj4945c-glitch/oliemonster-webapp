// Moduleregister: welke modules de portal heeft, waar ze staan en wie erbij mag.
//
// Eén bron voor de tegels op het dashboard, het Beheer-menu in de balk en de
// toegang tot pagina's (lib/paginaToegang.ts). De navigatie van fase 2 (zijbalk
// en onderbalk) leest hier ook uit: per sectie de modules die de gebruiker mag
// zien, zie modulesVoor().
//
// Een nieuwe module: voeg hem hier toe, met een route onder /dashboard. Rechten
// op de API staan los daarvan in de routes zelf (withAuth, lib/toegang.ts).
//
// Geen server-imports hier: dit bestand draait ook in de browser.

import type { IconNaam } from '@/app/components/ui';
import { isAlleenLezen, ROLE_ADMIN } from './roles';

export type Sectie = 'Werk' | 'Klanten' | 'Rapportage' | 'Beheer';

/** De volgorde van de secties in menu en dashboard. */
export const SECTIES: Sectie[] = ['Werk', 'Klanten', 'Rapportage', 'Beheer'];

/** De rollen zoals het register ze kent; de oude kijkersrol telt als alleen_lezen. */
export type ModuleRol = 'admin' | 'user' | 'alleen_lezen';

export interface ModuleInfo {
  sleutel: string;
  naam: string;
  /** Een zin voor op de dashboardtegel. */
  beschrijving: string;
  icoon: IconNaam;
  /** De pagina. Bij perJaar de basis: de pagina zelf is `${route}/${jaar}`. */
  route: string;
  sectie: Sectie;
  /** Wie de pagina mag openen en hem in menu en dashboard ziet. */
  rollen: ModuleRol[];
  /** Komt als tegel op het dashboard. Beheerpagina's staan alleen in het menu. */
  tegel: boolean;
  /** Eén pagina per analysejaar: /dashboard/oliemonsters/2026. */
  perJaar?: boolean;
  /** Opent in een nieuw tabblad en valt buiten /dashboard (bijvoorbeeld Mail opstellen). */
  extern?: boolean;
}

const IEDEREEN: ModuleRol[] = ['admin', 'user', 'alleen_lezen'];
const MEDEWERKERS: ModuleRol[] = ['admin', 'user'];
const ADMIN: ModuleRol[] = ['admin'];

export const MODULES: ModuleInfo[] = [
  {
    sleutel: 'oliemonsters',
    naam: 'Oliemonsters',
    beschrijving: 'Overzicht en beheer van oliemonsteranalyses, per analysejaar',
    icoon: 'oil-sample',
    route: '/dashboard/oliemonsters',
    sectie: 'Werk',
    rollen: IEDEREEN,
    tegel: true,
    perJaar: true,
  },
  {
    sleutel: 'controlerondes',
    naam: 'Controlerondes',
    beschrijving: 'Plan en rijd controlerondes langs geselecteerde straten met live route en voortgang',
    icoon: 'module-rounds',
    route: '/dashboard/controlerondes',
    sectie: 'Werk',
    rollen: MEDEWERKERS,
    tegel: true,
  },
  {
    sleutel: 'ultimo',
    naam: 'Ultimo-opmerkingen',
    beschrijving: 'Opmerkingen per onderhoudstaak (looprouteregel) bijhouden en exact terugvinden',
    icoon: 'module-ultimo',
    route: '/dashboard/ultimo',
    sectie: 'Werk',
    rollen: MEDEWERKERS,
    tegel: true,
  },
  {
    sleutel: 'klanten',
    naam: 'Klanten',
    beschrijving: 'Klanten met contactpersonen, objecten en installaties',
    icoon: 'company',
    route: '/dashboard/klanten',
    sectie: 'Klanten',
    rollen: ADMIN,
    tegel: true,
  },
  {
    sleutel: 'installaties',
    naam: 'Installaties',
    beschrijving: 'Pompen, aggregaten, compressoren en persen per object',
    icoon: 'pump',
    route: '/dashboard/installaties',
    sectie: 'Klanten',
    rollen: ADMIN,
    tegel: true,
  },
  {
    sleutel: 'acquisitie',
    naam: 'Acquisitie',
    beschrijving: 'Prospects, pijplijn en contactmomenten voor nieuwe vaste klanten',
    icoon: 'module-acquisitie',
    route: '/dashboard/acquisitie',
    sectie: 'Klanten',
    rollen: MEDEWERKERS,
    tegel: true,
  },
  {
    sleutel: 'mail',
    naam: 'Mail opstellen',
    beschrijving: 'Opgemaakte mails in huisstijl samenstellen vanuit sjablonen en plakken in Apple Mail',
    icoon: 'module-email',
    // Losstaand HTML-bestand in public/ (bron: Documents/Claude/email-templates/).
    route: '/email-editor.html',
    sectie: 'Klanten',
    rollen: MEDEWERKERS,
    tegel: true,
    extern: true,
  },
  {
    sleutel: 'objecten',
    naam: 'Objecten',
    beschrijving: 'Kunstwerken, vestigingen en locaties waar monsters vandaan komen',
    icoon: 'map-pin',
    route: '/dashboard/objecten',
    sectie: 'Beheer',
    rollen: MEDEWERKERS,
    tegel: false,
  },
  {
    sleutel: 'audit-logs',
    naam: 'Audit logs',
    beschrijving: 'Wie deed wat en wanneer',
    icoon: 'audit-log',
    route: '/dashboard/audit-logs',
    sectie: 'Beheer',
    rollen: ADMIN,
    tegel: false,
  },
  {
    sleutel: 'instellingen',
    naam: 'Instellingen',
    beschrijving: 'Gebruikers, kolommen en andere instellingen',
    icoon: 'settings',
    route: '/dashboard/admin',
    sectie: 'Beheer',
    rollen: ADMIN,
    tegel: false,
  },
];

/** De rol van een gebruiker zoals het register hem kent. */
export function registerRol(role: string | null | undefined): ModuleRol {
  if (isAlleenLezen(role)) return 'alleen_lezen';
  if (role === ROLE_ADMIN) return 'admin';
  return 'user';
}

export function magModule(module: ModuleInfo, role: string | null | undefined): boolean {
  return module.rollen.includes(registerRol(role));
}

/** De modules die deze gebruiker mag zien, eventueel alleen die van één sectie. */
export function modulesVoor(role: string | null | undefined, sectie?: Sectie): ModuleInfo[] {
  return MODULES.filter((m) => magModule(m, role) && (!sectie || m.sectie === sectie));
}

export function moduleVan(sleutel: string): ModuleInfo {
  const m = MODULES.find((x) => x.sleutel === sleutel);
  if (!m) throw new Error(`Onbekende module ${sleutel}`);
  return m;
}

/** Bij welke module hoort dit pad? Alleen pagina's onder /dashboard. */
export function moduleVoorPad(pad: string): ModuleInfo | null {
  return (
    MODULES.find((m) => !m.extern && (pad === m.route || pad.startsWith(m.route + '/'))) ?? null
  );
}

/** De pagina van de oliemonsters van één jaar. */
export function oliemonsterPad(jaar: number): string {
  return `${moduleVan('oliemonsters').route}/${jaar}`;
}

/** Het jaar uit /dashboard/oliemonsters/2026, of null als het pad geen jaarpagina is. */
export function jaarUitPad(pad: string): number | null {
  const basis = moduleVan('oliemonsters').route;
  const m = pad.match(/^(.*)\/(\d{4})$/);
  if (!m || m[1] !== basis) return null;
  const jaar = Number(m[2]);
  return geldigJaar(jaar) ? jaar : null;
}

/** De jaren waarvoor een oliemonsterpagina kan bestaan. */
export function geldigJaar(jaar: number): boolean {
  return Number.isInteger(jaar) && jaar >= 2000 && jaar <= 2100;
}
