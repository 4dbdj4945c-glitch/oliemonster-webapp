import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord } from '@/lib/prospectApi';
import { leesProspectsCsv } from '@/lib/prospectCsv';

/** Sleutel om dubbelen te herkennen: bedrijfsnaam + plaats, hoofdletterongevoelig. */
function sleutel(bedrijfsnaam: string, plaats: string): string {
  return `${bedrijfsnaam.trim().toLowerCase()}|${plaats.trim().toLowerCase()}`;
}

// POST - Prospects importeren uit een CSV-tekst (alleen admin).
// Body: { csv: "..." }. Dubbelen worden overgeslagen, niets wordt overschreven.
export async function POST(request: NextRequest) {
  try {
    const session = await haalSessie();
    const fout = toegangsFout(session, true);
    if (fout) return fout;

    const body = await request.json().catch(() => ({}));
    const csv = (body as { csv?: string }).csv;

    if (!csv || !csv.trim()) {
      return NextResponse.json({ error: 'Er is geen CSV meegestuurd' }, { status: 400 });
    }

    let gelezen;
    try {
      gelezen = leesProspectsCsv(csv);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }

    const bestaande = await prisma.prospect.findMany({ select: { bedrijfsnaam: true, plaats: true } });
    const gezien = new Set(bestaande.map((p) => sleutel(p.bedrijfsnaam, p.plaats)));

    const overgeslagen: string[] = [];
    const toevoegen: typeof gelezen.prospects = [];

    for (const p of gelezen.prospects) {
      const s = sleutel(p.bedrijfsnaam, p.plaats);
      if (gezien.has(s)) {
        overgeslagen.push(`${p.bedrijfsnaam} (${p.plaats})`);
        continue;
      }
      gezien.add(s);
      toevoegen.push(p);
    }

    let toegevoegd = 0;
    for (const p of toevoegen) {
      await prisma.prospect.create({
        data: {
          bedrijfsnaam: p.bedrijfsnaam,
          segment: p.segment,
          plaats: p.plaats,
          provincie: p.provincie,
          website: p.website,
          telefoon: p.telefoon,
          email: p.email,
          contactpersoon: p.contactpersoon,
          functie: p.functie,
          linkedin: p.linkedin,
          omvang: p.omvang,
          activiteit: p.activiteit,
          aanknopingspunt: p.aanknopingspunt,
          signaal: p.signaal,
          bron: p.bron,
          score: p.score,
          scoreReden: p.scoreReden,
          afstandKm: p.afstandKm,
          status: p.status ?? 'NIEUW',
          kanaal: p.kanaal ?? 'MAIL',
          afgemeldOp: p.afgemeldOp,
          volgendeActie: p.volgendeActie,
          volgendeActieOp: p.volgendeActieOp,
          klantSindsOp: p.status === 'KLANT' ? new Date() : null,
          geschatteWaarde: p.geschatteWaarde,
          notities: p.notities,
        },
      });
      toegevoegd++;
    }

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.IMPORT_PROSPECTS,
      details: {
        toegevoegd,
        overgeslagen: overgeslagen.length,
        regelsMetFout: gelezen.fouten.length,
      },
      request,
    });

    return NextResponse.json({
      toegevoegd,
      overgeslagen: overgeslagen.length,
      overgeslagenNamen: overgeslagen.slice(0, 25),
      fouten: gelezen.fouten,
      onbekendeKolommen: gelezen.onbekendeKolommen,
    });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij importeren van prospects');
  }
}
