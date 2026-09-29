import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { del, list, put } from '@vercel/blob';
import { z } from 'zod';
import { apiRoute, ApiFout, jaarSchema, leesQuery } from '@/lib/apiRoute';
import { magJaar } from '@/lib/afscherming';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalOpdracht } from '@/lib/klantOpdracht';
import { maakRapportPdf, rapportNaam } from '@/lib/rapport/rapportPdf';
import { isAlleenLezen, krijgtKlantportaal } from '@/lib/roles';

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

// Een antwoord van een Vercel-functie mag hooguit 4,5 MB zijn. Een groter
// rapport (een jaar met honderden foto's) gaat eerst naar de opslag onder een
// onvindbare naam, en de browser krijgt een doorverwijzing daarheen. Zo'n
// bestand blijft een uur staan; elke nieuwe download ruimt de oude op.
const MAX_ANTWOORD = 4 * 1024 * 1024;
const RAPPORT_MAP = 'rapporten/';
const BEWAAR_MS = 60 * 60 * 1000;

async function ruimOudeRapportenOp() {
  try {
    const { blobs } = await list({ prefix: RAPPORT_MAP });
    const oud = blobs.filter((b) => Date.now() - new Date(b.uploadedAt).getTime() > BEWAAR_MS).map((b) => b.url);
    if (oud.length) await del(oud);
  } catch (error) {
    console.error('Oude rapporten niet opgeruimd:', error);
  }
}

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

    const naam = rapportNaam(opdracht.klant.naam, jaar);
    if (pdf.length > MAX_ANTWOORD && process.env.BLOB_READ_WRITE_TOKEN) {
      await ruimOudeRapportenOp();
      const blob = await put(`${RAPPORT_MAP}${randomBytes(16).toString('hex')}/${naam}`, pdf, {
        access: 'public',
        addRandomSuffix: true,
        contentType: 'application/pdf',
      });
      // downloadUrl laat de browser het bestand opslaan in plaats van tonen.
      return NextResponse.redirect(blob.downloadUrl, 303);
    }

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${naam}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'private, no-store',
      },
    });
  }
);
