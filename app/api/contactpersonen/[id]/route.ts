import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { ContactpersoonWijzigingSchema } from '@/lib/klanten';

const OPTIES = { rol: 'admin', module: 'klanten' } as const;

async function actievePersoon(id: number) {
  const persoon = await prisma.contactpersoon.findFirst({ where: { id, deletedAt: null } });
  if (!persoon) throw new ApiFout(404, 'Contactpersoon niet gevonden');
  return persoon;
}

// PUT - Contactpersoon bijwerken
export const PUT = apiRoute({ ...OPTIES, fout: 'Fout bij bijwerken van de contactpersoon' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende contactpersoon');
  await actievePersoon(id);
  const invoer = await leesJson(request, ContactpersoonWijzigingSchema);
  const data = Object.fromEntries(Object.entries(invoer).filter(([, w]) => w !== undefined));
  const persoon = await prisma.contactpersoon.update({ where: { id }, data });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.UPDATE_CONTACTPERSOON,
    details: { id, naam: persoon.naam },
    request,
  });
  return NextResponse.json(persoon);
});

// DELETE - Contactpersoon weghalen (zacht, met Ongedaan maken in het scherm)
export const DELETE = apiRoute({ ...OPTIES, fout: 'Fout bij verwijderen van de contactpersoon' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende contactpersoon');
  const persoon = await actievePersoon(id);
  await prisma.contactpersoon.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: sessie.username } });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.DELETE_CONTACTPERSOON,
    details: { id, naam: persoon.naam, klantId: persoon.klantId, zacht: true },
    request,
  });
  return NextResponse.json({ success: true, id, naam: persoon.naam });
});
