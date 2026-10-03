-- Meerdere foto's per bevinding van een inspectie. De kolom InspectieItem.fotoUrl
-- blijft staan (terugval), maar de portal gebruikt hem niet meer: de bestaande
-- foto's worden hieronder overgezet naar InspectieFoto, met volgorde 0.

-- CreateTable
CREATE TABLE "InspectieFoto" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "bijschrift" TEXT,
    "volgorde" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectieFoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspectieFoto_itemId_idx" ON "InspectieFoto"("itemId");

-- AddForeignKey
ALTER TABLE "InspectieFoto" ADD CONSTRAINT "InspectieFoto_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InspectieItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bestaande foto's overzetten (ook van bevindingen in de prullenbak, zodat
-- Ongedaan maken de foto terugbrengt).
INSERT INTO "InspectieFoto" ("itemId", "url", "volgorde", "createdAt")
SELECT "id", "fotoUrl", 0, "updatedAt"
FROM "InspectieItem"
WHERE "fotoUrl" IS NOT NULL AND "fotoUrl" <> '';
