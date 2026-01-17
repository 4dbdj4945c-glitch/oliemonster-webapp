'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SetPasswordPage() {
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();

      if (!data.isLoggedIn || !data.requiresPasswordChange) {
        // Redirect als gebruiker niet ingelogd is of geen wachtwoord hoeft te wijzigen
        router.push('/dashboard');
        return;
      }

      setUsername(data.username);
      setLoading(false);
    } catch (error) {
      router.push('/login');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Wachtwoord moet minimaal 6 karakters lang zijn');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Wachtwoorden komen niet overeen');
      return;
    }

    try {
      const response = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Er is een fout opgetreden');
        return;
      }

      // Redirect naar dashboard na succesvol instellen wachtwoord
      router.push('/dashboard');
    } catch (error) {
      setError('Er is een fout opgetreden');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <p style={{ color: 'var(--foreground)' }}>Laden...</p>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 20px;
        }

        .card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          padding: 48px 40px;
          width: 100%;
          max-width: 480px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }

        .logo {
          height: 80px;
          object-fit: contain;
          margin-bottom: 24px;
        }

        .title {
          font-size: 28px;
          font-weight: 700;
          color: white;
          margin-bottom: 12px;
          text-align: center;
        }

        .subtitle {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.8);
          text-align: center;
          margin-bottom: 32px;
          line-height: 1.6;
        }

        .input-group {
          margin-bottom: 20px;
        }

        .label {
          display: block;
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 8px;
        }

        .input {
          width: 100%;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-bottom: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 0;
          color: white;
          font-size: 16px;
          transition: all 0.3s ease;
          outline: none;
        }

        .input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .input:focus {
          background: rgba(255, 255, 255, 0.15);
          border-bottom-color: rgba(255, 255, 255, 0.8);
        }

        .error {
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #fca5a5;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
          text-align: center;
        }

        .button {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 8px;
        }

        .button:hover {
          background: linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
        }

        .tip {
          margin-top: 20px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.6);
          text-align: center;
          line-height: 1.5;
        }

        @media (max-width: 640px) {
          .card {
            padding: 32px 24px;
          }
        }
      `}</style>

      <div className="container">
        <div className="card">
          <div style={{ textAlign: 'center' }}>
            <img src="/header_logo.png" alt="It's Done Services" className="logo" />
            <h1 className="title">Stel je wachtwoord in</h1>
            <p className="subtitle">
              Welkom, <strong>{username}</strong>! Dit is je eerste login. Kies een veilig wachtwoord om door te gaan.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="label">
                Nieuw wachtwoord
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
                placeholder="Minimaal 6 karakters"
                required
                minLength={6}
              />
            </div>

            <div className="input-group">
              <label className="label">
                Bevestig wachtwoord
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
                placeholder="Herhaal je wachtwoord"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="error">
                {error}
              </div>
            )}

            <button type="submit" className="button">
              Wachtwoord instellen
            </button>
          </form>

          <p className="tip">
            💡 Tip: Kies een wachtwoord dat je niet elders gebruikt en bewaar het op een veilige plek.
          </p>
        </div>
      </div>
    </>
  );
}
