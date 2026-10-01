import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson, tegelijk } from '@/lib/apiRoute';
import { alsLijstRij, haalLijstRij, LIJST_SELECT } from '@/lib/monsterLijst';
import { controleerInstallatie, controleerObject, MonsterSchema, bewaarKlantBijLoskoppelen } from '@/lib/monsterInvoer';
import { LAATSTE_POGING_SELECT, NIEUWSTE_EERST, wijzigLaatstePoging, type PogingVelden } from '@/lib/sampleAttempts';
import { verwijderKolomBestaat, KOLOM_ONTBREEKT_VERWIJDEREN } from '@/lib/verwijderdeMonsters';

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

    // In één query: dit monster en alle monsters met hetzelfde o-nummer (het jaar
    // filteren we hieronder, dat weten we pas als we het monster hebben). Ook
    // een monster in de prullenbak houdt zijn nummer bezet (uniek per jaar).
    // De objectcontrole loopt alvast mee; zijn fout telt pas na de controles
    // hieronder, net als toen alles na elkaar ging.
    const objectControle = controleerObject(invoer.objectId);
    objectControle.catch(() => {});
    const rijen = await prisma.oilSample.findMany({
      where: { OR: [{ id }, { oNumber: invoer.oNumber }] },
      select: {
        id: true,
        analysisYear: true,
        objectId: true,
        sampleDate: true,
        isTaken: true,
        remarks: true,
        deletedAt: true,
        // De laatste poging (alleen van dit monster gebruikt), voor wijzigLaatstePoging.
        attempts: { orderBy: NIEUWSTE_EERST, take: 1, select: LAATSTE_POGING_SELECT },
      },
    });
    const huidig = rijen.find((r) => r.id === id && r.deletedAt === null);
    if (!huidig) throw new ApiFout(404, 'Monster niet gevonden');

    const existing = rijen.find((r) => r.id !== id && r.analysisYear === huidig.analysisYear);
    if (existing) {
      throw new ApiFout(
        400,
        existing.deletedAt === null
          ? 'O-nummer bestaat al'
          : `O-nummer ${invoer.oNumber} staat in de prullenbak. Zet dat monster terug of kies een ander nummer.`
      );
    }

    await objectControle;
    const objectId = invoer.objectId === undefined ? huidig.objectId : invoer.objectId;
    await tegelijk([
      // Het object gaat eraf: de klant van dat object blijft op het monster staan.
      invoer.objectId === null && huidig.objectId !== null ? bewaarKlantBijLoskoppelen({ id }) : Promise.resolve(),
      controleerInstallatie(invoer.installatieId, objectId),
    ]);

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
      // Zet je hier op genomen, dan is het monster niet meer onbereikbaar. Zelfde
      // regel als in de statusroute, zodat een monster nooit twee statussen heeft.
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
    };

    // Wat uit de laatste poging komt: alleen wat veranderd is. Bij niet genomen
    // blijft de datum van de poging staan (zoals bij de statusknop); de lijst
    // toont hem dan toch niet.
    const naarPoging: PogingVelden = {};
    if (invoer.isTaken !== huidig.isTaken) naarPoging.isTaken = invoer.isTaken;
    if (invoer.isTaken && !zelfdeDag(invoer.sampleDate ?? null, huidig.sampleDate)) {
      naarPoging.sampleDate = invoer.sampleDate ?? null;
    }
    if ((invoer.remarks ?? null) !== (huidig.remarks ?? null)) naarPoging.remarks = invoer.remarks ?? null;
    // De velden van het monster gaan mee in de update die de poging spiegelt;
    // die update geeft het monster meteen in de vorm van de lijst terug, zodat
    // het scherm alleen deze regel hoeft te vervangen.
    const rij =
      Object.keys(naarPoging).length > 0
        ? (await wijzigLaatstePoging(id, naarPoging, gegevens, { laatste: huidig.attempts[0] ?? null, lijstRij: true })).monster
        : await prisma.oilSample.update({ where: { id }, data: gegevens, select: LIJST_SELECT });
    const sample = rij ? alsLijstRij(rij, session) : await haalLijstRij(id, session);

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
