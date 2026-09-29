'use client';

import { Modal, Icon } from '@/app/components/ui';

/** Wat dit venster van een monster moet weten. */
export interface ActiesDoel {
  oNumber: string;
  isTaken: boolean;
  isDisabled?: boolean;
  isUnreachable?: boolean;
}

interface Props {
  doel: ActiesDoel | null;
  onClose: () => void;
  onRedenAanpassen: () => void;
  onWeerBereikbaar: () => void;
  onTerugdraaien: () => void;
  onAnnuleren: () => void;
  onHermonstering: () => void;
}

/*
  De minder gebruikte handelingen bij een monster, achter de knop Meer in de
  monstertabel. Vroeger stonden ze allemaal naast elkaar in de rij, en dan liep
  de tabel op 1440 px ruim buiten zijn kader: Bewerken was niet eens te zien.
  In de rij blijven alleen Monster nemen (als het monster open staat), Meer en
  Bewerken. Opmaak in globals.css (.acties-lijst).
*/
export default function MonsterActiesModal({
  doel,
  onClose,
  onRedenAanpassen,
  onWeerBereikbaar,
  onTerugdraaien,
  onAnnuleren,
  onHermonstering,
}: Props) {
  // Eerst sluiten, dan de handeling: die opent vaak zelf een venster.
  const doe = (handeling: () => void) => () => {
    onClose();
    handeling();
  };

  return (
    <Modal
      open={doel !== null}
      onClose={onClose}
      title={doel ? `Meer bij ${doel.oNumber}` : 'Meer'}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Sluiten
        </button>
      }
    >
      {doel && (
        <div className="acties-lijst">
          {!doel.isDisabled && !doel.isTaken && doel.isUnreachable && (
            <>
              <button type="button" className="btn btn-block" onClick={doe(onRedenAanpassen)}>
                <Icon name="pencil" />
                Reden van Niet bereikbaar aanpassen
              </button>
              <button type="button" className="btn btn-block" onClick={doe(onWeerBereikbaar)}>
                <Icon name="reset" />
                Weer bereikbaar
              </button>
            </>
          )}
          <button type="button" className="btn btn-block" onClick={doe(onHermonstering)}>
            <Icon name="resample" />
            Hermonstering toevoegen
          </button>
          {doel.isDisabled ? (
            <button type="button" className="btn btn-block" onClick={doe(onTerugdraaien)}>
              <Icon name="reset" />
              Annulering terugdraaien
            </button>
          ) : (
            <button type="button" className="btn btn-block" onClick={doe(onAnnuleren)}>
              <Icon name="status-cancelled" />
              Monster annuleren
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
