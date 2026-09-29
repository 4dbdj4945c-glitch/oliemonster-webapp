import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { NIEUWSTE_EERST, syncLatestAttemptToSample } from '@/lib/sampleAttempts';
import { tabelOntbreekt, KOLOM_ONTBREEKT_WENSEN2 } from '@/lib/kolommen';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { fotoFout, fotoExtensie } from '@/lib/fotoControle';
import { bewaarFoto, ruimFotoOpAls } from '@/lib/fotoOpslag';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';

/**
 * POST - Monster nemen in één keer.
 *
 * Achter de knop "Monster nemen" in de lijst. Eerst moest je via hermonstering
 * een afname inplannen voordat je iets kon invullen; dat was te omslachtig. Deze
 * route neemt in één aanroep de datum, het type olie, de opmerking en beide
 * foto's aan, en zet het monster op genomen.
 *
 * Multipart, want er gaan twee bestanden mee:
 *   sampleDate        datum van de afname (verplicht)
 *   oilType, remarks  optioneel
 *   photoOnderdeel    foto van het onderdeel waar het monster vandaan komt
 *   photoPotje        foto van het monsterpotje
 *
 * Staat er nog een openstaande poging (ingeplande hermonstering), dan wordt die
 * gevuld in plaats van dat er een tweede poging bijkomt. Anders komt er een
 * nieuwe poging bij, zodat hermonstering blijft werken zoals het werkte.
 */
export const POST = apiRoute(
  { rol: 'admin', module: 'oliemonsters', fout: 'Fout bij opslaan van het genomen monster', ontbreekt: KOLOM_ONTBREEKT_WENSEN2 },
  async (request, context, session) => {
    const sampleId = await leesId(context, 'Onbekend monster');

    const form = await request.formData();
    const tekst = (naam: string) => {
      const waarde = form.get(naam);
      return typeof waarde === 'string' ? waarde.trim() : '';
    };
    const bestand = (naam: string) => {
      const waarde = form.get(naam);
      return waarde instanceof File && waarde.size > 0 ? waarde : null;
    };

    const datumTekst = tekst('sampleDate');
    if (!datumTekst) throw new ApiFout(400, 'Vul de datum van de afname in');
    const sampleDate = new Date(datumTekst);
    if (Number.isNaN(sampleDate.getTime())) throw new ApiFout(400, 'De datum van de afname klopt niet');

    const oilType = tekst('oilType');
    const remarks = tekst('remarks');
    const fotoOnderdeel = bestand('photoOnderdeel');
    const fotoPotje = bestand('photoPotje');
    for (const foto of [fotoOnderdeel, fotoPotje]) {
      const melding = foto ? fotoFout(foto) : null;
      if (melding) throw new ApiFout(400, melding);
    }

    const sample = await prisma.oilSample.findUnique({
      where: { id: sampleId, ...(await actiefFilter()) },
      select: { id: true, oNumber: true, analysisYear: true, isDisabled: true },
    });
    if (!sample) throw new ApiFout(404, 'Monster niet gevonden');
    if (sample.isDisabled) throw new ApiFout(400, 'Dit monster is geannuleerd. Draai de annulering eerst terug.');

    if ((fotoOnderdeel || fotoPotje) && !process.env.BLOB_READ_WRITE_TOKEN) {
      throw new ApiFout(500, 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.');
    }

    const uploaden = async (file: File | null, soort: string): Promise<string | null> => {
      if (!file) return null;
      return bewaarFoto(`sample-${sampleId}-${soort}-${Date.now()}.${fotoExtensie(file)}`, file);
    };

    const partPhotoUrl = await uploaden(fotoOnderdeel, 'onderdeel');
    const photoUrl = await uploaden(fotoPotje, 'potje');

    // Een nog openstaande poging vullen we in; anders komt er een poging bij.
    const laatste = await prisma.sampleAttempt.findFirst({
      where: { oilSampleId: sampleId },
      orderBy: NIEUWSTE_EERST,
      select: { id: true, isTaken: true, photoUrl: true, partPhotoUrl: true },
    });

    const pogingData = {
      sampleDate,
      isTaken: true,
      remarks: remarks || null,
      ...(photoUrl ? { photoUrl } : {}),
      ...(partPhotoUrl ? { partPhotoUrl } : {}),
    };

    let attemptId: number;
    let nieuwePoging = false;
    if (laatste && !laatste.isTaken) {
      const bijgewerkt = await prisma.sampleAttempt.update({
        where: { id: laatste.id },
        data: pogingData,
        select: { id: true },
      });
      attemptId = bijgewerkt.id;
    } else {
      const gemaakt = await prisma.sampleAttempt.create({
        data: { oilSampleId: sampleId, ...pogingData },
        select: { id: true },
      });
      attemptId = gemaakt.id;
      nieuwePoging = true;
    }

    // Spiegelt datum, foto's, opmerking en status naar het monster.
    await syncLatestAttemptToSample(sampleId);

    // Een openstaande poging die een nieuwe foto kreeg: de oude foto opruimen.
    if (!nieuwePoging && laatste) {
      await ruimFotoOpAls(photoUrl ? laatste.photoUrl : null, partPhotoUrl ? laatste.partPhotoUrl : null);
    }

    // Type olie staat op het monster zelf, niet op de poging. En een genomen
    // monster is niet meer onbereikbaar.
    const monsterData = {
      ...(oilType ? { oilType } : {}),
      isUnreachable: false,
      unreachableReason: null,
      unreachableNote: null,
      unreachablePhotoUrl: null,
      unreachableAt: null,
      unreachableBy: null,
    };
    try {
      await prisma.oilSample.update({
        where: { id: sampleId },
        data: monsterData,
        select: { id: true },
      });
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      if (oilType) {
        await prisma.oilSample.update({
          where: { id: sampleId },
          data: { oilType },
          select: { id: true },
        });
      }
    }

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.TAKE_SAMPLE,
      details: {
        id: sampleId,
        oNumber: sample.oNumber,
        analysisYear: sample.analysisYear,
        datum: sampleDate,
        attemptId,
        nieuwePoging,
        fotoOnderdeel: partPhotoUrl !== null,
        fotoPotje: photoUrl !== null,
      },
      request,
    });

    return NextResponse.json({ id: sampleId, attemptId, isTaken: true, sampleDate });
  }
);
