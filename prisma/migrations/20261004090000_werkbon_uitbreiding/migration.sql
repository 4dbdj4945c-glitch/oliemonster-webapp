-- Dagrapport wordt werkbon: meer velden, handtekening optioneel (status afgerond).
ALTER TABLE "Klant" ADD COLUMN "werkbonHandtekening" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Dagrapport" ADD COLUMN "tijdsoort" TEXT NOT NULL DEFAULT 'uren',
ADD COLUMN "beginTijd" TEXT,
ADD COLUMN "eindTijd" TEXT,
ADD COLUMN "pauzeMinuten" INTEGER,
ADD COLUMN "reisMinuten" INTEGER,
ADD COLUMN "kilometers" INTEGER,
ADD COLUMN "soortWerk" TEXT,
ADD COLUMN "referentie" TEXT,
ADD COLUMN "contactpersoon" TEXT,
ADD COLUMN "materialen" JSONB,
ADD COLUMN "vervolgNodig" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "vervolgActie" TEXT,
ADD COLUMN "handtekeningVragen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "afgerondOp" TIMESTAMP(3);

-- Mourik vraagt geen handtekening (oliemonsters): standaard uit, ook voor de
-- werkbonnen die nog een concept zijn.
UPDATE "Klant" SET "werkbonHandtekening" = false WHERE "naam" ILIKE 'Mourik%';
UPDATE "Dagrapport" SET "handtekeningVragen" = false
WHERE "status" = 'concept' AND "klantId" IN (SELECT "id" FROM "Klant" WHERE "naam" ILIKE 'Mourik%');
