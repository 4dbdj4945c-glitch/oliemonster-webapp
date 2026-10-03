'use client';

/*
  Lijst plakken: een werklijst in één keer in de inspectie zetten. Elke
  niet-lege regel wordt een bevinding, kolommen gescheiden door | of een tab
  (titel | locatie | opmerking). Vóór het opslaan een voorbeeld met wat er
  komt en welke regels niet kloppen; opslaan kan pas als alles klopt. Het
  lezen gebeurt met leesPlakLijst (lib/inspecties/plakken.ts), de server
  controleert het nog eens (POST /api/inspecties/[id]/items/bulk).
*/

import { useMemo, useRef, useState } from 'react';
import { Icon, Modal } from '@/app/components/ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { leesPlakLijst } from '@/lib/inspecties/plakken';
import { sjabloonVan } from '@/lib/inspecties/sjablonen';
import { IDEMPOTENTIE_HEADER, nieuweSleutel } from '@/lib/wachtrij';
import type { Inspectie } from './types';

export default function PlakVenster({
  inspectie,
  onClose,
  onOpgeslagen,
}: {
  inspectie: Inspectie;
  onClose: () => void;
  onOpgeslagen: (nieuw: Inspectie, aantal: number) => void;
}) {
  const s = sjabloonVan(inspectie.sjabloon);
  const [tekst, setTekst] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const sleutel = useRef(nieuweSleutel());
  const { regels, fouten } = useMemo(() => leesPlakLijst(tekst), [tekst]);
  const woord = (n: number) => (n === 1 ? s.item.enkel : s.item.meervoud);
  const kan = regels.length > 0 && fouten.length === 0;

  const opslaan = async () => {
    if (!kan) return;
    setBezig(true);
    setFout('');
    try {
      const res = await fetch(`/api/inspecties/${inspectie.id}/items/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENTIE_HEADER]: sleutel.current },
        body: JSON.stringify({ regels: regels.map(({ titel, locatie, notitie }) => ({ titel, locatie, notitie })) }),
      });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De lijst is niet opgeslagen.'));
        return;
      }
      const data = await res.json();
      onOpgeslagen(data.inspectie, data.aantal);
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Lijst plakken"
      footer={
        <>
          <button type="button" className="btn veldwerk-knop" onClick={onClose}>Annuleren</button>
          <button type="button" className="btn btn-primary veldwerk-knop" onClick={opslaan} disabled={!kan || bezig}>
            <Icon name="check" size={16} />
            {bezig ? 'Bezig...' : regels.length > 0 ? `${regels.length} ${woord(regels.length)} toevoegen` : 'Toevoegen'}
          </button>
        </>
      }
    >
      <div className="veldwerk">
        <div className="veld">
          <label className="label" htmlFor="plak-tekst">Eén {s.item.enkel} per regel</label>
          <textarea
            id="plak-tekst"
            className="textarea insp-plak-tekst"
            rows={8}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            placeholder={inspectie.sjabloon === 'markering' ? 'Bron 6: pakkingen | Technische kast | 13 stuks' : `${s.item.titel} | locatie | opmerking`}
            spellCheck={false}
          />
          <p className="hint">
            Kolommen scheiden met | of een tab: {s.item.titel.toLowerCase()} | locatie | opmerking. Locatie en opmerking mogen weg. Een tabel uit Excel of Word plakken kan ook.
          </p>
        </div>

        {(regels.length > 0 || fouten.length > 0) && (
          <p className="label" aria-live="polite" style={{ margin: 0 }}>
            {regels.length + fouten.length} {regels.length + fouten.length === 1 ? 'regel' : 'regels'}, {kan ? 'worden' : 'goed voor'} {regels.length} {woord(regels.length)}
            {fouten.length > 0 ? `. ${fouten.length} ${fouten.length === 1 ? 'regel klopt' : 'regels kloppen'} niet.` : '.'}
          </p>
        )}

        {fouten.length > 0 && (
          <div className="alert alert-danger" role="alert">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {fouten.slice(0, 10).map((f) => (
                <li key={`${f.nr}-${f.melding}`}>
                  Regel {f.nr}: {f.melding}
                  {f.tekst ? `. "${f.tekst.length > 60 ? `${f.tekst.slice(0, 60)}...` : f.tekst}"` : ''}
                </li>
              ))}
              {fouten.length > 10 && <li>En nog {fouten.length - 10} meer.</li>}
            </ul>
          </div>
        )}

        {regels.length > 0 && (
          <ol className="insp-plak-voorbeeld" aria-label="Voorbeeld">
            {regels.map((r, i) => (
              <li key={r.nr}>
                <span className="getal">{inspectie.items.length + i + 1}</span>
                <b>{r.titel}</b>
                <span>{[r.locatie, r.notitie].filter(Boolean).join('. ') || 'Zonder locatie'}</span>
              </li>
            ))}
          </ol>
        )}

        {fout && <div className="alert alert-danger" role="alert">{fout}</div>}
      </div>
    </Modal>
  );
}
