import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, leesJson } from '@/lib/apiRoute';
import { DOCUMENT_SELECT, NieuwDocumentSchema, documentAlsJson, documentData } from '@/lib/eigenDossierServer';

/*
  GET  /api/eigen-dossier - alle documenten van het eigen dossier (alleen admin),
       eerst wat het eerst verloopt
  POST /api/eigen-dossier - nieuw document (het bestand komt daarna via .../bestand)
*/

const OPTIES = { rol: 'admin', module: 'eigen-dossier' } as const;

export const GET = apiRoute({ ...OPTIES, fout: 'Fout bij ophalen van het eigen dossier' }, async () => {
  const rijen = await prisma.eigenDocument.findMany({
    where: { deletedAt: null },
    orderBy: [{ vervaltOp: { sort: 'asc', nulls: 'last' } }, { titel: 'asc' }],
    select: DOCUMENT_SELECT,
  });
  return NextResponse.json(rijen.map((d) => documentAlsJson(d)));
});

export const POST = apiRoute({ ...OPTIES, fout: 'Fout bij opslaan van het document' }, async (request, _context, sessie) => {
  const invoer = await leesJson(request, NieuwDocumentSchema);
  const d = await prisma.eigenDocument.create({ data: documentData(invoer) as Parameters<typeof prisma.eigenDocument.create>[0]['data'], select: DOCUMENT_SELECT });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.CREATE_EIGEN_DOCUMENT,
    details: { id: d.id, soort: d.soort, titel: d.titel },
    request,
  });
  return NextResponse.json(documentAlsJson(d), { status: 201 });
});
