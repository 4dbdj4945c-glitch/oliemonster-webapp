'use client';

interface PhotoModalProps {
  photoUrl: string;
  onClose: () => void;
  sampleNumber?: string;
}

const knopStijl: React.CSSProperties = {
  position: 'absolute',
  top: '12px',
  width: '36px',
  height: '36px',
  padding: 0,
  borderRadius: '999px',
  zIndex: 10,
};

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
    <div className="modal-backdrop" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: '56rem',
          maxHeight: '90vh',
          background: 'var(--wit)',
          border: '1px solid var(--grijs-200)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
      >
        {/* Sluiten */}
        <button
          type="button"
          onClick={onClose}
          className="btn"
          style={{ ...knopStijl, right: '12px' }}
          aria-label="Sluiten"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>

        {/* Downloaden */}
        <button
          type="button"
          onClick={handleDownload}
          className="btn"
          style={{ ...knopStijl, right: '56px' }}
          aria-label="Download"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>

        {/* Foto */}
        <img
          src={photoUrl}
          alt="Oliemonster foto"
          style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', display: 'block' }}
        />
      </div>
    </div>
  );
}
