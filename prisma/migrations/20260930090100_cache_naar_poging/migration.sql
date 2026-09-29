-- Datamigratie: opmerking en foto's die alleen op het monster staan, naar de
-- laatste poging. Er verandert niets aan het schema.
--
-- Waarom: op main schreven de bewerkknop (remarks) en de fotoknop (photoUrl,
-- partPhotoUrl) rechtstreeks op OilSample, zonder poging. Sinds fase 1b gaat
-- elke wijziging via de laatste poging (wijzigLaatstePoging in
-- lib/sampleAttempts.ts) en wordt het monster daarna gelijk gezet met die
-- poging. Staat de waarde alleen op het monster, dan zou de eerstvolgende klik
-- (status, foto, Opslaan) hem wissen. Daarom zetten we hem hier vooraf op de
-- poging, zodat hij bewaard blijft.
--
-- Welke poging is de laatste: dezelfde volgorde als NIEUWSTE_EERST in
-- lib/sampleAttempts.ts (sampleDate aflopend, dan createdAt aflopend). Prisma
-- en PostgreSQL zetten bij aflopend sorteren NULL vooraan, dus hier ook
-- (NULLS FIRST is de standaard bij DESC).
--
-- Alleen velden die op de poging leeg zijn en op het monster niet: er wordt
-- nooit iets overschreven. Monsters zonder poging hoeven niet: daar neemt
-- wijzigLaatstePoging de waarden van het monster al over. Vaker draaien doet
-- niets extra.
--
-- Telling vooraf (op een kopie): hoeveel monsters wijken af van hun laatste poging?
--   WITH l AS (SELECT DISTINCT ON ("oilSampleId") * FROM "SampleAttempt"
--              ORDER BY "oilSampleId", "sampleDate" DESC, "createdAt" DESC)
--   SELECT count(*) FROM l JOIN "OilSample" s ON s.id = l."oilSampleId"
--   WHERE (l."remarks" IS NULL AND s."remarks" IS NOT NULL)
--      OR (l."photoUrl" IS NULL AND s."photoUrl" IS NOT NULL)
--      OR (l."partPhotoUrl" IS NULL AND s."partPhotoUrl" IS NOT NULL);

WITH laatste AS (
  SELECT DISTINCT ON ("oilSampleId") "id", "oilSampleId"
  FROM "SampleAttempt"
  ORDER BY "oilSampleId", "sampleDate" DESC, "createdAt" DESC
)
UPDATE "SampleAttempt" AS a
SET
  "remarks" = COALESCE(a."remarks", s."remarks"),
  "photoUrl" = COALESCE(a."photoUrl", s."photoUrl"),
  "partPhotoUrl" = COALESCE(a."partPhotoUrl", s."partPhotoUrl"),
  "updatedAt" = CURRENT_TIMESTAMP
FROM laatste AS l
JOIN "OilSample" AS s ON s."id" = l."oilSampleId"
WHERE a."id" = l."id"
  AND (
    (a."remarks" IS NULL AND s."remarks" IS NOT NULL)
    OR (a."photoUrl" IS NULL AND s."photoUrl" IS NOT NULL)
    OR (a."partPhotoUrl" IS NULL AND s."partPhotoUrl" IS NOT NULL)
  );
