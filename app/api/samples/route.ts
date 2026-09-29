import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, jaarSchema, leesJson, leesQuery } from '@/lib/apiRoute';
import { controleerInstallatie, controleerObject, MonsterSchema } from '@/lib/monsterInvoer';
import { wijzigLaatstePoging } from '@/lib/sampleAttempts';
import {
  tabelOntbreekt,
  SAMPLE_BASIS_SELECT,
  SAMPLE_PLANNING_SELECT,
  SAMPLE_VOL_SELECT,
  SAMPLE_PLANNING_LEEG,
  SAMPLE_WENSEN2_LEEG,
} from '@/lib/planningApi';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { monsterFilter } from '@/lib/afscherming';

const LijstQuery = z.object({
  search: z.string().max(200).optional(),
  year: z.string().optional(),
});

// GET - Lijst van alle samples (met optionele zoekfunctie en analysisYear-filter)
export const GET = apiRoute(
  { rol: 'alleen_lezen', module: 'oliemonsters', fout: 'Fout bij ophalen van monsters' },
  async (request, _context, session) => {
    // De monsterlijst is het enige dat de rol alleen lezen mag ophalen.
    const query = leesQuery(request, LijstQuery);
    const search = query.search?.trim() || '';
    // Heeft deze gebruiker een eigen kijkjaar, dan geldt dat jaar en niets
    // anders, ongeacht wat er in de query staat; hoort hij bij een klant, dan
    // alleen de monsters van die klant. Dat wordt hier serverside afgedwongen
    // (lib/afscherming.ts) en niet alleen in de schermen.
    //
    // Verwijderde monsters (prullenbak) ziet niemand in de lijst, ook de rol
    // alleen lezen niet; alleen een admin ziet ze via /api/samples/verwijderd.
    const gevraagdJaar = query.year ? jaarSchema.parse(query.year) : null;
    const yearFilter = await monsterFilter(session, gevraagdJaar);

    const whereClause = search
      ? {
          AND: [
            yearFilter,
            {
              OR: [
                { oNumber: { contains: search, mode: 'insensitive' as const } },
                { location: { contains: search, mode: 'insensitive' as const } },
                { description: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          ],
        }
      : yearFilter;

    // Alles erbij: het object, de tweede foto en de velden van Niet bereikbaar.
    // Staat de database nog niet bij, dan in twee stappen terugvallen, zodat er
    // telkens zo veel mogelijk blijft werken.
    const extra = {
      _count: { select: { attempts: true } },
      object: { select: { id: true, name: true, objectType: true } },
    } as const;
    const zoek = { where: whereClause, orderBy: { sampleDate: 'desc' as const } };

    let samples;
    try {
      samples = await prisma.oilSample.findMany({
        ...zoek,
        select: { ...SAMPLE_VOL_SELECT, ...extra },
      });
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      try {
        const zonderWensen2 = await prisma.oilSample.findMany({
          ...zoek,
          select: { ...SAMPLE_PLANNING_SELECT, ...extra },
        });
        samples = zonderWensen2.map((s) => ({ ...s, ...SAMPLE_WENSEN2_LEEG }));
      } catch (tweede) {
        if (!tabelOntbreekt(tweede)) throw tweede;
        const oud = await prisma.oilSample.findMany({
          ...zoek,
          select: { ...SAMPLE_BASIS_SELECT, _count: { select: { attempts: true } } },
        });
        samples = oud.map((s) => ({ ...s, ...SAMPLE_PLANNING_LEEG, ...SAMPLE_WENSEN2_LEEG }));
      }
    }

    // attemptsCount als veld op het monster voor de schermen.
    const response = samples.map(({ _count, ...rest }) => ({
      ...rest,
      attemptsCount: _count.attempts,
    }));

    return NextResponse.json(response);
  }
);

// POST - Nieuw monster (alleen admin). Datum, genomen en opmerking gaan via een
// eerste poging (lib/sampleAttempts.ts), niet rechtstreeks op het monster.
export const POST = apiRoute(
  { rol: 'admin', module: 'oliemonsters', fout: 'Fout bij aanmaken van monster' },
  async (request, _context, session) => {
    const invoer = await leesJson(request, MonsterSchema);
    const jaar = invoer.analysisYear ?? 2025;
    await controleerObject(invoer.objectId);
    await controleerInstallatie(invoer.installatieId, invoer.objectId ?? null);

    // O-nummers zijn uniek per analysejaar (2025 en 2026 mogen hetzelfde nummer hebben)
    const existing = await prisma.oilSample.findFirst({
      where: { oNumber: invoer.oNumber, analysisYear: jaar, ...(await actiefFilter()) },
      select: { id: true },
    });
    if (existing) throw new ApiFout(400, `O-nummer bestaat al in ${jaar}`);
    // Staat dit nummer in de prullenbak, dan is het in de database nog bezet
    // (uniek per jaar). Een nieuw monster zou de oude pogingen en foto's
    // verbergen; terugzetten is dan de bedoeling. De pagina toont een knop.
    const inPrullenbak = await prisma.oilSample.findFirst({
      where: { oNumber: invoer.oNumber, analysisYear: jaar },
      select: { id: true },
    });
    if (inPrullenbak) {
      throw new ApiFout(
        409,
        `O-nummer ${invoer.oNumber} staat in ${jaar} in de prullenbak. Zet het daar terug, dan komen de pogingen, datums en foto's ook weer terug.`,
        { inPrullenbak: inPrullenbak.id }
      );
    }

    const nieuw = await prisma.oilSample.create({
      data: {
        oNumber: invoer.oNumber,
        analysisYear: jaar,
        location: invoer.location,
        description: invoer.description,
        oilType: invoer.oilType ?? null,
        isTaken: false,
        // Alleen meesturen als de pagina een object koos.
        ...(invoer.objectId === undefined ? {} : { objectId: invoer.objectId }),
        ...(invoer.installatieId === undefined ? {} : { installatieId: invoer.installatieId }),
      },
      select: { id: true },
    });

    await wijzigLaatstePoging(nieuw.id, {
      isTaken: invoer.isTaken,
      sampleDate: invoer.isTaken ? invoer.sampleDate ?? null : null,
      remarks: invoer.remarks ?? null,
    });

    const sample = await prisma.oilSample.findUniqueOrThrow({ where: { id: nieuw.id }, select: SAMPLE_BASIS_SELECT });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_SAMPLE,
      details: { oNumber: invoer.oNumber, location: invoer.location, isTaken: invoer.isTaken, analysisYear: jaar },
      request,
    });

    return NextResponse.json(sample, { status: 201 });
  }
);
