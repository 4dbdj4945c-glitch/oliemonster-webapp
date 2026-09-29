import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute } from '@/lib/apiRoute';
import { documentSoort, isGeldig, vandaagDag } from '@/lib/eigenDossier';
import { nlDag } from '@/lib/klantOpdracht';
import { maakInhuurdossierPdf } from '@/lib/rapport/inhuurdossierPdf';
import { pdfAntwoord } from '@/lib/pdfAntwoord';

/*
  GET /api/eigen-dossier/inhuurdossier - de geldige documenten van het eigen
  dossier in één PDF (alleen admin). Verlopen documenten gaan niet mee.
  Volgorde: VCA, verzekering, KvK, daarna het deskundigheidsdossier.
*/

export const maxDuration = 60;

const VOLGORDE = ['vca', 'verzekering', 'kvk', 'diploma', 'cursus', 'kalibratie', 'overig'];

export const GET = apiRoute({ rol: 'admin', module: 'eigen-dossier', fout: 'Het inhuurdossier kon niet worden gemaakt' }, async (request, _context, sessie) => {
  const rijen = await prisma.eigenDocument.findMany({
    where: { deletedAt: null },
    orderBy: [{ titel: 'asc' }],
    select: { id: true, soort: true, titel: true, uitgever: true, nummer: true, afgegevenOp: true, vervaltOp: true, bestandUrl: true, bestandType: true },
  });
  const geldig = rijen
    .filter((d) => isGeldig(d.vervaltOp ? nlDag(d.vervaltOp) : null))
    .sort((a, b) => VOLGORDE.indexOf(documentSoort(a.soort).waarde) - VOLGORDE.indexOf(documentSoort(b.soort).waarde));
  const pdf = await maakInhuurdossierPdf(geldig, { origin: new URL(request.url).origin });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.INHUURDOSSIER_DOWNLOAD,
    details: { documenten: geldig.map((d) => d.id), weggelaten: rijen.length - geldig.length },
    request,
  });
  // Gescande documenten tot 4 MB per stuk: samen al snel boven de grens, dan via de opslag.
  return pdfAntwoord(pdf, `inhuurdossier-its-done-services-${vandaagDag()}.pdf`);
});
