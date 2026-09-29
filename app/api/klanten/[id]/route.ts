import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { controleerKlantnaam, KlantWijzigingSchema } from '@/lib/klanten';
import { klantLogoAdres } from '@/lib/fotoAdres';

const OPTIES = { rol: 'admin', module: 'klanten' } as const;

async function actieveKlant(id: number) {
  const klant = await prisma.klant.findFirst({ where: { id, deletedAt: null } });
  if (!klant) throw new ApiFout(404, 'Klant niet gevonden');
  return klant;
}

// GET - Eén klant met contactpersonen, objecten (met installaties en het aantal
// monsters), de gebruikers die voor deze klant meekijken en de prospect waar
// hij uit ontstond.
export const GET = apiRoute({ ...OPTIES, fout: 'Fout bij ophalen van de klant' }, async (_request, context) => {
  const id = await leesId(context, 'Onbekende klant');
  const klant = await actieveKlant(id);

  const [contactpersonen, objecten, gebruikers, prospect] = await Promise.all([
    prisma.contactpersoon.findMany({ where: { klantId: id, deletedAt: null }, orderBy: { naam: 'asc' } }),
    prisma.sampleObject.findMany({
      where: { klantId: id },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        objectType: true,
        region: true,
        address: true,
        installaties: {
          where: { deletedAt: null },
          orderBy: { naam: 'asc' },
          select: { id: true, code: true, naam: true, soort: true, merk: true, typenummer: true, bouwjaar: true },
        },
        _count: { select: { samples: { where: await actiefFilter() } } },
      },
    }),
    prisma.user.findMany({
      where: { klantId: id },
      orderBy: { username: 'asc' },
      select: { id: true, username: true, role: true, viewYear: true, portaalWeergave: true },
    }),
    prisma.prospect.findUnique({ where: { klantId: id }, select: { id: true, bedrijfsnaam: true, klantSindsOp: true } }),
  ]);

  return NextResponse.json({
    ...klant,
    // Het logo via de fotoroute, zoals alle beelden (lib/fotoAdres.ts).
    logoUrl: klantLogoAdres(klant),
    contactpersonen,
    objecten: objecten.map(({ _count, ...o }) => ({ ...o, aantalMonsters: _count.samples })),
    gebruikers,
    prospect,
  });
});

// PUT - Gegevens van de klant bijwerken
export const PUT = apiRoute({ ...OPTIES, fout: 'Fout bij bijwerken van de klant' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende klant');
  await actieveKlant(id);
  const invoer = await leesJson(request, KlantWijzigingSchema);
  if (invoer.naam) await controleerKlantnaam(invoer.naam, id);

  const data = Object.fromEntries(Object.entries(invoer).filter(([, w]) => w !== undefined));
  const klant = await prisma.klant.update({ where: { id }, data });

  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.UPDATE_KLANT,
    details: { id, naam: klant.naam, velden: Object.keys(data) },
    request,
  });
  return NextResponse.json({ ...klant, logoUrl: klantLogoAdres(klant) });
});

const VerwijderSchema = z.object({ bevestigNaam: z.string().optional() });

// DELETE - Klant naar de prullenbak (zacht verwijderen). Alleen als er geen
// objecten en geen meekijkende gebruikers meer aan hangen: die zouden anders
// bij een klant horen die je niet meer ziet. De naam moet ter bevestiging mee.
export const DELETE = apiRoute({ ...OPTIES, fout: 'Fout bij verwijderen van de klant' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende klant');
  const klant = await actieveKlant(id);
  const { bevestigNaam } = await leesJson(request, VerwijderSchema);
  if ((bevestigNaam ?? '').trim().toLowerCase() !== klant.naam.trim().toLowerCase()) {
    throw new ApiFout(400, `Typ de naam ${klant.naam} over om het verwijderen te bevestigen.`);
  }

  const [objecten, gebruikers] = await Promise.all([
    prisma.sampleObject.count({ where: { klantId: id } }),
    prisma.user.count({ where: { klantId: id } }),
  ]);
  if (objecten > 0 || gebruikers > 0) {
    const delen = [
      objecten ? `${objecten} ${objecten === 1 ? 'object' : 'objecten'}` : '',
      gebruikers ? `${gebruikers} ${gebruikers === 1 ? 'gebruiker' : 'gebruikers'}` : '',
    ].filter(Boolean);
    throw new ApiFout(
      400,
      `Aan ${klant.naam} hangen nog ${delen.join(' en ')}. Koppel die eerst aan een andere klant of los.`
    );
  }

  await prisma.klant.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: sessie.username } });

  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.DELETE_KLANT,
    details: { id, naam: klant.naam, zacht: true },
    request,
  });
  return NextResponse.json({ success: true, id, naam: klant.naam });
});
