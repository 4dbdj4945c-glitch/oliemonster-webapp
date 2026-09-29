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
  await prisma.sampleObject.deleteMany();
  await prisma.uitnodiging.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  const gebruikers: Record<string, number> = {};
  for (const [sleutel, g] of Object.entries(NEP_GEBRUIKERS)) {
    const user = await prisma.user.create({
      data: {
        username: g.username,
        password: g.wachtwoord ? await bcrypt.hash(g.wachtwoord, 4) : null,
        role: g.role,
        viewYear: g.viewYear,
        requiresPasswordChange: g.wachtwoord === null,
      },
    });
    gebruikers[sleutel] = user.id;
  }

  const objecten = [];
  for (const o of OBJECTEN) {
    objecten.push(await prisma.sampleObject.create({ data: { ...o, address: `${o.name}, Nederland` } }));
  }

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

  return { gebruikers, objecten: objecten.map((o) => o.id), monsters, verwijderd: verwijderd.id };
}
