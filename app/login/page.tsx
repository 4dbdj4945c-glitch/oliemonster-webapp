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
        .page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f7;
          padding: 24px;
        }

        .card {
          background: #ffffff;
          border-radius: 18px;
          padding: 48px 40px 40px;
          width: 100%;
          max-width: 380px;
          box-shadow: 0 4px 40px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(0, 0, 0, 0.06);
        }

        @media (max-width: 480px) {
          .card { padding: 36px 24px 28px; }
        }

        .logo-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 36px;
        }

        .logo {
          height: 64px;
          object-fit: contain;
        }

        .field {
          margin-bottom: 14px;
        }

        .field label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #6e6e73;
          margin-bottom: 6px;
        }

        .input {
          width: 100%;
          padding: 11px 14px;
          background: #f5f5f7;
          border: 1px solid rgba(0, 0, 0, 0.15);
          border-radius: 10px;
          color: #1d1d1f;
          font-size: 15px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          font-family: inherit;
        }

        .input::placeholder {
          color: #aeaeb2;
        }

        .input:focus {
          border-color: #007AFF;
          box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
          background: #ffffff;
        }

        .remember {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 14px 0 20px;
        }

        .remember input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: #007AFF;
          cursor: pointer;
        }

        .remember label {
          font-size: 14px;
          color: #3c3c43;
          cursor: pointer;
          user-select: none;
        }

        .error {
          background: rgba(255, 59, 48, 0.08);
          border: 1px solid rgba(255, 59, 48, 0.2);
          color: #FF3B30;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 14px;
          text-align: center;
          margin-bottom: 14px;
        }

        .login-btn {
          width: 100%;
          padding: 13px;
          background: #007AFF;
          border: none;
          border-radius: 10px;
          color: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
          font-family: inherit;
        }

        .login-btn:hover:not(:disabled) {
          background: #0071E3;
        }

        .login-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      `}</style>

      <div className="page">
        <div className="card">
          <div className="logo-wrap">
            <img src="/header_logo.png" alt="It's Done Services" className="logo" />
          </div>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="username">Gebruikersnaam</label>
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

            <div className="field">
              <label htmlFor="password">Wachtwoord</label>
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

            {error && <div className="error">{error}</div>}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Inloggen...' : 'Inloggen'}
            </button>

            <InstallButton />
          </form>
        </div>
      </div>
    </>
  );
}
