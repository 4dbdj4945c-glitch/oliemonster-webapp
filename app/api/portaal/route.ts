import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiRoute, ApiFout, jaarSchema, leesQuery } from '@/lib/apiRoute';
import { magJaar } from '@/lib/afscherming';
import { fotoAdres, klantLogoAdres } from '@/lib/fotoAdres';
import { haalOpdracht, jarenVanKlant } from '@/lib/klantOpdracht';
import { teNemen } from '@/lib/klantStatus';
import { isAlleenLezen, krijgtKlantportaal } from '@/lib/roles';
import { inspectiesVanKlant, inspectieInLijst } from '@/lib/inspecties/server';
import { sjabloonVan } from '@/lib/inspecties/sjablonen';

/*
  GET /api/portaal?jaar=2026 - het klantportaal van een kijker: voortgang, stand
  per object, komende monsterdagen (zonder tijden of route), recente foto's,
  de rapporten per jaar en de afgeronde inspecties van de klant (met de
  volgende inspectiedatum en het rapport). Alleen lezen.

  - Een kijker krijgt altijd zijn eigen klant; een klantId in de URL doet niets.
    Zonder klant is er geen klantportaal (403). Met een kijkjaar alleen dat jaar.
  - Admin en gebruiker kunnen met ?klantId= het portaal van een klant bekijken
    zoals de klant het ziet (knop Klantportaal bekijken in het klantdossier).
*/

const Query = z.object({
  jaar: z.string().optional(),
  klantId: z.coerce.number().int().positive().optional(),
});

export const GET = apiRoute(
  { rol: 'alleen_lezen', module: 'oliemonsters', fout: 'Fout bij ophalen van het klantportaal' },
  async (request, _context, sessie) => {
    const query = leesQuery(request, Query);
    const kijker = isAlleenLezen(sessie.role);
    // Een klassieke kijker heeft geen klantportaal (zoals op main).
    if (kijker && !krijgtKlantportaal(sessie)) throw new ApiFout(403, 'Geen klantportaal voor deze gebruiker');
    const klantId = kijker ? sessie.klantId : query.klantId ?? null;
    if (!klantId) throw new ApiFout(kijker ? 403 : 400, kijker ? 'Geen klantportaal voor deze gebruiker' : 'Kies een klant');

    const jaren = await jarenVanKlant(klantId, sessie.viewYear);
    const gevraagd = query.jaar ? jaarSchema.parse(query.jaar) : null;
    const jaar = gevraagd ?? sessie.viewYear ?? jaren[0]?.jaar ?? new Date().getFullYear();
    if (!magJaar(sessie, jaar)) throw new ApiFout(404, 'Dit jaar is er niet');

    const opdracht = await haalOpdracht(klantId, jaar);
    if (!opdracht) throw new ApiFout(404, 'Klant niet gevonden');

    const recenteFotos = opdracht.monsters
      .filter((m) => m.status === 'genomen' && (m.photoUrl || m.partPhotoUrl))
      .sort((a, b) => (b.datum?.getTime() ?? 0) - (a.datum?.getTime() ?? 0))
      .slice(0, 6)
      .map((m) => ({
        id: m.id,
        oNumber: m.oNumber,
        plek: m.installatieNaam ?? m.objectNaam ?? m.location,
        datum: m.datum,
        // Liefst het potje; anders het onderdeel.
        foto: m.photoUrl ? fotoAdres('monster', m.id, 'potje', m.photoUrl) : fotoAdres('monster', m.id, 'onderdeel', m.partPhotoUrl),
      }));

    // Afgeronde inspecties van deze klant, met dezelfde afscherming als het
    // inspectierapport (lib/inspecties/server.ts). Geen concepten, geen interne
    // gegevens (wie afrondde, rekeninstellingen, foto's).
    const inspecties = (await inspectiesVanKlant(sessie, klantId, true)).map((rij) => {
      const i = inspectieInLijst(rij);
      return {
        id: i.id,
        nummer: i.nummer,
        naam: sjabloonVan(i.sjabloon).naam,
        sjabloon: i.sjabloon,
        datum: i.datum,
        object: i.object.name,
        uitkomst: i.uitkomst,
        volgende: i.volgende,
        rapport: `/api/inspecties/${i.id}/rapport`,
      };
    });

    return NextResponse.json({
      inspecties,
      klant: { id: opdracht.klant.id, naam: opdracht.klant.naam, logo: klantLogoAdres(opdracht.klant) },
      jaar,
      jaren,
      telling: opdracht.telling,
      teNemen: teNemen(opdracht.telling),
      bijgewerktOp: opdracht.bijgewerktOp,
      objecten: opdracht.objecten.map((o) => ({
        ...o,
        laatsteFoto: o.laatsteFotoMonster
          ? o.laatsteFotoMonster.photoUrl
            ? fotoAdres('monster', o.laatsteFotoMonster.id, 'potje', o.laatsteFotoMonster.photoUrl)
            : fotoAdres('monster', o.laatsteFotoMonster.id, 'onderdeel', o.laatsteFotoMonster.partPhotoUrl)
          : null,
        laatsteFotoMonster: undefined,
      })),
      planning: opdracht.planning,
      recenteFotos,
      monsters: opdracht.monsters.map((m) => ({
        id: m.id,
        oNumber: m.oNumber,
        description: m.description,
        objectId: m.objectId,
        installatieNaam: m.installatieNaam,
        status: m.status,
        datum: m.datum,
        reden: m.reden,
      })),
    });
  }
);
