'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '../ui/Icon';
import { datumAlsInvoer, datumAlsTekst, isWerkdag, minutenAlsTekst } from '@/lib/planningInstellingen';
import { vandaagNl } from '@/lib/contracten';
import { dagInhoud, isMonsterStop, stopNaam, type PlanDag } from './types';

/*
  Maandkalender boven de dagen van de planning (PlanningPaneel). Laat per dag
  zien wat er gepland staat; een klik op een geplande dag toont hem in de lijst,
  een klik op een lege dag (beheerder) voegt hem toe. Datums zijn overal
  jjjj-mm-dd in de lokale tijd, net als datumAlsInvoer. Stijl: .plan-kal-* in
  globals.css (geen styled-jsx in losse componenten, zie STIJL.md).
*/

const WEEKDAGEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

const p2 = (n: number) => String(n).padStart(2, '0');

/** jjjj-mm-dd van een jaar, maand (0-11) en dag */
function sleutel(jaar: number, maand: number, dag: number): string {
  return `${jaar}-${p2(maand + 1)}-${p2(dag)}`;
}

/** Een jjjj-mm-dd als lokale datum (middernacht) */
function alsDatum(datum: string): Date {
  return new Date(`${datum}T00:00:00`);
}

/** ISO-weeknummer (week met de eerste donderdag is week 1) */
function weekNummer(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dag);
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
}

/** Maand als getal om te vergelijken: jaar * 12 + maand */
const maandIndex = (jaar: number, maand: number) => jaar * 12 + maand;

type Status = 'klaar' | 'vol' | 'gepland';

/** Alles afgevinkt is klaar, anders te vol, anders gewoon gepland. */
function statusVan(d: PlanDag): Status {
  if (d.stops.length > 0 && d.stops.every((s) => s.isDone)) return 'klaar';
  if (d.teVol) return 'vol';
  return 'gepland';
}

const STATUS_WOORD: Record<Status, string> = {
  klaar: 'alles klaar',
  vol: 'te vol',
  gepland: '',
};

export default function PlanningKalender({
  dagen,
  analysisYear,
  isAdmin,
  bezig,
  invoerFout,
  onToevoegen,
  onToonInLijst,
  onWisFout,
}: {
  dagen: PlanDag[];
  analysisYear: number;
  isAdmin: boolean;
  bezig: boolean;
  invoerFout: string;
  /** Nieuwe dag op deze datum (jjjj-mm-dd) */
  onToevoegen: (datum: string) => void;
  /** Naar de dagkaart in de lijst scrollen en hem kort markeren */
  onToonInLijst: (dag: PlanDag) => void;
  onWisFout: () => void;
}) {
  const vandaag = vandaagNl();

  const perDatum = useMemo(() => {
    const m = new Map<string, PlanDag>();
    for (const d of dagen) m.set(datumAlsInvoer(d.date), d);
    return m;
  }, [dagen]);

  // Bereik: het hele analysejaar, en verder als er dagen buiten dat jaar staan.
  const datums = [...perDatum.keys()].sort();
  const eersteMaand = Math.min(
    maandIndex(analysisYear, 0),
    ...datums.slice(0, 1).map((d) => maandIndex(+d.slice(0, 4), +d.slice(5, 7) - 1))
  );
  const laatsteMaand = Math.max(
    maandIndex(analysisYear, 11),
    ...datums.slice(-1).map((d) => maandIndex(+d.slice(0, 4), +d.slice(5, 7) - 1))
  );
  const vandaagMaand = maandIndex(+vandaag.slice(0, 4), +vandaag.slice(5, 7) - 1);

  // Start: deze maand als die in het analysejaar valt, anders de eerste maand
  // met een geplande dag, anders januari.
  const [maand, setMaand] = useState<number>(() => {
    if (+vandaag.slice(0, 4) === analysisYear) return vandaagMaand;
    const eerste = datums.find((d) => +d.slice(0, 4) === analysisYear) ?? datums[0];
    if (eerste) return maandIndex(+eerste.slice(0, 4), +eerste.slice(5, 7) - 1);
    return maandIndex(analysisYear, 0);
  });
  const [gekozen, setGekozen] = useState<string | null>(null);

  const jaar = Math.floor(maand / 12);
  const maandNr = maand % 12;
  const maandNaam = new Date(jaar, maandNr, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

  // Weken van maandag tot en met zondag; dagen buiten de maand blijven leeg.
  const eersteDag = new Date(jaar, maandNr, 1);
  const voorloop = (eersteDag.getDay() + 6) % 7;
  const dagenInMaand = new Date(jaar, maandNr + 1, 0).getDate();
  const weken: (number | null)[][] = [];
  for (let start = 1 - voorloop; start <= dagenInMaand; start += 7) {
    weken.push(Array.from({ length: 7 }, (_, i) => (start + i >= 1 && start + i <= dagenInMaand ? start + i : null)));
  }

  const naarMaand = (m: number) => {
    setMaand(Math.min(laatsteMaand, Math.max(eersteMaand, m)));
  };

  const kies = (datum: string) => {
    setGekozen(datum);
    onWisFout();
    const dag = perDatum.get(datum);
    // Op desktop meteen naar de dag in de lijst. Op de telefoon staat de inhoud
    // onder de kalender; daar blijf je staan.
    if (dag && typeof window !== 'undefined' && window.matchMedia('(min-width: 641px)').matches) {
      onToonInLijst(dag);
    }
  };

  const naarVandaag = () => {
    naarMaand(vandaagMaand);
    if (vandaagMaand >= eersteMaand && vandaagMaand <= laatsteMaand) setGekozen(vandaag);
  };

  const gekozenDag = gekozen ? perDatum.get(gekozen) : undefined;
  const vandaagInBereik = vandaagMaand >= eersteMaand && vandaagMaand <= laatsteMaand;

  return (
    <div className="card plan-kal">
      <div className="plan-kal-kop">
        <h2 className="plan-kal-maand">{maandNaam.charAt(0).toUpperCase() + maandNaam.slice(1)}</h2>
        <div className="plan-kal-nav">
          <button
            type="button"
            className="btn btn-sm"
            onClick={naarVandaag}
            disabled={!vandaagInBereik}
            title={vandaagInBereik ? undefined : `Vandaag valt buiten de planning van ${analysisYear}`}
          >
            Vandaag
          </button>
          <button
            type="button"
            className="icon-btn plan-kal-pijl"
            onClick={() => naarMaand(maand - 1)}
            disabled={maand <= eersteMaand}
            aria-label="Vorige maand"
            title="Vorige maand"
          >
            <Icon name="chevron-down" size={20} className="plan-kal-vorige" />
          </button>
          <button
            type="button"
            className="icon-btn plan-kal-pijl"
            onClick={() => naarMaand(maand + 1)}
            disabled={maand >= laatsteMaand}
            aria-label="Volgende maand"
            title="Volgende maand"
          >
            <Icon name="chevron-down" size={20} className="plan-kal-volgende" />
          </button>
        </div>
      </div>

      <div className="plan-kal-raster">
        <div className="plan-kal-wk plan-kal-weekdag" aria-hidden="true">wk</div>
        {WEEKDAGEN.map((w, i) => (
          <div key={w} className={`plan-kal-weekdag${i >= 5 ? ' plan-kal-weekend' : ''}`} aria-hidden="true">
            {w}
          </div>
        ))}

        {weken.map((week, wi) => {
          const eerste = week.find((d) => d !== null)!;
          return (
            <div key={wi} className="plan-kal-week">
              <div className="plan-kal-wk" title={`Week ${weekNummer(new Date(jaar, maandNr, eerste))}`}>
                {weekNummer(new Date(jaar, maandNr, eerste))}
              </div>
              {week.map((dagNr, i) => {
                if (dagNr === null) return <div key={i} className="plan-kal-leeg" />;
                const datum = sleutel(jaar, maandNr, dagNr);
                const dag = perDatum.get(datum);
                const status = dag ? statusVan(dag) : null;
                const datumWoord = alsDatum(datum).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
                const olie = dag ? dag.stops.filter(isMonsterStop) : [];
                const taken = dag ? dag.stops.filter((s) => s.soort === 'taak').length : 0;
                const inspecties = dag ? dag.stops.filter((s) => s.soort === 'inspectie').length : 0;
                const label = [
                  datumWoord,
                  datum === vandaag ? 'vandaag' : '',
                  dag ? `${dag.stops.length === 0 ? 'lege dag gepland' : `${dagInhoud(dag)} gepland`}` : 'niets gepland',
                  status ? STATUS_WOORD[status] : '',
                ].filter(Boolean).join(', ');
                const klassen = [
                  'plan-kal-dag',
                  i >= 5 ? 'plan-kal-weekend' : '',
                  datum === vandaag ? 'plan-kal-vandaag' : '',
                  dag ? `plan-kal-gepland${status !== 'gepland' ? ` plan-kal-${status}` : ''}` : '',
                  gekozen === datum ? 'plan-kal-gekozen' : '',
                ].filter(Boolean).join(' ');
                return (
                  <button
                    key={i}
                    type="button"
                    className={klassen}
                    aria-label={label}
                    aria-pressed={gekozen === datum}
                    data-datum={datum}
                    onClick={() => kies(datum)}
                  >
                    <span className="plan-kal-nr">
                      <span className="plan-kal-getal">{dagNr}</span>
                      {status === 'klaar' && <Icon name="check" size={16} />}
                      {status === 'vol' && <Icon name="alert-warning" size={16} />}
                    </span>
                    {dag && (
                      <>
                        {/* Telefoon: alleen een stip met het aantal */}
                        <span className="plan-kal-stip" aria-hidden="true">
                          {dag.stops.length > 0 ? dag.stops.length : ''}
                        </span>
                        {/* Desktop: aantal, de eerste namen en de soorten */}
                        <span className="plan-kal-inhoud" aria-hidden="true">
                          <span className="plan-kal-aantal">
                            {dag.stops.length === 0
                              ? 'Nog leeg'
                              : olie.length > 0
                                ? `${olie.length} ${olie.length === 1 ? 'object' : 'objecten'}`
                                : ''}
                          </span>
                          {olie.slice(0, 2).map((s) => (
                            <span key={s.id} className="plan-kal-naam">{s.object.name}</span>
                          ))}
                          {olie.length > 2 && <span className="plan-kal-meer">en {olie.length - 2} meer</span>}
                          {(taken > 0 || inspecties > 0) && (
                            <span className="plan-kal-soorten">
                              {taken > 0 && <span className="plan-kal-soort">{taken > 1 ? `${taken} taken` : 'Taak'}</span>}
                              {inspecties > 0 && <span className="plan-kal-soort">{inspecties > 1 ? `${inspecties} inspecties` : 'Inspectie'}</span>}
                            </span>
                          )}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="plan-kal-legenda" aria-hidden="true">
        <span><i className="plan-kal-teken plan-kal-teken-gepland" />Gepland</span>
        <span><i className="plan-kal-teken plan-kal-teken-vol" />Te vol</span>
        <span><i className="plan-kal-teken plan-kal-teken-klaar" />Alles klaar</span>
        <span><i className="plan-kal-teken plan-kal-teken-vandaag" />Vandaag</span>
      </div>

      {/* De gekozen dag: inhoud, of toevoegen */}
      {gekozen && (
        <div className="plan-kal-keuze" aria-live="polite">
          {gekozenDag ? (
            <>
              <div className="plan-kal-keuze-kop">
                <div>
                  <div className="plan-dag-datum">{datumAlsTekst(gekozenDag.date)}</div>
                  <div className="plan-dag-sub">
                    {dagInhoud(gekozenDag)}, {minutenAlsTekst(gekozenDag.totaalMinuten)} totaal
                    {statusVan(gekozenDag) !== 'gepland' && `, ${STATUS_WOORD[statusVan(gekozenDag)]}`}
                  </div>
                </div>
                <div className="knoppenrij plan-kal-keuze-knoppen">
                  <button type="button" className="btn btn-sm plan-kal-inlijst" onClick={() => onToonInLijst(gekozenDag)}>
                    In de lijst
                  </button>
                  <Link prefetch={false} href={`/dashboard/planning/dag/${gekozenDag.id}`} className="btn btn-sm">
                    <Icon name="gps-live" size={16} />
                    Dag openen
                  </Link>
                </div>
              </div>
              {gekozenDag.stops.length === 0 ? (
                <p className="plan-leeg-regel">Nog niets op deze dag.</p>
              ) : (
                <ol className="plan-kal-stops">
                  {gekozenDag.stops.map((s) => (
                    <li key={s.id} className={s.isDone ? 'plan-kal-stop-klaar' : undefined}>
                      <span className="plan-kal-stop-naam">{stopNaam(s)}</span>
                      {!isMonsterStop(s) && (
                        <span className="badge badge-navy">{s.soort === 'taak' ? 'Contracttaak' : 'Inspectie'}</span>
                      )}
                      {s.isDone && (
                        <span className="badge badge-success">
                          <Icon name="check" size={16} />
                          Klaar
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <>
              <div className="plan-dag-datum">
                {isAdmin && +gekozen.slice(0, 4) === analysisYear ? 'Dag toevoegen op ' : ''}
                {datumAlsTekst(alsDatum(gekozen))}
              </div>
              {+gekozen.slice(0, 4) !== analysisYear ? (
                <p className="hint">
                  Deze datum valt buiten {analysisYear}. Een dag voor deze planning moet in {analysisYear} liggen;
                  kies bovenaan een ander jaar om in {gekozen.slice(0, 4)} te plannen.
                </p>
              ) : isAdmin ? (
                <>
                  <p className="plan-dag-sub">Nog niets gepland op deze dag.</p>
                  {!isWerkdag(alsDatum(gekozen)) && (
                    <p className="hint">Let op: dit is geen werkdag (maandag tot en met vrijdag).</p>
                  )}
                  <div className="knoppenrij plan-kal-keuze-knoppen">
                    <button type="button" className="btn btn-primary" onClick={() => onToevoegen(gekozen)} disabled={bezig}>
                      <Icon name="plus" size={16} />
                      {bezig ? 'Bezig...' : 'Toevoegen'}
                    </button>
                  </div>
                  {invoerFout && (
                    <div className="alert alert-danger plan-kal-fout" role="alert">
                      {invoerFout}
                    </div>
                  )}
                </>
              ) : (
                <p className="plan-dag-sub">Niets gepland op deze dag.</p>
              )}
            </>
          )}
        </div>
      )}
      {!gekozen && (
        <p className="plan-kal-uitleg">
          {isAdmin
            ? 'Kies een geplande dag om hem te bekijken, of een lege dag om hem toe te voegen.'
            : 'Kies een geplande dag om te zien wat er die dag gebeurt.'}
        </p>
      )}
    </div>
  );
}
