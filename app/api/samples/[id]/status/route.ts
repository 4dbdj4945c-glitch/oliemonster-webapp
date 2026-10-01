import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { tabelOntbreekt } from '@/lib/kolommen';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { apiRoute, ApiFout, leesId, leesJson, optioneleDatum } from '@/lib/apiRoute';
import { LAATSTE_POGING_SELECT, NIEUWSTE_EERST, wijzigLaatstePoging } from '@/lib/sampleAttempts';
import { alsLijstRij, haalLijstRij } from '@/lib/monsterLijst';

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
    let sample: {
      id: number;
      oNumber: string;
      isTaken: boolean;
      isDisabled: boolean;
      analysisYear: number;
      sampleDate: Date | null;
      isUnreachable?: boolean;
      attempts?: { id: number; sampleDate: Date | null; photoUrl: string | null; partPhotoUrl: string | null; remarks: string | null; isTaken: boolean }[];
    } | null;
    try {
      // Het monster met zijn laatste poging in één query.
      sample = await prisma.oilSample.findUnique({
        where: { id: sampleId, ...(await actiefFilter()) },
        select: { ...basis, isUnreachable: true, attempts: { orderBy: NIEUWSTE_EERST, take: 1, select: LAATSTE_POGING_SELECT } },
      });
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      sample = await prisma.oilSample.findUnique({ where: { id: sampleId, ...(await actiefFilter()) }, select: basis });
    }
    if (!sample) throw new ApiFout(404, 'Monster niet gevonden');
    if (sample.isDisabled) throw new ApiFout(400, 'Dit monster is geannuleerd. Draai de annulering eerst terug.');

    // Datum bij "genomen": de meegestuurde datum, anders de datum die er al
    // stond (van de laatste poging, of zonder poging van het monster), anders
    // vandaag. Bij "niet genomen" blijft de datum staan.
    //
    // Een genomen monster is niet meer onbereikbaar: die registratie gaat eruit,
    // anders houdt het monster twee statussen tegelijk. De reden blijft in het
    // logboek staan. Dat gaat mee in dezelfde update die de poging spiegelt.
    const wisOnbereikbaar = isTaken && sample.isUnreachable === true;
    const { vorige, wijziging, monster: rij } = await wijzigLaatstePoging(
      sampleId,
      (stond) => ({
        isTaken,
        sampleDate: isTaken ? invoer.sampleDate ?? stond.sampleDate ?? new Date() : stond.sampleDate,
      }),
      wisOnbereikbaar
        ? {
            isUnreachable: false,
            unreachableReason: null,
            unreachableNote: null,
            unreachablePhotoUrl: null,
            unreachableAt: null,
            unreachableBy: null,
          }
        : {},
      // De laatste poging hebben we al; het monster komt in de vorm van de lijst terug.
      { laatste: sample.attempts ? sample.attempts[0] ?? null : undefined, lijstRij: true }
    );
    const bestaandeDatum = vorige?.sampleDate ?? null;
    const sampleDate = wijziging.sampleDate ?? null;

    // Het monster zoals de lijst het toont, zodat het scherm alleen deze regel vervangt.
    const monster = rij ? alsLijstRij(rij, session) : await haalLijstRij(sampleId, session);

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

    return NextResponse.json({ id: sampleId, isTaken, sampleDate, monster });
  }
);
