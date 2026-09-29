'use client';

import { useState } from 'react';
import Icon from './ui/Icon';

export interface FotoInVenster {
  url: string;
  /** Wat er op de foto staat, bijvoorbeeld "Foto onderdeel" */
  label: string;
}

interface PhotoModalProps {
  /** De foto's die bij dit monster horen; één of meer. */
  fotos: FotoInVenster[];
  /** Welke foto als eerste open staat */
  startIndex?: number;
  onClose: () => void;
  sampleNumber?: string;
}

/*
  Fotovenster. Een monster heeft twee foto's: het onderdeel waar het monster
  vandaan komt en het monsterpotje. Staan ze er beide, dan kun je hier met één
  tik wisselen. Alle opmaak staat in globals.css, want styled-jsx in een los
  component krijgt de scope-klasse niet mee (zie STIJL.md).
*/
export default function PhotoModal({ fotos, startIndex = 0, onClose, sampleNumber }: PhotoModalProps) {
  const [actief, setActief] = useState(
    startIndex >= 0 && startIndex < fotos.length ? startIndex : 0
  );

  if (fotos.length === 0) return null;
  const foto = fotos[Math.min(actief, fotos.length - 1)];

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = foto.url;
    const soort = foto.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    link.download = `oliemonster-${sampleNumber || 'foto'}-${soort}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="modal-backdrop foto-backdrop" onClick={onClose}>
      <div className="foto-paneel" onClick={(e) => e.stopPropagation()}>
        {/* Sluiten */}
        <button
          type="button"
          onClick={onClose}
          className="btn foto-knop foto-knop-sluiten"
          aria-label="Sluiten"
        >
          <Icon name="close" />
        </button>

        {/* Downloaden */}
        <button
          type="button"
          onClick={handleDownload}
          className="btn foto-knop foto-knop-download"
          aria-label={`${foto.label} downloaden`}
        >
          <Icon name="download" />
        </button>

        {/* Wisselen tussen de twee foto's; bij één foto is er niets te kiezen */}
        {fotos.length > 1 && (
          <div className="foto-keuze" role="tablist">
            {fotos.map((f, i) => (
              <button
                key={f.url}
                type="button"
                role="tab"
                aria-selected={i === actief}
                className={i === actief ? 'on' : ''}
                onClick={() => setActief(i)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Foto */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={foto.url}
          alt={foto.label}
          className="foto-beeld"
          title="Klik voor volledig formaat"
          onClick={() => window.open(foto.url, '_blank', 'noopener')}
        />
        <div className="foto-onderschrift">
          {foto.label}. Klik op de foto voor volledig formaat.
        </div>
      </div>
    </div>
  );
}
