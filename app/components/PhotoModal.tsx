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
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
    >
      <div 
        className="relative max-w-4xl max-h-[90vh] rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95 z-10"
          style={{
            backgroundColor: 'var(--accent)',
            border: '1px solid var(--accent)',
          }}
          aria-label="Sluiten"
        >
          <span className="text-xl" style={{ color: 'var(--background)', lineHeight: 1 }}>×</span>
        </button>

        {/* Download button */}
        <button
          onClick={handleDownload}
          className="absolute top-4 right-16 w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95 z-10"
          style={{
            backgroundColor: 'var(--accent)',
            border: '1px solid var(--accent)',
          }}
          aria-label="Download"
        >
          <span className="text-xl" style={{ color: 'var(--background)', lineHeight: 1 }}>↓</span>
        </button>

        {/* Photo */}
        <img 
          src={photoUrl} 
          alt="Oliemonster foto" 
          className="max-w-full max-h-[90vh] object-contain"
        />
      </div>
    </div>
  );
}
