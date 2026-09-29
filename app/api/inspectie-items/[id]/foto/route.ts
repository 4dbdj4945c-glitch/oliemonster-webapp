import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { fotoExtensie, fotoFout } from '@/lib/fotoControle';
import { bewaarFoto, ruimFotoOpAls } from '@/lib/fotoOpslag';
import { haalInspectie, inspectieAlsJson } from '@/lib/inspecties/server';

// Foto bij een bevinding (een lek, een arbeidsmiddel), via de gewone fotoflow:
// verkleind in de browser, opgeslagen onder een onvindbare naam, naar de
// browser alleen via /api/fotos/inspectie/[id]. Een nieuwe foto vervangt de oude.

async function actiefItem(id: number) {
  const item = await prisma.inspectieItem.findFirst({
    where: { id, deletedAt: null, inspectie: { deletedAt: null } },
    select: { id: true, inspectieId: true, fotoUrl: true },
  });
  if (!item) throw new ApiFout(404, 'Bevinding niet gevonden');
  return item;
}

export const POST = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij uploaden van de foto' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende bevinding');
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiFout(500, 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.');
  }
  const item = await actiefItem(id);
  const form = await request.formData();
  const file = form.get('photo');
  if (!(file instanceof File) || file.size === 0) throw new ApiFout(400, 'Geen foto gevonden');
  const melding = fotoFout(file);
  if (melding) throw new ApiFout(400, melding);

  const url = await bewaarFoto(`inspectie-${id}.${fotoExtensie(file)}`, file);
  await prisma.inspectieItem.update({ where: { id }, data: { fotoUrl: url }, select: { id: true } });
  await ruimFotoOpAls(item.fotoUrl);
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.UPLOAD_INSPECTIE_FOTO,
    details: { itemId: id, inspectieId: item.inspectieId, vervangen: item.fotoUrl },
    request,
  });
  return NextResponse.json(inspectieAlsJson(await haalInspectie(item.inspectieId, sessie)));
});

export const DELETE = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij verwijderen van de foto' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende bevinding');
  const item = await actiefItem(id);
  await prisma.inspectieItem.update({ where: { id }, data: { fotoUrl: null }, select: { id: true } });
  await ruimFotoOpAls(item.fotoUrl);
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.DELETE_INSPECTIE_FOTO,
    details: { itemId: id, inspectieId: item.inspectieId, url: item.fotoUrl },
    request,
  });
  return NextResponse.json(inspectieAlsJson(await haalInspectie(item.inspectieId, sessie)));
});
