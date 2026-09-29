// Nepdata voor de lokale ontwikkel- en testdatabase. Wordt gebruikt door
// prisma/seed.ts (npm run seed) en door de route-tests in tests/.
//
// Wist eerst ALLES in de database. Daarom weigert het te draaien tegen iets
// anders dan een database op deze computer (zie magLokaalWissen).

import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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
  await prisma.verzending.deleteMany();
  await prisma.agendaFeed.deleteMany();
  await prisma.dagrapportFoto.deleteMany();
  await prisma.dagrapport.deleteMany();
  await prisma.samplePlanStop.deleteMany();
  await prisma.contractTaakUitvoering.deleteMany();
  await prisma.contractTaak.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.inspectieItem.deleteMany();
  await prisma.inspectie.deleteMany();
  await prisma.eigenDocument.deleteMany();
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
    data: { name: 'Werkplaats Veldhoven', objectType: 'overig', address: 'Industrieweg 8, Veldhoven', lat: 51.4072, lng: 5.4046, klantId: tweede.id },
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
  // Alleen K-2026-05: het niet bereikbare monster staat nog niet opnieuw op de planning.
  await prisma.samplePlanStop.create({
    data: { planId: dag3.id, objectId: werkplaats.id, orderIndex: 0, plannedMinutes: 60, sampleIds: JSON.stringify([tweedeMonsters[2026][4]]) },
  });

  // Acquisitie: een actie die te laat is, een voor vandaag en een voor later.
  await prisma.prospect.createMany({
    data: [
      { bedrijfsnaam: 'Kunststofpers Brabant', plaats: 'Tilburg', status: 'BENADERD', telefoon: '013 1234567', contactpersoon: 'Ruud Martens', volgendeActie: 'Nabellen over de eerste mail', volgendeActieOp: kalenderdagVanaf(-2), segment: 'industrie' },
      { bedrijfsnaam: 'Metaalbewerking De Kempen', plaats: 'Eersel', status: 'GESPREK', email: 'info@example.com', volgendeActie: 'Voorstel keuring arbeidsmiddelen sturen', volgendeActieOp: kalenderdagVanaf(0), segment: 'industrie' },
      { bedrijfsnaam: 'Loonbedrijf Heezerveld', plaats: 'Heeze', status: 'NIEUW', volgendeActie: 'Eerste mail sturen', volgendeActieOp: kalenderdagVanaf(5), segment: 'dienstverlener' },
    ],
  });

  // Inspecties (fase 4). De tweede klant: een afgeronde lekkeninspectie en een
  // afgeronde inspectie arbeidsmiddelen (met een luchtketel boven 2.500 liter),
  // plus een concept dat de kijker kempen niet ziet. Mourik: een concept, dat
  // geen enkele kijker ziet.
  const inspectieDag = (n: number) => {
    const d = dagVanaf(n);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12));
  };
  const lekken = await prisma.inspectie.create({
    data: {
      sjabloon: 'persluchtlekken',
      klantId: tweede.id,
      objectId: werkplaats.id,
      datum: inspectieDag(-21),
      uitvoerder: 'Roel Mandigers',
      status: 'afgerond',
      afgerondOp: inspectieDag(-20),
      afgerondDoor: 'admin',
      samenvatting: 'Persluchtnet van hal 1 en 2 nagelopen met de ultrasone lekdetector. De grootste lekken zitten bij de snelkoppelingen aan de werkbanken.',
      instellingen: { drukBar: 7, draaiuren: 4000, prijsmodel: 'kwh', prijsKwh: 0.25, prijsM3: 0.025, kwhPerM3: null, co2PerKwh: 0.268 },
      volgendeOp: inspectieDag(344),
      items: {
        create: [
          { volgorde: 1, titel: '101', locatie: 'Hal 1, snelkoppeling werkbank 3', oordeel: 'hoog', waarden: { db: 48, verliesLpm: 95 }, fotoUrl: '/nepdata/lek-1.jpg', gerepareerd: true, gerepareerdOp: inspectieDag(-14) },
          { volgorde: 2, titel: '102', locatie: 'Hal 1, slang boven kantpers', oordeel: 'hoog', waarden: { db: 45, verliesLpm: 70 }, fotoUrl: '/nepdata/lek-2.jpg' },
          { volgorde: 3, titel: '103', locatie: 'Hal 2, ventiel verdeelblok', oordeel: 'middel', waarden: { db: 38, verliesLpm: 32 }, fotoUrl: '/nepdata/lek-3.jpg', gerepareerd: true, gerepareerdOp: inspectieDag(-14) },
          { volgorde: 4, titel: '104', locatie: 'Hal 2, filter-regelaar', oordeel: 'middel', waarden: { db: 34, verliesLpm: 18 } },
          { volgorde: 5, titel: '105', locatie: 'Technische ruimte, condensaatafvoer', oordeel: 'laag', waarden: { db: 29, verliesLpm: 9 }, notitie: 'Afvoer staat half open, bij de volgende onderhoudsbeurt afstellen.' },
          { volgorde: 6, titel: '106', locatie: 'Hal 2, koppeling spuitcabine', oordeel: 'laag', waarden: { db: 27, verliesLpm: 6 } },
        ],
      },
    },
  });
  const [kantpersInst, compressorInst] = [installaties[2], installaties[3]];
  const arbeidsmiddelen = await prisma.inspectie.create({
    data: {
      sjabloon: 'arbeidsmiddelen',
      klantId: tweede.id,
      objectId: werkplaats.id,
      datum: inspectieDag(-10),
      uitvoerder: 'Roel Mandigers',
      status: 'afgerond',
      afgerondOp: inspectieDag(-10),
      afgerondDoor: 'admin',
      samenvatting: 'Drie arbeidsmiddelen in orde of met een kleine actie. De grote luchtketel in hal 3 valt buiten deze inspectie en moet door een aangewezen instelling worden gekeurd.',
      instellingen: { norm: 'NEN-EN-ISO 4413 (hydrauliek), NEN-EN-ISO 4414 (pneumatiek) en het voorschrift van de fabrikant' },
      volgendeOp: inspectieDag(355),
      items: {
        create: [
          {
            volgorde: 1, titel: 'Kantpers 1', installatieId: kantpersInst.id, locatie: 'Hal 1', oordeel: 'in-orde', fotoUrl: '/nepdata/arbeidsmiddel-1.jpg',
            waarden: { werkdrukBar: 210, checklist: { slangen: 'goed', lekkage: 'goed', leidingen: 'goed', beveiliging: 'goed', manometer: 'goed', bediening: 'goed', afscherming: 'goed', olie: 'goed', filters: 'goed', markering: 'goed' } },
            volgendeOp: inspectieDag(355),
          },
          {
            volgorde: 2, titel: 'Schroefcompressor', installatieId: compressorInst.id, locatie: 'Technische ruimte', oordeel: 'actie-nodig',
            notitie: 'Condensaatafvoer lekt, afvoer vervangen. Verder in orde.',
            waarden: { werkdrukBar: 8, ketelLiter: 500, ketelBar: 11, checklist: { slangen: 'goed', lekkage: 'niet-goed', leidingen: 'goed', beveiliging: 'goed', manometer: 'goed', bediening: 'goed', afscherming: 'goed', olie: 'goed', filters: 'goed', markering: 'goed' } },
            volgendeOp: inspectieDag(172),
          },
          {
            volgorde: 3, titel: 'Heftafel werkbank 2', locatie: 'Hal 2', oordeel: 'in-orde',
            waarden: { werkdrukBar: 160, checklist: { slangen: 'goed', lekkage: 'goed', leidingen: 'goed', beveiliging: 'nvt', manometer: 'nvt', bediening: 'goed', afscherming: 'goed', olie: 'goed', filters: 'nvt', markering: 'goed' } },
            volgendeOp: inspectieDag(355),
          },
          {
            volgorde: 4, titel: 'Luchtketel hal 3', locatie: 'Hal 3, buitenwand', oordeel: 'actie-nodig', fotoUrl: '/nepdata/arbeidsmiddel-2.jpg',
            notitie: 'Ketel valt onder de keuringsplicht van een aangewezen instelling. Alleen visueel bekeken.',
            waarden: { ketelLiter: 3000, ketelBar: 11, checklist: { lekkage: 'goed', manometer: 'goed', markering: 'goed' } },
            volgendeOp: inspectieDag(355),
          },
        ],
      },
    },
  });
  const conceptTweede = await prisma.inspectie.create({
    data: { sjabloon: 'persluchtlekken', klantId: tweede.id, objectId: werkplaats.id, datum: inspectieDag(0), uitvoerder: 'Roel Mandigers', instellingen: { drukBar: 7, draaiuren: 4000, prijsmodel: 'kwh' } },
  });
  const conceptMourik = await prisma.inspectie.create({
    data: {
      sjabloon: 'arbeidsmiddelen',
      klantId: mourik.id,
      objectId: objecten[0].id,
      installatieId: installaties[0].id,
      datum: inspectieDag(-2),
      uitvoerder: 'Roel Mandigers',
      items: { create: [{ volgorde: 1, titel: 'Aggregaat hefdeur boven', installatieId: installaties[0].id, oordeel: 'in-orde', waarden: { werkdrukBar: 180, checklist: { slangen: 'goed', lekkage: 'goed' } }, volgendeOp: inspectieDag(363) }] },
    },
  });

  // Contracten (fase 5). De tweede klant: een onderhoudscontract met vier
  // terugkerende taken. De lekkeninspectie en de inspectie arbeidsmiddelen zijn
  // al een keer uitgevoerd (door de afgeronde inspecties hierboven), het
  // halfjaarlijkse onderhoud van de compressor staat vandaag op de planning en
  // de oliemonsters zijn drie dagen te laat. Mourik: een contract met een taak
  // ver weg. Alleen de dag telt (12:00 UTC, net als bij de inspecties).
  const plusMaanden = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate(), 12));
  const contractTweede = await prisma.contract.create({
    data: {
      klantId: tweede.id,
      naam: 'Onderhoudscontract werkplaats',
      startOp: inspectieDag(-60),
      eindOp: inspectieDag(670),
      notities: 'Intern: vaste prijs per bezoek afgesproken, voorrijkosten inbegrepen.',
    },
  });
  const taakLekken = await prisma.contractTaak.create({
    data: { contractId: contractTweede.id, soort: 'persluchtlekken', objectId: werkplaats.id, intervalMaanden: 12, volgendeOp: plusMaanden(inspectieDag(-21), 12), laatstUitgevoerdOp: inspectieDag(-21) },
  });
  await prisma.contractTaakUitvoering.create({
    data: { taakId: taakLekken.id, datum: inspectieDag(-21), bron: `inspectie-${lekken.id}`, vorigeOp: inspectieDag(-25), volgendeOp: plusMaanden(inspectieDag(-21), 12), door: 'admin' },
  });
  const taakArbeidsmiddelen = await prisma.contractTaak.create({
    data: { contractId: contractTweede.id, soort: 'arbeidsmiddelen', objectId: werkplaats.id, intervalMaanden: 12, volgendeOp: plusMaanden(inspectieDag(-10), 12), laatstUitgevoerdOp: inspectieDag(-10) },
  });
  await prisma.contractTaakUitvoering.create({
    data: { taakId: taakArbeidsmiddelen.id, datum: inspectieDag(-10), bron: `inspectie-${arbeidsmiddelen.id}`, vorigeOp: inspectieDag(-5), volgendeOp: plusMaanden(inspectieDag(-10), 12), door: 'admin' },
  });
  const taakCompressor = await prisma.contractTaak.create({
    data: {
      contractId: contractTweede.id,
      soort: 'onderhoud',
      omschrijving: 'Halfjaarlijks onderhoud schroefcompressor',
      objectId: werkplaats.id,
      installatieId: installaties[3].id,
      intervalMaanden: 6,
      volgendeOp: inspectieDag(0),
      geschatteMinuten: 90,
      notities: 'Intern: filterset vooraf bestellen bij de leverancier.',
    },
  });
  const taakOlie = await prisma.contractTaak.create({
    data: { contractId: contractTweede.id, soort: 'oliemonsters', omschrijving: 'Oliemonsters kantpers en compressor', objectId: werkplaats.id, intervalMaanden: 6, volgendeOp: inspectieDag(-3) },
  });
  const contractMourik = await prisma.contract.create({
    data: { klantId: mourik.id, naam: 'Oliemonstername kunstwerken', startOp: inspectieDag(-200), notities: 'Intern: gegund, twintig dagen per jaar.' },
  });
  const taakMourik = await prisma.contractTaak.create({
    data: { contractId: contractMourik.id, soort: 'oliemonsters', omschrijving: 'Jaarlijkse monstername', objectId: objecten[0].id, intervalMaanden: 12, volgendeOp: inspectieDag(190), geschatteMinuten: 480 },
  });
  // Het onderhoud van de compressor staat vandaag op de planning, achteraan de monsterdag.
  const taakStop = await prisma.samplePlanStop.create({
    data: { planId: dag1.id, objectId: werkplaats.id, orderIndex: 2, taakId: taakCompressor.id },
  });

  // Dagrapporten (fase 5): een getekend rapport bij de tweede klant (dat ziet de
  // kijker kempen in zijn portaal) en een concept bij Mourik (dat ziet niemand
  // buiten It's Done Services).
  const handtekening = `data:image/png;base64,${readFileSync(path.join(process.cwd(), 'public', 'nepdata', 'handtekening.png')).toString('base64')}`;
  const dagrapportTweede = await prisma.dagrapport.create({
    data: {
      klantId: tweede.id,
      objectId: werkplaats.id,
      datum: inspectieDag(-21),
      uitvoerder: 'Roel Mandigers',
      werkzaamheden: 'Persluchtnet hal 1 en 2 nagelopen op lekken, drie lekken gelabeld. Twee snelkoppelingen direct vervangen.',
      bevindingen: 'Lek bij het verdeelblok in hal 2 moet nog gerepareerd worden; onderdeel besteld.',
      minuten: 150,
      status: 'getekend',
      handtekening,
      getekendDoor: 'Piet Verhoeven',
      getekendOp: inspectieDag(-21),
      fotos: { create: [{ url: '/nepdata/lek-1.jpg', bijschrift: 'Lek 101, snelkoppeling werkbank 3', volgorde: 1 }, { url: '/nepdata/lek-3.jpg', bijschrift: 'Lek 103, verdeelblok', volgorde: 2 }] },
    },
  });
  const dagrapportMourik = await prisma.dagrapport.create({
    data: { klantId: mourik.id, planId: dag1.id, objectId: objecten[2].id, datum: inspectieDag(0), uitvoerder: 'Roel Mandigers', werkzaamheden: 'Monstername Sluis Sambeek.', minuten: 60 },
  });

  // Eigen dossier: VCA verloopt binnen 30 dagen, de kalibratie is verlopen.
  await prisma.eigenDocument.createMany({
    data: [
      { soort: 'vca', titel: 'VCA Basis', uitgever: 'SSVV', nummer: 'VCA-1234567', afgegevenOp: inspectieDag(-3630), vervaltOp: inspectieDag(20), bestandUrl: '/nepdata/document-vca.pdf', bestandNaam: 'vca.pdf', bestandType: 'application/pdf' },
      { soort: 'verzekering', titel: 'Beroeps- en bedrijfsaansprakelijkheid', uitgever: 'Voorbeeldverzekeraar', nummer: 'POL-778899', afgegevenOp: inspectieDag(-200), vervaltOp: inspectieDag(165), bestandUrl: '/nepdata/document-polis.pdf', bestandNaam: 'polis.pdf', bestandType: 'application/pdf' },
      { soort: 'kvk', titel: 'Uittreksel Kamer van Koophandel', uitgever: 'KvK', afgegevenOp: inspectieDag(-40), vervaltOp: inspectieDag(325), bestandUrl: '/nepdata/document-kvk.pdf', bestandNaam: 'kvk.pdf', bestandType: 'application/pdf', notities: 'Opdrachtgevers willen meestal een uittreksel van hooguit een jaar oud.' },
      { soort: 'diploma', titel: 'MBO 4 Mechatronica', uitgever: 'Summa College', afgegevenOp: inspectieDag(-6000), bestandUrl: '/nepdata/diploma.jpg', bestandNaam: 'diploma.jpg', bestandType: 'image/jpeg' },
      { soort: 'cursus', titel: 'Slangen en koppelingen, NPR 5527', uitgever: 'Voorbeeldopleider', afgegevenOp: inspectieDag(-400), vervaltOp: inspectieDag(695), bestandUrl: '/nepdata/document-cursus.pdf', bestandNaam: 'cursus.pdf', bestandType: 'application/pdf' },
      { soort: 'kalibratie', titel: 'Kalibratie ultrasone lekdetector', uitgever: 'Voorbeeld kalibratielab', nummer: 'KAL-2025-031', afgegevenOp: inspectieDag(-370), vervaltOp: inspectieDag(-5), bestandUrl: '/nepdata/document-kalibratie.pdf', bestandNaam: 'kalibratie.pdf', bestandType: 'application/pdf' },
    ],
  });

  return {
    gebruikers,
    klanten: { mourik: mourik.id, tweede: tweede.id },
    inspecties: { lekken: lekken.id, arbeidsmiddelen: arbeidsmiddelen.id, conceptTweede: conceptTweede.id, conceptMourik: conceptMourik.id },
    contracten: { tweede: contractTweede.id, mourik: contractMourik.id },
    taken: { lekken: taakLekken.id, arbeidsmiddelen: taakArbeidsmiddelen.id, compressor: taakCompressor.id, olie: taakOlie.id, mourik: taakMourik.id },
    taakStop: taakStop.id,
    dagen: { vandaag: dag1.id, overmorgen: dag2.id, volgendeWeek: dag3.id },
    dagrapporten: { tweede: dagrapportTweede.id, mourik: dagrapportMourik.id },
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
