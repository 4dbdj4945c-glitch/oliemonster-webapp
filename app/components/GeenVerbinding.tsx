'use client';

import { useSyncExternalStore } from 'react';
import { Icon } from './ui';

/*
  Melding bovenaan het veldscherm en in Monster nemen als de telefoon geen
  verbinding heeft (navigator.onLine). Alleen de melding: wat je invult blijft
  in het venster staan, maar opslaan lukt pas weer met bereik. Een echte
  wachtrij die later verstuurt, komt in een volgende fase.
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
            'Je kunt deze dag gewoon verder bekijken. Opslaan lukt pas weer als je bereik hebt; wat je invult, blijft in het venster staan.'}
        </span>
      </div>
    </div>
  );
}
