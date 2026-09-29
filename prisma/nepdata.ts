// Nepdata voor de lokale ontwikkel- en testdatabase. Wordt gebruikt door
// prisma/seed.ts (npm run seed) en door de route-tests in tests/.
//
// Wist eerst ALLES in de database. Daarom weigert het te draaien tegen iets
// anders dan een database op deze computer (zie magLokaalWissen).

import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export const NEP_GEBRUIKERS = {
  admin: { username: 'admin', wachtwoord: 'admin123', role: 'admin', viewYear: null },
  gebruiker: { username: 'gebruiker', wachtwoord: 'user123', role: 'user', viewYear: null },
  // Zoals de Mourik-kijker: alleen lezen, alleen 2025, eigen wachtwoord.
  kijker: { username: 'kijker', wachtwoord: 'kijker123', role: 'alleen_lezen', viewYear: 2025 },
  // Nog geen wachtwoord: moet eerst via een uitnodigingslink.
  nieuw: { username: 'nieuw', wachtwoord: null, role: 'user', viewYear: null },
} as const;

/** true als de URL naar een database op deze computer wijst. */
export function magLokaalWissen(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

const OBJECTEN = [
  { name: 'Sluis Grave', region: 'Brabant / Gelderland', objectType: 'sluis', lat: 51.7613, lng: 5.7369, estimatedMinutes: 90 },
  { name: 'Sluis Lith', region: 'Brabant / Gelderland', objectType: 'sluis', lat: 51.8098, lng: 5.4354, estimatedMinutes: null },
  { name: 'Sluis Sambeek', region: 'Noord-Limburg', objectType: 'sluis', lat: 51.6419, lng: 5.9563, estimatedMinutes: null },
  { name: 'Sluis Belfeld', region: 'Noord-Limburg', objectType: 'sluis', lat: 51.3084, lng: 6.1159, estimatedMinutes: 60 },
  { name: 'Sluis Roermond', region: 'Midden-Limburg', objectType: 'sluis', lat: 51.1845, lng: 5.9601, estimatedMinutes: null },
  { name: 'Stuw Borgharen', region: 'Maastricht', objectType: 'stuw', lat: 50.8781, lng: 5.6877, estimatedMinutes: null },
];

const ONDERDELEN = [
  'Hydrauliekaggregaat hefdeur boven',
  'Hydrauliekaggregaat hefdeur beneden',
  'Tandwielkast aandrijving schuif',
  'Cilinder puntdeur links',
];

/** Wist de database en vult hem met een vaste set nepdata. Geeft de ids terug. */
export async function vulMetNepdata(prisma: PrismaClient) {
  // Volgorde: eerst wat naar iets anders verwijst.
  await prisma.samplePlanStop.deleteMany();
  await prisma.samplePlan.deleteMany();
  await prisma.sampleAttempt.deleteMany();
  await prisma.oilSample.deleteMany();
  await prisma.installatie.deleteMany();
  await prisma.sampleObject.deleteMany();
  await prisma.uitnodiging.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.contactpersoon.deleteMany();
  await prisma.klant.deleteMany();

  // Klanten: Mourik (zoals de migratie hem aanmaakt) en een tweede, verzonnen klant.
  const mourik = await prisma.klant.create({
    data: { naam: 'Mourik Infra B.V.', adres: 'Trambaan 15', postcode: '6101 AJ', plaats: 'Echt' },
  });
  const tweede = await prisma.klant.create({
    data: {
      naam: 'Kempen Metaalbewerking B.V.',
      adres: 'Industrieweg 8',
      postcode: '5500 AA',
      plaats: 'Veldhoven',
      kvkNummer: '12345678',
      notities: 'Nepdata: tweede klant om mee te testen.',
    },
  });
  await prisma.contactpersoon.createMany({
    data: [
      { klantId: mourik.id, naam: 'Jan de Vries', functie: 'Projectleider', email: 'jan.devries@example.com', telefoon: '06 12345678' },
      { klantId: mourik.id, naam: 'Els Janssen', functie: 'Werkvoorbereider', email: 'els.janssen@example.com' },
      { klantId: tweede.id, naam: 'Piet Verhoeven', functie: 'Technisch dienst', telefoon: '040 1234567' },
    ],
  });

  const gebruikers: Record<string, number> = {};
  for (const [sleutel, g] of Object.entries(NEP_GEBRUIKERS)) {
    const user = await prisma.user.create({
      data: {
        username: g.username,
        password: g.wachtwoord ? await bcrypt.hash(g.wachtwoord, 4) : null,
        role: g.role,
        viewYear: g.viewYear,
        requiresPasswordChange: g.wachtwoord === null,
        klantId: g.role === 'alleen_lezen' ? mourik.id : null,
      },
    });
    gebruikers[sleutel] = user.id;
  }

  const objecten = [];
  for (const o of OBJECTEN) {
    objecten.push(await prisma.sampleObject.create({ data: { ...o, address: `${o.name}, Nederland`, klantId: mourik.id } }));
  }
  const werkplaats = await prisma.sampleObject.create({
    data: { name: 'Werkplaats Veldhoven', objectType: 'overig', address: 'Industrieweg 8, Veldhoven', klantId: tweede.id },
  });

  // Installaties: twee aggregaten op Sluis Grave, een pers en een compressor bij de tweede klant.
  const installaties = [
    await prisma.installatie.create({
      data: { objectId: objecten[0].id, code: 'GRV2AB', naam: 'Aggregaat hefdeur boven', soort: 'aggregaat', merk: 'Bosch Rexroth', typenummer: 'ABPAC-100', bouwjaar: 2009, serienummer: 'R9-44871' },
    }),
    await prisma.installatie.create({
      data: { objectId: objecten[0].id, code: 'GRV3CD', naam: 'Aggregaat hefdeur beneden', soort: 'aggregaat', merk: 'Bosch Rexroth', bouwjaar: 2009 },
    }),
    await prisma.installatie.create({
      data: { objectId: werkplaats.id, code: 'KMP4EF', naam: 'Kantpers 1', soort: 'pers', merk: 'Safan', typenummer: 'E-Brake 100', bouwjaar: 2015 },
    }),
    await prisma.installatie.create({
      data: { objectId: werkplaats.id, code: 'KMP5GH', naam: 'Schroefcompressor', soort: 'compressor', merk: 'Atlas Copco', typenummer: 'GA 15', notities: 'Staat in de technische ruimte achter hal 2.' },
    }),
  ];

  // Per jaar per object twee monsters: 12 per jaar.
  const monsters: Record<number, number[]> = { 2025: [], 2026: [] };
  for (const jaar of [2025, 2026]) {
    let n = 1;
    for (const [i, object] of objecten.entries()) {
      for (let k = 0; k < 2; k++) {
        const oNumber = `O-${jaar}-${String(n).padStart(3, '0')}`;
        const onderdeel = ONDERDELEN[(i + k) % ONDERDELEN.length];
        // 2025 is af (op één geannuleerd na); in 2026 staat de helft nog open.
        const genomen = jaar === 2025 ? n !== 5 : n <= 5;
        const geannuleerd = (jaar === 2025 && n === 5) || (jaar === 2026 && n === 12);
        const onbereikbaar = jaar === 2026 && n === 8;
        const datum = new Date(Date.UTC(jaar, 3, 1 + n));
        const monster = await prisma.oilSample.create({
          data: {
            oNumber,
            analysisYear: jaar,
            location: object.name,
            description: onderdeel,
            oilType: k === 0 ? 'HLP 46' : 'CLP 220',
            objectId: object.id,
            // De eerste twee monsters van Sluis Grave horen bij een installatie.
            installatieId: i === 0 ? installaties[k].id : null,
            isTaken: genomen && !geannuleerd,
            sampleDate: genomen && !geannuleerd ? datum : null,
            isDisabled: geannuleerd,
            cancelReason: geannuleerd ? 'Installatie buiten bedrijf' : null,
            cancelledAt: geannuleerd ? datum : null,
            cancelledBy: geannuleerd ? 'admin' : null,
            isUnreachable: onbereikbaar,
            unreachableReason: onbereikbaar ? 'Afzetting' : null,
            unreachableNote: onbereikbaar ? 'Kade afgezet voor werkzaamheden' : null,
            unreachableAt: onbereikbaar ? datum : null,
            unreachableBy: onbereikbaar ? 'admin' : null,
          },
        });
        if (genomen && !geannuleerd) {
          await prisma.sampleAttempt.create({
            data: { oilSampleId: monster.id, sampleDate: datum, isTaken: true, remarks: 'Monster zonder bijzonderheden' },
          });
        }
        monsters[jaar].push(monster.id);
        n++;
      }
    }
  }

  // Eén monster in de prullenbak (2026), telt nergens meer mee.
  const verwijderd = await prisma.oilSample.create({
    data: {
      oNumber: 'O-2026-099',
      analysisYear: 2026,
      location: 'Sluis Grave',
      description: 'Per ongeluk aangemaakt',
      isTaken: false,
      objectId: objecten[0].id,
      deletedAt: new Date(Date.UTC(2026, 3, 20)),
      deletedBy: 'admin',
    },
  });

  // Planning 2026: twee werkdagen met de objecten die nog open staan.
  const dag1 = await prisma.samplePlan.create({
    data: { date: new Date('2026-10-05T00:00:00'), analysisYear: 2026 },
  });
  const dag2 = await prisma.samplePlan.create({
    data: { date: new Date('2026-10-06T00:00:00'), analysisYear: 2026, notes: 'Sleutel ophalen bij de sluiswachter' },
  });
  await prisma.samplePlanStop.createMany({
    data: [
      { planId: dag1.id, objectId: objecten[2].id, orderIndex: 0 },
      { planId: dag1.id, objectId: objecten[3].id, orderIndex: 1 },
      { planId: dag2.id, objectId: objecten[4].id, orderIndex: 0 },
      { planId: dag2.id, objectId: objecten[5].id, orderIndex: 1, plannedMinutes: 45 },
    ],
  });

  return {
    gebruikers,
    klanten: { mourik: mourik.id, tweede: tweede.id },
    objecten: objecten.map((o) => o.id),
    werkplaats: werkplaats.id,
    installaties: installaties.map((x) => x.id),
    monsters,
    verwijderd: verwijderd.id,
  };
}
