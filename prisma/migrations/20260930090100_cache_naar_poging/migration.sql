-- TELLING VOORAF (op een kopie van de productiedatabase), zie ook onderaan het commentaar.
--   WITH l AS (SELECT DISTINCT ON ("oilSampleId") * FROM "SampleAttempt"
--              ORDER BY "oilSampleId", "sampleDate" DESC, "createdAt" DESC)
--   SELECT
--     (SELECT count(*) FROM "OilSample" m WHERE NOT EXISTS (SELECT 1 FROM "SampleAttempt" x WHERE x."oilSampleId" = m.id)
--        AND (m."isTaken" OR m."sampleDate" IS NOT NULL OR m."remarks" IS NOT NULL OR m."photoUrl" IS NOT NULL OR m."partPhotoUrl" IS NOT NULL)) AS zonder_poging,
--     count(*) FILTER (WHERE (l."remarks" IS NULL AND s."remarks" IS NOT NULL)
--                         OR (l."photoUrl" IS NULL AND s."photoUrl" IS NOT NULL)
--                         OR (l."partPhotoUrl" IS NULL AND s."partPhotoUrl" IS NOT NULL)) AS opmerking_of_foto,
--     count(*) FILTER (WHERE l."isTaken" IS DISTINCT FROM s."isTaken"
--                         OR l."sampleDate" IS DISTINCT FROM s."sampleDate") AS datum_of_status
--   FROM l JOIN "OilSample" s ON s.id = l."oilSampleId";
--
--
-- Datamigratie: wat alleen op het monster staat (opmerking, foto's, datum en
-- genomen), naar de laatste poging. Er verandert niets aan het schema.
--
-- Waarom: op main schreven de bewerkknop (remarks, sampleDate, isTaken) en de
-- fotoknop (photoUrl, partPhotoUrl) rechtstreeks op OilSample, zonder poging. Sinds fase 1b gaat
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
-- Opmerking en foto's (deel 1): alleen velden die op de poging leeg zijn en
-- op het monster niet; daar wordt nooit iets overschreven. Vaker draaien doet
-- in alle delen niets extra.
--
-- Deel 0: een monster met iets in de cache (genomen, een datum, een opmerking
-- of foto) maar zonder enige poging krijgt een poging met die gegevens. Anders
-- zet syncLatestAttemptToSample het monster bij de eerste klik terug op leeg.
--
-- Datum en genomen (deel 2): daar wint het monster, want dat is wat Roel en
-- de klant nu zien. De laatste poging krijgt de datum en de status van het
-- monster. Een nieuwe datum kan de volgorde veranderen (een andere poging wordt
-- dan de laatste); zo'n monster wordt NIET aangepast, want dan zou de volgende
-- klik toch een andere poging spiegelen. Die afwijkers laat de query
-- hieronder zien: die moet Roel met de hand bekijken (bewerkvenster, pogingen).
--
-- Een geplande hermonstering (nieuwste poging zonder datum en niet genomen,
-- met een eerdere poging) wordt nooit op genomen gezet en krijgt geen
-- opmerking of foto van het genomen monster; datum, genomen, opmerking en
-- foto's gaan dan naar de vorige poging (deel 3, draait als eerste). Zo'n monster staat daarna, net als
-- in de code, als niet genomen met een geplande hermonstering, en de
-- afwijkersquery toont het.
--
-- Na de migratie: welke monsters wijken nog af (datum of status)?
--   WITH l AS (SELECT DISTINCT ON ("oilSampleId") * FROM "SampleAttempt"
--              ORDER BY "oilSampleId", "sampleDate" DESC, "createdAt" DESC)
--   SELECT s.id, s."oNumber", s."analysisYear", s."sampleDate", s."isTaken", l."sampleDate", l."isTaken"
--   FROM l JOIN "OilSample" s ON s.id = l."oilSampleId"
--   WHERE l."isTaken" IS DISTINCT FROM s."isTaken" OR l."sampleDate" IS DISTINCT FROM s."sampleDate";

-- Deel 0: poging voor een monster met cachegegevens maar zonder poging.
INSERT INTO "SampleAttempt" ("oilSampleId", "sampleDate", "photoUrl", "partPhotoUrl", "remarks", "isTaken", "createdAt", "updatedAt")
SELECT m."id", m."sampleDate", m."photoUrl", m."partPhotoUrl", m."remarks", m."isTaken", m."createdAt", CURRENT_TIMESTAMP
FROM "OilSample" AS m
WHERE NOT EXISTS (SELECT 1 FROM "SampleAttempt" AS x WHERE x."oilSampleId" = m."id")
  AND (m."isTaken" OR m."sampleDate" IS NOT NULL OR m."remarks" IS NOT NULL OR m."photoUrl" IS NOT NULL OR m."partPhotoUrl" IS NOT NULL);

-- Deel 3 (vóór deel 1 en 2): het monster staat op genomen, maar de nieuwste
-- poging is een geplande hermonstering (geen datum, niet genomen). Dan horen
-- datum, genomen, opmerking en foto's bij de VORIGE poging: die krijgt ze, als
-- hij nog niet genomen is en geen of dezelfde datum heeft, of al genomen is op
-- dezelfde datum (dan alleen de lege opmerking en foto's). De hermonstering
-- blijft gepland en krijgt niets. Lukt dat niet, dan gaan deel 1 en 2 hun eigen
-- gang (niets gaat verloren) en toont de controle achteraf het monster.
WITH geordend AS (
  SELECT "id", "oilSampleId", "sampleDate", "isTaken",
         ROW_NUMBER() OVER (PARTITION BY "oilSampleId" ORDER BY "sampleDate" DESC, "createdAt" DESC) AS nr
  FROM "SampleAttempt"
)
UPDATE "SampleAttempt" AS a
SET
  "isTaken" = true,
  "sampleDate" = s."sampleDate",
  -- Een eigen opmerking van de vorige poging blijft staan; die van het monster
  -- komt eronder, zodat er geen tekst verloren gaat.
  "remarks" = CASE
    WHEN a."remarks" IS NULL THEN s."remarks"
    WHEN s."remarks" IS NULL OR position(s."remarks" in a."remarks") > 0 THEN a."remarks"
    ELSE a."remarks" || E'\n' || s."remarks"
  END,
  "photoUrl" = COALESCE(a."photoUrl", s."photoUrl"),
  "partPhotoUrl" = COALESCE(a."partPhotoUrl", s."partPhotoUrl"),
  "updatedAt" = CURRENT_TIMESTAMP
FROM geordend AS l
JOIN geordend AS v ON v."oilSampleId" = l."oilSampleId" AND v.nr = 2
JOIN "OilSample" AS s ON s."id" = l."oilSampleId"
WHERE l.nr = 1
  AND a."id" = v."id"
  AND l."sampleDate" IS NULL AND NOT l."isTaken"
  AND s."isTaken" AND s."sampleDate" IS NOT NULL
  AND (
    (NOT v."isTaken" AND (v."sampleDate" IS NULL OR v."sampleDate" = s."sampleDate"))
    OR (v."isTaken" AND v."sampleDate" = s."sampleDate")
  )
  AND (
    NOT a."isTaken" OR a."sampleDate" IS DISTINCT FROM s."sampleDate"
    OR (s."remarks" IS NOT NULL AND (a."remarks" IS NULL OR position(s."remarks" in a."remarks") = 0))
    OR (a."photoUrl" IS NULL AND s."photoUrl" IS NOT NULL)
    OR (a."partPhotoUrl" IS NULL AND s."partPhotoUrl" IS NOT NULL)
  );

-- Deel 1: opmerking en foto's.
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
  -- Door deel 3 afgehandeld (geplande hermonstering, vorige poging genomen op
  -- de datum van het monster): de hermonstering krijgt geen opmerking of foto.
  AND NOT (
    a."sampleDate" IS NULL AND NOT a."isTaken" AND s."isTaken"
    AND EXISTS (
      SELECT 1 FROM "SampleAttempt" AS v
      WHERE v."oilSampleId" = l."oilSampleId" AND v."id" <> l."id"
        AND v."isTaken" AND v."sampleDate" = s."sampleDate"
        -- alleen als de vorige poging alles van het monster al heeft; anders
        -- toch naar de laatste, want verliezen is erger dan een verkeerde plek
        AND (s."remarks" IS NULL OR position(s."remarks" in coalesce(v."remarks", '')) > 0)
        AND (s."photoUrl" IS NULL OR v."photoUrl" = s."photoUrl")
        AND (s."partPhotoUrl" IS NULL OR v."partPhotoUrl" = s."partPhotoUrl")
    )
  )
  AND (
    (a."remarks" IS NULL AND s."remarks" IS NOT NULL)
    OR (a."photoUrl" IS NULL AND s."photoUrl" IS NOT NULL)
    OR (a."partPhotoUrl" IS NULL AND s."partPhotoUrl" IS NOT NULL)
  );

-- Deel 2: datum en genomen van het monster naar de laatste poging, alleen als
-- die poging daarna nog steeds de laatste is.
WITH laatste AS (
  SELECT DISTINCT ON ("oilSampleId") "id", "oilSampleId", "createdAt"
  FROM "SampleAttempt"
  ORDER BY "oilSampleId", "sampleDate" DESC, "createdAt" DESC
)
UPDATE "SampleAttempt" AS a
SET
  "sampleDate" = s."sampleDate",
  "isTaken" = s."isTaken",
  "updatedAt" = CURRENT_TIMESTAMP
FROM laatste AS l
JOIN "OilSample" AS s ON s."id" = l."oilSampleId"
WHERE a."id" = l."id"
  AND (a."isTaken" IS DISTINCT FROM s."isTaken" OR a."sampleDate" IS DISTINCT FROM s."sampleDate")
  -- Een geplande hermonstering (geen datum, niet genomen, met een eerdere poging)
  -- blijft gepland: de genomen-gegevens horen bij de vorige poging (deel 3).
  AND NOT (
    a."sampleDate" IS NULL AND NOT a."isTaken" AND s."isTaken"
    AND EXISTS (SELECT 1 FROM "SampleAttempt" AS e WHERE e."oilSampleId" = l."oilSampleId" AND e."id" <> l."id")
  )
  -- Met de nieuwe datum blijft deze poging bovenaan: geen andere poging zonder
  -- datum (die gaan voor) en geen met een latere datum, of dezelfde datum en later gemaakt.
  AND (
    s."sampleDate" IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM "SampleAttempt" AS o
      WHERE o."oilSampleId" = l."oilSampleId"
        AND o."id" <> l."id"
        AND (
          o."sampleDate" IS NULL
          OR o."sampleDate" > s."sampleDate"
          OR (o."sampleDate" = s."sampleDate" AND o."createdAt" > l."createdAt")
        )
    )
  );
