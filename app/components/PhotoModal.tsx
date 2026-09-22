'use client';

import Icon from './ui/Icon';

interface PhotoModalProps {
  photoUrl: string;
  onClose: () => void;
  sampleNumber?: string;
}

export default function PhotoModal({ photoUrl, onClose, sampleNumber }: PhotoModalProps) {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = photoUrl;
    link.download = `oliemonster-${sampleNumber || 'foto'}.jpg`;
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
          aria-label="Download"
        >
          <Icon name="download" />
        </button>

        {/* Foto */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt="Oliemonster foto"
          className="foto-beeld"
          title="Klik voor volledig formaat"
          onClick={() => window.open(photoUrl, '_blank', 'noopener')}
        />
        <div className="foto-onderschrift">Klik op de foto voor volledig formaat</div>
      </div>
    </div>
  );
}
