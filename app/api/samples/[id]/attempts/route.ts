import { NextResponse } from 'next/server';
import { metPogingFotos } from '@/lib/fotoAdres';
import { geenFotoRoute } from '@/lib/fotoOpslag';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { ATTEMPT_BASIS_SELECT, syncLatestAttemptToSample } from '@/lib/sampleAttempts';
import { KOLOM_ONTBREEKT_WENSEN2, tabelOntbreekt } from '@/lib/kolommen';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { apiRoute, ApiFout, leesId, leesJson, optioneleDatum, optioneleTekst } from '@/lib/apiRoute';

const OPTIES = { module: 'oliemonsters', ontbreekt: KOLOM_ONTBREEKT_WENSEN2 } as const;

// GET - Alle pogingen voor een monster (chronologisch, oudste eerst)
export const GET = apiRoute(
  { rol: 'user', ...OPTIES, fout: 'Fout bij ophalen van pogingen' },
  async (_request, context) => {
    // De rol alleen lezen mag de pogingen niet zien: die zit alleen in het
    // bewerkvenster van een admin. withAuth weigert hem, ook serverside.
    const oilSampleId = await leesId(context, 'Onbekend monster');
    const volgorde = [{ sampleDate: 'asc' as const }, { createdAt: 'asc' as const }];

    try {
      const attempts = await prisma.sampleAttempt.findMany({
        where: { oilSampleId },
        orderBy: volgorde,
        select: { ...ATTEMPT_BASIS_SELECT, partPhotoUrl: true },
      });
      return NextResponse.json(attempts.map(metPogingFotos));
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      const oud = await prisma.sampleAttempt.findMany({
        where: { oilSampleId },
        orderBy: volgorde,
        select: ATTEMPT_BASIS_SELECT,
      });
      return NextResponse.json(oud.map((a) => metPogingFotos({ ...a, partPhotoUrl: null })));
    }
  }
);

const NieuwePogingSchema = z.object({
  sampleDate: optioneleDatum(),
  photoUrl: optioneleTekst(2000).refine(geenFotoRoute, { error: 'Onbekend fotoadres' }),
  partPhotoUrl: optioneleTekst(2000).refine(geenFotoRoute, { error: 'Onbekend fotoadres' }),
  remarks: optioneleTekst(),
  isTaken: z.boolean().optional(),
});

// POST - Nieuwe poging toevoegen (hermonstering)
export const POST = apiRoute(
  { rol: 'admin', ...OPTIES, fout: 'Fout bij aanmaken van poging' },
  async (request, context, session) => {
    const oilSampleId = await leesId(context, 'Onbekend monster');

    const sample = await prisma.oilSample.findUnique({
      where: { id: oilSampleId, ...(await actiefFilter()) },
      select: { id: true, oNumber: true },
    });
    if (!sample) throw new ApiFout(404, 'Monster niet gevonden');

    const invoer = await leesJson(request, NieuwePogingSchema);

    const attempt = await prisma.sampleAttempt.create({
      data: {
        oilSampleId,
        sampleDate: invoer.sampleDate ?? null,
        photoUrl: invoer.photoUrl ?? null,
        partPhotoUrl: invoer.partPhotoUrl ?? null,
        remarks: invoer.remarks ?? null,
        isTaken: invoer.isTaken ?? false,
      },
      select: { ...ATTEMPT_BASIS_SELECT, partPhotoUrl: true },
    });

    await syncLatestAttemptToSample(oilSampleId);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_ATTEMPT,
      details: { oilSampleId, oNumber: sample.oNumber, attemptId: attempt.id },
      request,
    });

    return NextResponse.json(metPogingFotos(attempt), { status: 201 });
  }
);
