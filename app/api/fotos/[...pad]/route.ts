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
  installatie of klantlogo van zijn eigen klant en jaar (lib/afscherming.ts),
  en nooit een foto van een inspectie (die ziet hij alleen in het rapport).
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
  z.tuple([z.literal('inspectie'), z.string().regex(/^\d+$/)]),
  z.tuple([z.literal('inspectiefoto'), z.string().regex(/^\d+$/)]),
  z.tuple([z.literal('dagrapport'), z.string().regex(/^\d+$/)]),
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
    } else if (bron === 'inspectie' || bron === 'inspectiefoto') {
      // Foto bij een bevinding: alleen voor beheerder en gebruiker. Een kijker
      // krijgt de inspectie als rapport (PDF, op de server gemaakt) en heeft
      // deze route dus niet nodig; ook met het klantportaal niet.
      // inspectiefoto/[id] is één foto; het oude adres inspectie/[id] (id van de
      // bevinding, van voor meerdere foto's) geeft de eerste foto.
      if (!isAlleenLezen(sessie.role)) {
        if (bron === 'inspectiefoto') {
          const foto = await prisma.inspectieFoto.findFirst({
            where: { id, item: { deletedAt: null, inspectie: { deletedAt: null } } },
            select: { url: true },
          });
          url = foto?.url;
        } else {
          const item = await prisma.inspectieItem.findFirst({
            where: { id, deletedAt: null, inspectie: { deletedAt: null } },
            select: { fotoUrl: true, fotos: { orderBy: [{ volgorde: 'asc' }, { id: 'asc' }], take: 1, select: { url: true } } },
          });
          url = item?.fotos[0]?.url ?? item?.fotoUrl;
        }
      }
    } else if (bron === 'dagrapport') {
      // Foto bij een dagrapport: net als bij een inspectie alleen voor beheerder
      // en gebruiker. De klant krijgt de foto's in de PDF van het dagrapport.
      if (!isAlleenLezen(sessie.role)) {
        const foto = await prisma.dagrapportFoto.findFirst({
          where: { id, dagrapport: { deletedAt: null } },
          select: { url: true },
        });
        url = foto?.url;
      }
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
