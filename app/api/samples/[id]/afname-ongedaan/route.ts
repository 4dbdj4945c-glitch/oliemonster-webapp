import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { syncLatestAttemptToSample } from '@/lib/sampleAttempts';
import { haalSessie, toegangsFout } from '@/lib/toegang';
import { tabelOntbreekt } from '@/lib/kolommen';
import { actiefFilter } from '@/lib/verwijderdeMonsters';

/**
 * POST - Afname ongedaan maken (alleen admin).
 *
 * Zet de laatste monstername terug naar niet genomen: datum en beide foto's gaan
 * eraf, de opmerking blijft staan. Bij meerdere pogingen alleen de laatste, de
 * eerdere blijven zoals ze zijn. "Laatste" is dezelfde volgorde als waarmee
 * syncLatestAttemptToSample het monster bijwerkt, zodat de lijst daarna klopt.
 *
 * De foto's worden alleen losgekoppeld, niet uit de opslag gewist. De oude datum
 * en de adressen van de foto's staan in het logboek, zodat het met de hand terug
 * te zetten is als het toch een vergissing was.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id } = await params;
    const sampleId = parseInt(id);
    if (Number.isNaN(sampleId)) {
      return NextResponse.json({ error: 'Onbekend monster' }, { status: 400 });
    }

    const sample = await prisma.oilSample.findFirst({
      where: { id: sampleId, ...(await actiefFilter()) },
      select: { id: true, oNumber: true, analysisYear: true, isTaken: true, sampleDate: true, photoUrl: true },
    });
    if (!sample) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
    }

    const volgorde = [{ sampleDate: 'desc' as const }, { createdAt: 'desc' as const }];
    let laatste: {
      id: number;
      isTaken: boolean;
      sampleDate: Date | null;
      photoUrl: string | null;
      partPhotoUrl?: string | null;
    } | null;
    try {
      laatste = await prisma.sampleAttempt.findFirst({
        where: { oilSampleId: sampleId },
        orderBy: volgorde,
        select: { id: true, isTaken: true, sampleDate: true, photoUrl: true, partPhotoUrl: true },
      });
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      laatste = await prisma.sampleAttempt.findFirst({
        where: { oilSampleId: sampleId },
        orderBy: volgorde,
        select: { id: true, isTaken: true, sampleDate: true, photoUrl: true },
      });
    }

    const genomen = laatste ? laatste.isTaken : sample.isTaken;
    if (!genomen) {
      return NextResponse.json(
        { error: `De laatste monstername van ${sample.oNumber} staat al op niet genomen.` },
        { status: 400 }
      );
    }

    const leeg = { isTaken: false, sampleDate: null, photoUrl: null };
    if (laatste) {
      try {
        await prisma.sampleAttempt.update({
          where: { id: laatste.id },
          data: { ...leeg, partPhotoUrl: null },
          select: { id: true },
        });
      } catch (error) {
        if (!tabelOntbreekt(error)) throw error;
        await prisma.sampleAttempt.update({ where: { id: laatste.id }, data: leeg, select: { id: true } });
      }
      await syncLatestAttemptToSample(sampleId);
    } else {
      // Oud monster zonder pogingen: de velden staan alleen op het monster zelf.
      try {
        await prisma.oilSample.update({
          where: { id: sampleId },
          data: { ...leeg, partPhotoUrl: null },
          select: { id: true },
        });
      } catch (error) {
        if (!tabelOntbreekt(error)) throw error;
        await prisma.oilSample.update({ where: { id: sampleId }, data: leeg, select: { id: true } });
      }
    }

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UNDO_TAKE_SAMPLE,
      details: {
        id: sampleId,
        oNumber: sample.oNumber,
        analysisYear: sample.analysisYear,
        attemptId: laatste?.id ?? null,
        vorigeDatum: laatste ? laatste.sampleDate : sample.sampleDate,
        fotoPotje: laatste ? laatste.photoUrl : sample.photoUrl,
        fotoOnderdeel: laatste?.partPhotoUrl ?? null,
      },
      request,
    });

    return NextResponse.json({ success: true, id: sampleId, oNumber: sample.oNumber });
  } catch (error) {
    console.error('Error undoing sample take:', error);
    return NextResponse.json({ error: 'Fout bij ongedaan maken van de afname' }, { status: 500 });
  }
}
