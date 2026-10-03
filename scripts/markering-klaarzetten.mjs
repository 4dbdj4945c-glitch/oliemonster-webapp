// Eenmalig (3 okt 2026): zet voor de opdracht "markeren met stickers" (memo
// 31137033-MEM-03786) per complex een concept-inspectie Markering klaar, met
// alle locaties uit de werklijst
// (Documents/Claude/Klanten/Mourik/Markeren met stickers - werklijst.md).
//
// Staat er op het object al een Markering die nog concept is (Grave, met de
// hand aangemaakt), dan vult het die aan: de bronnen die er nog niet in staan
// (herkend aan "Bron 6" in de titel) en de rapportgegevens die nog leeg zijn.
// Wat er al staat (locaties, uitslagen, foto's, ingevulde gegevens) blijft
// ongemoeid. Een afgeronde Markering wordt niet aangeraakt.
//
// Draaien via ./markering-klaarzetten.sh. Laat eerst zien wat het gaat doen en
// vraagt dan om bevestiging. Vaker draaien maakt niets dubbel.
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
    complex: 'Grave',
    naam: 'Sluis Grave',
    zoek: ['grave'],
    voorkeur: 'sluis',
    locaties: [
      ['Bron 6: pakkingen', 'Technische kast in voorlichtingsruimte, dienstengebouw', 'Volgens rapport 13 stuks (p. 14)'],
      ['Bron 9: textiel (kabelmantel)', 'Kast in NSA-ruimte, dienstengebouw', 'Volgens rapport 8 m1 (p. 15)'],
      ['Bron 15: aandrijvingen van stuw', 'Kruipruimte trafo, dienstengebouw', 'Volgens rapport 20 stuks (p. 15)'],
    ],
  },
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

/** "Bron 6: pakkingen" en "bron6" geven allebei "6"; zonder bronnummer null. */
function bronNummer(titel) {
  const m = /bron\s*(\d+)/i.exec(titel ?? '');
  return m ? m[1] : null;
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
    const bestaande = await prisma.inspectie.findMany({
      where: { objectId: object.id, sjabloon: 'markering', deletedAt: null },
      orderBy: { id: 'asc' },
      select: { id: true, nummerJaar: true, volgnummer: true, status: true, instellingen: true, items: { where: { deletedAt: null }, select: { titel: true, volgorde: true } } },
    });
    if (bestaande.length === 0) {
      plan.push({ ...c, object, soort: 'nieuw' });
      continue;
    }
    const concepten = bestaande.filter((b) => b.status === 'concept');
    const naamVan = (b) => (b.volgnummer ? nummer(b.nummerJaar, b.volgnummer) : `INS-${b.id}`);
    if (concepten.length !== 1) {
      problemen.push(`${c.complex}: op ${object.name} staan ${concepten.length === 0 ? 'alleen afgeronde' : 'meer concept-'}Markeringen (${bestaande.map(naamVan).join(', ')}), overgeslagen.`);
      continue;
    }
    const b = concepten[0];
    const bronnen = new Set(b.items.map((i) => bronNummer(i.titel)).filter(Boolean));
    const ontbrekend = c.locaties.filter(([titel]) => !bronnen.has(bronNummer(titel)));
    const huidig = b.instellingen && typeof b.instellingen === 'object' ? b.instellingen : {};
    const leeg = Object.keys(INSTELLINGEN).filter((k) => !(typeof huidig[k] === 'string' && huidig[k].trim()) || (k === 'markering' && huidig[k] === 'Waarschuwingssticker'));
    if (ontbrekend.length === 0 && leeg.length === 0) {
      problemen.push(`${c.complex}: ${naamVan(b)} op ${object.name} is al compleet, niets te doen.`);
      continue;
    }
    plan.push({ ...c, object, soort: 'aanvullen', inspectie: b, naam: naamVan(b), ontbrekend, leeg, huidig, bestaandeItems: b.items });
  }

  console.log(`Klant: ${klant.naam}\n`);
  for (const p of plan) {
    if (p.soort === 'nieuw') {
      console.log(`Nieuw: Markering op ${p.object.name}, ${p.locaties.length} ${p.locaties.length === 1 ? 'locatie' : 'locaties'}`);
      for (const [titel, locatie] of p.locaties) console.log(`    ${titel} | ${locatie}`);
    } else {
      console.log(`Aanvullen: ${p.naam} op ${p.object.name} (staat er al in: ${p.bestaandeItems.length ? p.bestaandeItems.map((i) => i.titel).join(', ') : 'geen locaties'})`);
      for (const [titel, locatie] of p.ontbrekend) console.log(`    erbij: ${titel} | ${locatie}`);
      if (p.leeg.length) console.log(`    gegevens voor het rapport invullen: ${p.leeg.join(', ')}`);
    }
  }
  for (const m of problemen) console.log(`Let op: ${m}`);
  if (plan.length === 0) {
    console.log('\nNiets te doen. Er is niets gewijzigd.');
    process.exit(0);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const nieuw = plan.filter((p) => p.soort === 'nieuw').length;
  const aan = plan.length - nieuw;
  const vraag = [nieuw ? `${nieuw} ${nieuw === 1 ? 'inspectie' : 'inspecties'} aanmaken` : null, aan ? `${aan} aanvullen` : null].filter(Boolean).join(' en ');
  const antwoord = (await rl.question(`\n${vraag}? Typ ja en Enter: `)).trim().toLowerCase();
  rl.close();
  if (antwoord !== 'ja') {
    console.log('Afgebroken. Er is niets gewijzigd.');
    process.exit(0);
  }

  const datum = vandaag();
  const jaar = datum.getUTCFullYear();
  for (const p of plan) {
    if (p.soort === 'aanvullen') {
      await prisma.$transaction(async (tx) => {
        const start = Math.max(0, ...p.bestaandeItems.map((i) => i.volgorde)) + 1;
        const instellingen = { ...p.huidig };
        for (const k of p.leeg) instellingen[k] = INSTELLINGEN[k];
        await tx.inspectie.update({
          where: { id: p.inspectie.id },
          data: {
            instellingen,
            items: { create: p.ontbrekend.map(([titel, locatie, notitie], n) => ({ volgorde: start + n, titel, locatie, notitie, waarden: {} })) },
          },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: {
            username: 'script',
            action: 'UPDATE_INSPECTIE',
            details: JSON.stringify({ id: p.inspectie.id, bron: 'scripts/markering-klaarzetten.mjs', locatiesErbij: p.ontbrekend.map(([t]) => t), gegevens: p.leeg }),
          },
        });
      });
      console.log(`Aangevuld: ${p.naam} op ${p.object.name}, ${p.ontbrekend.length} ${p.ontbrekend.length === 1 ? 'locatie' : 'locaties'} erbij`);
      continue;
    }
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
