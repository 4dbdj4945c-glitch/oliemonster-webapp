'use client';

import { useEffect, useState } from 'react';

/**
 * Component die Storage Access API gebruikt voor Safari iframe support
 * Dit lost cookie problemen op in Safari en andere strikte browsers
 */
export default function StorageAccessHandler() {
  const [accessGranted, setAccessGranted] = useState(true);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check of we in een iframe zitten
    const isInIframe = window.self !== window.top;

    if (!isInIframe) {
      // Niet in iframe, geen actie nodig
      return;
    }

    // Check of Storage Access API beschikbaar is (Safari)
    if ('requestStorageAccess' in document) {
      // Check eerst of we al toegang hebben
      document.hasStorageAccess().then((hasAccess) => {
        if (!hasAccess) {
          setShowPrompt(true);
          setAccessGranted(false);
        } else {
          setAccessGranted(true);
        }
      }).catch(() => {
        // Fallback als API niet werkt
        setAccessGranted(true);
      });
    }
  }, []);

  const requestAccess = async () => {
    try {
      await document.requestStorageAccess();
      setAccessGranted(true);
      setShowPrompt(false);
      // Reload om de nieuwe cookie toegang te activeren
      window.location.reload();
    } catch (error) {
      console.error('Storage access denied:', error);
      alert('Cookies zijn nodig voor deze applicatie. Schakel cookies in voor deze website.');
    }
  };

  // Toon niets als toegang al is verleend
  if (accessGranted || !showPrompt) {
    return null;
  }

  // Toon melding voor Safari-gebruikers
  return (
    <>
      <style jsx>{`
        .cookie-banner {
          position: fixed;
          top: 16px;
          left: 16px;
          right: 16px;
          z-index: 10000;
          display: flex;
          justify-content: center;
        }

        .cookie-banner .alert {
          width: 100%;
          max-width: 560px;
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          box-shadow: var(--shadow-md);
        }

        .cookie-tekst {
          flex: 1;
          min-width: 200px;
        }

        .cookie-tekst strong {
          display: block;
          font-weight: 700;
          margin-bottom: 2px;
        }

        .cookie-sub {
          display: block;
          font-size: 12px;
          opacity: 0.85;
          margin-top: 2px;
        }
      `}</style>

      <div className="cookie-banner" role="alert">
        <div className="alert alert-info">
          <div className="cookie-tekst">
            <strong>Cookies nodig</strong>
            Deze applicatie heeft toegang nodig tot cookies om je sessie op te slaan, anders kun je niet inloggen.
            <span className="cookie-sub">We gebruiken alleen noodzakelijke cookies voor authenticatie.</span>
          </div>
          <button type="button" onClick={requestAccess} className="btn btn-sm">
            Cookies toestaan
          </button>
        </div>
      </div>
    </>
  );
}
