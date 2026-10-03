// Eenmalig (3 okt 2026): zet voor de opdracht "markeren met stickers" (memo
// 31137033-MEM-03786) de nog niet uitgevoerde complexen klaar als
// concept-inspectie Markering, met alle locaties uit de werklijst
// (Documents/Claude/Klanten/Mourik/Markeren met stickers - werklijst.md).
// Grave is al uitgevoerd en staat hier niet in.
//
// Draaien via ./markering-klaarzetten.sh. Laat eerst zien wat het gaat doen en
// vraagt dan om bevestiging. Slaat een object over als daar al een Markering
// (niet weggehaald) op staat, dus vaker draaien maakt niets dubbel.
import { createInterface } from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';

const INSTELLINGEN = {
  titel: 'Opleverrapport aanbrengen asbestmarkeringen',
  opdracht: "Memo 31137033-MEM-03786, Advies blootstellingsrisico's n.a.v. asbestinventarisaties 2024 MB1.75 (03-12-2024)",
  markering: 'Asbest-waarschuwingssticker',
  tav: 'Martin Slabbers',
};
const UITVOERDER = 'Roel Mandigers';

// zoek: een woord dat in de objectnaam moet staan. Bij meer objecten met dat
// woord (Sluis en Stuw Lith) telt eerst de precieze naam, dan het voorkeurwoord:
// het object waar de bronnen zitten.
const COMPLEXEN = [
  {
    complex: 'Born',
    naam: 'Sluis Born',
    zoek: ['born'],
    voorkeur: 'sluis',
    locaties: [
      ['Bron 3: flenspakkingen', 'Gemaalgebouw', 'Volgens rapport 60 stuks (p. 17)'],
      ['Bron 13: aandrijvingen', 'Werkplaats', 'Volgens rapport 2 stuks (p. 18)'],
      ['Bron 14: aandrijvingen traverse', 'Traverse', 'Volgens rapport 1 stuk (p. 19)'],
    ],
  },
  {
    complex: 'Lith',
    naam: 'Stuw Lith',
    zoek: ['lith'],
    voorkeur: 'stuw',
    locaties: [['Bron 5: dichte installatie met verdachte componenten', 'In de stuwtorens, alle verdiepingen', 'Volgens rapport 4 stuks (p. 20)']],
  },
  {
    complex: 'Maasbracht',
    naam: 'Sluis Maasbracht',
    zoek: ['maasbracht'],
    voorkeur: 'sluis',
    locaties: [['Bron 2: aandrijfinstallatie', 'Gemaalgebouw', 'Volgens rapport 7 stuks (p. 22)']],
  },
  {
    complex: 'Roermond',
    naam: 'Sluis Roermond',
    zoek: ['roermond'],
    voorkeur: 'sluis',
    locaties: [
      ['Bron 9: schuifaandrijvingen', 'Bediengebouwen en wachtgebouw (begane grond en 1e verdieping)', 'Volgens rapport 6 stuks (p. 24)'],
      ['Bron 10: stopverf op kabels', 'Technische ruimten bediengebouwen en wachtgebouw', 'Volgens rapport 29 stuks (p. 25)'],
    ],
  },
  {
    complex: 'St. Andries',
    naam: 'Sluis Sint Andries',
    zoek: ['andries'],
    voorkeur: 'sluis',
    locaties: [
      ['Bron 1: koordafdichting elektrakast', 'Technische ruimte sluistoren Waalhoofd oostzijde', 'Volgens rapport 1 stuk, achter de kap van de elektra-eindsluiting (p. 27)'],
    ],
  },
];

function vandaag() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date());
  return new Date(`${d}T12:00:00Z`);
}

function nummer(jaar, volg) {
  return `INS-${jaar}-${String(volg).padStart(3, '0')}`;
}

const prisma = new PrismaClient();
try {
  const klanten = await prisma.klant.findMany({ where: { deletedAt: null, naam: { contains: 'mourik', mode: 'insensitive' } }, select: { id: true, naam: true } });
  if (klanten.length !== 1) {
    console.log(`GESTOPT: verwacht precies één klant met "Mourik" in de naam, gevonden: ${klanten.map((k) => k.naam).join(', ') || 'geen'}. Er is niets gewijzigd.`);
    process.exit(1);
  }
  const klant = klanten[0];
  const objecten = await prisma.sampleObject.findMany({ where: { klantId: klant.id }, select: { id: true, name: true } });

  const plan = [];
  const problemen = [];
  for (const c of COMPLEXEN) {
    const kandidaten = objecten.filter((o) => c.zoek.some((w) => o.name.toLowerCase().includes(w)));
    // Eén kandidaat: die. Meer: eerst de precieze naam (Sluis Born), dan de
    // enige met het voorkeurwoord erin. Anders niet raden maar overslaan.
    const precies = c.naam.toLowerCase();
    const metVoorkeur = kandidaten.filter((o) => o.name.toLowerCase().includes(c.voorkeur));
    const object =
      kandidaten.length === 1
        ? kandidaten[0]
        : kandidaten.find((o) => o.name.trim().toLowerCase() === precies) ?? (metVoorkeur.length === 1 ? metVoorkeur[0] : null);
    if (!object) {
      problemen.push(`${c.complex}: ${kandidaten.length === 0 ? 'geen object gevonden' : `niet duidelijk welk object (${kandidaten.map((o) => o.name).join(', ')})`}, overgeslagen. Maak hem met de hand aan.`);
      continue;
    }
    const bestaand = await prisma.inspectie.findFirst({ where: { objectId: object.id, sjabloon: 'markering', deletedAt: null }, select: { id: true, nummerJaar: true, volgnummer: true } });
    if (bestaand) {
      problemen.push(`${c.complex}: op ${object.name} staat al een Markering (${bestaand.volgnummer ? nummer(bestaand.nummerJaar, bestaand.volgnummer) : `INS-${bestaand.id}`}), overgeslagen.`);
      continue;
    }
    plan.push({ ...c, object });
  }

  console.log(`Klant: ${klant.naam}\n`);
  for (const p of plan) {
    console.log(`Nieuw: Markering op ${p.object.name}, ${p.locaties.length} ${p.locaties.length === 1 ? 'locatie' : 'locaties'}`);
    for (const [titel, locatie] of p.locaties) console.log(`    ${titel} | ${locatie}`);
  }
  for (const m of problemen) console.log(`Let op: ${m}`);
  if (plan.length === 0) {
    console.log('\nNiets te doen. Er is niets gewijzigd.');
    process.exit(0);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const antwoord = (await rl.question(`\n${plan.length} inspecties aanmaken? Typ ja en Enter: `)).trim().toLowerCase();
  rl.close();
  if (antwoord !== 'ja') {
    console.log('Afgebroken. Er is niets gewijzigd.');
    process.exit(0);
  }

  const datum = vandaag();
  const jaar = datum.getUTCFullYear();
  for (const p of plan) {
    const gemaakt = await prisma.$transaction(async (tx) => {
      const max = await tx.inspectie.aggregate({ where: { nummerJaar: jaar }, _max: { volgnummer: true } });
      const volgnummer = (max._max.volgnummer ?? 0) + 1;
      const insp = await tx.inspectie.create({
        data: {
          nummerJaar: jaar,
          volgnummer,
          sjabloon: 'markering',
          klantId: klant.id,
          objectId: p.object.id,
          datum,
          uitvoerder: UITVOERDER,
          instellingen: INSTELLINGEN,
          items: {
            create: p.locaties.map(([titel, locatie, notitie], n) => ({ volgorde: n + 1, titel, locatie, notitie, waarden: {} })),
          },
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          username: 'script',
          action: 'CREATE_INSPECTIE',
          details: JSON.stringify({ id: insp.id, sjabloon: 'markering', klantId: klant.id, objectId: p.object.id, bron: 'scripts/markering-klaarzetten.mjs', locaties: p.locaties.length }),
        },
      });
      return { id: insp.id, volgnummer };
    });
    console.log(`Aangemaakt: ${nummer(jaar, gemaakt.volgnummer)} op ${p.object.name}`);
  }
  console.log('\nKlaar. De inspecties staan als concept in de portal en in de planning bij Nog in te plannen.');
} finally {
  await prisma.$disconnect();
}
