-- De modules Controlerondes en Ultimo-opmerkingen zijn opgeheven (Roel, oktober
-- 2026). Hun vier tabellen gaan weg, met de foreign keys ertussen en die van
-- UltimoComment naar User.
--
-- ./db-bijwerken.sh bewaart VOOR deze migratie de volledige inhoud van de vier
-- tabellen als JSON in ../backups/ (scripts/backup-opgeheven.mjs, alleen lezen)
-- en stopt als dat niet lukt. Aan andere tabellen verandert niets; de regels in
-- het logboek (AuditLog) over rondes en Ultimo blijven staan als historie.

-- DropForeignKey
ALTER TABLE "ControlRoundStreet" DROP CONSTRAINT "ControlRoundStreet_roundId_fkey";

-- DropForeignKey
ALTER TABLE "UltimoComment" DROP CONSTRAINT "UltimoComment_taskId_fkey";

-- DropForeignKey
ALTER TABLE "UltimoComment" DROP CONSTRAINT "UltimoComment_userId_fkey";

-- DropTable
DROP TABLE "ControlRound";

-- DropTable
DROP TABLE "ControlRoundStreet";

-- DropTable
DROP TABLE "UltimoComment";

-- DropTable
DROP TABLE "UltimoTask";
