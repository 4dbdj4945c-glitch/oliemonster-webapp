import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { eenmalig } from '@/lib/idempotentie';
import { fotoExtensie, fotoFout } from '@/lib/fotoControle';
import { bewaarFoto } from '@/lib/fotoOpslag';
import { MAX_FOTOS_PER_BEVINDING, alleenBijConcept, haalInspectie, inspectieAlsJson } from '@/lib/inspecties/server';

/*
  POST /api/inspectie-items/[id]/fotos - een foto toevoegen aan een bevinding
  (admin, multipart: photo, en bijschrift mag). Kan vaker: hoogstens
  MAX_FOTOS_PER_BEVINDING per bevinding. Alleen bij een concept. Via de gewone
  fotoflow: verkleind in de browser, opgeslagen onder een onvindbare naam, naar
  de browser alleen via /api/fotos/inspectiefoto/[fotoId].
  Met de header Idempotentie-Sleutel (de offline wachtrij) maar één keer.
  Geeft de hele inspectie terug.

  Weghalen en het bijschrift wijzigen: /api/inspectie-fotos/[id].
*/

export const POST = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij uploaden van de foto' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende bevinding');
  return eenmalig(request, sessie, `inspectie-foto-${id}`, async () => {
    const item = await prisma.inspectieItem.findFirst({
      where: { id, deletedAt: null, inspectie: { deletedAt: null } },
      // Ook weggehaalde foto's tellen mee voor de volgorde, zodat Ongedaan maken hem op zijn plek terugzet.
      select: { id: true, inspectieId: true, fotos: { select: { volgorde: true, deletedAt: true } } },
    });
    if (!item) throw new ApiFout(404, 'Bevinding niet gevonden');
    await alleenBijConcept(item.inspectieId);
    if (item.fotos.filter((f) => !f.deletedAt).length >= MAX_FOTOS_PER_BEVINDING) {
      throw new ApiFout(400, `Een bevinding heeft hoogstens ${MAX_FOTOS_PER_BEVINDING} foto's. Haal er eerst een weg.`);
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new ApiFout(500, 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.');
    }
    const form = await request.formData();
    const file = form.get('photo');
    if (!(file instanceof File) || file.size === 0) throw new ApiFout(400, 'Geen foto gevonden');
    const melding = fotoFout(file);
    if (melding) throw new ApiFout(400, melding);
    const bijschriftRuw = form.get('bijschrift');
    const bijschrift = typeof bijschriftRuw === 'string' && bijschriftRuw.trim() ? bijschriftRuw.trim().slice(0, 300) : null;

    const url = await bewaarFoto(`inspectie-${id}.${fotoExtensie(file)}`, file);
    const volgorde = item.fotos.length ? Math.max(...item.fotos.map((f) => f.volgorde)) + 1 : 0;
    const foto = await prisma.inspectieFoto.create({ data: { itemId: id, url, bijschrift, volgorde }, select: { id: true } });
    await createAuditLog({
      userId: sessie.userId,
      username: sessie.username,
      action: AuditActions.UPLOAD_INSPECTIE_FOTO,
      details: { itemId: id, inspectieId: item.inspectieId, fotoId: foto.id },
      request,
    });
    return NextResponse.json(inspectieAlsJson(await haalInspectie(item.inspectieId, sessie)));
  });
});
