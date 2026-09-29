import { bewaarKlantBijLoskoppelen } from '@/lib/monsterInvoer';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { TABEL_ONTBREEKT_PLANNING } from '@/lib/planningApi';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { alleenMeegestuurd, ObjectWijzigingSchema } from '@/lib/objectInvoer';
import { controleerKlant } from '@/lib/klanten';

const OPTIES = { rol: 'admin', module: 'objecten', ontbreekt: TABEL_ONTBREEKT_PLANNING } as const;

// PUT - Object bijwerken (alleen admin). Ook voor het koppelen aan een klant
// vanuit het klantscherm: dan komt alleen klantId mee.
export const PUT = apiRoute({ ...OPTIES, fout: 'Fout bij bijwerken van object' }, async (request, context, session) => {
  const objectId = await leesId(context, 'Onbekend object');

  const bestaand = await prisma.sampleObject.findUnique({ where: { id: objectId }, select: { id: true, klantId: true } });
  if (!bestaand) throw new ApiFout(404, 'Object niet gevonden');

  const invoer = await leesJson(request, ObjectWijzigingSchema);
  await controleerKlant(invoer.klantId);

  // Namen zijn uniek: controleer of een ander object die naam al heeft.
  if (invoer.name) {
    const dubbel = await prisma.sampleObject.findFirst({
      where: { name: invoer.name, id: { not: objectId } },
      select: { id: true },
    });
    if (dubbel) throw new ApiFout(400, 'Er is al een object met deze naam');
  }

  const object = await prisma.sampleObject.update({ where: { id: objectId }, data: alleenMeegestuurd(invoer) });

  await createAuditLog({
    userId: session.userId,
    username: session.username || 'unknown',
    action: AuditActions.UPDATE_SAMPLE_OBJECT,
    details: {
      id: objectId,
      naam: object.name,
      ...(invoer.klantId !== undefined && invoer.klantId !== bestaand.klantId
        ? { klantVan: bestaand.klantId, klantNaar: invoer.klantId }
        : {}),
    },
    request,
  });

  return NextResponse.json(object);
});

// DELETE - Object verwijderen (alleen admin). Dat mag alleen als er geen monsters
// en geen installaties meer aan hangen: anders raak je zonder het te zien de
// koppeling van die monsters kwijt. Hangen er nog monsters aan, voeg het object
// dan eerst samen met het goede kunstwerk.
export const DELETE = apiRoute({ ...OPTIES, fout: 'Fout bij verwijderen van object' }, async (request, context, session) => {
  const objectId = await leesId(context, 'Onbekend object');

  const object = await prisma.sampleObject.findUnique({ where: { id: objectId }, select: { id: true, name: true } });
  if (!object) throw new ApiFout(404, 'Object niet gevonden');

  const aantal = await prisma.oilSample.count({ where: { objectId, ...(await actiefFilter()) } });
  if (aantal > 0) {
    throw new ApiFout(
      400,
      `Aan "${object.name}" hangen nog ${aantal} ${aantal === 1 ? 'monster' : 'monsters'}. Voeg dit object eerst samen met het goede kunstwerk, of koppel de monsters om.`
    );
  }
  // Ook installaties in de prullenbak tellen: die horen nog bij dit object.
  const installaties = await prisma.installatie.count({ where: { objectId } });
  if (installaties > 0) {
    throw new ApiFout(
      400,
      `Op "${object.name}" staan nog ${installaties} ${installaties === 1 ? 'installatie' : 'installaties'}. Verplaats die eerst of voeg dit object samen met een ander.`
    );
  }
  // Monsters in de prullenbak verliezen hun object (SetNull), maar houden de klant.
  await bewaarKlantBijLoskoppelen({ objectId });
  await prisma.sampleObject.delete({ where: { id: objectId } });

  await createAuditLog({
    userId: session.userId,
    username: session.username || 'unknown',
    action: AuditActions.DELETE_SAMPLE_OBJECT,
    details: { id: objectId, naam: object.name },
    request,
  });

  return NextResponse.json({ success: true });
});
