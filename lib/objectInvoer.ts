// Invoer van de objectroutes (/api/sample-objects): een zod-schema in plaats
// van de oude handgeschreven controle. Bij PUT mag alles ontbreken; wat niet
// meekomt blijft zoals het is.

import { z } from 'zod';
import { OBJECT_TYPES } from './sampleObjects';
import { optioneelId, optioneleTekst, tekst } from './apiRoute';

function coordinaat(min: number, max: number, melding: string) {
  return z
    .union([z.number(), z.string(), z.null()], { error: melding })
    .optional()
    .transform((w, ctx) => {
      if (w === undefined) return undefined;
      if (w === null || (typeof w === 'string' && w.trim() === '')) return null;
      const n = typeof w === 'number' ? w : parseFloat(w.replace(',', '.'));
      if (Number.isNaN(n)) return null;
      if (n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: melding });
        return z.NEVER;
      }
      return n;
    });
}

const velden = {
  name: tekst('Geef het object een naam', 200),
  region: optioneleTekst(200),
  address: optioneleTekst(500),
  notes: optioneleTekst(),
  objectType: z
    .union([z.enum(OBJECT_TYPES.map((t) => t.waarde) as [string, ...string[]]), z.literal(''), z.null()], {
      error: 'Onbekend objecttype',
    })
    .optional()
    .transform((w) => (w === '' ? null : w)),
  lat: coordinaat(-90, 90, 'Breedtegraad ligt buiten het bereik'),
  lng: coordinaat(-180, 180, 'Lengtegraad ligt buiten het bereik'),
  estimatedMinutes: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((w, ctx) => {
      if (w === undefined) return undefined;
      if (w === null || (typeof w === 'string' && w.trim() === '')) return null;
      const n = typeof w === 'number' ? w : parseFloat(w.replace(',', '.'));
      if (Number.isNaN(n)) return null;
      if (n < 0 || n > 24 * 60) {
        ctx.addIssue({ code: 'custom', message: 'De geschatte tijd moet tussen 0 en 24 uur liggen' });
        return z.NEVER;
      }
      return Math.round(n);
    }),
  klantId: optioneelId('Onbekende klant'),
};

export const NieuwObjectSchema = z.object(velden);
export const ObjectWijzigingSchema = z.object({ ...velden, name: velden.name.optional() });

/** Alleen de velden die echt meekwamen, voor een Prisma-update. */
export function alleenMeegestuurd<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([, w]) => w !== undefined)) as Partial<T>;
}
