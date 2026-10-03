import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson, optioneleTekst } from '@/lib/apiRoute';
import { alleenBijConcept, haalInspectie, inspectieAlsJson } from '@/lib/inspecties/server';

/*
  PUT    /api/inspectie-fotos/[id] - bijschrift wijzigen (admin, { bijschrift })
  DELETE /api/inspectie-fotos/[id] - foto weghalen (admin, zacht: het scherm
         toont Ongedaan maken, zie .../herstellen). Het bestand blijft in de
         opslag zolang de rij bestaat (lib/fotoOpslag.ts telt ook weggehaalde foto's).
  Alleen bij een concept. Beide geven de hele inspectie terug.
*/

async function actieveFoto(id: number) {
  const foto = await prisma.inspectieFoto.findFirst({
    where: { id, deletedAt: null, item: { deletedAt: null, inspectie: { deletedAt: null } } },
    select: { id: true, url: true, itemId: true, item: { select: { inspectieId: true, fotoUrl: true } } },
  });
  if (!foto) throw new ApiFout(404, 'Foto niet gevonden');
  await alleenBijConcept(foto.item.inspectieId);
  return foto;
}

const BijschriftSchema = z.object({ bijschrift: optioneleTekst(300) });

export const PUT = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij opslaan van het bijschrift' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende foto');
  const foto = await actieveFoto(id);
  const { bijschrift } = await leesJson(request, BijschriftSchema);
  await prisma.inspectieFoto.update({ where: { id }, data: { bijschrift: bijschrift ?? null }, select: { id: true } });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.UPDATE_INSPECTIE_FOTO,
    details: { fotoId: id, itemId: foto.itemId, inspectieId: foto.item.inspectieId },
    request,
  });
  return NextResponse.json(inspectieAlsJson(await haalInspectie(foto.item.inspectieId, sessie)));
});

export const DELETE = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij weghalen van de foto' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende foto');
  const foto = await actieveFoto(id);
  await prisma.$transaction([
    prisma.inspectieFoto.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: sessie.username }, select: { id: true } }),
    // De oude kolom (terugval van voor meerdere foto's) wijst misschien nog naar
    // dezelfde foto: die mag dan ook leeg, anders komt de foto via een oud adres terug.
    prisma.inspectieItem.updateMany({ where: { id: foto.itemId, fotoUrl: foto.url }, data: { fotoUrl: null } }),
  ]);
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.DELETE_INSPECTIE_FOTO,
    details: { fotoId: id, itemId: foto.itemId, inspectieId: foto.item.inspectieId, zacht: true },
    request,
  });
  return NextResponse.json(inspectieAlsJson(await haalInspectie(foto.item.inspectieId, sessie)));
});
