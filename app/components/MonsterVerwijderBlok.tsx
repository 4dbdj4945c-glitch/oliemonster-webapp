'use client';

import { useState } from 'react';
import { Icon } from '@/app/components/ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';

/**
 * Het afgescheiden blok "Monster verwijderen" onderaan het bewerkvenster. Dit is
 * de enige plek waar een heel monster weg kan: niet meer als prullenbakje in de
 * rij, waar het naast Bewerken en Hermonstering te makkelijk te raken was.
 * Eerst uitklappen, dan het O-nummer overtypen, dan pas de knop.
 *
 * Het monster gaat naar de prullenbak (zacht verwijderen); een admin zet het
 * daar terug, en direct na het verwijderen kan het met Ongedaan maken.
 */
export interface VerwijderDoel {
  id: number;
  oNumber: string;
  attemptsCount?: number;
  isTaken: boolean;
  sampleDate: string | null;
  photoUrl?: string | null;
  partPhotoUrl?: string | null;
}

export default function MonsterVerwijderBlok({
  doel,
  onVerwijderd,
}: {
  doel: VerwijderDoel;
  onVerwijderd: (doel: VerwijderDoel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [getypt, setGetypt] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  const klopt = getypt.trim().toLowerCase() === doel.oNumber.trim().toLowerCase();
  const pogingen = doel.attemptsCount ?? 0;
  const fotos = [doel.partPhotoUrl, doel.photoUrl].filter(Boolean).length;

  const watGaatWeg: string[] = [];
  if (pogingen > 0) {
    watGaatWeg.push(pogingen === 1 ? 'de monstername' : `alle ${pogingen} monsternames`);
  }
  watGaatWeg.push(
    doel.isTaken && doel.sampleDate
      ? `de afnamedatum (${new Date(doel.sampleDate).toLocaleDateString('nl-NL')})`
      : 'de datums'
  );
  watGaatWeg.push(fotos > 0 ? `${fotos === 1 ? 'de foto' : `de ${fotos} foto's`}` : "eventuele foto's");
  const opsomming =
    watGaatWeg.length > 1
      ? `${watGaatWeg.slice(0, -1).join(', ')} en ${watGaatWeg[watGaatWeg.length - 1]}`
      : watGaatWeg[0];

  const verwijder = async () => {
    if (!klopt || bezig) return;
    setBezig(true);
    setFout('');
    try {
      const res = await fetch(`/api/samples/${doel.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bevestigONummer: getypt.trim() }),
      });
      if (!res.ok) {
        setFout(await foutTekst(res, 'Het monster is niet verwijderd.'));
        return;
      }
      onVerwijderd(doel);
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  return (
    <section className="gevarenzone" aria-labelledby={`verwijder-kop-${doel.id}`}>
      <p className="gevarenzone-kop" id={`verwijder-kop-${doel.id}`}>
        <Icon name="trash" size={16} />
        Monster verwijderen
      </p>
      <p className="gevarenzone-tekst">
        Hiermee haal je {doel.oNumber} uit de lijst, de planning en de PDF. Daarmee verdwijnen ook{' '}
        {opsomming}. Het monster gaat naar de prullenbak van dit jaar, waar een admin het terugzet.
      </p>
      <p className="gevarenzone-tekst">
        Wil je alleen een monstername terugdraaien? Gebruik dan Afname ongedaan maken.
      </p>

      {!open ? (
        <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => setOpen(true)}>
          <Icon name="trash" size={16} />
          Monster verwijderen...
        </button>
      ) : (
        <div className="gevarenzone-bevestig">
          <label className="label" htmlFor={`verwijder-bevestig-${doel.id}`}>
            Typ {doel.oNumber} om te bevestigen
          </label>
          <input
            id={`verwijder-bevestig-${doel.id}`}
            className="input"
            value={getypt}
            onChange={(e) => setGetypt(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={doel.oNumber}
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
              {bezig ? 'Bezig...' : `${doel.oNumber} verwijderen`}
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
