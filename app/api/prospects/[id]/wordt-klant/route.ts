import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson, optioneelId } from '@/lib/apiRoute';
import { controleerKlant } from '@/lib/klanten';

const Schema = z.object({
  /** Koppelen aan een klant die al bestaat, in plaats van een nieuwe maken. */
  klantId: optioneelId('Onbekende klant'),
});

/**
 * POST - Wordt klant: van een prospect een klant maken (alleen admin).
 *
 * Maakt een Klant met de bedrijfsnaam en plaats, en een Contactpersoon als er
 * bij de prospect een contactpersoon staat. De prospect krijgt status KLANT en
 * onthoudt de klant (klantId), zodat je vanuit de acquisitie naar de klant kunt.
 *
 * Bestaat er al een klant met dezelfde naam, dan komt er geen dubbele: dan
 * volgt een 409 met die klant, en kan de pagina aanbieden hem daaraan te koppelen
 * (opnieuw aanroepen met klantId).
 */
export const POST = apiRoute(
  { rol: 'admin', module: 'acquisitie', fout: 'Fout bij het omzetten naar klant' },
  async (request, context, sessie) => {
    const id = await leesId(context, 'Onbekende prospect');
    const { klantId: bestaandId } = await leesJson(request, Schema);

    const prospect = await prisma.prospect.findUnique({ where: { id } });
    if (!prospect) throw new ApiFout(404, 'Prospect niet gevonden');
    if (prospect.klantId) {
      throw new ApiFout(400, `${prospect.bedrijfsnaam} is al klant.`, { klantId: prospect.klantId });
    }

    let klantId: number;
    let nieuw = false;
    if (bestaandId) {
      await controleerKlant(bestaandId);
      const bezet = await prisma.prospect.findUnique({ where: { klantId: bestaandId }, select: { bedrijfsnaam: true } });
      if (bezet) throw new ApiFout(400, `Die klant hoort al bij de prospect ${bezet.bedrijfsnaam}.`);
      klantId = bestaandId;
    } else {
      const dubbel = await prisma.klant.findFirst({
        where: { naam: { equals: prospect.bedrijfsnaam, mode: 'insensitive' }, deletedAt: null },
        select: { id: true, naam: true },
      });
      if (dubbel) {
        throw new ApiFout(409, `Er is al een klant ${dubbel.naam}. Koppel de prospect daaraan of pas eerst de naam aan.`, {
          bestaandeKlant: dubbel,
        });
      }
      klantId = await prisma.$transaction(async (tx) => {
        const klant = await tx.klant.create({
          data: {
            naam: prospect.bedrijfsnaam,
            plaats: prospect.plaats || null,
            notities: prospect.activiteit ? `Uit de acquisitie: ${prospect.activiteit}` : null,
          },
        });
        if (prospect.contactpersoon?.trim()) {
          await tx.contactpersoon.create({
            data: {
              klantId: klant.id,
              naam: prospect.contactpersoon.trim(),
              functie: prospect.functie || null,
              email: prospect.email || null,
              telefoon: prospect.telefoon || null,
            },
          });
        }
        return klant.id;
      });
      nieuw = true;
    }

    await prisma.prospect.update({
      where: { id },
      data: { klantId, status: 'KLANT', klantSindsOp: prospect.klantSindsOp ?? new Date() },
    });

    await createAuditLog({
      userId: sessie.userId,
      username: sessie.username,
      action: AuditActions.PROSPECT_WORDT_KLANT,
      details: { prospectId: id, bedrijfsnaam: prospect.bedrijfsnaam, klantId, nieuweKlant: nieuw },
      request,
    });

    return NextResponse.json({ klantId, nieuw }, { status: nieuw ? 201 : 200 });
  }
);
