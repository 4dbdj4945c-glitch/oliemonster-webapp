-- AlterTable
ALTER TABLE "Klant" ADD COLUMN     "logoUrl" TEXT;

-- AlterTable
ALTER TABLE "OilSample" ADD COLUMN     "klantId" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "portaalWeergave" TEXT NOT NULL DEFAULT 'klassiek';

-- CreateIndex
CREATE INDEX "OilSample_klantId_idx" ON "OilSample"("klantId");

-- AddForeignKey
ALTER TABLE "OilSample" ADD CONSTRAINT "OilSample_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ------------------------------------------------------------------
-- Datamigratie fase 3 (klantportaal). Er verdwijnt niets en er wordt niets
-- overschreven dat al een waarde heeft; vaker draaien doet niets extra.
-- ------------------------------------------------------------------

-- Monsters zonder object (oude regels met alleen een locatie) horen tot nu toe
-- allemaal bij de opdracht van Mourik. Door ze aan Mourik te koppelen blijft de
-- Mourik-kijker ze zien nu de afscherming per klant geldt. Monsters met een
-- object volgen de klant van het object en worden hier niet aangeraakt.
UPDATE "OilSample"
SET "klantId" = (SELECT "id" FROM "Klant" WHERE "naam" = 'Mourik Infra B.V.' AND "deletedAt" IS NULL ORDER BY "id" LIMIT 1)
WHERE "objectId" IS NULL AND "klantId" IS NULL;

-- Het logo van Mourik staat al in de portal (public/mourik_logo.png).
UPDATE "Klant"
SET "logoUrl" = '/mourik_logo.png'
WHERE "naam" = 'Mourik Infra B.V.' AND "logoUrl" IS NULL;

-- portaalWeergave: alle bestaande gebruikers krijgen de standaard 'klassiek'
-- (de DEFAULT hierboven), dus de Mourik-kijker ziet precies wat hij zag.
