// Rollen in de app.
// - admin: volledige toegang
// - user:  gewone gebruiker (leest modules, wijzigen is admin-only)
// - viewer_oil2025: beperkte kijker. Mag UITSLUITEND de module
//   "Oliemonsters 2025" bekijken (alleen lezen) en bijbehorende foto's openen.
//   Geen enkele andere module en geen wijzigingen.
export const ROLE_ADMIN = 'admin';
export const ROLE_USER = 'user';
export const ROLE_VIEWER_OIL2025 = 'viewer_oil2025';

// Toegestane rollen bij het aanmaken/bewerken van een gebruiker.
export const ALLOWED_ROLES = [ROLE_ADMIN, ROLE_USER, ROLE_VIEWER_OIL2025];

// Menselijke labels voor in de UI.
export const ROLE_LABELS: Record<string, string> = {
  [ROLE_ADMIN]: 'Admin',
  [ROLE_USER]: 'Gebruiker',
  [ROLE_VIEWER_OIL2025]: 'Kijker – Oliemonsters 2025',
};

// Is dit de beperkte kijker-rol?
export function isOilViewer2025(role?: string | null): boolean {
  return role === ROLE_VIEWER_OIL2025;
}
