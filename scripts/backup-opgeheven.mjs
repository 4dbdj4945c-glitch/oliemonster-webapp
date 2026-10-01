// Hulpje voor db-bijwerken.sh, VOOR de migratie
// 20261003090000_controlerondes_ultimo_opheffen. Bewaart de volledige inhoud
// van de vier tabellen van de opgeheven modules Controlerondes en
// Ultimo-opmerkingen (ControlRound, ControlRoundStreet, UltimoTask,
// UltimoComment) als JSON in de map backups naast de projectmap:
//   ~/Documents/It's Done Services/Oliemonster Webapp/backups/controlerondes-ultimo-<datum>.json
//
// Alleen lezen: alles in één transactie met SET TRANSACTION READ ONLY, dus de
// database kan hier niets veranderen.
//
// Uitkomst (exitcode):
//   0  bewaard en teruggelezen (aantallen kloppen), of de tabellen bestaan al
//      niet meer (de migratie is eerder gedraaid): dan valt er niets te bewaren
//   1  iets mislukte (verbinding, schrijven, teruglezen); db-bijwerken.sh stopt
//      dan en de migratie draait NIET
//
// Andere map (voor een proef): BACKUP_MAP=/pad node scripts/backup-opgeheven.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const TABELLEN = ['ControlRound', 'ControlRoundStreet', 'UltimoTask', 'UltimoComment'];
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const map = process.env.BACKUP_MAP || join(repo, '..', 'backups');

const prisma = new PrismaClient();
try {
  const uitkomst = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const bestaan = {};
    for (const t of TABELLEN) {
      const [{ bestaat }] = await tx.$queryRawUnsafe(`SELECT to_regclass('public."${t}"') IS NOT NULL AS bestaat`);
      bestaan[t] = bestaat;
    }
    const inhoud = {};
    for (const t of TABELLEN) {
      if (!bestaan[t]) continue;
      // Als JSON uit PostgreSQL zelf: elke kolom precies zoals hij in de database staat.
      inhoud[t] = (await tx.$queryRawUnsafe(`SELECT row_to_json(r) AS rij FROM "${t}" r ORDER BY r.id`)).map((x) => x.rij);
    }
    return { bestaan, inhoud };
  });

  const aanwezig = TABELLEN.filter((t) => uitkomst.bestaan[t]);
  if (aanwezig.length === 0) {
    console.log('Back-up controlerondes en Ultimo: de tabellen bestaan niet meer, er valt niets te bewaren.');
    process.exit(0);
  }

  const datum = new Date();
  const dag = `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`;
  mkdirSync(map, { recursive: true });
  // Nooit een bestaande back-up overschrijven.
  let bestand = join(map, `controlerondes-ultimo-${dag}.json`);
  for (let i = 2; existsSync(bestand); i++) bestand = join(map, `controlerondes-ultimo-${dag}-${i}.json`);

  const aantallen = Object.fromEntries(aanwezig.map((t) => [t, uitkomst.inhoud[t].length]));
  writeFileSync(
    bestand,
    JSON.stringify(
      {
        uitleg: 'Inhoud van de opgeheven modules Controlerondes en Ultimo-opmerkingen, bewaard door db-bijwerken.sh voor de migratie 20261003090000_controlerondes_ultimo_opheffen.',
        gemaakt: datum.toISOString(),
        aantallen,
        tabellen: uitkomst.inhoud,
      },
      null,
      2
    ),
    { flag: 'wx' }
  );

  // Teruglezen: staat alles er echt in?
  const terug = JSON.parse(readFileSync(bestand, 'utf8'));
  for (const t of aanwezig) {
    if (!Array.isArray(terug.tabellen?.[t]) || terug.tabellen[t].length !== aantallen[t]) {
      throw new Error(`De back-up van ${t} klopt niet na teruglezen.`);
    }
  }

  console.log(`Back-up controlerondes en Ultimo bewaard in ${bestand}`);
  for (const t of aanwezig) console.log(`  ${t.padEnd(20)} ${aantallen[t]} regels`);
} catch (e) {
  console.error('De back-up van controlerondes en Ultimo is MISLUKT:');
  console.error(e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
