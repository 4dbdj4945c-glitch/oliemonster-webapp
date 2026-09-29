'use client';

/*
  Agenda-abonnement (gebruikersmenu): een geheime link waarop Apple Agenda zich
  abonneert, met de planningsdagen en de contracttaken en een herinnering de dag
  ervoor. De link is per gebruiker, opnieuw te tonen, te vervangen door een
  nieuwe en in te trekken (lib/agenda.ts, /api/agenda).
*/

import { useCallback, useEffect, useState } from 'react';
import { Icon, Modal } from './ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';

interface Stand {
  actief: boolean;
  https?: string;
  webcal?: string;
  aangemaakt?: string;
  laatstGebruikt?: string | null;
}

export default function AgendaVenster({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [gekopieerd, setGekopieerd] = useState(false);

  const laad = useCallback(async () => {
    try {
      const res = await fetch('/api/agenda');
      if (!res.ok) {
        setFout(await foutTekst(res, 'De agendalink kon niet worden opgehaald.'));
        return;
      }
      const data: Stand = await res.json();
      setStand(data);
      setFout('');
    } catch {
      setFout(GEEN_VERBINDING);
    }
  }, []);

  useEffect(() => {
    if (open) laad();
  }, [open, laad]);

  const actie = async (methode: 'POST' | 'DELETE', vraag?: string) => {
    if (vraag && !confirm(vraag)) return;
    setBezig(true);
    setFout('');
    setGekopieerd(false);
    try {
      const res = await fetch('/api/agenda', { method: methode });
      if (!res.ok) {
        setFout(await foutTekst(res, 'Dat lukte niet.'));
        return;
      }
      setStand(await res.json());
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  const kopieer = async () => {
    if (!stand?.https) return;
    try {
      await navigator.clipboard.writeText(stand.https);
      setGekopieerd(true);
    } catch {
      setFout('Kopiëren lukte niet. Houd de link ingedrukt en kies Kopieer.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="md" title="Agenda-abonnement">
      <div className="agenda">
        <p className="agenda-intro">
          Zet je planningsdagen en de contracttaken in Apple Agenda op je iPhone en Mac, met een herinnering de dag ervoor.
          Agenda werkt zichzelf bij; wijzigen doe je hier in de portal.
        </p>

        {fout && <div className="alert alert-danger" role="alert">{fout}</div>}

        {!stand ? (
          !fout && <p className="hint">Laden...</p>
        ) : !stand.actief ? (
          <button type="button" className="btn btn-primary btn-block" onClick={() => actie('POST')} disabled={bezig}>
            <Icon name="agenda-feed" size={20} />
            {bezig ? 'Bezig...' : 'Link maken'}
          </button>
        ) : (
          <>
            <div className="veld">
              <label className="label" htmlFor="agenda-link">Jouw geheime link</label>
              <div className="agenda-link">
                <input id="agenda-link" className="input" readOnly value={stand.https} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn" onClick={kopieer}>
                  <Icon name={gekopieerd ? 'check' : 'copy'} size={16} />
                  {gekopieerd ? 'Gekopieerd' : 'Kopiëren'}
                </button>
              </div>
              <p className="hint">
                Deel deze link met niemand: wie hem heeft, ziet je planning.
                {stand.laatstGebruikt
                  ? ` Laatst opgehaald door een agenda op ${new Date(stand.laatstGebruikt).toLocaleString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`
                  : ' Nog niet opgehaald door een agenda.'}
              </p>
            </div>

            <a className="btn btn-primary btn-block" href={stand.webcal}>
              <Icon name="agenda-feed" size={20} />
              Openen in Agenda
            </a>

            <div className="agenda-uitleg">
              <section>
                <h3><Icon name="phone" size={16} />Op de iPhone</h3>
                <ol>
                  <li>Open dit venster op de iPhone en tik op <strong>Openen in Agenda</strong>, daarna op <strong>Abonneer</strong>.</li>
                  <li>Lukt dat niet: kopieer de link en ga naar Instellingen, Apps, Agenda, Agenda-accounts, Nieuw account, Andere, <strong>Voeg agenda-abonnement toe</strong>. Plak de link en tik op Volgende en Bewaar.</li>
                </ol>
              </section>
              <section>
                <h3><Icon name="calendar" size={16} />Op de Mac</h3>
                <ol>
                  <li>Open Agenda en kies in de menubalk Archief, <strong>Nieuw agenda-abonnement</strong>.</li>
                  <li>Plak de link en klik op Abonneer.</li>
                  <li>Kies bij Locatie <strong>iCloud</strong>, dan staat hij vanzelf ook op je iPhone. Kies bij Vernieuw automatisch <strong>Elk uur</strong>.</li>
                  <li>Zet bij Verwijder het vinkje bij <strong>Waarschuwingen</strong> uit, anders krijg je de herinnering van de dag ervoor niet. Klik op OK.</li>
                </ol>
              </section>
            </div>

            <div className="agenda-beheer">
              <p className="hint">Denk je dat iemand anders de link heeft? Maak een nieuwe: de oude werkt dan meteen niet meer en je abonneert opnieuw.</p>
              <div className="knoppenrij">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={bezig}
                  onClick={() => actie('POST', 'Nieuwe link maken? De oude link werkt daarna niet meer; je moet in Agenda opnieuw abonneren.')}
                >
                  <Icon name="reset" size={16} />
                  Nieuwe link maken
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger-soft"
                  disabled={bezig}
                  onClick={() => actie('DELETE', 'Link intrekken? De agenda op je iPhone en Mac krijgt daarna geen afspraken meer uit de portal.')}
                >
                  <Icon name="trash" size={16} />
                  Link intrekken
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
