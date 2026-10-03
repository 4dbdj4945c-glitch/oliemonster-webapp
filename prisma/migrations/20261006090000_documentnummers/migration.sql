-- Documentnummers per jaar: INS-2026-001 voor inspecties en WB-2026-001 voor
-- werkbonnen. Het jaar is het jaar van de inspectie- of werkbondatum bij het
-- aanmaken; het volgnummer begint elk jaar bij 1. Beide liggen vast bij het
-- aanmaken en veranderen daarna nooit, ook niet als de datum wordt aangepast.
--
-- De kolommen mogen leeg zijn, zodat de vorige versie van de portal (die ze
-- nog niet kent) blijft werken tot de nieuwe live staat. Zonder nummer toont
-- de portal het oude nummer (INS-12).
--
-- Bestaande inspecties en werkbonnen krijgen hieronder een nummer in de
-- volgorde waarin ze zijn aangemaakt, ook de weggehaalde, zodat een nummer
-- nooit twee keer voorkomt.

-- AlterTable
ALTER TABLE "Inspectie" ADD COLUMN "nummerJaar" INTEGER,
ADD COLUMN "volgnummer" INTEGER;

-- AlterTable
ALTER TABLE "Dagrapport" ADD COLUMN "nummerJaar" INTEGER,
ADD COLUMN "volgnummer" INTEGER;

-- Bestaande nummeren
UPDATE "Inspectie" AS i
SET "nummerJaar" = n.jaar, "volgnummer" = n.volg
FROM (
  SELECT "id",
         EXTRACT(YEAR FROM "datum")::INTEGER AS jaar,
         ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM "datum") ORDER BY "createdAt", "id")::INTEGER AS volg
  FROM "Inspectie"
) AS n
WHERE i."id" = n."id" AND i."volgnummer" IS NULL;

UPDATE "Dagrapport" AS d
SET "nummerJaar" = n.jaar, "volgnummer" = n.volg
FROM (
  SELECT "id",
         EXTRACT(YEAR FROM "datum")::INTEGER AS jaar,
         ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM "datum") ORDER BY "createdAt", "id")::INTEGER AS volg
  FROM "Dagrapport"
) AS n
WHERE d."id" = n."id" AND d."volgnummer" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Inspectie_nummerJaar_volgnummer_key" ON "Inspectie"("nummerJaar", "volgnummer");

-- CreateIndex
CREATE UNIQUE INDEX "Dagrapport_nummerJaar_volgnummer_key" ON "Dagrapport"("nummerJaar", "volgnummer");
