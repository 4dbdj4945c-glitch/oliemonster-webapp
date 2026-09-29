import { apiRoute, leesId } from '@/lib/apiRoute';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { dagrapportNummer, haalDagrapport } from '@/lib/dagrapporten';
import { dagrapportNaam, maakDagrapportPdf } from '@/lib/rapport/dagrapportPdf';
import { pdfAntwoord } from '@/lib/pdfAntwoord';

/*
  GET /api/dagrapporten/[id]/pdf - het dagrapport als PDF, op de server gemaakt
  (lib/rapport/dagrapportPdf.ts).

  - Admin en gebruiker: elk dagrapport, ook een concept (dan staat Concept in de kop).
  - Kijker met de weergave klantportaal: alleen een GETEKEND dagrapport van zijn
    eigen klant; anders een 404. De klassieke kijker komt hier niet (lib/toegang.ts).
    Elke download staat in het logboek.
*/

export const maxDuration = 60;

export const GET = apiRoute({ rol: 'alleen_lezen', module: 'dagrapporten', fout: 'Het dagrapport kon niet worden gemaakt' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekend dagrapport');
  const rij = await haalDagrapport(id, sessie);
  const pdf = await maakDagrapportPdf(rij, { origin: new URL(request.url).origin });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.DAGRAPPORT_DOWNLOAD,
    details: { id, nummer: dagrapportNummer(id), klantId: rij.klantId, klant: rij.klant.naam },
    request,
  });
  return pdfAntwoord(pdf, dagrapportNaam(rij));
});
