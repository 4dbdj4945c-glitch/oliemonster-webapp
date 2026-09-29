-- Fase 5: contracten met terugkerende taken, planning met taken en
-- inspectiebezoeken, dagrapport met handtekening, agendafeed en de
-- verzendingen van de offline wachtrij.
--
-- Alleen nieuwe tabellen en twee nieuwe, lege kolommen op SamplePlanStop
-- (taakId, inspectieId). Aan bestaande gegevens verandert niets: elke
-- bestaande stop blijft een gewone oliemonsterstop.

-- AlterTable
ALTER TABLE "SamplePlanStop" ADD COLUMN     "inspectieId" INTEGER,
ADD COLUMN     "taakId" INTEGER;

-- CreateTable
CREATE TABLE "Contract" (
    "id" SERIAL NOT NULL,
    "klantId" INTEGER NOT NULL,
    "naam" TEXT NOT NULL,
    "startOp" TIMESTAMP(3),
    "eindOp" TIMESTAMP(3),
    "notities" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTaak" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "soort" TEXT NOT NULL,
    "omschrijving" TEXT,
    "objectId" INTEGER NOT NULL,
    "installatieId" INTEGER,
    "intervalMaanden" INTEGER NOT NULL,
    "volgendeOp" TIMESTAMP(3) NOT NULL,
    "geschatteMinuten" INTEGER,
    "laatstUitgevoerdOp" TIMESTAMP(3),
    "notities" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTaak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTaakUitvoering" (
    "id" SERIAL NOT NULL,
    "taakId" INTEGER NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "bron" TEXT NOT NULL,
    "vorigeOp" TIMESTAMP(3) NOT NULL,
    "volgendeOp" TIMESTAMP(3) NOT NULL,
    "door" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTaakUitvoering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dagrapport" (
    "id" SERIAL NOT NULL,
    "klantId" INTEGER NOT NULL,
    "planId" INTEGER,
    "objectId" INTEGER,
    "datum" TIMESTAMP(3) NOT NULL,
    "uitvoerder" TEXT NOT NULL,
    "werkzaamheden" TEXT,
    "bevindingen" TEXT,
    "minuten" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'concept',
    "handtekening" TEXT,
    "getekendDoor" TEXT,
    "getekendOp" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dagrapport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DagrapportFoto" (
    "id" SERIAL NOT NULL,
    "dagrapportId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "bijschrift" TEXT,
    "volgorde" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DagrapportFoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaFeed" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "sleutel" TEXT NOT NULL,
    "laatstGebruiktOp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verzending" (
    "sleutel" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "route" TEXT NOT NULL,
    "status" INTEGER,
    "antwoord" JSONB,
    "klaarOp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verzending_pkey" PRIMARY KEY ("sleutel")
);

-- CreateIndex
CREATE INDEX "Contract_klantId_idx" ON "Contract"("klantId");

-- CreateIndex
CREATE INDEX "Contract_deletedAt_idx" ON "Contract"("deletedAt");

-- CreateIndex
CREATE INDEX "ContractTaak_contractId_idx" ON "ContractTaak"("contractId");

-- CreateIndex
CREATE INDEX "ContractTaak_objectId_idx" ON "ContractTaak"("objectId");

-- CreateIndex
CREATE INDEX "ContractTaak_volgendeOp_idx" ON "ContractTaak"("volgendeOp");

-- CreateIndex
CREATE INDEX "ContractTaak_deletedAt_idx" ON "ContractTaak"("deletedAt");

-- CreateIndex
CREATE INDEX "ContractTaakUitvoering_taakId_idx" ON "ContractTaakUitvoering"("taakId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTaakUitvoering_taakId_bron_key" ON "ContractTaakUitvoering"("taakId", "bron");

-- CreateIndex
CREATE INDEX "Dagrapport_klantId_idx" ON "Dagrapport"("klantId");

-- CreateIndex
CREATE INDEX "Dagrapport_planId_idx" ON "Dagrapport"("planId");

-- CreateIndex
CREATE INDEX "Dagrapport_datum_idx" ON "Dagrapport"("datum");

-- CreateIndex
CREATE INDEX "Dagrapport_deletedAt_idx" ON "Dagrapport"("deletedAt");

-- CreateIndex
CREATE INDEX "DagrapportFoto_dagrapportId_idx" ON "DagrapportFoto"("dagrapportId");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaFeed_userId_key" ON "AgendaFeed"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaFeed_sleutel_key" ON "AgendaFeed"("sleutel");

-- CreateIndex
CREATE INDEX "Verzending_createdAt_idx" ON "Verzending"("createdAt");

-- CreateIndex
CREATE INDEX "SamplePlanStop_taakId_idx" ON "SamplePlanStop"("taakId");

-- CreateIndex
CREATE INDEX "SamplePlanStop_inspectieId_idx" ON "SamplePlanStop"("inspectieId");

-- AddForeignKey
ALTER TABLE "SamplePlanStop" ADD CONSTRAINT "SamplePlanStop_taakId_fkey" FOREIGN KEY ("taakId") REFERENCES "ContractTaak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamplePlanStop" ADD CONSTRAINT "SamplePlanStop_inspectieId_fkey" FOREIGN KEY ("inspectieId") REFERENCES "Inspectie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTaak" ADD CONSTRAINT "ContractTaak_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTaak" ADD CONSTRAINT "ContractTaak_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "SampleObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTaak" ADD CONSTRAINT "ContractTaak_installatieId_fkey" FOREIGN KEY ("installatieId") REFERENCES "Installatie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTaakUitvoering" ADD CONSTRAINT "ContractTaakUitvoering_taakId_fkey" FOREIGN KEY ("taakId") REFERENCES "ContractTaak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dagrapport" ADD CONSTRAINT "Dagrapport_klantId_fkey" FOREIGN KEY ("klantId") REFERENCES "Klant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dagrapport" ADD CONSTRAINT "Dagrapport_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SamplePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dagrapport" ADD CONSTRAINT "Dagrapport_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "SampleObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DagrapportFoto" ADD CONSTRAINT "DagrapportFoto_dagrapportId_fkey" FOREIGN KEY ("dagrapportId") REFERENCES "Dagrapport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaFeed" ADD CONSTRAINT "AgendaFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

