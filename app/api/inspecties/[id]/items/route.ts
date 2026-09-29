import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, leesId, leesJson } from '@/lib/apiRoute';
import { plusMaanden, sjabloonVan, type SjabloonSleutel } from '@/lib/inspecties/sjablonen';
import { nlDag } from '@/lib/klantOpdracht';
import { ItemSchema, alsDag, controleerInstallatie, controleerItem, dagAlsDatum, haalInspectie, inspectieAlsJson } from '@/lib/inspecties/server';

/*
  POST /api/inspecties/[id]/items - een bevinding toevoegen (admin): een lek of
  een arbeidsmiddel. Zonder oordeel het standaardoordeel van het sjabloon;
  zonder volgende datum (arbeidsmiddelen) een jaar na de inspectie.
  Geeft de hele inspectie terug, met de nieuwe totalen.
*/

export const POST = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij toevoegen van de bevinding' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende inspectie');
  const inspectie = await haalInspectie(id, sessie);
  const sjabloon = inspectie.sjabloon as SjabloonSleutel;
  const s = sjabloonVan(sjabloon);
  const invoer = await leesJson(request, ItemSchema);
  const { waarden } = controleerItem(sjabloon, invoer);
  await controleerInstallatie(invoer.installatieId, inspectie.klantId);

  const volgorde = invoer.volgorde ?? (inspectie.items.at(-1)?.volgorde ?? 0) + 1;
  const volgendeOp = invoer.volgendeOp
    ? alsDag(invoer.volgendeOp)
    : s.volgendePerItem
      ? dagAlsDatum(plusMaanden(nlDag(inspectie.datum), s.volgendeNaMaanden))
      : null;
  const item = await prisma.inspectieItem.create({
    data: {
      inspectieId: id,
      volgorde,
      titel: invoer.titel,
      locatie: invoer.locatie ?? null,
      oordeel: invoer.oordeel ?? s.oordeel.standaard,
      notitie: invoer.notitie ?? null,
      waarden: waarden ?? {},
      gerepareerd: s.reparatie ? invoer.gerepareerd ?? false : false,
      gerepareerdOp: s.reparatie ? alsDag(invoer.gerepareerdOp) ?? null : null,
      volgendeOp,
      installatieId: invoer.installatieId ?? null,
    },
    select: { id: true },
  });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.CREATE_INSPECTIE_ITEM,
    details: { inspectieId: id, itemId: item.id, titel: invoer.titel },
    request,
  });
  return NextResponse.json({ itemId: item.id, inspectie: inspectieAlsJson(await haalInspectie(id, sessie)) }, { status: 201 });
});
