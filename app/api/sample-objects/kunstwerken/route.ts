import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { foutAntwoord } from '@/lib/planningApi';
import { KUNSTWERKEN } from '@/lib/sampleObjects';

/**
 * POST - Maakt de vaste kunstwerkenlijst uit de Mourik-offerte aan: sluizen,
 * stuwen en bruggen, elk als eigen object. Een sluis en een stuw op dezelfde
 * plaats zijn twee objecten, want een object is het kunstwerk zelf en niet de
 * plaats.
 *
 * Zonder `uitvoeren: true` krijg je alleen een voorbeeld: wat zou er gebeuren.
 * Een kunstwerk dat al bestaat (zelfde naam) blijft ongemoeid.
 */
export const POST = withAuth({ rol: 'admin', module: 'objecten' }, async (request: NextRequest, _context, session) => {
  try {
    const body = await request.json().catch(() => ({}));
    const uitvoeren = body.uitvoeren === true;

    const bestaande = await prisma.sampleObject.findMany({ select: { id: true, name: true } });
    const opNaam = new Set(bestaande.map((o) => o.name.toLowerCase()));

    const voorbeeld = KUNSTWERKEN.map((k) => ({
      naam: k.naam,
      regio: k.regio,
      objectType: k.type,
      notitie: k.notitie ?? null,
      bestaatAl: opNaam.has(k.naam.toLowerCase()),
    }));

    if (!uitvoeren) {
      return NextResponse.json({
        uitgevoerd: false,
        nieuw: voorbeeld.filter((v) => !v.bestaatAl).length,
        bestaandeObjecten: voorbeeld.filter((v) => v.bestaatAl).length,
        voorbeeld,
      });
    }

    let aangemaakt = 0;
    for (const k of KUNSTWERKEN) {
      if (opNaam.has(k.naam.toLowerCase())) continue;
      await prisma.sampleObject.create({
        data: {
          name: k.naam,
          region: k.regio,
          objectType: k.type,
          notes: k.notitie ?? null,
        },
      });
      opNaam.add(k.naam.toLowerCase());
      aangemaakt += 1;
    }

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_KUNSTWERKEN,
      details: { aangemaakt, overgeslagen: KUNSTWERKEN.length - aangemaakt },
      request,
    });

    return NextResponse.json({
      uitgevoerd: true,
      aangemaakt,
      overgeslagen: KUNSTWERKEN.length - aangemaakt,
    });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij aanmaken van de kunstwerkenlijst');
  }
});
