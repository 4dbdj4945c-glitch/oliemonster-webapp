// Bescherming tegen CSRF zonder SameSite aan te passen. De sessiecookie staat op
// SameSite=None (lib/session.ts), omdat de portal in een iframe op een ander
// domein moet kunnen werken. Daardoor stuurt de browser de cookie ook mee met
// een verzoek dat een vreemde site laat afvuren. Dus kijken we bij elk verzoek
// dat iets wijzigt naar waar het vandaan komt:
//
// 1. Origin moet de portal zelf zijn (dezelfde host als het verzoek), of in de
//    lijst toegestane origins staan. Ontbreekt Origin, dan moet Sec-Fetch-Site
//    same-origin (of none) zijn. Stuurt de browser geen van beide (geen browser,
//    dus ook geen cookie van een slachtoffer), dan laten we het door.
// 2. Content-Type moet application/json zijn; een formulier van een andere site
//    kan dat niet sturen zonder toestemming (CORS). Alleen de uploadroutes
//    mogen multipart/form-data. Zonder body en zonder Content-Type mag ook.
//
// Binnen de iframe komt een verzoek van de portal zelf, met de origin van de
// portal (niet die van de pagina eromheen), en gaat dus gewoon door.
//
// Extra origins via de env-variabele TOEGESTANE_ORIGINS, komma-gescheiden,
// bijvoorbeeld "https://portal.itsdoneservices.nl". Die komen bovenop de
// standaardlijst; de eigen host mag altijd.

const STANDAARD_ORIGINS = [
  'https://oliemonster-webapp.vercel.app',
  'https://mourik.itsdoneservices.nl',
];

const ONTWIKKEL_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

/** Routes die foto's ontvangen als multipart/form-data. */
const UPLOAD_ROUTES = [
  /^\/api\/samples\/\d+\/nemen$/,
  /^\/api\/samples\/\d+\/photo$/,
  /^\/api\/samples\/\d+\/unreachable$/,
  /^\/api\/samples\/\d+\/attempts\/\d+\/photo$/,
];

const VEILIGE_METHODES = new Set(['GET', 'HEAD', 'OPTIONS']);

export function toegestaneOrigins(): string[] {
  const extra = (process.env.TOEGESTANE_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const dev = process.env.NODE_ENV === 'production' ? [] : ONTWIKKEL_ORIGINS;
  return [...STANDAARD_ORIGINS, ...dev, ...extra];
}

export function isUploadRoute(pad: string): boolean {
  return UPLOAD_ROUTES.some((r) => r.test(pad));
}

export interface HerkomstVerzoek {
  method: string;
  pad: string;
  /** De origin van de portal zelf, bijvoorbeeld https://oliemonster-webapp.vercel.app */
  eigenOrigin: string;
  headers: { get(naam: string): string | null };
}

/** null als het verzoek door mag, anders de status en de melding. */
export function herkomstFout(v: HerkomstVerzoek): { status: number; error: string } | null {
  if (VEILIGE_METHODES.has(v.method.toUpperCase())) return null;
  if (!v.pad.startsWith('/api/')) return null;

  const origin = v.headers.get('origin');
  if (origin) {
    const schoon = origin.replace(/\/+$/, '');
    if (schoon !== v.eigenOrigin && !toegestaneOrigins().includes(schoon)) {
      return { status: 403, error: 'Dit verzoek komt niet van de portal zelf en is geweigerd.' };
    }
  } else {
    const site = v.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') {
      return { status: 403, error: 'Dit verzoek komt niet van de portal zelf en is geweigerd.' };
    }
  }

  const type = (v.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type && type !== 'application/json') {
    if (!(type === 'multipart/form-data' && isUploadRoute(v.pad))) {
      return { status: 415, error: 'Verstuur dit verzoek als JSON (Content-Type: application/json).' };
    }
  }
  return null;
}
