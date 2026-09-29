// Het klantdossier (alleen admin): per object en per installatie een tijdlijn
// van alles wat er gebeurde. Alleen op de server; GET /api/klanten/[id]/dossier.
//
// Momenten, nieuwste eerst:
// - monster: een poging die genomen is (datum, opmerking, de twee foto's)
// - poging: een poging die niet genomen is (hermonstering zonder afname)
// - niet-bereikbaar: de plek was niet te bereiken (reden, omschrijving, foto)
// - geannuleerd: het monster hoeft niet meer (reden)
// - open: moet nog, met de monsterdag als het gepland is
// Keuringen en werkzaamheden komen er later bij (eigen module), met hetzelfde
// type Moment.

import { prisma } from './prisma';
import { actiefFilter } from './verwijderdeMonsters';
import { monstersVanKlant } from './afscherming';
import { fotoAdres, metInstallatieFoto } from './fotoAdres';
import { haalOpdracht, jarenVanKlant, nlDag } from './klantOpdracht';

export type MomentSoort = 'monster' | 'poging' | 'niet-bereikbaar' | 'geannuleerd' | 'open';

export interface Moment {
  sleutel: string;
  soort: MomentSoort;
  /** jjjj-mm-dd, of null voor een open monster zonder monsterdag */
  datum: string | null;
  monsterId: number;
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
}

export async function haalDossier(klantId: number, jaar: number | null) {
  const [jaren, objecten] = await Promise.all([
    jarenVanKlant(klantId),
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
  ]);

  const monsters = await prisma.oilSample.findMany({
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
  });

  // Welke open monsters staan op een komende monsterdag? Zelfde regel als het
  // klantportaal, per jaar.
  const geplandOp = new Map<number, string>();
  for (const j of new Set(monsters.map((m) => m.analysisYear))) {
    const opdracht = await haalOpdracht(klantId, j);
    for (const m of opdracht?.monsters ?? []) {
      if (m.status === 'gepland' && m.datum) geplandOp.set(m.id, nlDag(m.datum));
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
  // Open zonder datum bovenaan, dan nieuwste eerst.
  momenten.sort((a, b) => {
    if (a.datum === b.datum) return a.oNumber.localeCompare(b.oNumber, 'nl');
    if (a.datum === null) return -1;
    if (b.datum === null) return 1;
    return b.datum.localeCompare(a.datum);
  });

  return {
    jaren,
    jaar,
    objecten: objecten.map((o) => ({ ...o, installaties: o.installaties.map(metInstallatieFoto) })),
    heeftLosseMonsters: monsters.some((m) => m.objectId === null),
    momenten,
  };
}
