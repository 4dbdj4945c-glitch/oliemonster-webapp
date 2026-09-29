import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { fotoLabel, fotoVeld, leesFotoSoort } from '@/lib/samplePhotos';
import { KOLOM_ONTBREEKT_WENSEN2 } from '@/lib/kolommen';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { fotoFout, fotoExtensie } from '@/lib/fotoControle';
import { bewaarFoto, ruimFotoOpAls } from '@/lib/fotoOpslag';
import { wijzigLaatstePoging } from '@/lib/sampleAttempts';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';

/*
  Foto's op het monster zelf. Er zijn er twee: het onderdeel waar het monster
  vandaan komt (soort "onderdeel", kolom partPhotoUrl) en het monsterpotje
  (soort "potje", kolom photoUrl). Wie geen soort meestuurt krijgt de potjesfoto,
  zodat bestaande aanroepen en bestaande foto's blijven kloppen.

  De foto's op het monster zijn een spiegel van de laatste poging. Deze route
  zet de foto dus op die poging (of maakt er een aan) en spiegelt daarna; zo
  verdwijnt een foto niet meer bij de volgende hermonstering. Een vervangen of
  verwijderde foto gaat ook uit de opslag, tenzij iets anders er nog naar wijst.
*/

const OPTIES = { ontbreekt: KOLOM_ONTBREEKT_WENSEN2 };

async function haalMonster(sampleId: number) {
  const sample = await prisma.oilSample.findUnique({
    where: { id: sampleId, ...(await actiefFilter()) },
    select: { id: true, oNumber: true },
  });
  if (!sample) throw new ApiFout(404, 'Monster niet gevonden');
  return sample;
}

export const POST = apiRoute(
  { rol: 'admin', module: 'oliemonsters', fout: 'Fout bij uploaden van foto', ...OPTIES },
  async (request, context, session) => {
    const sampleId = await leesId(context, 'Onbekend monster');

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new ApiFout(500, 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.');
    }

    const formData = await request.formData();
    const file = formData.get('photo');
    if (!(file instanceof File) || file.size === 0) throw new ApiFout(400, 'Geen foto gevonden');
    const fotoMelding = fotoFout(file);
    if (fotoMelding) throw new ApiFout(400, fotoMelding);

    const soort = leesFotoSoort(formData.get('soort'));
    if (!soort) throw new ApiFout(400, 'Onbekende soort foto');

    const sample = await haalMonster(sampleId);

    const filename = `sample-${sampleId}-${soort}-${Date.now()}.${fotoExtensie(file)}`;
    const url = await bewaarFoto(filename, file);

    const veld = fotoVeld(soort);
    const { vorige } = await wijzigLaatstePoging(sampleId, { [veld]: url });
    await ruimFotoOpAls(vorige?.[veld]);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPLOAD_PHOTO,
      details: { sampleId, oNumber: sample.oNumber, soort, filename, vervangen: vorige?.[veld] ?? null },
      request,
    });

    return NextResponse.json({ photoUrl: url, soort });
  }
);

export const DELETE = apiRoute(
  { rol: 'admin', module: 'oliemonsters', fout: 'Fout bij verwijderen van foto', ...OPTIES },
  async (request, context, session) => {
    const sampleId = await leesId(context, 'Onbekend monster');

    // Welke van de twee foto's: ?soort=onderdeel of ?soort=potje (standaard potje).
    const soort = leesFotoSoort(new URL(request.url).searchParams.get('soort'));
    if (!soort) throw new ApiFout(400, 'Onbekende soort foto');

    const sample = await haalMonster(sampleId);

    const veld = fotoVeld(soort);
    const { vorige } = await wijzigLaatstePoging(sampleId, { [veld]: null });
    await ruimFotoOpAls(vorige?.[veld]);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_PHOTO,
      details: { sampleId, oNumber: sample.oNumber, soort, label: fotoLabel(soort), url: vorige?.[veld] ?? null },
      request,
    });

    return NextResponse.json({ success: true, soort });
  }
);
