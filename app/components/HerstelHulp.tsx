'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/ui';

/**
 * Herstelhulp bij Nieuw monster. Typ je een O-nummer dat vorig jaar bestond maar
 * dit jaar niet, dan stelt hij voor om locatie, omschrijving, type olie en
 * object uit het vorige jaar over te nemen. Pas na een tik op de knop: wat je
 * zelf al hebt ingevuld wordt nooit stilletjes overschreven.
 *
 * Staat het nummer dit jaar in de prullenbak, dan wijst hij daarop en biedt
 * hij Herstellen aan, want dan komen ook de pogingen en foto's terug.
 */
export interface OverTeNemen {
  location: string;
  description: string;
  oilType: string;
  objectId: string;
}

interface Kandidaat {
  id: number;
  oNumber: string;
  location: string;
  description: string;
  oilType?: string | null;
  objectId?: number | null;
}

export default function HerstelHulp({
  oNumber,
  jaar,
  bestaatAl,
  onOvernemen,
  onHerstel,
}: {
  oNumber: string;
  jaar: number;
  /** Het nummer staat dit jaar al in de lijst; dan valt er niets te helpen */
  bestaatAl: boolean;
  onOvernemen: (gegevens: OverTeNemen) => void;
  onHerstel: (id: number, oNumber: string) => Promise<void>;
}) {
  const vorigJaar = jaar - 1;
  const [vorig, setVorig] = useState<Kandidaat | null>(null);
  const [inPrullenbak, setInPrullenbak] = useState<{ id: number; oNumber: string } | null>(null);
  const [overgenomen, setOvergenomen] = useState(false);
  const [bezig, setBezig] = useState(false);

  const nummer = oNumber.trim();

  useEffect(() => {
    setOvergenomen(false);
    if (!nummer || bestaatAl) {
      setVorig(null);
      setInPrullenbak(null);
      return;
    }
    let weg = false;
    // Even wachten tot het typen stilvalt, anders vuren we per letter.
    const klok = window.setTimeout(async () => {
      try {
        const [resVorig, resBak] = await Promise.all([
          fetch(`/api/samples?${new URLSearchParams({ year: String(vorigJaar), search: nummer })}`),
          fetch(`/api/samples/verwijderd?year=${jaar}`),
        ]);
        const gelijk = (s: { oNumber: string }) => s.oNumber.trim().toLowerCase() === nummer.toLowerCase();
        const lijst: Kandidaat[] = resVorig.ok ? await resVorig.json() : [];
        const bak: { monsters?: Kandidaat[] } = resBak.ok ? await resBak.json() : {};
        if (weg) return;
        setVorig(Array.isArray(lijst) ? lijst.find(gelijk) ?? null : null);
        const b = (bak.monsters ?? []).find(gelijk);
        setInPrullenbak(b ? { id: b.id, oNumber: b.oNumber } : null);
      } catch {
        if (!weg) {
          setVorig(null);
          setInPrullenbak(null);
        }
      }
    }, 350);
    return () => {
      weg = true;
      window.clearTimeout(klok);
    };
  }, [nummer, jaar, vorigJaar, bestaatAl]);

  if (inPrullenbak) {
    return (
      <div className="alert alert-warning herstel-hulp" role="status">
        <span>
          {inPrullenbak.oNumber} staat in de prullenbak van {jaar}. Zet het terug, dan komen de monsternames, datums
          en foto&apos;s ook weer terug.
        </span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={bezig}
          onClick={async () => {
            setBezig(true);
            try {
              await onHerstel(inPrullenbak.id, inPrullenbak.oNumber);
            } finally {
              setBezig(false);
            }
          }}
        >
          <Icon name="reset" size={16} />
          {bezig ? 'Bezig...' : `${inPrullenbak.oNumber} herstellen`}
        </button>
      </div>
    );
  }

  if (!vorig) return null;

  const samenvatting = [vorig.location, vorig.description, vorig.oilType].filter(Boolean).join(', ');

  return (
    <div className="alert alert-info herstel-hulp" role="status">
      <span>
        {overgenomen
          ? `Gegevens van ${vorig.oNumber} uit ${vorigJaar} ingevuld. Controleer ze en kies Toevoegen.`
          : `${vorig.oNumber} bestaat in ${vorigJaar}: ${samenvatting}.`}
      </span>
      {!overgenomen && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            onOvernemen({
              location: vorig.location ?? '',
              description: vorig.description ?? '',
              oilType: vorig.oilType ?? '',
              objectId: vorig.objectId ? String(vorig.objectId) : '',
            });
            setOvergenomen(true);
          }}
        >
          <Icon name="copy-year" size={16} />
          Gegevens overnemen uit {vorigJaar}
        </button>
      )}
    </div>
  );
}
