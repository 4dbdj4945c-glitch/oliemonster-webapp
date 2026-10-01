import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { fotoExtensie, fotoFout } from '@/lib/fotoControle';
import { bewaarFoto } from '@/lib/fotoOpslag';
import { alleenConcept, dagrapportAlsJson, haalDagrapport } from '@/lib/dagrapporten';

// POST /api/dagrapporten/[id]/fotos - een foto toevoegen (admin, multipart: photo, bijschrift). Alleen bij een concept.
const MAX_FOTOS = 20;

export const POST = apiRoute({ rol: 'admin', module: 'dagrapporten', fout: 'Fout bij opslaan van de foto' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende werkbon');
  const huidig = await haalDagrapport(id, sessie);
  alleenConcept(huidig);
  if (huidig.fotos.length >= MAX_FOTOS) throw new ApiFout(400, `Een werkbon heeft hoogstens ${MAX_FOTOS} foto's`);
  const form = await request.formData();
  const foto = form.get('photo');
  if (!(foto instanceof File) || foto.size === 0) throw new ApiFout(400, 'Kies een foto');
  const melding = fotoFout(foto);
  if (melding) throw new ApiFout(400, melding);
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiFout(500, 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.');
  }
  const bijschriftRuw = form.get('bijschrift');
  const bijschrift = typeof bijschriftRuw === 'string' && bijschriftRuw.trim() ? bijschriftRuw.trim().slice(0, 300) : null;
  const url = await bewaarFoto(`dagrapport-${id}.${fotoExtensie(foto)}`, foto);
  const volgorde = (huidig.fotos.at(-1)?.volgorde ?? 0) + 1;
  const nieuw = await prisma.dagrapportFoto.create({ data: { dagrapportId: id, url, bijschrift, volgorde }, select: { id: true } });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.UPLOAD_DAGRAPPORT_FOTO, details: { id, fotoId: nieuw.id }, request });
  return NextResponse.json(dagrapportAlsJson(await haalDagrapport(id, sessie)), { status: 201 });
});
