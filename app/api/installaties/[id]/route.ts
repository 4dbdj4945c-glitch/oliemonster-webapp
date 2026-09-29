import { NextResponse } from 'next/server';
import { metInstallatieFoto } from '@/lib/fotoAdres';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { InstallatieWijzigingSchema } from '@/lib/klanten';

const OPTIES = { rol: 'admin', module: 'klanten' } as const;

async function actieveInstallatie(id: number) {
  const installatie = await prisma.installatie.findFirst({ where: { id, deletedAt: null } });
  if (!installatie) throw new ApiFout(404, 'Installatie niet gevonden');
  return installatie;
}

// GET - Eén installatie met object, klant en de laatste monsters.
export const GET = apiRoute({ ...OPTIES, fout: 'Fout bij ophalen van de installatie' }, async (_request, context) => {
  const id = await leesId(context, 'Onbekende installatie');
  await actieveInstallatie(id);
  const installatie = await prisma.installatie.findUniqueOrThrow({
    where: { id },
    include: {
      object: { select: { id: true, name: true, objectType: true, klant: { select: { id: true, naam: true } } } },
      monsters: {
        where: { deletedAt: null },
        orderBy: [{ analysisYear: 'desc' }, { oNumber: 'asc' }],
        take: 50,
        select: { id: true, oNumber: true, analysisYear: true, sampleDate: true, isTaken: true, isDisabled: true, isUnreachable: true, description: true },
      },
    },
  });
  return NextResponse.json(metInstallatieFoto(installatie));
});

// PUT - Gegevens bijwerken. Een ander object mag, de monsters gaan dan niet mee.
export const PUT = apiRoute({ ...OPTIES, fout: 'Fout bij bijwerken van de installatie' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende installatie');
  const huidig = await actieveInstallatie(id);
  const invoer = await leesJson(request, InstallatieWijzigingSchema);
  if (invoer.objectId !== undefined) {
    const object = await prisma.sampleObject.findUnique({ where: { id: invoer.objectId }, select: { id: true } });
    if (!object) throw new ApiFout(400, 'Onbekend object');
  }
  const data = Object.fromEntries(Object.entries(invoer).filter(([, w]) => w !== undefined));
  const installatie = await prisma.installatie.update({ where: { id }, data });

  // Naar een ander object: de monsters van het oude object horen er niet meer bij.
  let losgekoppeld = 0;
  if (invoer.objectId !== undefined && invoer.objectId !== huidig.objectId) {
    losgekoppeld = (
      await prisma.oilSample.updateMany({
        where: { installatieId: id, OR: [{ objectId: null }, { objectId: { not: invoer.objectId } }] },
        data: { installatieId: null },
      })
    ).count;
  }

  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.UPDATE_INSTALLATIE,
    details: { id, code: installatie.code, velden: Object.keys(data), monstersLosgekoppeld: losgekoppeld },
    request,
  });
  return NextResponse.json(metInstallatieFoto(installatie));
});

const VerwijderSchema = z.object({ bevestigCode: z.string().optional() });

// DELETE - Installatie naar de prullenbak (zacht). De monsters houden hun
// koppeling en zijn er na terugzetten weer bij. De code moet ter bevestiging mee.
export const DELETE = apiRoute({ ...OPTIES, fout: 'Fout bij verwijderen van de installatie' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende installatie');
  const installatie = await actieveInstallatie(id);
  const { bevestigCode } = await leesJson(request, VerwijderSchema);
  if ((bevestigCode ?? '').trim().toUpperCase() !== installatie.code) {
    throw new ApiFout(400, `Typ de code ${installatie.code} over om het verwijderen te bevestigen.`);
  }
  await prisma.installatie.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: sessie.username } });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.DELETE_INSTALLATIE,
    details: { id, code: installatie.code, naam: installatie.naam, zacht: true },
    request,
  });
  return NextResponse.json({ success: true, id, code: installatie.code, naam: installatie.naam });
});
