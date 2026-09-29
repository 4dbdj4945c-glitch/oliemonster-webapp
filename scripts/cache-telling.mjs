// Hulpje voor db-bijwerken.sh bij de migratie 20260930090100_cache_naar_poging.
// Alleen lezen: wijzigt niets in de database (alleen SELECT).
//
//   node scripts/cache-telling.mjs voor   hoeveel monsters de migratie raakt
//   node scripts/cache-telling.mjs na     welke monsters daarna nog afwijken
//
// "Laatste poging" in dezelfde volgorde als de code (NIEUWSTE_EERST in
// lib/sampleAttempts.ts): datum aflopend (lege datum vooraan), dan aangemaakt aflopend.
import { PrismaClient } from '@prisma/client';

const LAATSTE = `WITH l AS (SELECT DISTINCT ON ("oilSampleId") * FROM "SampleAttempt"
  ORDER BY "oilSampleId", "sampleDate" DESC, "createdAt" DESC)`;

const modus = process.argv[2];
const prisma = new PrismaClient();
const datum = (d) => (d ? new Date(d).toLocaleDateString('nl-NL') : '-');
try {
  if (modus === 'voor') {
    const [t] = await prisma.$queryRawUnsafe(`${LAATSTE}
      SELECT
        (SELECT count(*) FROM "OilSample" m WHERE NOT EXISTS (SELECT 1 FROM "SampleAttempt" x WHERE x."oilSampleId" = m.id)
          AND (m."isTaken" OR m."sampleDate" IS NOT NULL OR m."remarks" IS NOT NULL OR m."photoUrl" IS NOT NULL OR m."partPhotoUrl" IS NOT NULL))::int AS zonder_poging,
        (count(*) FILTER (WHERE (l."remarks" IS NULL AND s."remarks" IS NOT NULL)
          OR (l."photoUrl" IS NULL AND s."photoUrl" IS NOT NULL)
          OR (l."partPhotoUrl" IS NULL AND s."partPhotoUrl" IS NOT NULL)))::int AS opmerking_of_foto,
        (count(*) FILTER (WHERE l."isTaken" IS DISTINCT FROM s."isTaken" OR l."sampleDate" IS DISTINCT FROM s."sampleDate"))::int AS datum_of_status
      FROM l JOIN "OilSample" s ON s.id = l."oilSampleId"`);
    console.log('Monsters waarvan gegevens alleen op het monster staan (de cachemigratie zet ze op de poging):');
    console.log(`  zonder poging, met gegevens:              ${t.zonder_poging}`);
    console.log(`  opmerking of foto alleen op het monster:  ${t.opmerking_of_foto}`);
    console.log(`  datum of status wijkt af van de poging:   ${t.datum_of_status}`);
  } else if (modus === 'na') {
    const rijen = await prisma.$queryRawUnsafe(`${LAATSTE}
      SELECT s."oNumber", s."analysisYear", s."sampleDate" AS monster_datum, s."isTaken" AS monster_genomen,
             l."sampleDate" AS poging_datum, l."isTaken" AS poging_genomen,
             (l."sampleDate" IS NULL AND NOT l."isTaken" AND EXISTS (
               SELECT 1 FROM "SampleAttempt" v WHERE v."oilSampleId" = s.id AND v.id <> l.id AND v."isTaken")) AS hermonstering
      FROM l JOIN "OilSample" s ON s.id = l."oilSampleId"
      WHERE s."deletedAt" IS NULL AND (l."isTaken" IS DISTINCT FROM s."isTaken" OR l."sampleDate" IS DISTINCT FROM s."sampleDate")
      ORDER BY s."analysisYear", s."oNumber"`);
    const herm = rijen.filter((r) => r.hermonstering);
    const echt = rijen.filter((r) => !r.hermonstering);
    if (herm.length > 0) {
      console.log(`${herm.length} monster(s) met een geplande hermonstering: de vorige poging staat op genomen, de nieuwe is gepland.`);
      console.log('  Dat klopt; na de eerste wijziging toont de portal ze als niet genomen, hermonstering gepland:');
      for (const r of herm) console.log(`  ${r.oNumber} (${r.analysisYear})`);
    }
    if (echt.length === 0) {
      console.log(herm.length ? 'Verder kloppen alle monsters met hun laatste poging.' : 'Alle monsters kloppen met hun laatste poging.');
    } else {
      console.log(`${echt.length} monster(s) wijken nog af van hun laatste poging. Bekijk ze in de portal (Bewerken, pogingen):`);
      for (const r of echt) {
        console.log(`  ${r.oNumber} (${r.analysisYear}): monster ${r.monster_genomen ? 'genomen' : 'niet genomen'} ${datum(r.monster_datum)}, laatste poging ${r.poging_genomen ? 'genomen' : 'niet genomen'} ${datum(r.poging_datum)}`);
      }
    }
  } else {
    console.error('Gebruik: node scripts/cache-telling.mjs voor|na');
    process.exitCode = 2;
  }
} finally {
  await prisma.$disconnect();
}
