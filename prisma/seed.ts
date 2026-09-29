// Vult de LOKALE ontwikkeldatabase met nepdata: twee analysejaren oliemonsters,
// objecten, klanten met contactpersonen en installaties, een planning en de
// gebruikers admin, gebruiker, kijker (alleen lezen, 2025) en nieuw (nog geen
// wachtwoord). Wist eerst alles.
//
// Draaien: npm run seed. Weigert alles wat niet op deze computer staat.

import { PrismaClient } from '@prisma/client';
import { magLokaalWissen, NEP_GEBRUIKERS, vulMetNepdata } from './nepdata';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!magLokaalWissen(url)) {
    console.error('Gestopt: DATABASE_URL wijst niet naar een database op deze computer. De seed wist alles en draait alleen lokaal.');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const r = await vulMetNepdata(prisma);
    console.log(`Klaar: ${r.monsters[2025].length} monsters in 2025, ${r.monsters[2026].length} in 2026, ${r.objecten.length + 1} objecten, 2 klanten, ${r.installaties.length} installaties.`);
    for (const g of Object.values(NEP_GEBRUIKERS)) {
      console.log(`  ${g.username.padEnd(10)} ${g.wachtwoord ?? '(nog geen wachtwoord)'}  rol ${g.role}${g.viewYear ? `, jaar ${g.viewYear}` : ''}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
