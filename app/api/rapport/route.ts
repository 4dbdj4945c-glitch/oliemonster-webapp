import { z } from 'zod';
import { apiRoute, ApiFout, jaarSchema, leesQuery } from '@/lib/apiRoute';
import { magJaar } from '@/lib/afscherming';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalOpdracht } from '@/lib/klantOpdracht';
import { maakRapportPdf, rapportNaam } from '@/lib/rapport/rapportPdf';
import { isAlleenLezen, krijgtKlantportaal } from '@/lib/roles';
import { pdfAntwoord } from '@/lib/pdfAntwoord';

/*
  GET /api/rapport?jaar=2026[&klantId=3][&fotos=0] - het rapport van een
  oliemonsteropdracht als PDF, op de server gemaakt (lib/rapport/rapportPdf.ts).

  - Admin en gebruiker: elke klant, met ?klantId=.
  - Kijker met de weergave klantportaal: alleen zijn eigen klant (klantId in de URL moet die klant zijn of
    wegblijven; een andere klant geeft 404) en alleen zijn kijkjaar. Een kijker
    zonder klant of met de klassieke weergave krijgt geen rapport (403): dat
    hoort bij het klantportaal.
*/

// Foto's ophalen en verkleinen kan even duren bij een groot jaar.
export const maxDuration = 60;

// Groter dan 4,5 MB: via de opslag (lib/pdfAntwoord.ts).

const Query = z.object({
  jaar: z.string({ error: 'Kies een jaar' }),
  klantId: z.coerce.number().int().positive().optional(),
  fotos: z.enum(['0', '1']).optional(),
});

export const GET = apiRoute(
  { rol: 'alleen_lezen', module: 'oliemonsters', fout: 'Het rapport kon niet worden gemaakt' },
  async (request, _context, sessie) => {
    const query = leesQuery(request, Query);
    const jaar = jaarSchema.parse(query.jaar);
    const kijker = isAlleenLezen(sessie.role);

    let klantId: number;
    if (kijker) {
      // Alleen met de weergave klantportaal; een klassieke kijker maakt geen PDF (zoals op main).
      if (!sessie.klantId || !krijgtKlantportaal(sessie)) throw new ApiFout(403, 'Geen rapport voor deze gebruiker');
      if (query.klantId && query.klantId !== sessie.klantId) throw new ApiFout(404, 'Klant niet gevonden');
      klantId = sessie.klantId;
    } else {
      if (!query.klantId) throw new ApiFout(400, 'Kies een klant');
      klantId = query.klantId;
    }
    if (!magJaar(sessie, jaar)) throw new ApiFout(404, 'Dit jaar is er niet');

    const opdracht = await haalOpdracht(klantId, jaar);
    if (!opdracht) throw new ApiFout(404, 'Klant niet gevonden');

    const pdf = await maakRapportPdf(opdracht, {
      origin: new URL(request.url).origin,
      metFotos: query.fotos !== '0',
    });

    await createAuditLog({
      userId: sessie.userId,
      username: sessie.username,
      action: AuditActions.RAPPORT_DOWNLOAD,
      details: { klantId, klant: opdracht.klant.naam, jaar, monsters: opdracht.monsters.length },
      request,
    });

    return pdfAntwoord(pdf, rapportNaam(opdracht.klant.naam, jaar));
  }
);
