'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/ui';

/**
 * Melding onderin het scherm na een verwijderactie, met een knop Ongedaan maken.
 * Staat standaard 10 seconden in beeld. Op de telefoon onderin binnen het veilige
 * gebied, met een knop van 44px. Herbruikbaar: de pagina houdt de melding in
 * state en geeft mee wat Ongedaan maken moet doen.
 *
 * Stijl staat in globals.css (.ongedaan-melding); losse componenten kunnen geen
 * styled-jsx gebruiken, zie STIJL.md.
 */
export interface OngedaanInhoud {
  /** Bijvoorbeeld "Monster 3229 verwijderd" */
  tekst: string;
  /** Draait de actie terug. Gooit of geeft false bij mislukken. */
  onOngedaan?: () => Promise<boolean | void> | boolean | void;
  /** Uniek per melding, zodat de klok opnieuw start bij een nieuwe melding */
  sleutel?: string | number;
}

export default function OngedaanMelding({
  melding,
  onSluit,
  duur = 10000,
}: {
  melding: OngedaanInhoud | null;
  onSluit: () => void;
  duur?: number;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  useEffect(() => {
    setFout('');
    setBezig(false);
    if (!melding) return;
    const klok = window.setTimeout(onSluit, duur);
    return () => window.clearTimeout(klok);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [melding?.sleutel, melding?.tekst, duur]);

  if (!melding) return null;

  const draaiTerug = async () => {
    if (!melding.onOngedaan || bezig) return;
    setBezig(true);
    setFout('');
    try {
      const gelukt = await melding.onOngedaan();
      if (gelukt === false) {
        setFout('Terugzetten is niet gelukt.');
        return;
      }
      onSluit();
    } catch {
      setFout('Terugzetten is niet gelukt.');
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="ongedaan-melding" role="status" aria-live="polite">
      <span className="ongedaan-melding-tekst">
        <Icon name="check" size={20} />
        <span>{fout || melding.tekst}</span>
      </span>
      <span className="ongedaan-melding-knoppen">
        {melding.onOngedaan && (
          <button type="button" className="btn btn-sm" onClick={draaiTerug} disabled={bezig}>
            <Icon name="reset" size={16} />
            {bezig ? 'Bezig...' : 'Ongedaan maken'}
          </button>
        )}
        <button
          type="button"
          className="icon-btn ongedaan-melding-sluit"
          onClick={onSluit}
          aria-label="Melding sluiten"
          title="Sluiten"
        >
          <Icon name="close" size={20} />
        </button>
      </span>
    </div>
  );
}
