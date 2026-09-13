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
        <img src={photoUrl} alt="Oliemonster foto" className="foto-beeld" />
      </div>

      <style jsx>{`
        .foto-paneel {
          position: relative;
          max-width: 56rem;
          max-height: 90vh;
          background: var(--wit);
          border: 1px solid var(--grijs-200);
          border-radius: var(--radius);
          box-shadow: var(--shadow-xl);
          overflow: hidden;
        }
        .foto-beeld {
          display: block;
          max-width: 100%;
          max-height: 90vh;
          object-fit: contain;
        }
        .foto-knop {
          position: absolute;
          top: 12px;
          width: 36px;
          height: 36px;
          padding: 0;
          border-radius: 999px;
          z-index: 10;
        }
        .foto-knop-sluiten {
          right: 12px;
        }
        .foto-knop-download {
          right: 56px;
        }

        /* Telefoon: foto op volle breedte, gecentreerd, knoppen van 44px
           binnen het veilige gebied (notch en homebalk). */
        @media (max-width: 640px) {
          .foto-backdrop {
            align-items: center;
            padding: 0;
          }
          .foto-paneel {
            width: 100%;
            max-width: 100%;
            max-height: 100dvh;
            border: none;
            border-radius: 0;
          }
          .foto-beeld {
            width: 100%;
            max-height: 100dvh;
            padding-top: env(safe-area-inset-top);
            padding-bottom: env(safe-area-inset-bottom);
          }
          .foto-knop {
            top: max(12px, env(safe-area-inset-top));
            width: 44px;
            height: 44px;
            min-height: 44px;
          }
          .foto-knop-sluiten {
            right: max(12px, env(safe-area-inset-right));
          }
          .foto-knop-download {
            right: calc(max(12px, env(safe-area-inset-right)) + 52px);
          }
        }
      `}</style>
    </div>
  );
}
