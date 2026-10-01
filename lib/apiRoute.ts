// Eén manier om een API-route te schrijven: toegang, invoer controleren en
// fouten, op één plek.
//
//   export const PUT = apiRoute(
//     { rol: 'admin', module: 'klanten', fout: 'Fout bij bijwerken van de klant' },
//     async (request, context, sessie) => {
//       const id = await leesId(context, 'Onbekende klant');
//       const gegevens = await leesJson(request, KlantSchema);
//       ...
//       return NextResponse.json(klant);
//     }
//   );
//
// - Toegang gaat via withAuth (lib/toegang.ts), met dezelfde opties.
// - Invoer gaat door een zod-schema (leesJson, leesQuery). Klopt er iets niet,
//   dan volgt een 400 met de eerste melding als `error` en per veld een melding
//   in `velden`. De schermen tonen `error` al (lib/foutmelding.ts).
// - Wie in de route een ApiFout gooit, krijgt precies die status en melding terug.
// - Ontbreekt een tabel of kolom (database nog niet bijgewerkt), dan een 503 met
//   uitleg. Elke andere fout: 500 met de melding uit `fout`, en de echte fout in
//   de serverlog.
//
// Elke fout heeft dus dezelfde vorm: { error: string, velden?: {...}, ...extra }.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, type Sessie, type ToegangsOpties } from './toegang';
import { tabelOntbreekt } from './kolommen';

/** Een fout die de route bewust teruggeeft, met status en melding voor de gebruiker. */
export class ApiFout extends Error {
  constructor(
    public status: number,
    melding: string,
    public extra: Record<string, unknown> = {}
  ) {
    super(melding);
  }
}

/** Het uniforme foutantwoord. */
export function foutAntwoord(status: number, melding: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: melding, ...extra }, { status });
}

export const DATABASE_NIET_BIJ =
  'De database is nog niet bijgewerkt voor deze versie van de portal. Draai ./db-bijwerken.sh in de projectmap en ververs deze pagina.';

export interface RouteOpties extends ToegangsOpties {
  /** Melding bij een onverwachte fout (500). */
  fout: string;
  /** Melding als een tabel of kolom nog ontbreekt (503). */
  ontbreekt?: string;
}

/** Zet een fout uit een route om in het uniforme antwoord. */
export function antwoordBijFout(error: unknown, opties: Pick<RouteOpties, 'fout' | 'ontbreekt'>): Response {
  if (error instanceof ApiFout) return foutAntwoord(error.status, error.message, error.extra);
  if (error instanceof z.ZodError) return zodAntwoord(error);
  if (tabelOntbreekt(error)) {
    return foutAntwoord(503, opties.ontbreekt ?? DATABASE_NIET_BIJ, { tabelOntbreekt: true });
  }
  console.error(opties.fout, error);
  return foutAntwoord(500, opties.fout);
}

/** withAuth plus de foutafhandeling hierboven. */
export function apiRoute<C = unknown>(
  opties: RouteOpties,
  handler: (request: NextRequest, context: C, sessie: Sessie) => Promise<Response> | Response
) {
  return withAuth<C>(opties, async (request, context, sessie) => {
    try {
      return await handler(request, context, sessie);
    } catch (error) {
      return antwoordBijFout(error, opties);
    }
  });
}

/**
 * Een paar controles of opzoekingen tegelijk, die niet van elkaar afhangen.
 * Gaat er iets mis, dan geldt de fout van de eerste in de lijst (dezelfde
 * melding als wanneer ze na elkaar liepen), niet die van de snelste.
 */
export async function tegelijk<T extends readonly unknown[]>(taken: readonly [...{ [K in keyof T]: Promise<T[K]> }]): Promise<T> {
  const uitkomsten = await Promise.allSettled(taken);
  for (const u of uitkomsten) if (u.status === 'rejected') throw u.reason;
  return uitkomsten.map((u) => (u as PromiseFulfilledResult<unknown>).value) as unknown as T;
}

// ------------------------------------------------------------------
// Invoer lezen
// ------------------------------------------------------------------

function zodAntwoord(error: z.ZodError): Response {
  const velden: Record<string, string> = {};
  for (const issue of error.issues) {
    const pad = issue.path.join('.') || '_';
    if (!velden[pad]) velden[pad] = issue.message;
  }
  const eerste = error.issues[0]?.message ?? 'De gegevens kloppen niet';
  return foutAntwoord(400, eerste, { velden });
}

/**
 * Leest de JSON-body en controleert hem met het schema. Een lege body telt als
 * {}, zodat een schema met alleen optionele velden gewoon werkt. Geen geldige
 * JSON of een veld dat niet klopt: ApiFout of ZodError, en dus een 400.
 */
export async function leesJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S>> {
  const tekst = await request.text();
  let ruw: unknown = {};
  if (tekst.trim() !== '') {
    try {
      ruw = JSON.parse(tekst);
    } catch {
      throw new ApiFout(400, 'De gegevens konden niet worden gelezen');
    }
  }
  return schema.parse(ruw);
}

/** Leest de zoekparameters van de URL met een schema (alles komt binnen als tekst). */
export function leesQuery<S extends z.ZodType>(request: Request, schema: S): z.output<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return schema.parse(params);
}

/** Leest een numeriek id uit de routeparameters, bijvoorbeeld [id] of [attemptId]. */
export async function leesId(
  context: unknown,
  melding = 'Onbekend nummer',
  naam = 'id'
): Promise<number> {
  const params = await (context as { params?: Promise<Record<string, string>> })?.params;
  const waarde = params?.[naam];
  if (!waarde || !/^\d+$/.test(waarde)) throw new ApiFout(400, melding);
  const id = Number(waarde);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiFout(400, melding);
  return id;
}

// ------------------------------------------------------------------
// Bouwstenen voor schema's, met Nederlandse meldingen
// ------------------------------------------------------------------

/** Verplichte tekst, getrimd, niet leeg. */
export function tekst(melding: string, max = 500) {
  return z
    .string({ error: melding })
    .trim()
    .min(1, { error: melding })
    .max(max, { error: `Maximaal ${max} tekens` });
}

/**
 * Optionele tekst: undefined blijft undefined (veld niet meegestuurd, niet
 * aanraken), null of alleen spaties wordt null (leegmaken).
 */
export function optioneleTekst(max = 5000) {
  return z
    .union([z.string(), z.null()], { error: 'Dit veld moet tekst zijn' })
    .optional()
    .transform((w) => (w === undefined ? undefined : w === null || w.trim() === '' ? null : w.trim()))
    .refine((w) => w === undefined || w === null || w.length <= max, { error: `Maximaal ${max} tekens` });
}

/**
 * Een optioneel id (van een object, klant, installatie): een getal of cijfers
 * als tekst. Leeg of null = geen koppeling (null), niet meegestuurd = undefined.
 */
export function optioneelId(melding: string) {
  return z
    .union([z.number(), z.string(), z.null()], { error: melding })
    .optional()
    .transform((w, ctx) => {
      if (w === undefined) return undefined;
      if (w === null || w === '') return null;
      const n = typeof w === 'number' ? w : /^\d+$/.test(w.trim()) ? Number(w.trim()) : NaN;
      if (!Number.isSafeInteger(n) || n <= 0) {
        ctx.addIssue({ code: 'custom', message: melding });
        return z.NEVER;
      }
      return n;
    });
}

/** Een datum als tekst (2026-09-29 of ISO); leeg of null = null. */
export function optioneleDatum(melding = 'De datum klopt niet') {
  return z
    .union([z.string(), z.null()], { error: melding })
    .optional()
    .transform((w, ctx) => {
      if (w === undefined) return undefined;
      if (w === null || w.trim() === '') return null;
      const d = new Date(w);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: 'custom', message: melding });
        return z.NEVER;
      }
      return d;
    });
}

/** Een geheel getal binnen grenzen, als getal of tekst; leeg = null. */
export function optioneelGetal(melding: string, min: number, max: number) {
  return z
    .union([z.number(), z.string(), z.null()], { error: melding })
    .optional()
    .transform((w, ctx) => {
      if (w === undefined) return undefined;
      if (w === null || (typeof w === 'string' && w.trim() === '')) return null;
      const n = typeof w === 'number' ? w : Number(w.trim().replace(',', '.'));
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: melding });
        return z.NEVER;
      }
      return Math.round(n);
    });
}

/** Analysejaar: 2000 tot en met 2100, als getal of tekst. */
export const jaarSchema = z.coerce
  .number({ error: 'Onbekend jaar' })
  .int({ error: 'Onbekend jaar' })
  .min(2000, { error: 'Onbekend jaar' })
  .max(2100, { error: 'Onbekend jaar' });
