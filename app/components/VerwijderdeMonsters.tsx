'use client';

import { useEffect, useState } from 'react';
import { Icon, Laden } from '@/app/components/ui';
import LaadFout from './LaadFout';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';

/**
 * De prullenbak van één analysejaar (alleen admin): verwijderde monsters met de
 * knop Herstellen. Pogingen, datums en foto's zijn nooit gewist, dus die komen
 * gewoon mee terug. Echt wissen kan hier bewust niet.
 */
interface Verwijderd {
  id: number;
  oNumber: string;
  location: string;
  description: string;
  isTaken: boolean;
  sampleDate: string | null;
  deletedAt: string;
  deletedBy: string | null;
  attemptsCount: number;
}

export default function VerwijderdeMonsters({
  jaar,
  onHersteld,
}: {
  jaar: number;
  onHersteld: (oNumber: string) => void;
}) {
  const [monsters, setMonsters] = useState<Verwijderd[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  // Pas true als de lijst echt geladen is; bij een fout geen "prullenbak is leeg".
  const [geladen, setGeladen] = useState(false);
  const [kolomOntbreekt, setKolomOntbreekt] = useState(false);
  const [bezig, setBezig] = useState<number | null>(null);

  const laad = async () => {
    setLaden(true);
    try {
      const res = await fetch(`/api/samples/verwijderd?year=${jaar}`);
      if (!res.ok) {
        setFout(await foutTekst(res, 'De prullenbak kon niet worden opgehaald.'));
        return;
      }
      const data = await res.json();
      setMonsters(data.monsters ?? []);
      setKolomOntbreekt(!!data.kolomOntbreekt);
      setGeladen(true);
      setFout('');
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setLaden(false);
    }
  };

  useEffect(() => {
    laad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jaar]);

  const herstel = async (m: Verwijderd) => {
    setBezig(m.id);
    try {
      const res = await fetch(`/api/samples/${m.id}/herstellen`, { method: 'POST' });
      if (!res.ok) {
        setFout(await foutTekst(res, `${m.oNumber} is niet teruggezet.`));
        return;
      }
      setMonsters((lijst) => lijst.filter((x) => x.id !== m.id));
      setFout('');
      onHersteld(m.oNumber);
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(null);
    }
  };

  return (
    <div className="card prullenbak">
      <p className="section-label" style={{ margin: 0 }}>Verwijderde monsters {jaar}</p>
      <p className="hint" style={{ margin: '4px 0 14px' }}>
        Deze monsters staan niet in de lijst, de planning of de PDF. Herstellen zet ze terug met alle
        monsternames, datums en foto&apos;s. Het O-nummer blijft bezet zolang een monster hier staat.
      </p>

      {fout && <LaadFout melding={fout} onOpnieuw={laad} bezig={laden} />}

      {laden ? (
        <Laden label="Prullenbak laden" regels={2} soort="lijst" />
      ) : !geladen ? null : kolomOntbreekt ? (
        <div className="alert alert-info">
          De prullenbak staat nog niet in de database. Draai ./db-push-veilig-verwijderen.sh in de projectmap. Tot die
          tijd kan er ook niets verwijderd worden.
        </div>
      ) : monsters.length === 0 ? (
        <div className="leeg">
          <Icon name="trash" size={32} />
          <p style={{ margin: 0 }}>De prullenbak van {jaar} is leeg.</p>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-scroll">
            <table className="table table-kaarten">
              <thead>
                <tr>
                  <th>O-nummer</th>
                  <th>Locatie</th>
                  <th>Omschrijving</th>
                  <th>Monsternames</th>
                  <th>Verwijderd</th>
                  <th>Acties</th>
                </tr>
              </thead>
              <tbody>
                {monsters.map((m) => (
                  <tr key={m.id}>
                    <td data-label="O-nummer" className="kaart-kop font-medium">{m.oNumber}</td>
                    <td data-label="Locatie">{m.location}</td>
                    <td data-label="Omschrijving">{m.description}</td>
                    <td data-label="Monsternames">
                      {m.attemptsCount}
                      {m.isTaken && m.sampleDate
                        ? `, genomen ${new Date(m.sampleDate).toLocaleDateString('nl-NL')}`
                        : ''}
                    </td>
                    <td data-label="Verwijderd">
                      {new Date(m.deletedAt).toLocaleString('nl-NL', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {m.deletedBy ? ` door ${m.deletedBy}` : ''}
                    </td>
                    <td data-label="Acties" className="kaart-acties">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => herstel(m)}
                        disabled={bezig === m.id}
                      >
                        <Icon name="reset" size={16} />
                        {bezig === m.id ? 'Bezig...' : 'Herstellen'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
