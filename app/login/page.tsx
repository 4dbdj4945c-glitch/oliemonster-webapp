'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import StorageAccessHandler from '@/app/components/StorageAccessHandler';
import InstallButton from '@/app/components/InstallButton';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const savedUsername = localStorage.getItem('rememberedUsername');
    if (savedUsername) {
      setUsername(savedUsername);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Inloggen mislukt');
        setLoading(false);
        return;
      }

      if (rememberMe) {
        localStorage.setItem('rememberedUsername', username);
      } else {
        localStorage.removeItem('rememberedUsername');
      }

      if (data.requiresPasswordChange) {
        router.push('/set-password');
      } else {
        router.push('/dashboard');
      }
    } catch {
      setError('Er is een fout opgetreden');
      setLoading(false);
    }
  };

  return (
    <>
      <StorageAccessHandler />
      <style jsx>{`
        .remember {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 4px 0 18px;
        }

        .remember input[type="checkbox"] {
          width: 16px;
          height: 16px;
          margin: 0;
        }

        .remember label {
          font-size: 13px;
          color: var(--navy);
          cursor: pointer;
          user-select: none;
        }

        .fout {
          margin-bottom: 14px;
        }
      `}</style>

      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-band">
            <img src="/header_logo.png" alt="It's Done Services" />
          </div>

          <div className="auth-body">
            <h1 className="auth-title">Inloggen</h1>
            <p className="auth-subtitle">Log in met je gebruikersnaam en wachtwoord.</p>

            <form onSubmit={handleSubmit}>
              <div className="veld">
                <label htmlFor="username" className="label">Gebruikersnaam</label>
                <input
                  id="username"
                  type="text"
                  className="input"
                  placeholder="Gebruikersnaam"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>

              <div className="veld">
                <label htmlFor="password" className="label">Wachtwoord</label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  placeholder="Wachtwoord"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <div className="remember">
                <input
                  type="checkbox"
                  id="remember-me"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label htmlFor="remember-me">Onthoud mij</label>
              </div>

              {error && <div className="alert alert-danger fout">{error}</div>}

              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
                {loading ? 'Inloggen...' : 'Inloggen'}
              </button>

              <InstallButton />
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
