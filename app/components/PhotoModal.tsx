'use client';

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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>

        {/* Downloaden */}
        <button
          type="button"
          onClick={handleDownload}
          className="btn foto-knop foto-knop-download"
          aria-label="Download"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
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
