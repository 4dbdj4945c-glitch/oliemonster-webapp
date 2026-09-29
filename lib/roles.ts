// Rollen in de app.
// - admin:        volledige toegang
// - user:         gewone gebruiker (leest modules, wijzigen is admin-only)
// - alleen_lezen: kijker. Mag UITSLUITEND de oliemonstermodule bekijken: de lijst,
//                 de foto's, de geannuleerde monsters en de monsters die niet
//                 bereikbaar waren. Mag niets wijzigen, geen PDF genereren en geen
//                 andere module of beheerpagina openen. Per gebruiker staat in
//                 `User.viewYear` welk analysejaar die mag zien; leeg = alle jaren.
export const ROLE_ADMIN = 'admin';
export const ROLE_USER = 'user';
export const ROLE_ALLEEN_LEZEN = 'alleen_lezen';

// De oude rol van vóór deze ronde. Bestaande gebruikers worden met
// prisma/migreer-alleen-lezen.ts omgezet naar `alleen_lezen` met viewYear 2025.
// Zolang dat script nog niet gedraaid is, telt de oude rol als alleen lezen mee,
// zodat zo'n gebruiker niet ineens meer mag dan de bedoeling is.
export const ROLE_VIEWER_OIL2025_OUD = 'viewer_oil2025';

// Toegestane rollen bij het aanmaken/bewerken van een gebruiker. De oude
// kijkersrol staat er bewust niet meer bij: nieuw uitdelen kan niet meer.
export const ALLOWED_ROLES = [ROLE_ADMIN, ROLE_USER, ROLE_ALLEEN_LEZEN];

// Menselijke labels voor in de UI.
export const ROLE_LABELS: Record<string, string> = {
  [ROLE_ADMIN]: 'Admin',
  [ROLE_USER]: 'Gebruiker',
  [ROLE_ALLEEN_LEZEN]: 'Alleen lezen',
  [ROLE_VIEWER_OIL2025_OUD]: 'Alleen lezen (oude rol)',
};

/** Is dit de rol alleen lezen? De oude kijkersrol telt mee. */
export function isAlleenLezen(role?: string | null): boolean {
  return role === ROLE_ALLEEN_LEZEN || role === ROLE_VIEWER_OIL2025_OUD;
}

/**
 * Het jaar dat bij de oude kijkersrol hoort. Zolang de kolom `viewYear` nog niet
 * in de database staat, houden we die gebruikers op 2025, precies wat ze eerder
 * mochten zien.
 */
export const OUD_KIJKJAAR = 2025;
