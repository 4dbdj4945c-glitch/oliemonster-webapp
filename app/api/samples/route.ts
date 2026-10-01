import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, jaarSchema, leesJson, leesQuery, tegelijk } from '@/lib/apiRoute';
import { controleerInstallatie, controleerObject, MonsterSchema } from '@/lib/monsterInvoer';
import { controleerKlant } from '@/lib/klanten';
import { wijzigLaatstePoging } from '@/lib/sampleAttempts';
import { haalLijstRij, haalMonsterLijst } from '@/lib/monsterLijst';

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
    return NextResponse.json(await haalMonsterLijst(session, gevraagdJaar, search));
  }
);

// POST - Nieuw monster (alleen admin). Datum, genomen en opmerking gaan via een
// eerste poging (lib/sampleAttempts.ts), niet rechtstreeks op het monster.
export const POST = apiRoute(
  { rol: 'admin', module: 'oliemonsters', fout: 'Fout bij aanmaken van monster' },
  async (request, _context, session) => {
    const invoer = await leesJson(request, MonsterSchema);
    const jaar = invoer.analysisYear ?? 2025;
    // De controles hangen niet van elkaar af: tegelijk.
    const [, , , zelfdeNummer] = await tegelijk([
      controleerObject(invoer.objectId),
      controleerInstallatie(invoer.installatieId, invoer.objectId ?? null),
      controleerKlant(invoer.klantId),
      // O-nummers zijn uniek per analysejaar (2025 en 2026 mogen hetzelfde nummer
      // hebben). Ook een monster in de prullenbak houdt zijn nummer bezet.
      prisma.oilSample.findMany({
        where: { oNumber: invoer.oNumber, analysisYear: jaar },
        select: { id: true, deletedAt: true },
      }),
    ]);

    if (zelfdeNummer.some((m) => m.deletedAt === null)) throw new ApiFout(400, `O-nummer bestaat al in ${jaar}`);
    // Staat dit nummer in de prullenbak, dan is het in de database nog bezet
    // (uniek per jaar). Een nieuw monster zou de oude pogingen en foto's
    // verbergen; terugzetten is dan de bedoeling. De pagina toont een knop.
    const inPrullenbak = zelfdeNummer[0];
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
        // Een monster zonder object kan zo toch bij een klant horen (lib/afscherming.ts).
        ...(invoer.klantId ? { klantId: invoer.klantId } : {}),
      },
      select: { id: true },
    });

    await wijzigLaatstePoging(nieuw.id, {
      isTaken: invoer.isTaken,
      sampleDate: invoer.isTaken ? invoer.sampleDate ?? null : null,
      remarks: invoer.remarks ?? null,
    });

    // In de vorm van de lijst, zodat het scherm hem meteen kan tonen.
    const sample = await haalLijstRij(nieuw.id, session);

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
