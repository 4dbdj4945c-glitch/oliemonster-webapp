import { z } from 'zod';
import { apiRoute, leesId, leesQuery } from '@/lib/apiRoute';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalInspectie } from '@/lib/inspecties/server';
import { inspectieNummer } from '@/lib/inspecties/sjablonen';
import { inspectieRapportNaam, maakInspectieRapportPdf } from '@/lib/rapport/inspectieRapportPdf';
import { pdfAntwoord } from '@/lib/pdfAntwoord';

/*
  GET /api/inspecties/[id]/rapport[?fotos=0] - het rapport van één inspectie
  als PDF, op de server gemaakt (lib/rapport/inspectieRapportPdf.ts).

  - Admin en gebruiker: elke inspectie, ook een concept.
  - Kijker met de weergave klantportaal: alleen een AFGERONDE inspectie van zijn
    eigen klant (en met een kijkjaar alleen van dat jaar). Anders een 404,
    alsof de inspectie niet bestaat. De klassieke kijker komt hier niet
    (lib/toegang.ts). Elke download staat in het logboek.
*/

export const maxDuration = 60;

const Query = z.object({ fotos: z.enum(['0', '1']).optional() });

export const GET = apiRoute(
  { rol: 'alleen_lezen', module: 'inspecties', fout: 'Het rapport kon niet worden gemaakt' },
  async (request, context, sessie) => {
    const id = await leesId(context, 'Onbekende inspectie');
    const query = leesQuery(request, Query);
    const rij = await haalInspectie(id, sessie);
    const pdf = await maakInspectieRapportPdf(rij, { origin: new URL(request.url).origin, metFotos: query.fotos !== '0' });

    await createAuditLog({
      userId: sessie.userId,
      username: sessie.username,
      action: AuditActions.INSPECTIE_RAPPORT_DOWNLOAD,
      details: { id, nummer: inspectieNummer(rij), klantId: rij.klantId, klant: rij.klant.naam, sjabloon: rij.sjabloon },
      request,
    });

    return pdfAntwoord(pdf, inspectieRapportNaam(rij));
  }
);
