import { NextResponse } from 'next/server';
import { fotoAdres } from '@/lib/fotoAdres';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { fotoExtensie, fotoFout } from '@/lib/fotoControle';
import { bewaarFoto, ruimFotoOpAls } from '@/lib/fotoOpslag';

// Foto van een installatie (bijvoorbeeld het typeplaatje). Een nieuwe foto
// vervangt de oude; die gaat uit de opslag.

async function actieveInstallatie(id: number) {
  const installatie = await prisma.installatie.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true, fotoUrl: true },
  });
  if (!installatie) throw new ApiFout(404, 'Installatie niet gevonden');
  return installatie;
}

export const POST = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij uploaden van de foto' },
  async (request, context, sessie) => {
    const id = await leesId(context, 'Onbekende installatie');
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new ApiFout(500, 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.');
    }
    const installatie = await actieveInstallatie(id);
    const form = await request.formData();
    const file = form.get('photo');
    if (!(file instanceof File) || file.size === 0) throw new ApiFout(400, 'Geen foto gevonden');
    const melding = fotoFout(file);
    if (melding) throw new ApiFout(400, melding);

    const url = await bewaarFoto(`installatie-${id}-${Date.now()}.${fotoExtensie(file)}`, file);
    await prisma.installatie.update({ where: { id }, data: { fotoUrl: url }, select: { id: true } });
    await ruimFotoOpAls(installatie.fotoUrl);

    await createAuditLog({
      userId: sessie.userId,
      username: sessie.username,
      action: AuditActions.UPLOAD_INSTALLATIE_FOTO,
      details: { id, code: installatie.code, vervangen: installatie.fotoUrl },
      request,
    });
    return NextResponse.json({ fotoUrl: fotoAdres('installatie', id, null, url) });
  }
);

export const DELETE = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij verwijderen van de foto' },
  async (request, context, sessie) => {
    const id = await leesId(context, 'Onbekende installatie');
    const installatie = await actieveInstallatie(id);
    await prisma.installatie.update({ where: { id }, data: { fotoUrl: null }, select: { id: true } });
    await ruimFotoOpAls(installatie.fotoUrl);
    await createAuditLog({
      userId: sessie.userId,
      username: sessie.username,
      action: AuditActions.DELETE_INSTALLATIE_FOTO,
      details: { id, code: installatie.code, url: installatie.fotoUrl },
      request,
    });
    return NextResponse.json({ success: true });
  }
);
