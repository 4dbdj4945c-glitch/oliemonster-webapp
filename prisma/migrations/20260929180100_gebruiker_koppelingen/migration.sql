-- Echte koppelingen naar User voor het logboek en de Ultimo-opmerkingen.
--
-- Wordt een gebruiker later verwijderd, dan blijft de regel staan: userId wordt
-- leeg (ON DELETE SET NULL) en de gebruikersnaam blijft als tekst in "username".
--
-- Eerst de verwijzingen naar gebruikers die al niet meer bestaan leegmaken,
-- anders weigert PostgreSQL de koppeling. Er gaat niets verloren: de
-- gebruikersnaam staat in dezelfde regel als tekst, en een id van een
-- verwijderde gebruiker wijst nergens meer naar.

UPDATE "AuditLog" a
SET "userId" = NULL
WHERE a."userId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = a."userId");

UPDATE "UltimoComment" c
SET "userId" = NULL
WHERE c."userId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = c."userId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UltimoComment" ADD CONSTRAINT "UltimoComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
