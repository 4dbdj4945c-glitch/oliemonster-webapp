-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('NIEUW', 'ONDERZOCHT', 'BENADERD', 'REACTIE', 'GESPREK', 'OFFERTE', 'KLANT', 'AFGEWEZEN', 'LATER');

-- CreateEnum
CREATE TYPE "ProspectKanaal" AS ENUM ('MAIL', 'LINKEDIN', 'TELEFOON', 'BEZOEK', 'OFFERTE', 'OVERIG');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT,
    "role" TEXT NOT NULL,
    "viewYear" INTEGER,
    "requiresPasswordChange" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Uitnodiging" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "verlooptOp" TIMESTAMP(3) NOT NULL,
    "gebruiktOp" TIMESTAMP(3),
    "gemaaktDoor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Uitnodiging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OilSample" (
    "id" SERIAL NOT NULL,
    "oNumber" TEXT NOT NULL,
    "analysisYear" INTEGER NOT NULL DEFAULT 2025,
    "sampleDate" TIMESTAMP(3),
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "oilType" TEXT,
    "remarks" TEXT,
    "isTaken" BOOLEAN NOT NULL,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "photoUrl" TEXT,
    "partPhotoUrl" TEXT,
    "objectId" INTEGER,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelReasonInPdf" BOOLEAN NOT NULL DEFAULT true,
    "isUnreachable" BOOLEAN NOT NULL DEFAULT false,
    "unreachableReason" TEXT,
    "unreachableNote" TEXT,
    "unreachablePhotoUrl" TEXT,
    "unreachableAt" TIMESTAMP(3),
    "unreachableBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OilSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleObject" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "objectType" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "estimatedMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SampleObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SamplePlan" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "analysisYear" INTEGER NOT NULL,
    "notes" TEXT,
    "routeGeometry" TEXT,
    "routeDistance" DOUBLE PRECISION,
    "routeDuration" DOUBLE PRECISION,
    "manualOrder" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SamplePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SamplePlanStop" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "objectId" INTEGER NOT NULL,
    "sampleIds" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "plannedMinutes" INTEGER,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SamplePlanStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleAttempt" (
    "id" SERIAL NOT NULL,
    "oilSampleId" INTEGER NOT NULL,
    "sampleDate" TIMESTAMP(3),
    "photoUrl" TEXT,
    "partPhotoUrl" TEXT,
    "remarks" TEXT,
    "isTaken" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SampleAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlRound" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "notes" TEXT,
    "routeGeometry" TEXT,
    "routeDistance" DOUBLE PRECISION,
    "routeSteps" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlRoundStreet" (
    "id" SERIAL NOT NULL,
    "roundId" INTEGER NOT NULL,
    "street" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geometry" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlRoundStreet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" SERIAL NOT NULL,
    "company" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactNote" (
    "id" SERIAL NOT NULL,
    "contactId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "userId" INTEGER,
    "username" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UltimoTask" (
    "id" SERIAL NOT NULL,
    "jobName" TEXT NOT NULL,
    "taskDescription" TEXT NOT NULL,
    "installation" TEXT,
    "lastDate" TIMESTAMP(3),
    "lastComment" TEXT,
    "lastJobNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UltimoTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UltimoComment" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "jobNumber" TEXT,
    "text" TEXT NOT NULL,
    "userId" INTEGER,
    "username" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UltimoComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" SERIAL NOT NULL,
    "bedrijfsnaam" TEXT NOT NULL,
    "segment" TEXT,
    "plaats" TEXT NOT NULL,
    "provincie" TEXT,
    "website" TEXT,
    "telefoon" TEXT,
    "email" TEXT,
    "contactpersoon" TEXT,
    "functie" TEXT,
    "linkedin" TEXT,
    "omvang" TEXT,
    "activiteit" TEXT,
    "aanknopingspunt" TEXT,
    "signaal" TEXT,
    "bron" TEXT,
    "score" INTEGER,
    "scoreReden" TEXT,
    "afstandKm" DOUBLE PRECISION,
    "status" "ProspectStatus" NOT NULL DEFAULT 'NIEUW',
    "kanaal" "ProspectKanaal" NOT NULL DEFAULT 'MAIL',
    "afgemeldOp" TIMESTAMP(3),
    "volgendeActie" TEXT,
    "volgendeActieOp" TIMESTAMP(3),
    "laatsteContactOp" TIMESTAMP(3),
    "klantSindsOp" TIMESTAMP(3),
    "geschatteWaarde" INTEGER,
    "notities" TEXT,
    "archief" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectContactmoment" (
    "id" SERIAL NOT NULL,
    "prospectId" INTEGER NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "kanaal" "ProspectKanaal" NOT NULL DEFAULT 'MAIL',
    "samenvatting" TEXT NOT NULL,
    "uitkomst" TEXT,
    "aangemaaktDoor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectContactmoment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Uitnodiging_tokenHash_key" ON "Uitnodiging"("tokenHash");

-- CreateIndex
CREATE INDEX "Uitnodiging_userId_idx" ON "Uitnodiging"("userId");

-- CreateIndex
CREATE INDEX "OilSample_analysisYear_idx" ON "OilSample"("analysisYear");

-- CreateIndex
CREATE INDEX "OilSample_objectId_idx" ON "OilSample"("objectId");

-- CreateIndex
CREATE INDEX "OilSample_deletedAt_idx" ON "OilSample"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OilSample_oNumber_analysisYear_key" ON "OilSample"("oNumber", "analysisYear");

-- CreateIndex
CREATE UNIQUE INDEX "SampleObject_name_key" ON "SampleObject"("name");

-- CreateIndex
CREATE INDEX "SampleObject_region_idx" ON "SampleObject"("region");

-- CreateIndex
CREATE INDEX "SamplePlan_analysisYear_idx" ON "SamplePlan"("analysisYear");

-- CreateIndex
CREATE UNIQUE INDEX "SamplePlan_date_analysisYear_key" ON "SamplePlan"("date", "analysisYear");

-- CreateIndex
CREATE INDEX "SamplePlanStop_planId_idx" ON "SamplePlanStop"("planId");

-- CreateIndex
CREATE INDEX "SamplePlanStop_objectId_idx" ON "SamplePlanStop"("objectId");

-- CreateIndex
CREATE INDEX "SamplePlanStop_orderIndex_idx" ON "SamplePlanStop"("orderIndex");

-- CreateIndex
CREATE INDEX "SampleAttempt_oilSampleId_idx" ON "SampleAttempt"("oilSampleId");

-- CreateIndex
CREATE INDEX "SampleAttempt_sampleDate_idx" ON "SampleAttempt"("sampleDate");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_key_key" ON "Settings"("key");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ControlRound_place_idx" ON "ControlRound"("place");

-- CreateIndex
CREATE INDEX "ControlRoundStreet_roundId_idx" ON "ControlRoundStreet"("roundId");

-- CreateIndex
CREATE INDEX "ControlRoundStreet_orderIndex_idx" ON "ControlRoundStreet"("orderIndex");

-- CreateIndex
CREATE INDEX "Contact_company_idx" ON "Contact"("company");

-- CreateIndex
CREATE INDEX "Contact_name_idx" ON "Contact"("name");

-- CreateIndex
CREATE INDEX "ContactNote_contactId_idx" ON "ContactNote"("contactId");

-- CreateIndex
CREATE INDEX "ContactNote_createdAt_idx" ON "ContactNote"("createdAt");

-- CreateIndex
CREATE INDEX "UltimoTask_jobName_idx" ON "UltimoTask"("jobName");

-- CreateIndex
CREATE INDEX "UltimoTask_taskDescription_idx" ON "UltimoTask"("taskDescription");

-- CreateIndex
CREATE INDEX "UltimoComment_taskId_idx" ON "UltimoComment"("taskId");

-- CreateIndex
CREATE INDEX "UltimoComment_date_idx" ON "UltimoComment"("date");

-- CreateIndex
CREATE INDEX "Prospect_status_idx" ON "Prospect"("status");

-- CreateIndex
CREATE INDEX "Prospect_segment_idx" ON "Prospect"("segment");

-- CreateIndex
CREATE INDEX "Prospect_volgendeActieOp_idx" ON "Prospect"("volgendeActieOp");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_bedrijfsnaam_plaats_key" ON "Prospect"("bedrijfsnaam", "plaats");

-- CreateIndex
CREATE INDEX "ProspectContactmoment_prospectId_idx" ON "ProspectContactmoment"("prospectId");

-- CreateIndex
CREATE INDEX "ProspectContactmoment_datum_idx" ON "ProspectContactmoment"("datum");

-- AddForeignKey
ALTER TABLE "Uitnodiging" ADD CONSTRAINT "Uitnodiging_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OilSample" ADD CONSTRAINT "OilSample_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "SampleObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamplePlanStop" ADD CONSTRAINT "SamplePlanStop_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SamplePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamplePlanStop" ADD CONSTRAINT "SamplePlanStop_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "SampleObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleAttempt" ADD CONSTRAINT "SampleAttempt_oilSampleId_fkey" FOREIGN KEY ("oilSampleId") REFERENCES "OilSample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRoundStreet" ADD CONSTRAINT "ControlRoundStreet_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "ControlRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UltimoComment" ADD CONSTRAINT "UltimoComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UltimoTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectContactmoment" ADD CONSTRAINT "ProspectContactmoment_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

