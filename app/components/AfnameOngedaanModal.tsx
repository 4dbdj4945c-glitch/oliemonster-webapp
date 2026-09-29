'use client';

import { useState } from 'react';
import { Icon, Modal } from '@/app/components/ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';

/**
 * Bevestiging voor Afname ongedaan maken: de laatste monstername gaat terug
 * naar niet genomen. Zegt precies wat er verdwijnt (datum en foto's) en wat
 * blijft (de opmerking, eerdere monsternames, het monster zelf). Wordt gebruikt
 * vanuit het bewerkvenster en vanuit het pogingenpaneel.
 */
export interface AfnameDoel {
  sampleId: number;
  oNumber: string;
  sampleDate: string | null;
  heeftFotoPotje: boolean;
  heeftFotoOnderdeel: boolean;
  /** Hoeveel monsternames er zijn; bij meer dan één gaat het alleen om de laatste */
  aantalPogingen: number;
}

export default function AfnameOngedaanModal({
  doel,
  onClose,
  onKlaar,
}: {
  doel: AfnameDoel | null;
  onClose: () => void;
  onKlaar: (doel: AfnameDoel) => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  if (!doel) return null;

  const sluit = () => {
    setFout('');
    onClose();
  };

  const bevestig = async () => {
    setBezig(true);
    setFout('');
    try {
      const res = await fetch(`/api/samples/${doel.sampleId}/afname-ongedaan`, { method: 'POST' });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De afname is niet ongedaan gemaakt.'));
        return;
      }
      onKlaar(doel);
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  const weg: string[] = [
    doel.sampleDate
      ? `de afnamedatum ${new Date(doel.sampleDate).toLocaleDateString('nl-NL')}`
      : 'de afnamedatum',
  ];
  if (doel.heeftFotoOnderdeel) weg.push('de foto van het onderdeel');
  if (doel.heeftFotoPotje) weg.push('de foto van het monsterpotje');

  return (
    <Modal
      open
      onClose={sluit}
      title={`Afname van ${doel.oNumber} ongedaan maken`}
      footer={
        <>
          <button type="button" className="btn" onClick={sluit}>
            Terug
          </button>
          <button type="button" className="btn btn-primary" onClick={bevestig} disabled={bezig}>
            <Icon name="reset" size={16} />
            {bezig ? 'Bezig...' : 'Afname ongedaan maken'}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        {doel.aantalPogingen > 1 ? 'De laatste monstername' : 'De monstername'} van {doel.oNumber} gaat terug
        naar niet genomen.
      </p>
      <p className="label" style={{ margin: '12px 0 4px' }}>Dit verdwijnt</p>
      <ul className="afname-lijst">
        {weg.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <p className="hint" style={{ marginBottom: 0 }}>
        De opmerking blijft staan{doel.aantalPogingen > 1 ? ', net als de eerdere monsternames' : ''}. Het monster
        zelf blijft in de lijst. De oude datum en de foto-adressen staan in het logboek.
      </p>
      {fout && (
        <div className="alert alert-danger" role="alert" style={{ marginTop: '12px' }}>
          {fout}
        </div>
      )}
    </Modal>
  );
}
