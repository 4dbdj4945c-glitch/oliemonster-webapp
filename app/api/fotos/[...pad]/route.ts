import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiRoute, ApiFout } from '@/lib/apiRoute';
import { magKlant, monsterFilter } from '@/lib/afscherming';
import { haalFoto, isLokaalPad } from '@/lib/fotoLaden';
import { MONSTER_FOTO_VELDEN, POGING_FOTO_VELDEN, type MonsterFotoVeld, type PogingFotoVeld } from '@/lib/fotoAdres';
import { isAlleenLezen } from '@/lib/roles';

/*
  Alle foto's van de portal komen via deze route (adressen: lib/fotoAdres.ts).
  Eerst de toegang: een kijker krijgt alleen een foto van een monster, poging,
  installatie of klantlogo van zijn eigen klant en jaar (lib/afscherming.ts).
  Hoort het bij een andere klant, dan een 404, alsof de foto niet bestaat.
  Daarna haalt de server de foto zelf op en stuurt hem door, zodat het echte
  opslagadres nooit bij de browser komt.

  Oude adressen die niet in onze opslag staan (bijvoorbeeld een ander domein)
  haalt de server niet op; daarvoor volgt, na dezelfde controle, een
  doorverwijzing.
*/

const Pad = z.union([
  z.tuple([z.literal('monster'), z.string().regex(/^\d+$/), z.enum(['potje', 'onderdeel', 'onbereikbaar'])]),
  z.tuple([z.literal('poging'), z.string().regex(/^\d+$/), z.enum(['potje', 'onderdeel'])]),
  z.tuple([z.literal('installatie'), z.string().regex(/^\d+$/)]),
  z.tuple([z.literal('klantlogo'), z.string().regex(/^\d+$/)]),
]);

const NIET_GEVONDEN = 'Foto niet gevonden';

export const GET = apiRoute(
  { rol: 'alleen_lezen', module: 'oliemonsters', fout: 'Fout bij ophalen van de foto' },
  async (request, context, sessie) => {
    const params = await (context as { params: Promise<{ pad?: string[] }> }).params;
    const gelezen = Pad.safeParse(params?.pad ?? []);
    if (!gelezen.success) throw new ApiFout(404, NIET_GEVONDEN);
    const [bron, idTekst, veld] = gelezen.data;
    const id = Number(idTekst);
    if (!Number.isSafeInteger(id)) throw new ApiFout(404, NIET_GEVONDEN);

    let url: string | null | undefined = null;
    if (bron === 'monster') {
      const kolom = MONSTER_FOTO_VELDEN[veld as MonsterFotoVeld];
      const monster = await prisma.oilSample.findFirst({
        where: { id, ...(await monsterFilter(sessie)) },
        select: { photoUrl: true, partPhotoUrl: true, unreachablePhotoUrl: true },
      });
      url = monster?.[kolom];
    } else if (bron === 'poging') {
      const kolom = POGING_FOTO_VELDEN[veld as PogingFotoVeld];
      const poging = await prisma.sampleAttempt.findFirst({
        where: { id, oilSample: await monsterFilter(sessie) },
        select: { photoUrl: true, partPhotoUrl: true },
      });
      url = poging?.[kolom];
    } else if (bron === 'installatie') {
      const installatie = await prisma.installatie.findFirst({
        where: { id, deletedAt: null },
        select: { fotoUrl: true, object: { select: { klantId: true } } },
      });
      // Een kijker zonder klant heeft geen installaties; met een klant alleen die van hem.
      const mag = installatie && (!isAlleenLezen(sessie.role) || (sessie.klantId && magKlant(sessie, installatie.object.klantId)));
      url = mag ? installatie.fotoUrl : null;
    } else {
      const klant = await prisma.klant.findFirst({ where: { id, deletedAt: null }, select: { id: true, logoUrl: true } });
      const mag = klant && (!isAlleenLezen(sessie.role) || (sessie.klantId && magKlant(sessie, klant.id)));
      url = mag ? klant.logoUrl : null;
    }
    if (!url) throw new ApiFout(404, NIET_GEVONDEN);

    const foto = await haalFoto(url, new URL(request.url).origin);
    if (!foto) {
      // Niet in onze opslag en niet in public/: de browser haalt hem zelf.
      if (!isLokaalPad(url) && /^https?:\/\//.test(url)) return NextResponse.redirect(url, 302);
      throw new ApiFout(404, NIET_GEVONDEN);
    }
    const metVersie = new URL(request.url).searchParams.has('v');
    return new NextResponse(new Uint8Array(foto.bytes), {
      headers: {
        'Content-Type': foto.type,
        'Content-Length': String(foto.bytes.length),
        // Alleen in de eigen browser bewaren, nooit in een gedeelde cache.
        'Cache-Control': metVersie ? 'private, max-age=31536000, immutable' : 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
);
