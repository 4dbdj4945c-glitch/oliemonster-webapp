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
import { IDEMPOTENTIE_HEADER, inWachtrij, isNetwerkFout, nieuweSleutel, type Bestand } from '@/lib/wachtrij';
import { useGebruiker } from './GebruikerProvider';
import { useOnline } from './GeenVerbinding';

export interface NeemDoel {
  id: number;
  oNumber: string;
  location: string;
  description: string;
  oilType?: string | null;
  /** De opmerking die er al staat (van de openstaande poging); die blijft staan */
  remarks?: string | null;
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

  Zonder verbinding (of als de verbinding wegvalt tijdens het versturen) gaat
  het ingevulde formulier met de verkleinde foto's in de offline wachtrij
  (lib/wachtrij.ts) en wordt het vanzelf verstuurd zodra er bereik is. Eén
  sleutel per keer dat het venster opent: een herhaling doet op de server niets
  dubbel.
*/
export default function MonsterNemenModal({ doel, onClose, onKlaar }: Props) {
  // De pagina geeft dit venster een key mee per monster, dus elk nieuw monster
  // begint met een leeg formulier en de datum van vandaag. Een opmerking die er
  // al stond, staat er meteen in; anders zou opslaan hem wissen.
  const [stap, setStap] = useState<'nemen' | 'onbereikbaar'>('nemen');
  const [datum, setDatum] = useState(vandaag());
  const [oilType, setOilType] = useState(doel?.oilType || '');
  const [opmerking, setOpmerking] = useState(doel?.remarks || '');
  const [fotoOnderdeel, setFotoOnderdeel] = useState<File | null>(null);
  const [fotoPotje, setFotoPotje] = useState<File | null>(null);
  const [onbereikbaar, setOnbereikbaar] = useState<OnbereikbaarWaarden>(leegOnbereikbaar());
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const gebruiker = useGebruiker();
  const [sleutel] = useState(nieuweSleutel);
  const online = useOnline();

  const opslaan = async () => {
    if (!doel) return;
    if (!datum) {
      setFout('Vul de datum van de afname in.');
      return;
    }
    setBezig(true);
    setFout('');

    const velden = { sampleDate: datum, oilType, remarks: opmerking };
    // Verkleind naar ongeveer 400 KB per foto; twee onverkleinde iPhone-foto's
    // gaan over de grens van 4,5 MB per verzoek.
    const bestanden: Bestand[] = [];
    if (fotoOnderdeel) {
      const f = await verkleinFoto(fotoOnderdeel);
      bestanden.push({ veld: 'photoOnderdeel', naam: f.name, blob: f });
    }
    if (fotoPotje) {
      const f = await verkleinFoto(fotoPotje);
      bestanden.push({ veld: 'photoPotje', naam: f.name, blob: f });
    }

    // Geen bereik: bewaren op de telefoon, de wachtrij verstuurt het later.
    const bewaar = async () => {
      try {
        await inWachtrij({ sleutel, soort: 'monster-nemen', gebruiker: gebruiker.username, titel: `${doel.oNumber} nemen`, monsterId: doel.id, velden, bestanden });
        onKlaar(`${doel.oNumber} is op deze telefoon bewaard en gaat vanzelf mee zodra er bereik is.`);
      } catch {
        setFout('Geen verbinding, en bewaren op deze telefoon lukte ook niet. Laat het venster open en probeer het zo opnieuw.');
      }
    };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await bewaar();
      setBezig(false);
      return;
    }

    const form = new FormData();
    for (const [k, v] of Object.entries(velden)) form.append(k, v);
    for (const b of bestanden) form.append(b.veld, b.blob as File);

    try {
      const res = await fetch(`/api/samples/${doel.id}/nemen`, { method: 'POST', body: form, headers: { [IDEMPOTENTIE_HEADER]: sleutel } });
      if (!res.ok) {
        setFout(await foutTekst(res, 'Het monster is niet opgeslagen.'));
        return;
      }
      onKlaar(`${doel.oNumber} staat op genomen.`);
    } catch (e) {
      // Verbinding weg tijdens het versturen: misschien kwam het wel aan. Met
      // dezelfde sleutel in de wachtrij, dan gebeurt er op de server niets dubbel.
      if (isNetwerkFout(e)) await bewaar();
      else setFout(GEEN_VERBINDING);
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
              <Icon name={online ? 'status-taken' : 'offline'} size={16} />
              {bezig ? 'Bezig...' : online ? 'Opslaan als genomen' : 'Bewaren op deze telefoon'}
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

      {stap === 'nemen' && !online && (
        <div className="alert alert-info veldwerk-offline" role="status">
          <Icon name="offline" size={16} />
          Geen bereik. Wat je opslaat, wordt op deze telefoon bewaard en gaat vanzelf mee zodra er weer verbinding is.
        </div>
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
