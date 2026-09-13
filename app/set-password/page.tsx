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
    return <div className="laadscherm">Laden...</div>;
  }

  return (
    <>
      <style jsx>{`
        .fout {
          margin-bottom: 14px;
        }

        .auth-subtitle strong {
          color: var(--navy);
          font-weight: 600;
        }
      `}</style>

      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-band">
            <img src="/header_logo.png" alt="It's Done Services" />
          </div>

          <div className="auth-body">
            <h1 className="auth-title">Wachtwoord instellen</h1>
            <p className="auth-subtitle">
              Welkom, <strong>{username}</strong>. Dit is je eerste keer inloggen, kies een veilig wachtwoord om door te gaan.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="veld">
                <label htmlFor="new-password" className="label">Nieuw wachtwoord</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input"
                  placeholder="Minimaal 6 karakters"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              <div className="veld">
                <label htmlFor="confirm-password" className="label">Bevestig wachtwoord</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                  placeholder="Herhaal je wachtwoord"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              {error && <div className="alert alert-danger fout">{error}</div>}

              <button type="submit" className="btn btn-primary btn-block btn-lg">
                Wachtwoord instellen
              </button>
            </form>
          </div>

          <div className="auth-foot">
            Kies een wachtwoord dat je niet elders gebruikt en bewaar het op een veilige plek.
          </div>
        </div>
      </div>
    </>
  );
}
