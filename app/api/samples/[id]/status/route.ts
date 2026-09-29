import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { tabelOntbreekt } from '@/lib/kolommen';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { apiRoute, ApiFout, leesId, leesJson, optioneleDatum } from '@/lib/apiRoute';
import { NIEUWSTE_EERST, wijzigLaatstePoging } from '@/lib/sampleAttempts';

const StatusSchema = z.object({
  isTaken: z.boolean({ error: 'Geef mee of het monster genomen is' }),
  sampleDate: optioneleDatum().catch(null),
});

/**
 * PATCH - Zet een monster met één handeling op genomen of niet genomen.
 *
 * Dit is de hoofdhandeling in de monsterlijst: één tik op de statuscel in plaats
 * van vijf handelingen via het bewerkvenster. Bij "genomen" komt de datum op
 * vandaag, tenzij er al een datum meegestuurd wordt.
 *
 * Status en datum komen uit de laatste poging, dus die zetten we op de poging
 * (wijzigLaatstePoging) en spiegelen daarna. De opmerking en de foto's staan ook
 * op die poging en blijven dus gewoon staan. De datum van een bestaande poging
 * blijft staan als je op "niet genomen" zet, anders ben je een afnamedatum kwijt
 * die je niet terugkrijgt; de lijst toont de datum toch alleen bij een genomen
 * monster.
 */
export const PATCH = apiRoute(
  { rol: 'admin', module: 'oliemonsters', fout: 'Fout bij bijwerken van de status' },
  async (request, context, session) => {
    // De rol alleen lezen mag niets wijzigen, ook niet via de API.
    const sampleId = await leesId(context, 'Onbekend monster');
    const invoer = await leesJson(request, StatusSchema);
    const isTaken = invoer.isTaken;

    const basis = { id: true, oNumber: true, isTaken: true, isDisabled: true, analysisYear: true, sampleDate: true } as const;
    let sample: { id: number; oNumber: string; isTaken: boolean; isDisabled: boolean; analysisYear: number; sampleDate: Date | null; isUnreachable?: boolean } | null;
    try {
      sample = await prisma.oilSample.findUnique({
        where: { id: sampleId, ...(await actiefFilter()) },
        select: { ...basis, isUnreachable: true },
      });
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      sample = await prisma.oilSample.findUnique({ where: { id: sampleId, ...(await actiefFilter()) }, select: basis });
    }
    if (!sample) throw new ApiFout(404, 'Monster niet gevonden');
    if (sample.isDisabled) throw new ApiFout(400, 'Dit monster is geannuleerd. Draai de annulering eerst terug.');

    const laatste = await prisma.sampleAttempt.findFirst({
      where: { oilSampleId: sampleId },
      orderBy: NIEUWSTE_EERST,
      select: { sampleDate: true },
    });

    // Datum bij "genomen": de meegestuurde datum, anders de datum die er al
    // stond, anders vandaag. Bij "niet genomen" blijft de datum staan.
    const bestaandeDatum = laatste ? laatste.sampleDate : sample.sampleDate;
    const sampleDate: Date | null = isTaken ? invoer.sampleDate ?? bestaandeDatum ?? new Date() : bestaandeDatum;

    await wijzigLaatstePoging(sampleId, { isTaken, sampleDate });

    // Een genomen monster is niet meer onbereikbaar: die registratie gaat eruit,
    // anders houdt het monster twee statussen tegelijk. De reden blijft in het
    // logboek staan.
    const wisOnbereikbaar = isTaken && sample.isUnreachable === true;
    if (wisOnbereikbaar) {
      await prisma.oilSample.update({
        where: { id: sampleId },
        data: {
          isUnreachable: false,
          unreachableReason: null,
          unreachableNote: null,
          unreachablePhotoUrl: null,
          unreachableAt: null,
          unreachableBy: null,
        },
        select: { id: true },
      });
    }

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.SET_SAMPLE_STATUS,
      details: {
        id: sampleId,
        oNumber: sample.oNumber,
        analysisYear: sample.analysisYear,
        van: sample.isTaken ? 'genomen' : 'niet genomen',
        naar: isTaken ? 'genomen' : 'niet genomen',
        vorigeDatum: bestaandeDatum,
        nieuweDatum: sampleDate,
        onbereikbaarGewist: wisOnbereikbaar,
      },
      request,
    });

    return NextResponse.json({ id: sampleId, isTaken, sampleDate });
  }
);
