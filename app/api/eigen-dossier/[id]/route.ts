import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { DOCUMENT_SELECT, DocumentWijzigingSchema, documentAlsJson, documentData } from '@/lib/eigenDossierServer';

// PUT - gegevens van een document bijwerken; DELETE - naar de prullenbak
// (zacht, de pagina toont Ongedaan maken). Alleen admin.

const OPTIES = { rol: 'admin', module: 'eigen-dossier' } as const;

async function actief(id: number) {
  const d = await prisma.eigenDocument.findFirst({ where: { id, deletedAt: null }, select: { id: true, titel: true } });
  if (!d) throw new ApiFout(404, 'Document niet gevonden');
  return d;
}

export const PUT = apiRoute({ ...OPTIES, fout: 'Fout bij opslaan van het document' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekend document');
  await actief(id);
  const data = documentData(await leesJson(request, DocumentWijzigingSchema));
  const d = await prisma.eigenDocument.update({ where: { id }, data, select: DOCUMENT_SELECT });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.UPDATE_EIGEN_DOCUMENT, details: { id, velden: Object.keys(data) }, request });
  return NextResponse.json(documentAlsJson(d));
});

export const DELETE = apiRoute({ ...OPTIES, fout: 'Fout bij verwijderen van het document' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekend document');
  const d = await actief(id);
  await prisma.eigenDocument.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: sessie.username } });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.DELETE_EIGEN_DOCUMENT, details: { id, titel: d.titel, zacht: true }, request });
  return NextResponse.json({ success: true, id, titel: d.titel });
});
