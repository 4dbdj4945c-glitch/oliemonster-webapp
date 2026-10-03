'use client';

/*
  De foto's van een bevinding in het venster Bevinding: een raster van
  miniaturen (lui geladen), per foto een bijschrift, en de knop Foto's toevoegen
  (camera of fotobibliotheek, meerdere tegelijk). Nieuw gekozen foto's staan er
  met een gestippelde rand bij tot Opslaan; daarna gaan ze één voor één naar de
  server (BevindingVenster). De volgorde is die van toevoegen: de eerste is de
  overzichtsfoto. Weghalen van een foto die er al staat is zacht: daarna staat
  onderin Ongedaan maken (Invulscherm). Geen rode prullenbak in het raster.
  Opmaak in globals.css (.insp-fotos-*), geen styled-jsx.
*/

import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/ui';
import { nieuweSleutel } from '@/lib/wachtrij';
import type { InspectieFoto } from './types';

export interface NieuweFoto {
  /** Ook de idempotentiesleutel: opnieuw proberen maakt de foto niet dubbel. */
  sleutel: string;
  bestand: File;
  bijschrift: string;
  /** Mislukt bij de vorige poging: de melding. */
  fout?: string;
}

/** Voorbeeld van een gekozen foto. De blob-URL hoort bij één effect, zodat hij ook in de dubbele ontwikkelmodus van React niet te vroeg wordt opgeruimd. */
function Miniatuur({ bestand }: { bestand: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(bestand);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bestand]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" loading="lazy" decoding="async" /> : null;
}

export default function BevindingFotos({
  bestaande,
  bijschriften,
  onBijschrift,
  onWeghalen,
  nieuwe,
  onNieuwe,
  voortgang,
  uitgeschakeld,
}: {
  bestaande: InspectieFoto[];
  /** Gewijzigde bijschriften van bestaande foto's, per id */
  bijschriften: Record<number, string>;
  onBijschrift: (id: number, tekst: string) => void;
  onWeghalen: (foto: InspectieFoto, nr: number) => void;
  nieuwe: NieuweFoto[];
  onNieuwe: (lijst: NieuweFoto[]) => void;
  voortgang: string;
  uitgeschakeld: boolean;
}) {
  const totaal = bestaande.length + nieuwe.length;
  const voorbeeld = (nr: number) => (nr === 1 ? 'Bijv. Overzicht' : 'Bijschrift (mag leeg)');

  return (
    <section className="insp-fotos-blok" aria-labelledby="bv-fotos-kop">
      <div className="insp-fotos-kop">
        <span id="bv-fotos-kop" className="label">Foto&apos;s</span>
        <small>{totaal === 0 ? 'nog geen' : nieuwe.length > 0 ? `${totaal}, waarvan ${nieuwe.length} nieuw` : totaal}</small>
      </div>
      {totaal > 0 && (
        <ul className="insp-fotos">
          {bestaande.map((f, i) => (
            <li key={f.id}>
              <a className="insp-foto" href={f.url} target="_blank" rel="noreferrer" aria-label={`Foto ${i + 1} groot bekijken`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="" loading="lazy" decoding="async" />
                <span className="insp-foto-nr getal" aria-hidden="true">{i + 1}</span>
              </a>
              <input
                className="input"
                aria-label={`Bijschrift foto ${i + 1}`}
                value={bijschriften[f.id] ?? f.bijschrift ?? ''}
                placeholder={voorbeeld(i + 1)}
                maxLength={300}
                disabled={uitgeschakeld}
                onChange={(e) => onBijschrift(f.id, e.target.value)}
              />
              <button type="button" className="btn btn-sm btn-ghost insp-foto-weg" onClick={() => onWeghalen(f, i + 1)} disabled={uitgeschakeld}>
                <Icon name="image-remove" size={16} />
                Weghalen
              </button>
            </li>
          ))}
          {nieuwe.map((f, i) => {
            const nr = bestaande.length + i + 1;
            return (
              <li key={f.sleutel} className={f.fout ? 'insp-foto-fout' : 'insp-foto-nieuw'}>
                <span className="insp-foto">
                  <Miniatuur bestand={f.bestand} />
                  <span className="insp-foto-nr getal" aria-hidden="true">{nr}</span>
                </span>
                <input
                  className="input"
                  aria-label={`Bijschrift foto ${nr}`}
                  value={f.bijschrift}
                  placeholder={voorbeeld(nr)}
                  maxLength={300}
                  disabled={uitgeschakeld}
                  onChange={(e) => onNieuwe(nieuwe.map((x) => (x.sleutel === f.sleutel ? { ...x, bijschrift: e.target.value } : x)))}
                />
                {f.fout && <p className="veld-fout" style={{ margin: 0 }}>Niet opgeslagen</p>}
                <button
                  type="button"
                  className="btn btn-sm btn-ghost insp-foto-weg"
                  onClick={() => onNieuwe(nieuwe.filter((x) => x.sleutel !== f.sleutel))}
                  disabled={uitgeschakeld}
                >
                  <Icon name="close" size={16} />
                  Niet toevoegen
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {voortgang && (
        <p className="insp-foto-voortgang" aria-live="polite">{voortgang}</p>
      )}
      <label className={`btn veldwerk-knop insp-foto-toevoegen${uitgeschakeld ? ' disabled' : ''}`}>
        <Icon name="camera" size={20} />
        {totaal === 0 ? "Foto's toevoegen" : "Meer foto's toevoegen"}
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={uitgeschakeld}
          onChange={(e) => {
            const gekozen = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (gekozen.length === 0) return;
            onNieuwe([...nieuwe, ...gekozen.map((bestand) => ({ sleutel: nieuweSleutel(), bestand, bijschrift: '' }))]);
          }}
        />
      </label>
      <p className="hint" style={{ margin: 0 }}>
        Kies er meerdere tegelijk uit de camera of je foto&apos;s. De eerste foto is de overzichtsfoto. Nieuwe foto&apos;s gaan mee als je op Opslaan tikt.
      </p>
    </section>
  );
}
