// Het klantdossier (alleen admin): per object en per installatie een tijdlijn
// van alles wat er gebeurde. Alleen op de server; GET /api/klanten/[id]/dossier.
//
// Momenten, nieuwste eerst:
// - monster: een poging die genomen is (datum, opmerking, de twee foto's)
// - poging: een poging die niet genomen is (hermonstering zonder afname)
// - niet-bereikbaar: de plek was niet te bereiken (reden, omschrijving, foto)
// - geannuleerd: het monster hoeft niet meer (reden)
// - open: moet nog, met de monsterdag als het gepland is
// - inspectie: een inspectie (persluchtlekken, arbeidsmiddelen, markering), op het object
//   en, bij arbeidsmiddelen, ook per arbeidsmiddel dat een installatie is (dat
//   moment heeft `onderdeel`, zodat het bij het object niet dubbel staat)
// - dagrapport: een dagrapport van een bezoek (fase 5), bij het object als dat
//   is ingevuld, anders bij de losse momenten

import { prisma } from './prisma';
import { actiefFilter } from './verwijderdeMonsters';
import { monstersVanKlant } from './afscherming';
import { fotoAdres, metInstallatieFoto } from './fotoAdres';
import { jarenVanKlant, komendePlannen, nlDag, planOpenMonsters } from './klantOpdracht';
import { INSPECTIE_SELECT } from './inspecties/server';
import { inspectieNummer, inspectieTitel, oordeelVan, sjabloonVan, type SjabloonSleutel } from './inspecties/sjablonen';
import { uitkomstTekst, volgendeInspectie } from './inspecties/rekenen';
import { DAGRAPPORT_DOSSIER_SELECT, dagrapportNummer } from './dagrapporten';

export type MomentSoort = 'monster' | 'poging' | 'niet-bereikbaar' | 'geannuleerd' | 'open' | 'inspectie' | 'dagrapport';

export interface Moment {
  sleutel: string;
  soort: MomentSoort;
  /** jjjj-mm-dd, of null voor een open monster zonder monsterdag */
  datum: string | null;
  /** null bij een inspectie */
  monsterId: number | null;
  /** O-nummer, of bij een inspectie het nummer (INS-2026-012) */
  oNumber: string;
  jaar: number;
  objectId: number | null;
  installatieId: number | null;
  titel: string;
  tekst: string | null;
  /** Bij open: gepland of nog in te plannen */
  gepland?: boolean;
  fotos: { url: string; label: string }[];
  door: string | null;
  /** Alleen bij een inspectie */
  inspectie?: {
    id: number;
    sjabloon: string;
    status: string;
    /** Bij een moment per arbeidsmiddel: de uitslag */
    oordeel: string | null;
    volgende: string | null;
    rapport: string;
  };
  /** Moment van één arbeidsmiddel binnen een inspectie: alleen bij de installatie tonen. */
  onderdeel?: boolean;
  /** Alleen bij een dagrapport */
  dagrapport?: { id: number; status: string; getekendDoor: string | null; pdf: string };
}

/**
 * Het dossier van één jaar, of van alle jaren (null). Met 'nieuwste' het
 * jongste jaar met monsters (zonder monsters: alle jaren); dat is wat het
 * scherm de eerste keer toont, in één verzoek in plaats van twee.
 */
export async function haalDossier(klantId: number, gevraagd: number | null | 'nieuwste') {
  const jarenVerzoek = jarenVanKlant(klantId);
  const jaar = gevraagd === 'nieuwste' ? (await jarenVerzoek)[0]?.jaar ?? null : gevraagd;
  const jaarFilter = jaar !== null ? { datum: { gte: new Date(Date.UTC(jaar, 0, 1)), lt: new Date(Date.UTC(jaar + 1, 0, 1)) } } : {};

  // Alles wat niet van elkaar afhangt tegelijk.
  const [jaren, objecten, monsters, inspecties, dagrapporten, alleInspecties] = await Promise.all([
    jarenVerzoek,
    prisma.sampleObject.findMany({
      where: { klantId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        objectType: true,
        region: true,
        address: true,
        installaties: {
          where: { deletedAt: null },
          orderBy: { naam: 'asc' },
          select: { id: true, code: true, naam: true, soort: true, merk: true, typenummer: true, bouwjaar: true, serienummer: true, fotoUrl: true },
        },
      },
    }),
    prisma.oilSample.findMany({
    where: { ...(jaar !== null ? { analysisYear: jaar } : {}), ...(await actiefFilter()), ...monstersVanKlant(klantId) },
    orderBy: [{ analysisYear: 'desc' }, { oNumber: 'asc' }],
    select: {
      id: true,
      oNumber: true,
      analysisYear: true,
      description: true,
      objectId: true,
      installatieId: true,
      isTaken: true,
      isDisabled: true,
      isUnreachable: true,
      cancelReason: true,
      cancelledAt: true,
      cancelledBy: true,
      unreachableReason: true,
      unreachableNote: true,
      unreachablePhotoUrl: true,
      unreachableAt: true,
      unreachableBy: true,
      attempts: {
        orderBy: [{ sampleDate: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, sampleDate: true, isTaken: true, remarks: true, photoUrl: true, partPhotoUrl: true, createdAt: true },
      },
    },
    }),
    // Inspecties van deze klant (ook concepten: dit is het dossier van de beheerder).
    prisma.inspectie.findMany({
      where: { klantId, deletedAt: null, ...jaarFilter },
      orderBy: { datum: 'desc' },
      select: INSPECTIE_SELECT,
    }),
    // Dagrapporten van deze klant (ook concepten: dit is het dossier van de beheerder).
    prisma.dagrapport.findMany({
      where: { klantId, deletedAt: null, ...jaarFilter },
      orderBy: { datum: 'desc' },
      select: DAGRAPPORT_DOSSIER_SELECT,
    }),
    // Jaren met inspecties maar zonder monsters staan er ook in de jaarkeuze.
    prisma.inspectie.findMany({ where: { klantId, deletedAt: null }, select: { datum: true } }),
  ]);

  // Welke open monsters staan op een komende monsterdag? Zelfde regel als het
  // klantportaal (planOpenMonsters), per jaar, met de dagen van alle jaren in
  // één query.
  const geplandOp = new Map<number, string>();
  const monsterJaren = [...new Set(monsters.map((m) => m.analysisYear))];
  if (monsterJaren.length > 0) {
    const plannen = await komendePlannen(klantId, monsterJaren);
    const vandaag = nlDag(new Date());
    for (const j of monsterJaren) {
      const uitkomst = planOpenMonsters(
        plannen.filter((p) => p.analysisYear === j),
        monsters.filter((m) => m.analysisYear === j),
        vandaag
      );
      for (const [id, dag] of uitkomst.geplandOp) geplandOp.set(id, dag);
    }
  }

  const momenten: Moment[] = [];
  for (const m of monsters) {
    const basis = { monsterId: m.id, oNumber: m.oNumber, jaar: m.analysisYear, objectId: m.objectId, installatieId: m.installatieId };
    for (const a of m.attempts) {
      if (!a.isTaken && !a.remarks && !a.photoUrl && !a.partPhotoUrl) continue;
      const fotos = [
        a.partPhotoUrl ? { url: fotoAdres('poging', a.id, 'onderdeel', a.partPhotoUrl)!, label: 'Foto onderdeel' } : null,
        a.photoUrl ? { url: fotoAdres('poging', a.id, 'potje', a.photoUrl)!, label: 'Foto potje' } : null,
      ].filter((f): f is { url: string; label: string } => f !== null);
      momenten.push({
        ...basis,
        sleutel: `poging-${a.id}`,
        soort: a.isTaken ? 'monster' : 'poging',
        datum: a.sampleDate ? nlDag(a.sampleDate) : nlDag(a.createdAt),
        titel: a.isTaken ? `Oliemonster ${m.oNumber}` : `Poging ${m.oNumber}, niet genomen`,
        tekst: [m.description, a.remarks].filter(Boolean).join('. ') || null,
        fotos,
        door: null,
      });
    }
    if (m.isUnreachable && !m.isTaken) {
      momenten.push({
        ...basis,
        sleutel: `onbereikbaar-${m.id}`,
        soort: 'niet-bereikbaar',
        datum: m.unreachableAt ? nlDag(m.unreachableAt) : null,
        titel: `Niet bereikbaar, ${m.oNumber}`,
        tekst: [m.unreachableReason, m.unreachableNote].filter(Boolean).join(': ') || null,
        fotos: m.unreachablePhotoUrl ? [{ url: fotoAdres('monster', m.id, 'onbereikbaar', m.unreachablePhotoUrl)!, label: 'Foto niet bereikbaar' }] : [],
        door: m.unreachableBy,
      });
    }
    if (m.isDisabled) {
      momenten.push({
        ...basis,
        sleutel: `geannuleerd-${m.id}`,
        soort: 'geannuleerd',
        datum: m.cancelledAt ? nlDag(m.cancelledAt) : null,
        titel: `Geannuleerd, ${m.oNumber}`,
        tekst: m.cancelReason,
        fotos: [],
        door: m.cancelledBy,
      });
    } else if (!m.isTaken && !(m.isUnreachable && !geplandOp.has(m.id))) {
      // Niet bereikbaar en niet opnieuw gepland: dat moment staat er al.
      const dag = geplandOp.get(m.id) ?? null;
      momenten.push({
        ...basis,
        sleutel: `open-${m.id}`,
        soort: 'open',
        datum: dag,
        gepland: dag !== null,
        titel: `Oliemonster ${m.oNumber}`,
        tekst: m.description,
        fotos: [],
        door: null,
      });
    }
  }
  for (const i of inspecties) {
    const sjabloon = i.sjabloon as SjabloonSleutel;
    const s = sjabloonVan(sjabloon);
    const nummer = inspectieNummer(i);
    const rapport = `/api/inspecties/${i.id}/rapport`;
    const volgende = volgendeInspectie(sjabloon, i.volgendeOp, i.items);
    const basis = { monsterId: null, oNumber: nummer, jaar: new Date(i.datum).getUTCFullYear(), objectId: i.objectId, soort: 'inspectie' as const, datum: nlDag(i.datum), door: i.uitvoerder };
    momenten.push({
      ...basis,
      sleutel: `inspectie-${i.id}`,
      installatieId: i.installatieId,
      titel: `${inspectieTitel(sjabloon, i.instellingen)}, ${nummer}`,
      tekst: [uitkomstTekst(sjabloon, i.items, i.instellingen), i.samenvatting].filter(Boolean).join('. '),
      fotos: i.items
        .flatMap((it) => it.fotos.map((f) => ({ url: fotoAdres('inspectiefoto', f.id, null, f.url)!, label: `${s.item.enkel} ${it.titel}` })))
        .slice(0, 4),
      inspectie: { id: i.id, sjabloon, status: i.status, oordeel: null, volgende, rapport },
    });
    if (!s.volgendePerItem) continue;
    for (const it of i.items) {
      if (!it.installatieId || it.installatieId === i.installatieId) continue;
      momenten.push({
        ...basis,
        sleutel: `inspectie-${i.id}-${it.id}`,
        installatieId: it.installatieId,
        titel: `${inspectieTitel(sjabloon, i.instellingen)}, ${nummer}`,
        tekst: [oordeelVan(s, it.oordeel)?.label, it.notitie].filter(Boolean).join('. ') || null,
        fotos: it.fotos.map((f) => ({ url: fotoAdres('inspectiefoto', f.id, null, f.url)!, label: it.titel })),
        inspectie: { id: i.id, sjabloon, status: i.status, oordeel: it.oordeel, volgende: it.volgendeOp ? nlDag(it.volgendeOp) : volgende, rapport },
        onderdeel: true,
      });
    }
  }

  for (const r of dagrapporten) {
    const nummer = dagrapportNummer(r);
    momenten.push({
      sleutel: `dagrapport-${r.id}`,
      soort: 'dagrapport',
      datum: nlDag(r.datum),
      monsterId: null,
      oNumber: nummer,
      jaar: new Date(r.datum).getUTCFullYear(),
      objectId: r.objectId,
      installatieId: null,
      titel: `Werkbon ${nummer}`,
      tekst: [r.werkzaamheden, r.bevindingen].filter(Boolean).join(' ') || null,
      fotos: r.fotos.slice(0, 4).map((f) => ({ url: fotoAdres('dagrapport', f.id, null, f.url)!, label: f.bijschrift ?? 'Foto werkbon' })),
      door: r.uitvoerder,
      dagrapport: { id: r.id, status: r.status, getekendDoor: r.getekendDoor, pdf: `/api/dagrapporten/${r.id}/pdf` },
    });
  }

  // Open zonder datum bovenaan, dan nieuwste eerst.
  momenten.sort((a, b) => {
    if (a.datum === b.datum) return a.oNumber.localeCompare(b.oNumber, 'nl');
    if (a.datum === null) return -1;
    if (b.datum === null) return 1;
    return b.datum.localeCompare(a.datum);
  });

  const inspectieJaren = alleInspecties.map((i) => new Date(i.datum).getUTCFullYear());

  return {
    jaren,
    inspectieJaren: [...new Set(inspectieJaren)].sort((a, b) => b - a),
    jaar,
    objecten: objecten.map((o) => ({ ...o, installaties: o.installaties.map(metInstallatieFoto) })),
    heeftLosseMonsters: monsters.some((m) => m.objectId === null),
    momenten,
  };
}
