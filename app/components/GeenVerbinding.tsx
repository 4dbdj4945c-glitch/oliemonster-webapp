'use client';

import { useSyncExternalStore } from 'react';
import { Icon } from './ui';

/*
  Melding bovenaan het veldscherm als de telefoon geen verbinding heeft
  (navigator.onLine). Monster nemen en een nieuwe bevinding gaan dan in de
  offline wachtrij (lib/wachtrij.ts) en worden verstuurd zodra er bereik is;
  andere handelingen (afvinken, tijd starten) lukken pas weer met bereik.
*/

function abonneer(terug: () => void) {
  window.addEventListener('online', terug);
  window.addEventListener('offline', terug);
  return () => {
    window.removeEventListener('online', terug);
    window.removeEventListener('offline', terug);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    abonneer,
    () => navigator.onLine,
    () => true
  );
}

export default function GeenVerbinding({ tekst }: { tekst?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="geen-verbinding" role="alert">
      <Icon name="alert-warning" size={24} />
      <div>
        <strong>Geen verbinding</strong>
        <span>
          {tekst ??
            'Je kunt deze dag verder bekijken en monsters nemen: die worden op deze telefoon bewaard en gaan vanzelf mee zodra er bereik is. Afvinken en de tijd lukken pas weer met bereik.'}
        </span>
      </div>
    </div>
  );
}
