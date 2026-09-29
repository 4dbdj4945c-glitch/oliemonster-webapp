import { NextResponse } from 'next/server';
import { klantLogoAdres } from '@/lib/fotoAdres';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { fotoExtensie, fotoFout } from '@/lib/fotoControle';
import { bewaarFoto, ruimFotoOpAls } from '@/lib/fotoOpslag';

// Logo van een klant, voor het klantportaal en het rapport. Een nieuw logo
// vervangt het oude; dat gaat uit de opslag (een pad in /public blijft staan).

async function actieveKlant(id: number) {
  const klant = await prisma.klant.findFirst({ where: { id, deletedAt: null }, select: { id: true, naam: true, logoUrl: true } });
  if (!klant) throw new ApiFout(404, 'Klant niet gevonden');
  return klant;
}

export const POST = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij uploaden van het logo' },
  async (request, context, sessie) => {
    const id = await leesId(context, 'Onbekende klant');
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new ApiFout(500, 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.');
    }
    const klant = await actieveKlant(id);
    const form = await request.formData();
    const file = form.get('photo');
    if (!(file instanceof File) || file.size === 0) throw new ApiFout(400, 'Geen logo gevonden');
    const melding = fotoFout(file);
    if (melding) throw new ApiFout(400, melding);

    const url = await bewaarFoto(`logo.${fotoExtensie(file)}`, file);
    await prisma.klant.update({ where: { id }, data: { logoUrl: url }, select: { id: true } });
    await ruimFotoOpAls(klant.logoUrl);

    await createAuditLog({
      userId: sessie.userId,
      username: sessie.username,
      action: AuditActions.UPLOAD_KLANT_LOGO,
      details: { id, naam: klant.naam, vervangen: klant.logoUrl },
      request,
    });
    return NextResponse.json({ logo: klantLogoAdres({ id, logoUrl: url }) });
  }
);

export const DELETE = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij verwijderen van het logo' },
  async (request, context, sessie) => {
    const id = await leesId(context, 'Onbekende klant');
    const klant = await actieveKlant(id);
    await prisma.klant.update({ where: { id }, data: { logoUrl: null }, select: { id: true } });
    await ruimFotoOpAls(klant.logoUrl);
    await createAuditLog({
      userId: sessie.userId,
      username: sessie.username,
      action: AuditActions.DELETE_KLANT_LOGO,
      details: { id, naam: klant.naam, url: klant.logoUrl },
      request,
    });
    return NextResponse.json({ success: true });
  }
);
