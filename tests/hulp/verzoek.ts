// Hulpjes om API-routes aan te roepen zoals de browser dat doet: met de
// sessiecookie en de Origin van de portal.
import { NextRequest } from 'next/server';

const opslag = new Map<string, string>();

/** Wat next/headers cookies() in de tests teruggeeft. */
export const koekjes = {
  get(naam: string) {
    const value = opslag.get(naam);
    return value === undefined ? undefined : { name: naam, value };
  },
  getAll() {
    return [...opslag].map(([name, value]) => ({ name, value }));
  },
  has(naam: string) {
    return opslag.has(naam);
  },
  set(naam: string, waarde: string, opties?: { maxAge?: number }) {
    if (opties?.maxAge === 0 || waarde === '') opslag.delete(naam);
    else opslag.set(naam, waarde);
  },
  delete(naam: string) {
    opslag.delete(naam);
  },
};

/** Vergeet de sessie: niet meer ingelogd. */
export function uitloggen() {
  opslag.clear();
}

export const PORTAL = 'http://localhost:3000';

export function verzoek(pad: string, opties: { method?: string; body?: unknown } = {}) {
  const heeftBody = opties.body !== undefined;
  return new NextRequest(PORTAL + pad, {
    method: opties.method ?? (heeftBody ? 'POST' : 'GET'),
    headers: heeftBody ? { 'content-type': 'application/json', origin: PORTAL } : { origin: PORTAL },
    body: heeftBody ? JSON.stringify(opties.body) : undefined,
  });
}

/** Context zoals Next.js die aan een route met [id] meegeeft. */
export function metParams<P extends Record<string, string>>(params: P) {
  return { params: Promise.resolve(params) };
}
