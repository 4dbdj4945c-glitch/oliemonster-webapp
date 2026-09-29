// Nepdata voor de lokale ontwikkel- en testdatabase. Wordt gebruikt door
// prisma/seed.ts (npm run seed) en door de route-tests in tests/.
//
// Wist eerst ALLES in de database. Daarom weigert het te draaien tegen iets
// anders dan een database op deze computer (zie magLokaalWissen).

import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export const NEP_GEBRUIKERS = {
  admin: { username: 'admin', wachtwoord: 'admin123', role: 'admin', viewYear: null, klant: null, weergave: 'klassiek' },
  gebruiker: { username: 'gebruiker', wachtwoord: 'user123', role: 'user', viewYear: null, klant: null, weergave: 'klassiek' },
  // Zoals de Mourik-kijker: alleen lezen, alleen 2025, eigen wachtwoord, klassieke weergave.
  kijker: { username: 'kijker', wachtwoord: 'kijker123', role: 'alleen_lezen', viewYear: 2025, klant: 'mourik', weergave: 'klassiek' },
  // Kijker van de tweede klant, met het klantportaal en alle jaren.
  kempen: { username: 'kempen', wachtwoord: 'kempen123', role: 'alleen_lezen', viewYear: null, klant: 'tweede', weergave: 'klantportaal' },
  // Nog geen wachtwoord: moet eerst via een uitnodigingslink.
  nieuw: { username: 'nieuw', wachtwoord: null, role: 'user', viewYear: null, klant: null, weergave: 'klassiek' },
} as const;

/** Nepfoto's in public/nepdata (grijze vlakken met een woord), voor de tweede klant. */
export const NEP_FOTOS = {
  potje: ['/nepdata/potje-1.jpg', '/nepdata/potje-2.jpg'],
  onderdeel: ['/nepdata/onderdeel-1.jpg', '/nepdata/onderdeel-2.jpg'],
};

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

/** Middernacht van vandaag plus n dagen, in de eigen tijdzone. */
function dagVanaf(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

/** Een kalenderdag vanaf vandaag als UTC-middernacht, zoals de prospectdatums worden opgeslagen. */
function kalenderdagVanaf(n: number): Date {
  const d = dagVanaf(n);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

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
  await prisma.prospectContactmoment.deleteMany();
  await prisma.prospect.deleteMany();
  await prisma.contactpersoon.deleteMany();
  await prisma.klant.deleteMany();

  // Klanten: Mourik (zoals de migratie hem aanmaakt) en een tweede, verzonnen klant.
  const mourik = await prisma.klant.create({
    data: { naam: 'Mourik Infra B.V.', adres: 'Trambaan 15', postcode: '6101 AJ', plaats: 'Echt', logoUrl: '/mourik_logo.png' },
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
        klantId: g.klant === 'mourik' ? mourik.id : g.klant === 'tweede' ? tweede.id : null,
        portaalWeergave: g.weergave,
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

  // De tweede klant: monsters op zijn installaties, in 2025 afgerond en in 2026
  // half, met foto's, een niet bereikbaar, een geannuleerd, een op de planning
  // en een los monster zonder object (klant via OilSample.klantId). Dit ziet de
  // kijker van Mourik nooit, en de kijker kempen alleen dit.
  const tweedeMonsters: Record<number, number[]> = { 2025: [], 2026: [] };
  const [kantpers, compressor] = [installaties[2], installaties[3]];
  const TWEEDE = [
    { jaar: 2025, nr: 'K-2025-01', inst: kantpers, genomen: true, dag: [2025, 4, 12] },
    { jaar: 2025, nr: 'K-2025-02', inst: compressor, genomen: true, dag: [2025, 4, 12] },
    { jaar: 2026, nr: 'K-2026-01', inst: kantpers, genomen: true, dag: [2026, 2, 10] },
    { jaar: 2026, nr: 'K-2026-02', inst: compressor, genomen: true, dag: [2026, 2, 10] },
    { jaar: 2026, nr: 'K-2026-03', inst: kantpers, genomen: true, dag: [2026, 5, 16] },
    { jaar: 2026, nr: 'K-2026-04', inst: compressor, onbereikbaar: true, dag: [2026, 5, 16] },
    { jaar: 2026, nr: 'K-2026-05', inst: kantpers },
    { jaar: 2026, nr: 'K-2026-06', inst: compressor, geannuleerd: true, dag: [2026, 1, 3] },
  ] as const;
  for (const [i, t] of TWEEDE.entries()) {
    const datum = 'dag' in t ? new Date(Date.UTC(t.dag[0], t.dag[1], t.dag[2])) : null;
    const genomen = 'genomen' in t && t.genomen;
    const onbereikbaar = 'onbereikbaar' in t && t.onbereikbaar;
    const geannuleerd = 'geannuleerd' in t && t.geannuleerd;
    const fotoPotje = genomen ? NEP_FOTOS.potje[i % 2] : null;
    const fotoOnderdeel = genomen ? NEP_FOTOS.onderdeel[i % 2] : null;
    const monster = await prisma.oilSample.create({
      data: {
        oNumber: t.nr,
        analysisYear: t.jaar,
        location: werkplaats.name,
        description: t.inst.naam,
        oilType: t.inst === kantpers ? 'HLP 46' : 'Roto-Inject',
        objectId: werkplaats.id,
        installatieId: t.inst.id,
        isTaken: genomen,
        sampleDate: genomen ? datum : null,
        photoUrl: fotoPotje,
        partPhotoUrl: fotoOnderdeel,
        isDisabled: geannuleerd,
        cancelReason: geannuleerd ? 'Compressor vervangen, nieuwe draait nog in' : null,
        cancelledAt: geannuleerd ? datum : null,
        cancelledBy: geannuleerd ? 'admin' : null,
        isUnreachable: onbereikbaar,
        unreachableReason: onbereikbaar ? 'Andere werkzaamheden' : null,
        unreachableNote: onbereikbaar ? 'Technische ruimte afgesloten voor een verbouwing' : null,
        unreachableAt: onbereikbaar ? datum : null,
        unreachableBy: onbereikbaar ? 'admin' : null,
      },
    });
    if (genomen) {
      await prisma.sampleAttempt.create({
        data: { oilSampleId: monster.id, sampleDate: datum, isTaken: true, photoUrl: fotoPotje, partPhotoUrl: fotoOnderdeel, remarks: 'Olie helder, geen bijzonderheden' },
      });
    }
    tweedeMonsters[t.jaar].push(monster.id);
  }
  const losMonster = await prisma.oilSample.create({
    data: { oNumber: 'K-2026-07', analysisYear: 2026, location: 'Magazijn', description: 'Heftruck, hefcilinder', isTaken: false, klantId: tweede.id },
  });
  tweedeMonsters[2026].push(losMonster.id);
  // Een monster zonder object en zonder klant: ziet geen enkele kijker.
  const zonderKlant = await prisma.oilSample.create({
    data: { oNumber: 'O-2026-200', analysisYear: 2026, location: 'Onbekend', description: 'Zonder object en klant', isTaken: false },
  });

  // Planning 2026: vandaag en overmorgen, met de objecten die nog open staan.
  // Ten opzichte van vandaag, zodat het startscherm Vandaag altijd een
  // monsterdag laat zien. Middernacht in de eigen tijdzone, zoals de API opslaat.
  const dag1 = await prisma.samplePlan.create({
    data: { date: dagVanaf(0), analysisYear: 2026 },
  });
  const dag2 = await prisma.samplePlan.create({
    data: { date: dagVanaf(2), analysisYear: 2026, notes: 'Sleutel ophalen bij de sluiswachter' },
  });
  await prisma.samplePlanStop.createMany({
    data: [
      { planId: dag1.id, objectId: objecten[2].id, orderIndex: 0 },
      { planId: dag1.id, objectId: objecten[3].id, orderIndex: 1 },
      { planId: dag2.id, objectId: objecten[4].id, orderIndex: 0 },
      { planId: dag2.id, objectId: objecten[5].id, orderIndex: 1, plannedMinutes: 45 },
    ],
  });
  // Over een week: de werkplaats van de tweede klant.
  const dag3 = await prisma.samplePlan.create({
    data: { date: dagVanaf(7), analysisYear: 2026, notes: 'Intern: sleutel bij de receptie' },
  });
  await prisma.samplePlanStop.create({ data: { planId: dag3.id, objectId: werkplaats.id, orderIndex: 0, plannedMinutes: 60 } });

  // Acquisitie: een actie die te laat is, een voor vandaag en een voor later.
  await prisma.prospect.createMany({
    data: [
      { bedrijfsnaam: 'Kunststofpers Brabant', plaats: 'Tilburg', status: 'BENADERD', telefoon: '013 1234567', contactpersoon: 'Ruud Martens', volgendeActie: 'Nabellen over de eerste mail', volgendeActieOp: kalenderdagVanaf(-2), segment: 'industrie' },
      { bedrijfsnaam: 'Metaalbewerking De Kempen', plaats: 'Eersel', status: 'GESPREK', email: 'info@example.com', volgendeActie: 'Voorstel keuring arbeidsmiddelen sturen', volgendeActieOp: kalenderdagVanaf(0), segment: 'industrie' },
      { bedrijfsnaam: 'Loonbedrijf Heezerveld', plaats: 'Heeze', status: 'NIEUW', volgendeActie: 'Eerste mail sturen', volgendeActieOp: kalenderdagVanaf(5), segment: 'dienstverlener' },
    ],
  });

  return {
    gebruikers,
    klanten: { mourik: mourik.id, tweede: tweede.id },
    objecten: objecten.map((o) => o.id),
    werkplaats: werkplaats.id,
    installaties: installaties.map((x) => x.id),
    monsters,
    tweedeMonsters,
    losMonster: losMonster.id,
    zonderKlant: zonderKlant.id,
    verwijderd: verwijderd.id,
  };
}
