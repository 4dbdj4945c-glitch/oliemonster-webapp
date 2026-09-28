'use client';

import { Icon } from '@/app/components/ui';

/**
 * Melding boven een lijst als het ophalen van gegevens mislukte. Zonder deze
 * melding is "kon niet laden" niet te onderscheiden van "er is niets", en dat
 * is precies wat er misging: bij een fout stond er gewoon nul in de tegels.
 *
 * Stijl staat in globals.css (.laadfout); losse componenten kunnen geen
 * styled-jsx gebruiken, zie STIJL.md.
 */
export default function LaadFout({
  melding,
  onOpnieuw,
  bezig = false,
}: {
  melding: string;
  onOpnieuw?: () => void;
  bezig?: boolean;
}) {
  return (
    <div className="alert alert-danger laadfout" role="alert">
      <span className="laadfout-tekst">
        <Icon name="alert-danger" size={20} />
        <span>{melding}</span>
      </span>
      {onOpnieuw && (
        <button type="button" className="btn btn-sm" onClick={onOpnieuw} disabled={bezig}>
          <Icon name="reset" size={16} />
          {bezig ? 'Bezig...' : 'Opnieuw proberen'}
        </button>
      )}
    </div>
  );
}
