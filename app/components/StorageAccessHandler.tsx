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

  // Toon prompt voor Safari gebruikers
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div style={{
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        padding: '30px',
        borderRadius: '8px',
        maxWidth: '500px',
        textAlign: 'center',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
      }}>
        <h2 style={{ marginBottom: '15px', fontSize: '24px' }}>🍪 Cookie Toegang Nodig</h2>
        <p style={{ marginBottom: '20px', lineHeight: '1.6' }}>
          Deze applicatie heeft toegang nodig tot cookies om je sessie op te slaan.
          Dit is nodig om in te kunnen loggen en ingelogd te blijven.
        </p>
        <button
          onClick={requestAccess}
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--background)',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Cookie Toegang Toestaan
        </button>
        <p style={{ 
          marginTop: '15px', 
          fontSize: '12px', 
          color: 'var(--text-secondary)',
        }}>
          We gebruiken alleen essentiële cookies voor authenticatie.
        </p>
      </div>
    </div>
  );
}
