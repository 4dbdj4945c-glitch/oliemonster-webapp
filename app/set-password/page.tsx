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
          padding: 24px 20px;
          background: #f5f5f7;
        }

        .card {
          background: #ffffff;
          border-radius: 18px;
          padding: 48px 40px 40px;
          width: 100%;
          max-width: 420px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 4px 40px rgba(0, 0, 0, 0.1);
        }

        .logo {
          height: 44px;
          object-fit: contain;
          margin-bottom: 24px;
        }

        .title {
          font-size: 26px;
          font-weight: 700;
          color: #0C1B33;
          margin-bottom: 12px;
          text-align: center;
          letter-spacing: -0.3px;
        }

        .subtitle {
          font-size: 14px;
          color: #64748B;
          text-align: center;
          margin-bottom: 32px;
          line-height: 1.6;
        }

        .subtitle strong {
          color: #0C1B33;
        }

        .input-group {
          margin-bottom: 20px;
        }

        .label {
          display: block;
          color: #3c3c43;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 8px;
        }

        .input {
          width: 100%;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          color: #0C1B33;
          font-size: 16px;
          font-family: inherit;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
          outline: none;
        }

        .input::placeholder {
          color: #94A3B8;
        }

        .input:focus {
          background: rgba(255, 255, 255, 0.95);
          border-color: #1D4ED8;
          box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.15);
        }

        .error {
          background: rgba(220, 38, 38, 0.08);
          border: 1px solid rgba(220, 38, 38, 0.2);
          color: #CC2900;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
          text-align: center;
        }

        .button {
          width: 100%;
          padding: 14px;
          background: #1D4ED8;
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, box-shadow 0.15s ease;
          margin-top: 8px;
          font-family: inherit;
          box-shadow: 0 2px 8px rgba(29, 78, 216, 0.25);
        }

        .button:hover {
          background: #1740B8;
          box-shadow: 0 4px 16px rgba(29, 78, 216, 0.35);
        }

        .tip {
          margin-top: 20px;
          font-size: 13px;
          color: #64748B;
          text-align: center;
          line-height: 1.5;
        }

        @media (max-width: 640px) {
          .card {
            padding: 36px 24px 28px;
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
