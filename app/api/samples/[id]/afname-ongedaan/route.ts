import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { NIEUWSTE_EERST, wijzigLaatstePoging } from '@/lib/sampleAttempts';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';

/**
 * POST - Afname ongedaan maken (alleen admin).
 *
 * Zet de laatste monstername terug naar niet genomen: datum en beide foto's gaan
 * eraf, de opmerking blijft staan. Bij meerdere pogingen alleen de laatste, de
 * eerdere blijven zoals ze zijn. Dat gaat via de poging (wijzigLaatstePoging),
 * zodat de lijst daarna klopt, ook bij een oud monster zonder pogingen.
 *
 * De foto's worden alleen losgekoppeld, niet uit de opslag gewist. De oude datum
 * en de adressen van de foto's staan in het logboek, zodat het met de hand terug
 * te zetten is als het toch een vergissing was.
 */
export const POST = apiRoute(
  { rol: 'admin', module: 'oliemonsters', fout: 'Fout bij ongedaan maken van de afname' },
  async (request, context, session) => {
    const sampleId = await leesId(context, 'Onbekend monster');

    const sample = await prisma.oilSample.findFirst({
      where: { id: sampleId, ...(await actiefFilter()) },
      select: { id: true, oNumber: true, analysisYear: true, isTaken: true },
    });
    if (!sample) throw new ApiFout(404, 'Monster niet gevonden');

    const laatste = await prisma.sampleAttempt.findFirst({
      where: { oilSampleId: sampleId },
      orderBy: NIEUWSTE_EERST,
      select: { isTaken: true },
    });
    const genomen = laatste ? laatste.isTaken : sample.isTaken;
    if (!genomen) {
      throw new ApiFout(400, `De laatste monstername van ${sample.oNumber} staat al op niet genomen.`);
    }

    const { attemptId, vorige } = await wijzigLaatstePoging(sampleId, {
      isTaken: false,
      sampleDate: null,
      photoUrl: null,
      partPhotoUrl: null,
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UNDO_TAKE_SAMPLE,
      details: {
        id: sampleId,
        oNumber: sample.oNumber,
        analysisYear: sample.analysisYear,
        attemptId,
        vorigeDatum: vorige?.sampleDate ?? null,
        fotoPotje: vorige?.photoUrl ?? null,
        fotoOnderdeel: vorige?.partPhotoUrl ?? null,
      },
      request,
    });

    return NextResponse.json({ success: true, id: sampleId, oNumber: sample.oNumber });
  }
);
