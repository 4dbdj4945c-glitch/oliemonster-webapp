import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiRoute, ApiFout, leesQuery } from '@/lib/apiRoute';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { MAX_FOTOS_IN_RAPPORT, haalInspectie } from '@/lib/inspecties/server';
import { sjabloonVan } from '@/lib/inspecties/sjablonen';
import { maakVerzamelrapportPdf, verzamelrapportNaam } from '@/lib/rapport/verzamelrapportPdf';
import { pdfAntwoord } from '@/lib/pdfAntwoord';

/*
  GET /api/inspecties/rapport?ids=1,2,3[&fotos=0] - het verzamelrapport: meerdere
  inspecties van één klant en één sjabloon in één PDF (admin,
  lib/rapport/verzamelrapportPdf.ts). Hoogstens MAX_IDS inspecties en, met
  foto's, MAX_FOTOS_IN_RAPPORT foto's samen (anders een 400 met uitleg). Elke
  inspectie gaat door haalInspectie (afscherming en prullenbak); verschilt de
  klant of het sjabloon, dan een 400 met uitleg. Concepten mogen mee: dan staat
  CONCEPT op elke pagina. De download staat in het logboek. Met &controle=1
  alleen de controles, als JSON ({ ok, fotos }), zonder PDF.
*/

export const maxDuration = 60;

const MAX_IDS = 50;

const Query = z.object({
  ids: z
    .string({ error: 'Kies de inspecties voor het rapport' })
    .regex(/^\d{1,9}(,\d{1,9})*$/, { error: 'Kies de inspecties voor het rapport' })
    .transform((t) => [...new Set(t.split(',').map(Number))])
    .refine((l) => l.length <= MAX_IDS, { error: `Hoogstens ${MAX_IDS} inspecties in één rapport` }),
  fotos: z.enum(['0', '1']).optional(),
  controle: z.enum(['1']).optional(),
});

export const GET = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Het verzamelrapport kon niet worden gemaakt' }, async (request, _context, sessie) => {
  const { ids, fotos, controle } = leesQuery(request, Query);
  const rijen = await Promise.all(ids.map((id) => haalInspectie(id, sessie)));
  if (new Set(rijen.map((r) => r.klantId)).size > 1) {
    throw new ApiFout(400, 'Een verzamelrapport is voor één klant. Kies alleen inspecties van dezelfde klant.');
  }
  if (new Set(rijen.map((r) => r.sjabloon)).size > 1) {
    throw new ApiFout(400, 'Een verzamelrapport is voor één soort inspectie. Kies alleen inspecties van hetzelfde soort.');
  }
  // Elke foto wordt opgehaald en verkleind; boven deze grens past dat niet in de tijd van één verzoek.
  const aantalFotos = fotos === '0' ? 0 : rijen.reduce((som, r) => som + r.items.reduce((n, i) => n + i.fotos.length, 0), 0);
  if (aantalFotos > MAX_FOTOS_IN_RAPPORT) {
    throw new ApiFout(
      400,
      `Deze inspecties hebben samen ${aantalFotos} foto's; met foto's kan een verzamelrapport er hoogstens ${MAX_FOTOS_IN_RAPPORT} aan. Maak hem zonder foto's, of in delen (minder inspecties per rapport).`
    );
  }
  // Alleen controleren (het scherm vraagt dit eerst, zodat een melding niet als kapotte download eindigt).
  if (controle) return NextResponse.json({ ok: true, fotos: aantalFotos });
  const pdf = await maakVerzamelrapportPdf(rijen, { origin: new URL(request.url).origin, metFotos: fotos !== '0' });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.INSPECTIE_VERZAMELRAPPORT_DOWNLOAD,
    details: { ids, klantId: rijen[0].klantId, klant: rijen[0].klant.naam, sjabloon: sjabloonVan(rijen[0].sjabloon).naam },
    request,
  });
  return pdfAntwoord(pdf, verzamelrapportNaam(rijen));
});
