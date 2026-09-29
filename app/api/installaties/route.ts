import { NextResponse } from 'next/server';
import { metInstallatieFoto } from '@/lib/fotoAdres';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesJson, leesQuery } from '@/lib/apiRoute';
import { NieuweInstallatieSchema, vrijeInstallatieCode } from '@/lib/klanten';

const id = z.coerce.number().int().positive();
const LijstQuery = z.object({ klantId: id.optional(), objectId: id.optional() });

// GET - Installaties (alleen admin), eventueel van één klant of één object.
// Verwijderde installaties staan er niet in.
export const GET = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij ophalen van installaties' },
  async (request) => {
    const { klantId, objectId } = leesQuery(request, LijstQuery);
    const installaties = await prisma.installatie.findMany({
      where: {
        deletedAt: null,
        ...(objectId ? { objectId } : {}),
        ...(klantId ? { object: { klantId } } : {}),
      },
      orderBy: [{ object: { name: 'asc' } }, { naam: 'asc' }],
      include: {
        object: { select: { id: true, name: true, klant: { select: { id: true, naam: true } } } },
        _count: { select: { monsters: { where: { deletedAt: null } } } },
      },
    });
    return NextResponse.json(installaties.map(({ _count, ...i }) => ({ ...metInstallatieFoto(i), aantalMonsters: _count.monsters })));
  }
);

// POST - Nieuwe installatie op een object. De code voor de QR-sticker komt vanzelf.
export const POST = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij aanmaken van de installatie' },
  async (request, _context, sessie) => {
    const invoer = await leesJson(request, NieuweInstallatieSchema);
    const object = await prisma.sampleObject.findUnique({ where: { id: invoer.objectId }, select: { id: true, name: true } });
    if (!object) throw new ApiFout(400, 'Onbekend object');

    const installatie = await prisma.installatie.create({
      data: {
        ...Object.fromEntries(Object.entries(invoer).filter(([, w]) => w !== undefined)),
        objectId: invoer.objectId,
        naam: invoer.naam,
        soort: invoer.soort,
        code: await vrijeInstallatieCode(),
      },
    });

    await createAuditLog({
      userId: sessie.userId,
      username: sessie.username,
      action: AuditActions.CREATE_INSTALLATIE,
      details: { id: installatie.id, code: installatie.code, naam: installatie.naam, object: object.name },
      request,
    });
    return NextResponse.json(metInstallatieFoto(installatie), { status: 201 });
  }
);
