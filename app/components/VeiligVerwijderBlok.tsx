'use client';

import { useState, type ReactNode } from 'react';
import { Icon } from '@/app/components/ui';

/**
 * Het afgescheiden blok onderaan een detailscherm of bewerkvenster om iets weg
 * te halen dat veel meeneemt (een klant, een installatie). Zelfde patroon als
 * MonsterVerwijderBlok: eerst uitklappen, dan de naam of code overtypen, dan
 * pas de knop. Verwijderen is zacht; de pagina toont daarna Ongedaan maken.
 */
export default function VeiligVerwijderBlok({
  id,
  kop,
  uitleg,
  bevestig,
  knop,
  onVerwijder,
}: {
  id: string;
  /** Bijvoorbeeld "Klant verwijderen" */
  kop: string;
  /** Wat er weggaat en wat blijft */
  uitleg: ReactNode;
  /** Wat de gebruiker moet overtypen */
  bevestig: string;
  /** Tekst op de knop, bijvoorbeeld "Mourik verwijderen" */
  knop: string;
  /** Voert het verwijderen uit; geeft een foutmelding terug of null */
  onVerwijder: (getypt: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [getypt, setGetypt] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const klopt = getypt.trim().toLowerCase() === bevestig.trim().toLowerCase();

  const verwijder = async () => {
    if (!klopt || bezig) return;
    setBezig(true);
    setFout('');
    const melding = await onVerwijder(getypt.trim());
    setBezig(false);
    if (melding) setFout(melding);
  };

  return (
    <section className="gevarenzone" aria-labelledby={`${id}-kop`}>
      <p className="gevarenzone-kop" id={`${id}-kop`}>
        <Icon name="trash" size={16} />
        {kop}
      </p>
      <div className="gevarenzone-tekst">{uitleg}</div>
      {!open ? (
        <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => setOpen(true)}>
          <Icon name="trash" size={16} />
          {kop}...
        </button>
      ) : (
        <div className="gevarenzone-bevestig">
          <label className="label" htmlFor={`${id}-bevestig`}>
            Typ {bevestig} om te bevestigen
          </label>
          <input
            id={`${id}-bevestig`}
            className="input"
            value={getypt}
            onChange={(e) => setGetypt(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={bevestig}
          />
          <div className="knoppenrij gevarenzone-knoppen">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setOpen(false);
                setGetypt('');
                setFout('');
              }}
            >
              Toch niet
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={verwijder} disabled={!klopt || bezig}>
              <Icon name="trash" size={16} />
              {bezig ? 'Bezig...' : knop}
            </button>
          </div>
        </div>
      )}
      {fout && (
        <div className="alert alert-danger" role="alert" style={{ marginTop: '10px' }}>
          {fout}
        </div>
      )}
    </section>
  );
}
