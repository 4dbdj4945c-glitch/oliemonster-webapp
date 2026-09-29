-- Het model Contact (met ContactNote) had nooit een scherm of API en is
-- vervangen door Klant en Contactpersoon.
--
-- Veilig: de tabellen gaan alleen weg als ze allebei leeg zijn. Staat er toch
-- iets in, dan blijven ze onaangeroerd staan (de portal gebruikt ze niet meer)
-- en meldt PostgreSQL dat. Er gaat dus nooit data verloren.

DO $$
DECLARE
  aantal_contacten INTEGER := 0;
  aantal_notities INTEGER := 0;
BEGIN
  IF to_regclass('"ContactNote"') IS NOT NULL THEN
    SELECT count(*) INTO aantal_notities FROM "ContactNote";
  END IF;
  IF to_regclass('"Contact"') IS NOT NULL THEN
    SELECT count(*) INTO aantal_contacten FROM "Contact";
  END IF;

  IF aantal_contacten = 0 AND aantal_notities = 0 THEN
    DROP TABLE IF EXISTS "ContactNote";
    DROP TABLE IF EXISTS "Contact";
  ELSE
    RAISE NOTICE 'Contact (% rijen) en ContactNote (% rijen) niet leeg: blijven staan, niets verwijderd.',
      aantal_contacten, aantal_notities;
  END IF;
END $$;
