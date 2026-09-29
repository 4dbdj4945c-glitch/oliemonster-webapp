/**
 * Eenmalig migratiescript: zet de oude kijkersrol om naar de nieuwe rol
 * alleen lezen. Idempotent, je kunt het zo vaak draaien als je wil.
 *
 * Wat het doet:
 *   - elke gebruiker met rol "viewer_oil2025" krijgt rol "alleen_lezen" en
 *     viewYear 2025, want dat is precies wat die gebruiker eerder mocht zien;
 *   - gebruikers die al "alleen_lezen" zijn en nog geen viewYear hebben, blijven
 *     ongemoeid: leeg betekent alle jaren en dat is een bewuste keuze van de admin.
 *
 * Gebruik:
 *   npm run migreer-alleen-lezen
 * of, samen met de schemawijziging:
 *   ./db-push-wensen2.sh
 */

import { prisma } from '../lib/prisma';
import { ROLE_ALLEEN_LEZEN, ROLE_VIEWER_OIL2025_OUD, OUD_KIJKJAAR } from '../lib/roles';

async function main() {
  console.log('Start migratie kijkersrol → alleen lezen...');

  const oud = await prisma.user.findMany({
    where: { role: ROLE_VIEWER_OIL2025_OUD },
    select: { id: true, username: true },
  });

  if (oud.length === 0) {
    console.log('✓ Klaar. Geen gebruikers met de oude rol gevonden, niets te doen.');
    return;
  }

  for (const gebruiker of oud) {
    await prisma.user.update({
      where: { id: gebruiker.id },
      data: { role: ROLE_ALLEEN_LEZEN, viewYear: OUD_KIJKJAAR },
    });
    console.log(`  ${gebruiker.username}: alleen lezen, kijkjaar ${OUD_KIJKJAAR}`);
  }

  console.log(`✓ Klaar. Omgezet: ${oud.length}.`);
}

main()
  .catch((e) => {
    console.error('Migratie gefaald:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
