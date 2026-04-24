/**
 * Eenmalig migratiescript: zet bestaande OilSample data om naar een eerste
 * SampleAttempt-record per monster. Idempotent — je kunt het meerdere keren draaien.
 *
 * Gebruik:
 *   npm run migrate-attempts
 *
 * Na uitvoer:
 *   - Elk OilSample met sampleDate OF photoUrl OF remarks (en isTaken=true) krijgt
 *     een bijbehorende SampleAttempt (poging #1).
 *   - De cache-velden (sampleDate/photoUrl/remarks) op OilSample blijven staan en
 *     reflecteren de meest recente poging. Nieuwe pogingen updaten deze cache automatisch.
 */

import { prisma } from '../lib/prisma';

async function main() {
  console.log('Start migratie OilSample → SampleAttempt...');

  const samples = await prisma.oilSample.findMany({
    include: { attempts: true },
  });

  let created = 0;
  let skipped = 0;

  for (const sample of samples) {
    if (sample.attempts.length > 0) {
      skipped++;
      continue;
    }

    const hasData = sample.isTaken || sample.sampleDate || sample.photoUrl || sample.remarks;
    if (!hasData) {
      skipped++;
      continue;
    }

    await prisma.sampleAttempt.create({
      data: {
        oilSampleId: sample.id,
        sampleDate: sample.sampleDate,
        photoUrl: sample.photoUrl,
        remarks: sample.remarks,
        isTaken: sample.isTaken,
        createdAt: sample.createdAt,
      },
    });

    created++;
  }

  console.log(`✓ Klaar. Aangemaakt: ${created}, overgeslagen: ${skipped}, totaal: ${samples.length}`);
}

main()
  .catch((e) => {
    console.error('Migratie gefaald:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
