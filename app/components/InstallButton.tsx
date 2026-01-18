'use client';

import { useState, useEffect } from 'react';

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'macos' | 'windows' | 'android' | 'other'>('other');

  useEffect(() => {
    // Detect platform
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isMac = /Macintosh|MacIntel|MacPPC|Mac68K/.test(ua) && !isIOS;
    const isWindows = /Win32|Win64|Windows|WinCE/.test(ua);
    const isAndroid = /Android/.test(ua);

    if (isIOS) setPlatform('ios');
    else if (isMac) setPlatform('macos');
    else if (isWindows) setPlatform('windows');
    else if (isAndroid) setPlatform('android');

    // Listen for PWA install prompt (Chrome/Edge on desktop/Android)
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Chrome/Edge desktop & Android - native install prompt
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      // Show platform-specific instructions
      setShowInstructions(true);
    }
  };

  const getInstructions = () => {
    switch (platform) {
      case 'ios':
        return (
          <div>
            <p style={{ marginBottom: '1rem', fontSize: '0.875rem', lineHeight: '1.5' }}>
              1. Tik op het <strong>Deel</strong> icoon (□↑) onderaan Safari<br/>
              2. Scroll naar beneden en tik op <strong>"Voeg toe aan beginscherm"</strong><br/>
              3. Tik op <strong>"Voeg toe"</strong>
            </p>
          </div>
        );
      case 'macos':
        return (
          <div>
            <p style={{ marginBottom: '1rem', fontSize: '0.875rem', lineHeight: '1.5' }}>
              1. Klik in Safari op <strong>Deel</strong> (□↑) in de werkbalk<br/>
              2. Klik op <strong>"Voeg toe aan Dock"</strong><br/>
              3. De app verschijnt in je Dock
            </p>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)', marginTop: '1rem' }}>
              💡 Tip: Sleep de app uit je Dock naar je bureaublad voor snelle toegang
            </p>
          </div>
        );
      case 'windows':
        return (
          <div>
            <p style={{ marginBottom: '1rem', fontSize: '0.875rem', lineHeight: '1.5' }}>
              <strong>Chrome/Edge:</strong><br/>
              1. Klik op het <strong>+</strong> icoon in de adresbalk<br/>
              2. Of: Menu (⋮) → <strong>"App installeren"</strong><br/>
              <br/>
              <strong>Firefox:</strong><br/>
              Sleep het adresbalk icoon naar je bureaublad
            </p>
          </div>
        );
      case 'android':
        return (
          <div>
            <p style={{ marginBottom: '1rem', fontSize: '0.875rem', lineHeight: '1.5' }}>
              <strong>Chrome:</strong><br/>
              1. Tik op Menu (⋮) rechtsboven<br/>
              2. Tik op <strong>"App installeren"</strong> of <strong>"Toevoegen aan startscherm"</strong><br/>
              3. Tik op <strong>"Installeren"</strong>
            </p>
          </div>
        );
      default:
        return (
          <div>
            <p style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>
              Gebruik de installeer/toevoegen functie van je browser om deze webapp toe te voegen aan je apparaat.
            </p>
          </div>
        );
    }
  };

  return (
    <>
      <style jsx>{`
        .install-button {
          width: 100%;
          margin-top: 1rem;
          padding: 12px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .install-button:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.3);
          transform: translateY(-1px);
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 1000;
        }

        .modal-content {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 24px;
          padding: 2rem;
          max-width: 480px;
          width: 100%;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }

        .modal-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: white;
          margin-bottom: 1.5rem;
          text-align: center;
        }

        .close-button {
          width: 100%;
          margin-top: 1.5rem;
          padding: 12px 24px;
          background: linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .close-button:hover {
          background: linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
        }
      `}</style>

      <button onClick={handleInstallClick} className="install-button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Installeer App
      </button>

      {showInstructions && (
        <div className="modal-overlay" onClick={() => setShowInstructions(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">📱 Installeer Oliemonster</h2>
            <div style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
              {getInstructions()}
            </div>
            <button onClick={() => setShowInstructions(false)} className="close-button">
              Sluiten
            </button>
          </div>
        </div>
      )}
    </>
  );
}
