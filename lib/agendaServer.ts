// De afspraken in de agendafeed van een medewerker: de planningsdagen (vanaf
// zestig dagen terug) en de contracttaken die nog niet op een dag staan. Alleen
// op de server. De tekst van de feed zelf: lib/agenda.ts.
//
// - Een planningsdag is een afspraak van 08:00 met de geplande tijd van de dag
//   (werk plus rijden), op de plek van de eerste stop, met alle stops in de
//   beschrijving en een herinnering de dag ervoor op dezelfde tijd.
// - Een contracttaak zonder dag is een afspraak voor de hele dag op de volgende
//   datum, met een herinnering de middag ervoor (15:00). Staat de taak op een
//   planningsdag, dan staat hij in die afspraak en niet nog eens los.

import { prisma } from './prisma';
import { haalPlanning } from './samplePlans';
import { haalTaken } from './contractenServer';
import { nlDag } from './klantOpdracht';
import { PLANNING, minutenAlsTekst } from './planningInstellingen';
import { TAAK_STATUS_LABEL, intervalTekst, termijnTekst, vandaagNl, plusDagen } from './contracten';
import type { AgendaAfspraak } from './agenda';

const DOMEIN = 'ids-portal.itsdoneservices.nl';
/** Zo ver terug staan planningsdagen nog in de feed. */
export const FEED_DAGEN_TERUG = 60;

type Dag = Awaited<ReturnType<typeof haalPlanning>>['dagen'][number];
type Stop = Dag['stops'][number];

function stopNaam(s: Stop): string {
  if (s.taak) return s.taak.titel;
  if (s.inspectie) return `${s.inspectie.naam} ${s.inspectie.nummer}`;
  return s.object.name;
}

function stopRegel(s: Stop, i: number): string {
  const wat = s.taak
    ? `${s.taak.soortLabel} bij ${s.taak.klant.naam}, ${s.object.name}`
    : s.inspectie
      ? `inspectie bij ${s.inspectie.klant.naam}, ${s.object.name}`
      : `${s.aantalMonsters} ${s.aantalMonsters === 1 ? 'monster' : 'monsters'}`;
  const adres = s.object.address ? ` (${s.object.address})` : '';
  return `${i + 1}. ${stopNaam(s)}: ${wat}, ca. ${minutenAlsTekst(s.werkMinuten)}${adres}`;
}

function namen(dag: Dag): string {
  const n = [...new Set(dag.stops.map(stopNaam))];
  if (n.length === 0) return 'nog geen stops';
  if (n.length === 1) return n[0];
  return `${n.slice(0, -1).join(', ')} en ${n[n.length - 1]}`;
}

export function dagAfspraak(dag: Dag, origin: string): AgendaAfspraak {
  const heeftMonsters = dag.stops.some((s) => !s.taak && !s.inspectie);
  const soort = heeftMonsters ? 'Monsterdag' : 'Werkdag';
  const eerste = dag.stops.find((s) => !s.isDone) ?? dag.stops[0];
  const beschrijving = [
    ...dag.stops.map(stopRegel),
    '',
    `Ongeveer ${minutenAlsTekst(dag.werkMinuten)} werk en ${minutenAlsTekst(dag.rijMinuten)} rijden, samen ${minutenAlsTekst(dag.totaalMinuten)}.`,
    dag.notes ? `Notitie: ${dag.notes}` : null,
  ].filter((r) => r !== null).join('\n');
  return {
    uid: `plandag-${dag.id}@${DOMEIN}`,
    titel: `${soort}: ${namen(dag)}`,
    beschrijving,
    locatie: eerste ? eerste.object.address || eerste.object.name : null,
    url: `${origin}/dashboard/planning/dag/${dag.id}`,
    tijd: { dag: nlDag(dag.date), startMinuut: PLANNING.dagStartMinuut, duurMinuten: Math.max(60, dag.totaalMinuten) },
    herinneringMinutenVooraf: 24 * 60,
    herinnering: `Morgen: ${soort.toLowerCase()}, ${namen(dag)}`,
  };
}

export async function afsprakenVoorFeed(origin: string): Promise<AgendaAfspraak[]> {
  const vandaag = vandaagNl();
  const vanaf = plusDagen(vandaag, -FEED_DAGEN_TERUG);
  const jaren = await prisma.samplePlan.findMany({
    where: { date: { gte: new Date(`${plusDagen(vanaf, -1)}T00:00:00Z`) } },
    distinct: ['analysisYear'],
    select: { analysisYear: true },
  });
  const afspraken: AgendaAfspraak[] = [];
  for (const { analysisYear } of jaren) {
    const { dagen } = await haalPlanning(analysisYear);
    for (const d of dagen) {
      if (nlDag(d.date) < vanaf || d.stops.length === 0) continue;
      afspraken.push(dagAfspraak(d, origin));
    }
  }

  for (const t of await haalTaken()) {
    if (t.gepland) continue;
    afspraken.push({
      uid: `taak-${t.id}@${DOMEIN}`,
      titel: `${t.titel}, ${t.klant.naam}`,
      locatie: t.object.address || t.object.name,
      beschrijving: [
        `${t.soortLabel}, ${intervalTekst(t.intervalMaanden)}.`,
        `Contract: ${t.contract.naam}.`,
        `Plek: ${[t.object.name, t.installatie?.naam].filter(Boolean).join(', ')}.`,
        `${TAAK_STATUS_LABEL[t.status]}: ${termijnTekst(t.volgendeOp, vandaag)}. Nog niet op de planning.`,
      ].join('\n'),
      url: `${origin}/dashboard/contracten/${t.contractId}`,
      heleDag: t.volgendeOp,
      // Hele dag begint om middernacht: 9 uur vooraf is 15:00 de dag ervoor.
      herinneringMinutenVooraf: 9 * 60,
      herinnering: `Morgen: ${t.titel} bij ${t.klant.naam}`,
    });
  }
  return afspraken;
}
