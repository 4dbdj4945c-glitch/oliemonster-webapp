import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { DOCUMENT_MAX_BYTES, DOCUMENT_TYPES } from '@/lib/eigenDossier';
import { DOCUMENT_SELECT, documentAlsJson } from '@/lib/eigenDossierServer';
import { haalFoto } from '@/lib/fotoLaden';
import { bewaarDocument, ruimFotoOpAls } from '@/lib/fotoOpslag';
import { schoneNaam } from '@/lib/rapport/rapportPdf';

/*
  Het bestand bij een document uit het eigen dossier (alleen admin):
  GET    - downloaden; de server haalt het op en stuurt het door
  POST   - uploaden (multipart, veld "bestand": PDF, JPEG of PNG, hoogstens 4 MB);
           vervangt het vorige bestand, dat uit de opslag gaat
  DELETE - bestand weghalen
*/

const OPTIES = { rol: 'admin', module: 'eigen-dossier' } as const;

async function actief(id: number) {
  const d = await prisma.eigenDocument.findFirst({ where: { id, deletedAt: null }, select: { id: true, titel: true, bestandUrl: true, bestandNaam: true, bestandType: true } });
  if (!d) throw new ApiFout(404, 'Document niet gevonden');
  return d;
}

export const GET = apiRoute({ ...OPTIES, fout: 'Fout bij ophalen van het bestand' }, async (request, context) => {
  const id = await leesId(context, 'Onbekend document');
  const d = await actief(id);
  const bestand = d.bestandUrl ? await haalFoto(d.bestandUrl, new URL(request.url).origin) : null;
  if (!bestand) throw new ApiFout(404, 'Bij dit document staat geen bestand');
  const type = d.bestandType ?? bestand.type;
  const naam = `${schoneNaam(d.titel) || 'document'}.${DOCUMENT_TYPES[type] ?? 'pdf'}`;
  return new NextResponse(new Uint8Array(bestand.bytes), {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${naam}"`,
      'Content-Length': String(bestand.bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

export const POST = apiRoute({ ...OPTIES, fout: 'Fout bij uploaden van het bestand' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekend document');
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiFout(500, 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.');
  }
  const d = await actief(id);
  const form = await request.formData();
  const file = form.get('bestand');
  if (!(file instanceof File) || file.size === 0) throw new ApiFout(400, 'Geen bestand gevonden');
  const ext = DOCUMENT_TYPES[file.type];
  if (!ext) throw new ApiFout(400, 'Kies een PDF, of een foto of scan als JPEG of PNG.');
  if (file.size > DOCUMENT_MAX_BYTES) {
    throw new ApiFout(400, `Het bestand is te groot (${(file.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB, maximaal 4 MB).`);
  }
  const url = await bewaarDocument(ext, file);
  const nieuw = await prisma.eigenDocument.update({
    where: { id },
    data: { bestandUrl: url, bestandNaam: file.name.slice(0, 200), bestandType: file.type },
    select: DOCUMENT_SELECT,
  });
  await ruimFotoOpAls(d.bestandUrl);
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.UPLOAD_EIGEN_DOCUMENT_BESTAND, details: { id, naam: file.name, vervangen: d.bestandUrl }, request });
  return NextResponse.json(documentAlsJson(nieuw));
});

export const DELETE = apiRoute({ ...OPTIES, fout: 'Fout bij weghalen van het bestand' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekend document');
  const d = await actief(id);
  const nieuw = await prisma.eigenDocument.update({ where: { id }, data: { bestandUrl: null, bestandNaam: null, bestandType: null }, select: DOCUMENT_SELECT });
  await ruimFotoOpAls(d.bestandUrl);
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.DELETE_EIGEN_DOCUMENT_BESTAND, details: { id, url: d.bestandUrl }, request });
  return NextResponse.json(documentAlsJson(nieuw));
});
