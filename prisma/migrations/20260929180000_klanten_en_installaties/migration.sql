-- Fase 1b: klanten, contactpersonen en installaties.
--
-- Alleen nieuwe tabellen en nieuwe, lege kolommen: er verdwijnt niets. Daarna
-- de datamigratie: één klant Mourik Infra B.V., met daaraan alle bestaande
-- objecten en alle gebruikers met de rol alleen lezen. Idempotent: een tweede
-- keer draaien maakt geen tweede klant en overschrijft geen koppeling die er al is.

-- AlterTable
ALTER TABLE "OilSample" ADD COLUMN     "installatieId" INTEGER;

-- AlterTable
ALTER TABLE "Prospect" ADD COLUMN     "klantId" INTEGER;

-- AlterTable
ALTER TABLE "SampleObject" ADD COLUMN     "klantId" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "klantId" INTEGER;

-- CreateTable
CREATE TABLE "Klant" (
    "id" SERIAL NOT NULL,
    "naam" TEXT NOT NULL,
    "adres" TEXT,
    "postcode" TEXT,
    "plaats" TEXT,
    "kvkNummer" TEXT,
    "notities" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Klant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contactpersoon" (
    "id" SERIAL NOT NULL,
    "klantId" INTEGER NOT NULL,
    "naam" TEXT NOT NULL,
    "functie" TEXT,
    "email" TEXT,
    "telefoon" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contactpersoon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installatie" (
    "id" SERIAL NOT NULL,
    "objectId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "soort" TEXT NOT NULL,
    "merk" TEXT,
    "typenummer" TEXT,
    "bouwjaar" INTEGER,
    "serienummer" TEXT,
    "fotoUrl" TEXT,
    "notities" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installatie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Klant_naam_idx" ON "Klant"("naam");

-- CreateIndex
CREATE INDEX "Klant_deletedAt_idx" ON "Klant"("deletedAt");

-- CreateIndex
CREATE INDEX "Contactpersoon_klantId_idx" ON "Contactpersoon"("klantId");

-- CreateIndex
CREATE UNIQUE INDEX "Installatie_code_key" ON "Installatie"("code");

-- CreateIndex
CREATE INDEX "Installatie_objectId_idx" ON "Installatie"("objectId");

-- CreateIndex
CREATE INDEX "Installatie_deletedAt_idx" ON "Installatie"("deletedAt");

-- CreateIndex
CREATE INDEX "OilSample_installatieId_idx" ON "OilSample"("installatieId");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_klantId_key" ON "Prospect"("klantId");

-- CreateIndex
CREATE INDEX "SampleObject_klantId_idx" ON "SampleObject"("klantId");

-- CreateIndex
CREATE INDEX "User_klantId_idx" ON "User"("klantId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OilSample" ADD CONSTRAINT "OilSample_installatieId_fkey" FOREIGN KEY ("installatieId") REFERENCES "Installatie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleObject" ADD CONSTRAINT "SampleObject_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contactpersoon" ADD CONSTRAINT "Contactpersoon_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installatie" ADD CONSTRAINT "Installatie_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "SampleObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------------
-- Datamigratie: Mourik Infra B.V. als eerste klant
-- ------------------------------------------------------------------

INSERT INTO "Klant" ("naam", "adres", "postcode", "plaats", "createdAt", "updatedAt")
SELECT 'Mourik Infra B.V.', 'Trambaan 15', '6101 AJ', 'Echt', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Klant" WHERE "naam" = 'Mourik Infra B.V.' AND "deletedAt" IS NULL);

-- Alle objecten die nog bij geen klant horen: dat zijn nu de kunstwerken van Mourik.
UPDATE "SampleObject"
SET "klantId" = (SELECT "id" FROM "Klant" WHERE "naam" = 'Mourik Infra B.V.' AND "deletedAt" IS NULL ORDER BY "id" LIMIT 1)
WHERE "klantId" IS NULL;

-- Alle meekijkers (ook de oude kijkersrol) kijken voor Mourik mee. Hun rol en
-- kijkjaar blijven precies zoals ze zijn.
UPDATE "User"
SET "klantId" = (SELECT "id" FROM "Klant" WHERE "naam" = 'Mourik Infra B.V.' AND "deletedAt" IS NULL ORDER BY "id" LIMIT 1)
WHERE "klantId" IS NULL AND "role" IN ('alleen_lezen', 'viewer_oil2025');
