'use client';

import { useState, useEffect } from 'react';
import Modal from '@/app/components/ui/Modal';
import Icon from '@/app/components/ui/Icon';

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
          <ol className="stappen">
            <li>Tik op <strong>Deel</strong> onderaan in Safari.</li>
            <li>Scroll naar beneden en tik op <strong>Zet op beginscherm</strong>.</li>
            <li>Tik op <strong>Voeg toe</strong>.</li>
          </ol>
        );
      case 'macos':
        return (
          <>
            <ol className="stappen">
              <li>Klik in Safari op <strong>Deel</strong> in de werkbalk.</li>
              <li>Klik op <strong>Voeg toe aan Dock</strong>.</li>
              <li>De app verschijnt in je Dock.</li>
            </ol>
            <p className="hint">Tip: sleep de app uit je Dock naar je bureaublad voor snelle toegang.</p>
          </>
        );
      case 'windows':
        return (
          <>
            <p className="section-label">Chrome of Edge</p>
            <ol className="stappen">
              <li>Klik op het installatie-icoon in de adresbalk.</li>
              <li>Of kies in het menu <strong>App installeren</strong>.</li>
            </ol>
            <p className="section-label">Firefox</p>
            <p className="tekst">Sleep het icoon in de adresbalk naar je bureaublad.</p>
          </>
        );
      case 'android':
        return (
          <>
            <p className="section-label">Chrome</p>
            <ol className="stappen">
              <li>Tik op het menu rechtsboven.</li>
              <li>Tik op <strong>App installeren</strong> of <strong>Toevoegen aan startscherm</strong>.</li>
              <li>Tik op <strong>Installeren</strong>.</li>
            </ol>
          </>
        );
      default:
        return (
          <p className="tekst">
            Gebruik de installeer- of toevoegfunctie van je browser om deze webapp aan je apparaat toe te voegen.
          </p>
        );
    }
  };

  return (
    <>
      <div className="install-wrap">
        <button type="button" onClick={handleInstallClick} className="btn btn-block">
          <Icon name="install-app" />
          App installeren
        </button>
        <p className="install-uitleg">Zet de portal als app op je beginscherm of bureaublad.</p>
      </div>

      <Modal
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
        title="App installeren"
        footer={
          <button type="button" onClick={() => setShowInstructions(false)} className="btn btn-primary">
            Sluiten
          </button>
        }
      >
        {getInstructions()}
      </Modal>
    </>
  );
}
