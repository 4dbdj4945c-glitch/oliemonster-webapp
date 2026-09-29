import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout } from '@/lib/toegang';
import { syncLatestAttemptToSample } from '@/lib/sampleAttempts';
import { tabelOntbreekt, foutAntwoordWensen2 } from '@/lib/kolommen';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { fotoFout, fotoExtensie } from '@/lib/fotoControle';

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
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id } = await params;
    const sampleId = parseInt(id);
    if (Number.isNaN(sampleId)) {
      return NextResponse.json({ error: 'Onbekend monster' }, { status: 400 });
    }

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
    if (!datumTekst) {
      return NextResponse.json({ error: 'Vul de datum van de afname in' }, { status: 400 });
    }
    const sampleDate = new Date(datumTekst);
    if (Number.isNaN(sampleDate.getTime())) {
      return NextResponse.json({ error: 'De datum van de afname klopt niet' }, { status: 400 });
    }

    const oilType = tekst('oilType');
    const remarks = tekst('remarks');
    const fotoOnderdeel = bestand('photoOnderdeel');
    const fotoPotje = bestand('photoPotje');
    for (const foto of [fotoOnderdeel, fotoPotje]) {
      const melding = foto ? fotoFout(foto) : null;
      if (melding) return NextResponse.json({ error: melding }, { status: 400 });
    }

    const sample = await prisma.oilSample.findUnique({
      where: { id: sampleId, ...(await actiefFilter()) },
      select: { id: true, oNumber: true, analysisYear: true, isDisabled: true },
    });
    if (!sample) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
    }
    if (sample.isDisabled) {
      return NextResponse.json(
        { error: 'Dit monster is geannuleerd. Draai de annulering eerst terug.' },
        { status: 400 }
      );
    }

    if ((fotoOnderdeel || fotoPotje) && !process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.' },
        { status: 500 }
      );
    }

    const uploaden = async (file: File | null, soort: string): Promise<string | null> => {
      if (!file) return null;
      const filename = `sample-${sampleId}-${soort}-${Date.now()}.${fotoExtensie(file)}`;
      const blob = await put(filename, file, { access: 'public' });
      return blob.url;
    };

    const partPhotoUrl = await uploaden(fotoOnderdeel, 'onderdeel');
    const photoUrl = await uploaden(fotoPotje, 'potje');

    // Een nog openstaande poging vullen we in; anders komt er een poging bij.
    const laatste = await prisma.sampleAttempt.findFirst({
      where: { oilSampleId: sampleId },
      orderBy: [{ sampleDate: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, isTaken: true },
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
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij opslaan van het genomen monster');
  }
}
