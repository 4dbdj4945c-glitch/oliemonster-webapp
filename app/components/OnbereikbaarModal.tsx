'use client';

import { useState } from 'react';
import { Modal, Icon } from './ui';
import OnbereikbaarFormulier, {
  leegOnbereikbaar,
  verstuurOnbereikbaar,
  type OnbereikbaarWaarden,
} from './OnbereikbaarFormulier';

export interface OnbereikbaarDoel {
  id: number;
  oNumber: string;
}

interface Props {
  /** Welk monster; null betekent dat het venster dicht is. */
  doel: OnbereikbaarDoel | null;
  onClose: () => void;
  /** Gelukt: de lijst verversen en de melding tonen. */
  onKlaar: (melding: string) => void;
}

/*
  Los venster om vast te leggen dat een locatie niet te bereiken was. Vanuit de
  rij in de lijst. Hetzelfde formulier zit ook in het scherm Monster nemen, want
  in het veld merk je het daar pas.
*/
export default function OnbereikbaarModal({ doel, onClose, onKlaar }: Props) {
  // De pagina geeft dit venster een key mee per monster, dus bij een ander
  // monster begint het met een leeg formulier. Geen useEffect nodig om te wissen.
  const [waarden, setWaarden] = useState<OnbereikbaarWaarden>(leegOnbereikbaar());
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  const opslaan = async () => {
    if (!doel) return;
    setBezig(true);
    setFout('');
    const melding = await verstuurOnbereikbaar(doel.id, waarden);
    setBezig(false);
    if (melding) {
      setFout(melding);
      return;
    }
    onKlaar(`${doel.oNumber} staat als niet bereikbaar en blijft openstaan.`);
  };

  return (
    <Modal
      open={doel !== null}
      onClose={onClose}
      title={`${doel?.oNumber ?? ''}: niet bereikbaar`}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={bezig}>Terug</button>
          <button type="button" className="btn btn-primary" onClick={opslaan} disabled={bezig}>
            <Icon name="alert-warning" size={16} />
            {bezig ? 'Bezig...' : 'Vastleggen'}
          </button>
        </>
      }
    >
      <OnbereikbaarFormulier waarden={waarden} onChange={setWaarden} uitgeschakeld={bezig} />
      {fout && <div className="alert alert-danger" style={{ marginTop: '12px' }}>{fout}</div>}
    </Modal>
  );
}
