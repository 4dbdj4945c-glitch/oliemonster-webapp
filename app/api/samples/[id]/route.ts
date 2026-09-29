import { NextResponse } from 'next/server';
import { metMonsterFotos } from '@/lib/fotoAdres';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { SAMPLE_BASIS_SELECT } from '@/lib/planningApi';
import { tabelOntbreekt } from '@/lib/kolommen';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { controleerInstallatie, controleerObject, MonsterSchema } from '@/lib/monsterInvoer';
import { wijzigLaatstePoging, type PogingVelden } from '@/lib/sampleAttempts';
import { actiefFilter, verwijderKolomBestaat, KOLOM_ONTBREEKT_VERWIJDEREN } from '@/lib/verwijderdeMonsters';

const zelfdeDag = (a: Date | null, b: Date | null) =>
  (a === null && b === null) || (!!a && !!b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10));

// PUT - Monster bijwerken (alleen admin)
//
// De velden van het monster zelf (o-nummer, locatie, omschrijving, type olie,
// object, installatie) staan op OilSample. Datum, genomen en opmerking komen uit
// de laatste poging; die schrijven we dus via de poging (wijzigLaatstePoging),
// anders wist de eerstvolgende hermonstering ze weer. Alleen wat echt veranderd
// is gaat naar de poging, zodat Bijwerken nooit een wijziging uit het
// pogingenpaneel terugdraait.
export const PUT = apiRoute(
  { rol: 'admin', module: 'oliemonsters', fout: 'Fout bij bijwerken van monster' },
  async (request, context, session) => {
    const id = await leesId(context, 'Onbekend monster');
    const invoer = await leesJson(request, MonsterSchema);

    const huidig = await prisma.oilSample.findFirst({
      where: { id, ...(await actiefFilter()) },
      select: { analysisYear: true, objectId: true, sampleDate: true, isTaken: true, remarks: true },
    });
    if (!huidig) throw new ApiFout(404, 'Monster niet gevonden');

    // Ook een monster in de prullenbak houdt zijn nummer bezet (uniek per jaar),
    // dus die tellen hier mee, met een eigen melding.
    const existing = await prisma.oilSample.findFirst({
      where: { oNumber: invoer.oNumber, analysisYear: huidig.analysisYear, id: { not: id } },
      select: { id: true },
    });
    if (existing) {
      const actief = await prisma.oilSample.findFirst({
        where: { id: existing.id, ...(await actiefFilter()) },
        select: { id: true },
      });
      throw new ApiFout(
        400,
        actief
          ? 'O-nummer bestaat al'
          : `O-nummer ${invoer.oNumber} staat in de prullenbak. Zet dat monster terug of kies een ander nummer.`
      );
    }

    const objectId = invoer.objectId === undefined ? huidig.objectId : invoer.objectId;
    await controleerObject(invoer.objectId);
    await controleerInstallatie(invoer.installatieId, objectId);

    const gegevens = {
      oNumber: invoer.oNumber,
      location: invoer.location,
      description: invoer.description,
      oilType: invoer.oilType ?? null,
      // Alleen meesturen als de pagina een object koos, zie de POST-route.
      ...(invoer.objectId === undefined ? {} : { objectId: invoer.objectId }),
      // Een ander object: een installatie van het oude object past niet meer.
      ...(invoer.installatieId !== undefined
        ? { installatieId: invoer.installatieId }
        : invoer.objectId !== undefined && invoer.objectId !== huidig.objectId
        ? { installatieId: null }
        : {}),
    };

    // Zet je hier op genomen, dan is het monster niet meer onbereikbaar. Zelfde
    // regel als in de statusroute, zodat een monster nooit twee statussen heeft.
    try {
      await prisma.oilSample.update({
        where: { id },
        data: {
          ...gegevens,
          ...(invoer.isTaken
            ? {
                isUnreachable: false,
                unreachableReason: null,
                unreachableNote: null,
                unreachablePhotoUrl: null,
                unreachableAt: null,
                unreachableBy: null,
              }
            : {}),
        },
        select: { id: true },
      });
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      await prisma.oilSample.update({ where: { id }, data: gegevens, select: { id: true } });
    }

    // Wat uit de laatste poging komt: alleen wat veranderd is. Bij niet genomen
    // blijft de datum van de poging staan (zoals bij de statusknop); de lijst
    // toont hem dan toch niet.
    const naarPoging: PogingVelden = {};
    if (invoer.isTaken !== huidig.isTaken) naarPoging.isTaken = invoer.isTaken;
    if (invoer.isTaken && !zelfdeDag(invoer.sampleDate ?? null, huidig.sampleDate)) {
      naarPoging.sampleDate = invoer.sampleDate ?? null;
    }
    if ((invoer.remarks ?? null) !== (huidig.remarks ?? null)) naarPoging.remarks = invoer.remarks ?? null;
    if (Object.keys(naarPoging).length > 0) await wijzigLaatstePoging(id, naarPoging);

    const sample = metMonsterFotos(await prisma.oilSample.findUniqueOrThrow({ where: { id }, select: SAMPLE_BASIS_SELECT }));

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_SAMPLE,
      details: { id, oNumber: invoer.oNumber, location: invoer.location, isTaken: invoer.isTaken },
      request,
    });

    return NextResponse.json(sample);
  }
);

const VerwijderSchema = z.object({ bevestigONummer: z.string().optional() });

// DELETE - Monster naar de prullenbak (alleen admin)
//
// Zacht verwijderen: het monster krijgt deletedAt en deletedBy en blijft met
// pogingen, datums en foto's staan. Een admin zet het terug via de prullenbak.
// Staat de kolom nog niet in de database, dan weigeren we: terugvallen op een
// harde delete is precies wat misging.
export const DELETE = apiRoute(
  { rol: 'admin', module: 'oliemonsters', fout: 'Fout bij verwijderen van monster' },
  async (request, context, session) => {
    const sampleId = await leesId(context, 'Onbekend monster');

    if (!(await verwijderKolomBestaat())) {
      throw new ApiFout(503, KOLOM_ONTBREEKT_VERWIJDEREN, { tabelOntbreekt: true });
    }

    const sample = await prisma.oilSample.findFirst({
      where: { id: sampleId, deletedAt: null },
      select: { oNumber: true, location: true, analysisYear: true, _count: { select: { attempts: true } } },
    });
    if (!sample) throw new ApiFout(404, 'Monster niet gevonden of al verwijderd');

    // Het O-nummer moet ter bevestiging meekomen, zodat een losse aanroep of
    // een verkeerde rij nooit per ongeluk een monster weghaalt.
    const body = await leesJson(request, VerwijderSchema).catch(() => ({ bevestigONummer: undefined }));
    const bevestiging = (body.bevestigONummer ?? '').trim();
    if (bevestiging.toLowerCase() !== sample.oNumber.trim().toLowerCase()) {
      throw new ApiFout(400, `Typ het O-nummer ${sample.oNumber} over om het verwijderen te bevestigen.`);
    }

    await prisma.oilSample.update({
      where: { id: sampleId },
      data: { deletedAt: new Date(), deletedBy: session.username || 'onbekend' },
      select: { id: true },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_SAMPLE,
      details: {
        id: sampleId,
        oNumber: sample.oNumber,
        location: sample.location,
        analysisYear: sample.analysisYear,
        pogingen: sample._count.attempts,
        zacht: true,
      },
      request,
    });

    return NextResponse.json({ success: true, id: sampleId, oNumber: sample.oNumber });
  }
);
