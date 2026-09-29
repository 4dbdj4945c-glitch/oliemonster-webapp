// Hulpje voor db-bijwerken.sh: kijkt in de database die in DATABASE_URL staat
// welke migraties Prisma daar al als toegepast heeft geregistreerd.
//
// Schrijft precies één woord naar stdout:
//   basis-ontbreekt  de tabel _prisma_migrations bestaat niet, of 0_basis staat er niet in
//   basis-toegepast  0_basis staat als toegepast geregistreerd
//   onbekend         er staan migraties in de database die hier niet in prisma/migrations staan
// Bij onbekend komen de namen op stderr. Wijzigt niets in de database.
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const map = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations');
const lokaal = new Set(
  readdirSync(map).filter((naam) => statSync(join(map, naam)).isDirectory())
);

const prisma = new PrismaClient();
try {
  const [{ bestaat }] = await prisma.$queryRawUnsafe(
    "SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS bestaat"
  );
  if (!bestaat) {
    console.log('basis-ontbreekt');
  } else {
    const rijen = await prisma.$queryRawUnsafe(
      'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"'
    );
    const vreemd = rijen.map((r) => r.migration_name).filter((naam) => !lokaal.has(naam));
    if (vreemd.length > 0) {
      console.error('Onbekende migraties in de database: ' + vreemd.join(', '));
      console.log('onbekend');
    } else {
      const basis = rijen.some(
        (r) => r.migration_name === '0_basis' && r.finished_at && !r.rolled_back_at
      );
      console.log(basis ? 'basis-toegepast' : 'basis-ontbreekt');
    }
  }
} finally {
  await prisma.$disconnect();
}
