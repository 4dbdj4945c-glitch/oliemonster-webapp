-- Fase 4: inspecties (met bevindingen) en het eigen dossier. Alleen nieuwe,
-- lege tabellen; aan bestaande tabellen en gegevens verandert niets.

-- CreateTable
CREATE TABLE "Inspectie" (
    "id" SERIAL NOT NULL,
    "sjabloon" TEXT NOT NULL,
    "klantId" INTEGER NOT NULL,
    "objectId" INTEGER NOT NULL,
    "installatieId" INTEGER,
    "datum" TIMESTAMP(3) NOT NULL,
    "uitvoerder" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'concept',
    "samenvatting" TEXT,
    "instellingen" JSONB,
    "volgendeOp" TIMESTAMP(3),
    "afgerondOp" TIMESTAMP(3),
    "afgerondDoor" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspectie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectieItem" (
    "id" SERIAL NOT NULL,
    "inspectieId" INTEGER NOT NULL,
    "volgorde" INTEGER NOT NULL DEFAULT 0,
    "installatieId" INTEGER,
    "titel" TEXT NOT NULL,
    "locatie" TEXT,
    "oordeel" TEXT,
    "notitie" TEXT,
    "waarden" JSONB,
    "fotoUrl" TEXT,
    "gerepareerd" BOOLEAN NOT NULL DEFAULT false,
    "gerepareerdOp" TIMESTAMP(3),
    "volgendeOp" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectieItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EigenDocument" (
    "id" SERIAL NOT NULL,
    "soort" TEXT NOT NULL,
    "titel" TEXT NOT NULL,
    "uitgever" TEXT,
    "nummer" TEXT,
    "afgegevenOp" TIMESTAMP(3),
    "vervaltOp" TIMESTAMP(3),
    "bestandUrl" TEXT,
    "bestandNaam" TEXT,
    "bestandType" TEXT,
    "notities" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EigenDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inspectie_klantId_idx" ON "Inspectie"("klantId");

-- CreateIndex
CREATE INDEX "Inspectie_objectId_idx" ON "Inspectie"("objectId");

-- CreateIndex
CREATE INDEX "Inspectie_installatieId_idx" ON "Inspectie"("installatieId");

-- CreateIndex
CREATE INDEX "Inspectie_datum_idx" ON "Inspectie"("datum");

-- CreateIndex
CREATE INDEX "Inspectie_deletedAt_idx" ON "Inspectie"("deletedAt");

-- CreateIndex
CREATE INDEX "InspectieItem_inspectieId_idx" ON "InspectieItem"("inspectieId");

-- CreateIndex
CREATE INDEX "InspectieItem_installatieId_idx" ON "InspectieItem"("installatieId");

-- CreateIndex
CREATE INDEX "InspectieItem_deletedAt_idx" ON "InspectieItem"("deletedAt");

-- CreateIndex
CREATE INDEX "EigenDocument_vervaltOp_idx" ON "EigenDocument"("vervaltOp");

-- CreateIndex
CREATE INDEX "EigenDocument_deletedAt_idx" ON "EigenDocument"("deletedAt");

-- AddForeignKey
ALTER TABLE "Inspectie" ADD CONSTRAINT "Inspectie_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspectie" ADD CONSTRAINT "Inspectie_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "SampleObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspectie" ADD CONSTRAINT "Inspectie_installatieId_fkey" FOREIGN KEY ("installatieId") REFERENCES "Installatie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectieItem" ADD CONSTRAINT "InspectieItem_inspectieId_fkey" FOREIGN KEY ("inspectieId") REFERENCES "Inspectie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectieItem" ADD CONSTRAINT "InspectieItem_installatieId_fkey" FOREIGN KEY ("installatieId") REFERENCES "Installatie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

