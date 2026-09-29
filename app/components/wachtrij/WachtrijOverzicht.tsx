'use client';

/*
  Wat er op deze telefoon wacht op verzending (offline wachtrij, lib/wachtrij.ts):
  "2 wachten op verzending", per invoer de titel en wat er misging, een knop
  Nu versturen en bij iets dat echt mislukte Weghalen. In het veldscherm, het
  invulscherm van een inspectie en achter de knop in de balk.
*/

import { useState } from 'react';
import { Icon } from '@/app/components/ui';
import { useOnline } from '@/app/components/GeenVerbinding';
import { browserOpslag, verwerkInBrowser, type Invoer } from '@/lib/wachtrij';

export function wachtTekst(n: number): string {
  return `${n} ${n === 1 ? 'wacht' : 'wachten'} op verzending`;
}

export default function WachtrijOverzicht({ lijst, gebruiker, kop = true }: { lijst: Invoer[]; gebruiker: string; kop?: boolean }) {
  const online = useOnline();
  const [bezig, setBezig] = useState(false);
  if (lijst.length === 0) return null;
  const mislukt = lijst.filter((i) => i.status === 'mislukt').length;

  const nu = async () => {
    setBezig(true);
    try {
      await verwerkInBrowser(gebruiker, true);
    } catch {
      // staat per invoer in de lijst
    } finally {
      setBezig(false);
    }
  };

  const weg = async (i: Invoer) => {
    if (!confirm(`${i.titel} uit de wachtrij halen? Wat je invulde en de foto's gaan dan verloren; op de server staat het niet.`)) return;
    await browserOpslag.weg(i.sleutel);
  };

  return (
    <section className={`wachtrij${mislukt > 0 ? ' wachtrij-fout' : ''}`} aria-live="polite" aria-label="Wachtrij">
      {kop && (
        <div className="wachtrij-kop">
          <Icon name={online ? 'verzenden' : 'offline'} size={24} />
          <div>
            <strong>{wachtTekst(lijst.length)}</strong>
            <span>
              {online
                ? 'Bewaard op deze telefoon. Gaat vanzelf mee, of verstuur het nu.'
                : 'Bewaard op deze telefoon. Gaat vanzelf mee zodra er weer bereik is.'}
            </span>
          </div>
        </div>
      )}
      <ul className="wachtrij-lijst">
        {lijst.map((i) => (
          <li key={i.sleutel}>
            <span className="wachtrij-tekst">
              <strong>{i.titel}</strong>
              <span>
                {new Date(i.aangemaakt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                {i.bestanden?.length ? `, ${i.bestanden.length} ${i.bestanden.length === 1 ? 'foto' : "foto's"}` : ''}
                {i.foto ? ", 1 foto" : ''}
                {i.laatsteFout ? `. ${i.laatsteFout}` : ''}
              </span>
            </span>
            {i.status === 'mislukt' ? (
              <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => weg(i)}>
                <Icon name="trash" size={16} />
                Weghalen
              </button>
            ) : (
              <span className="badge badge-info">Wacht</span>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-block wachtrij-knop-nu" onClick={nu} disabled={bezig || !online}>
        <Icon name="verzenden" size={20} />
        {bezig ? 'Bezig met versturen...' : online ? (mislukt > 0 ? 'Opnieuw proberen' : 'Nu versturen') : 'Versturen kan zodra er bereik is'}
      </button>
    </section>
  );
}
