import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, leesId, leesJson, optioneleTekst, tekst } from '@/lib/apiRoute';
import { eenmalig } from '@/lib/idempotentie';
import { plusMaanden, sjabloonVan } from '@/lib/inspecties/sjablonen';
import { MAX_PLAK_REGELS, PLAK_MAX } from '@/lib/inspecties/plakken';
import { nlDag } from '@/lib/klantOpdracht';
import { alleenBijConcept, dagAlsDatum, haalInspectie, inspectieAlsJson } from '@/lib/inspecties/server';

/*
  POST /api/inspecties/[id]/items/bulk - een geplakte lijst bevindingen in één
  keer toevoegen (admin, alleen bij een concept). Body: { regels: [{ titel,
  locatie?, notitie? }] }, hoogstens MAX_PLAK_REGELS. Het scherm leest het
  tekstvak met leesPlakLijst (lib/inspecties/plakken.ts). Alles of niets, in
  één transactie, achter de bestaande bevindingen. Oordeel: de standaard van
  het sjabloon (bij markering en arbeidsmiddelen leeg). Met de header
  Idempotentie-Sleutel maar één keer. Geeft de hele inspectie terug.
*/

const BulkSchema = z.object({
  regels: z
    .array(
      z.object({
        titel: tekst('Vul een titel in', PLAK_MAX.titel),
        locatie: optioneleTekst(PLAK_MAX.locatie),
        notitie: optioneleTekst(PLAK_MAX.notitie),
      }),
      { error: 'Stuur een lijst met regels' }
    )
    .min(1, { error: 'Er staat geen enkele regel in de lijst' })
    .max(MAX_PLAK_REGELS, { error: `Hoogstens ${MAX_PLAK_REGELS} regels in één keer` }),
});

export const POST = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij toevoegen van de lijst' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende inspectie');
  return eenmalig(request, sessie, `inspectie-bulk-${id}`, async () => {
    const inspectie = await haalInspectie(id, sessie);
    await alleenBijConcept(id, inspectie.status);
    const s = sjabloonVan(inspectie.sjabloon);
    const { regels } = await leesJson(request, BulkSchema);
    const start = (inspectie.items.at(-1)?.volgorde ?? 0) + 1;
    const volgendeOp = s.volgendePerItem && s.heeftVolgende ? dagAlsDatum(plusMaanden(nlDag(inspectie.datum), s.volgendeNaMaanden)) : null;
    await prisma.$transaction(
      regels.map((r, n) =>
        prisma.inspectieItem.create({
          data: {
            inspectieId: id,
            volgorde: start + n,
            titel: r.titel,
            locatie: r.locatie ?? null,
            notitie: r.notitie ?? null,
            oordeel: s.oordeel.standaard,
            waarden: {},
            volgendeOp,
          },
          select: { id: true },
        })
      )
    );
    await createAuditLog({
      userId: sessie.userId,
      username: sessie.username,
      action: AuditActions.CREATE_INSPECTIE_ITEMS_BULK,
      details: { inspectieId: id, aantal: regels.length },
      request,
    });
    return NextResponse.json({ aantal: regels.length, inspectie: inspectieAlsJson(await haalInspectie(id, sessie)) }, { status: 201 });
  });
});
