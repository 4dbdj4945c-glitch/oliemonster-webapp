'use client';

import { useState } from 'react';
import { Modal, Icon } from './ui';
import FotoKiezer from './FotoKiezer';
import OnbereikbaarFormulier, {
  leegOnbereikbaar,
  verstuurOnbereikbaar,
  type OnbereikbaarWaarden,
} from './OnbereikbaarFormulier';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { verkleinFoto } from '@/lib/fotoVerkleinen';

export interface NeemDoel {
  id: number;
  oNumber: string;
  location: string;
  description: string;
  oilType?: string | null;
  /** Foto's die er al staan, van een eerdere poging */
  photoUrl?: string | null;
  partPhotoUrl?: string | null;
}

interface Props {
  /** Welk monster; null betekent dat het venster dicht is. */
  doel: NeemDoel | null;
  onClose: () => void;
  /** Gelukt: de lijst verversen en de melding tonen. */
  onKlaar: (melding: string) => void;
}

/** Vandaag als jjjj-mm-dd, in de eigen tijdzone en niet in UTC. */
function vandaag(): string {
  const nu = new Date();
  const maand = String(nu.getMonth() + 1).padStart(2, '0');
  const dag = String(nu.getDate()).padStart(2, '0');
  return `${nu.getFullYear()}-${maand}-${dag}`;
}

/*
  Monster nemen in één keer. Eerst moest je via hermonstering een afname
  inplannen voordat je iets kon invullen; dat was te omslachtig. Dit venster
  staat meteen open met de datum van vandaag, het type olie, een opmerking en
  beide foto's, en je slaat het in één keer op.

  Merk je in het veld dat je er niet bij kunt, dan schakelt de knop Niet
  bereikbaar over naar dat formulier, binnen hetzelfde venster.

  Grote velden en knoppen, want dit wordt op een telefoon met werkhandschoenen
  aan gebruikt (klasse veldwerk in globals.css).
*/
export default function MonsterNemenModal({ doel, onClose, onKlaar }: Props) {
  // De pagina geeft dit venster een key mee per monster, dus elk nieuw monster
  // begint met een leeg formulier en de datum van vandaag.
  const [stap, setStap] = useState<'nemen' | 'onbereikbaar'>('nemen');
  const [datum, setDatum] = useState(vandaag());
  const [oilType, setOilType] = useState(doel?.oilType || '');
  const [opmerking, setOpmerking] = useState('');
  const [fotoOnderdeel, setFotoOnderdeel] = useState<File | null>(null);
  const [fotoPotje, setFotoPotje] = useState<File | null>(null);
  const [onbereikbaar, setOnbereikbaar] = useState<OnbereikbaarWaarden>(leegOnbereikbaar());
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  const opslaan = async () => {
    if (!doel) return;
    if (!datum) {
      setFout('Vul de datum van de afname in.');
      return;
    }
    setBezig(true);
    setFout('');

    const form = new FormData();
    form.append('sampleDate', datum);
    form.append('oilType', oilType);
    form.append('remarks', opmerking);
    // Verkleind naar ongeveer 400 KB per foto; twee onverkleinde iPhone-foto's
    // gaan over de grens van 4,5 MB per verzoek.
    if (fotoOnderdeel) form.append('photoOnderdeel', await verkleinFoto(fotoOnderdeel));
    if (fotoPotje) form.append('photoPotje', await verkleinFoto(fotoPotje));

    try {
      const res = await fetch(`/api/samples/${doel.id}/nemen`, { method: 'POST', body: form });
      if (!res.ok) {
        setFout(await foutTekst(res, 'Het monster is niet opgeslagen.'));
        return;
      }
      onKlaar(`${doel.oNumber} staat op genomen.`);
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  const legVastOnbereikbaar = async () => {
    if (!doel) return;
    setBezig(true);
    setFout('');
    const melding = await verstuurOnbereikbaar(doel.id, onbereikbaar);
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
      size="md"
      title={
        stap === 'nemen'
          ? `${doel?.oNumber ?? ''} nemen`
          : `${doel?.oNumber ?? ''}: niet bereikbaar`
      }
      footer={
        stap === 'nemen' ? (
          <>
            <button type="button" className="btn veldwerk-knop" onClick={onClose} disabled={bezig}>Terug</button>
            <button type="button" className="btn btn-primary veldwerk-knop" onClick={opslaan} disabled={bezig}>
              <Icon name="status-taken" size={16} />
              {bezig ? 'Bezig...' : 'Opslaan als genomen'}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn veldwerk-knop" onClick={() => setStap('nemen')} disabled={bezig}>
              Terug naar nemen
            </button>
            <button type="button" className="btn btn-primary veldwerk-knop" onClick={legVastOnbereikbaar} disabled={bezig}>
              <Icon name="alert-warning" size={16} />
              {bezig ? 'Bezig...' : 'Vastleggen'}
            </button>
          </>
        )
      }
    >
      {doel && (
        <p className="veldwerk-kop">
          <strong>{doel.location}</strong>
          <span>{doel.description}</span>
        </p>
      )}

      {stap === 'nemen' ? (
        <div className="veldwerk">
          <div className="veld">
            <label className="label" htmlFor="neem-datum">Datum afname</label>
            <input
              id="neem-datum"
              type="date"
              className="input"
              value={datum}
              disabled={bezig}
              onChange={(e) => setDatum(e.target.value)}
            />
          </div>

          <div className="veld">
            <label className="label" htmlFor="neem-olietype">Type olie</label>
            <input
              id="neem-olietype"
              type="text"
              className="input"
              placeholder="Bijv. hydraulische olie"
              value={oilType}
              disabled={bezig}
              onChange={(e) => setOilType(e.target.value)}
            />
          </div>

          <div className="veld">
            <label className="label" htmlFor="neem-opmerking">Opmerking</label>
            <textarea
              id="neem-opmerking"
              className="textarea"
              rows={2}
              placeholder="Alleen als er iets bijzonders was"
              value={opmerking}
              disabled={bezig}
              onChange={(e) => setOpmerking(e.target.value)}
            />
          </div>

          <div>
            <p className="label">Twee foto&apos;s</p>
            <div className="veldwerk-fotos">
              <FotoKiezer
                label="Het onderdeel"
                icoon="sample-point"
                bestand={fotoOnderdeel}
                bestaandeUrl={doel?.partPhotoUrl ?? null}
                uitgeschakeld={bezig}
                onKies={setFotoOnderdeel}
              />
              <FotoKiezer
                label="Het monsterpotje"
                icoon="oil-sample"
                bestand={fotoPotje}
                bestaandeUrl={doel?.photoUrl ?? null}
                uitgeschakeld={bezig}
                onKies={setFotoPotje}
              />
            </div>
          </div>

          <button
            type="button"
            className="btn btn-block"
            onClick={() => setStap('onbereikbaar')}
            disabled={bezig}
          >
            <Icon name="alert-warning" size={16} />
            Niet bereikbaar
          </button>
        </div>
      ) : (
        <OnbereikbaarFormulier
          waarden={onbereikbaar}
          onChange={setOnbereikbaar}
          uitgeschakeld={bezig}
        />
      )}

      {fout && <div className="alert alert-danger" style={{ marginTop: '12px' }}>{fout}</div>}
    </Modal>
  );
}
