// Een PDF als antwoord van een API-route, ook als hij groter is dan wat Vercel
// toestaat. Een antwoord van een Vercel-functie mag hooguit 4,5 MB zijn. Een
// grotere PDF (een jaar met honderden foto's, een inhuurdossier met gescande
// documenten, een lekkenronde met veel foto's) gaat eerst naar de opslag onder
// een onvindbare naam, en de browser krijgt een doorverwijzing daarheen. Zo'n
// bestand blijft een uur staan; elke volgende grote download ruimt de oude op.
// Zonder opslag (lokaal) gaat hij gewoon mee.
//
// Gebruikt door /api/rapport, /api/inspecties/[id]/rapport,
// /api/dagrapporten/[id]/pdf en /api/eigen-dossier/inhuurdossier.

import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { del, list, put } from '@vercel/blob';

export const MAX_ANTWOORD = 4 * 1024 * 1024;
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

export async function pdfAntwoord(pdf: Buffer, naam: string): Promise<Response> {
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
