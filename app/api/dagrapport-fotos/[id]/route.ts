import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { ruimFotoOpAls } from '@/lib/fotoOpslag';
import { alleenConcept, dagrapportAlsJson, haalDagrapport } from '@/lib/dagrapporten';

// DELETE /api/dagrapport-fotos/[id] - een foto van een dagrapport weghalen (admin, alleen bij een concept)
export const DELETE = apiRoute({ rol: 'admin', module: 'dagrapporten', fout: 'Fout bij weghalen van de foto' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende foto');
  const foto = await prisma.dagrapportFoto.findUnique({ where: { id }, select: { id: true, url: true, dagrapportId: true } });
  if (!foto) throw new ApiFout(404, 'Foto niet gevonden');
  alleenConcept(await haalDagrapport(foto.dagrapportId, sessie));
  await prisma.dagrapportFoto.delete({ where: { id } });
  await ruimFotoOpAls(foto.url);
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.DELETE_DAGRAPPORT_FOTO, details: { dagrapportId: foto.dagrapportId, fotoId: id, url: foto.url }, request });
  return NextResponse.json(dagrapportAlsJson(await haalDagrapport(foto.dagrapportId, sessie)));
});
