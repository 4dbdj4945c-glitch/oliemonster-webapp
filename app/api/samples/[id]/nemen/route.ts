import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { NIEUWSTE_EERST, syncLatestAttemptToSample } from '@/lib/sampleAttempts';
import { KOLOM_ONTBREEKT_WENSEN2 } from '@/lib/kolommen';
import { alsLijstRij, haalLijstRij } from '@/lib/monsterLijst';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { fotoFout, fotoExtensie } from '@/lib/fotoControle';
import { bewaarFoto, ruimFotoOpAls } from '@/lib/fotoOpslag';
import { apiRoute, ApiFout, leesId, tegelijk } from '@/lib/apiRoute';
import { eenmalig } from '@/lib/idempotentie';

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
 *
 * Met de header Idempotentie-Sleutel (de offline wachtrij, lib/wachtrij.ts)
 * wordt dezelfde invoer maar één keer verwerkt (lib/idempotentie.ts).
 */
export const POST = apiRoute(
  { rol: 'admin', module: 'oliemonsters', fout: 'Fout bij opslaan van het genomen monster', ontbreekt: KOLOM_ONTBREEKT_WENSEN2 },
  async (request, context, session) => {
    const sampleId = await leesId(context, 'Onbekend monster');
    return eenmalig(request, session, `nemen-${sampleId}`, async () => {

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
        select: { id: true, oNumber: true, analysisYear: true, isDisabled: true, unreachablePhotoUrl: true },
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

    // De twee foto's en het opzoeken van de laatste poging tegelijk. Een nog
    // openstaande poging vullen we in; anders komt er een poging bij.
    const [partPhotoUrl, photoUrl, laatste] = await tegelijk([
      uploaden(fotoOnderdeel, 'onderdeel'),
      uploaden(fotoPotje, 'potje'),
      prisma.sampleAttempt.findFirst({
        where: { oilSampleId: sampleId },
        orderBy: NIEUWSTE_EERST,
        select: { id: true, isTaken: true, photoUrl: true, partPhotoUrl: true },
      }),
    ]);

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

    // Type olie staat op het monster zelf, niet op de poging. En een genomen
    // monster is niet meer onbereikbaar. De bewijsfoto van Niet bereikbaar
    // blijft in de opslag staan, met het adres in het logboek (zelfde regel als
    // bij Weer bereikbaar en Afname ongedaan): het is bewijs, geen wees.
    const oudeBewijsfoto = sample.unreachablePhotoUrl;
    // Spiegelt datum, foto's, opmerking en status naar het monster, in dezelfde
    // update als het type olie en het wissen van Niet bereikbaar.
    const rij = await syncLatestAttemptToSample(sampleId, {
      ...(oilType ? { oilType } : {}),
      isUnreachable: false,
      unreachableReason: null,
      unreachableNote: null,
      unreachablePhotoUrl: null,
      unreachableAt: null,
      unreachableBy: null,
    }, true);

    // Een openstaande poging die een nieuwe foto kreeg: de oude foto opruimen.
    if (!nieuwePoging && laatste) {
      await ruimFotoOpAls(photoUrl ? laatste.photoUrl : null, partPhotoUrl ? laatste.partPhotoUrl : null);
    }

    // Het monster zoals de lijst het toont, zodat het scherm alleen die regel vervangt.
    const monster = rij ? alsLijstRij(rij, session) : await haalLijstRij(sampleId, session);

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
        ...(oudeBewijsfoto ? { bewijsfotoNietBereikbaar: oudeBewijsfoto } : {}),
      },
      request,
    });

    return NextResponse.json({ id: sampleId, attemptId, isTaken: true, sampleDate, monster });
    });
  }
);
