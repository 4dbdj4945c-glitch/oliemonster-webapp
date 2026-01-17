'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import StorageAccessHandler from '@/app/components/StorageAccessHandler';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Load saved username on mount
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
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Inloggen mislukt');
        setLoading(false);
        return;
      }

      // Save username if remember me is checked
      if (rememberMe) {
        localStorage.setItem('rememberedUsername', username);
      } else {
        localStorage.removeItem('rememberedUsername');
      }

      // Redirect naar set-password als gebruiker wachtwoord moet instellen
      if (data.requiresPasswordChange) {
        router.push('/set-password');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError('Er is een fout opgetreden');
      setLoading(false);
    }
  };

  return (
    <>
      <StorageAccessHandler />
      <style jsx>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #2d1b4e 0%, #4a1942 50%, #1e3a8a 100%);
          position: relative;
          overflow: hidden;
        }

        .login-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          padding: 48px 40px;
          width: 100%;
          max-width: 420px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
          position: relative;
          z-index: 10;
        }

        .logo-container {
          display: flex;
          justify-content: center;
          margin-bottom: 32px;
        }

        .logo {
          height: 80px;
          object-fit: contain;
          filter: brightness(0) invert(1);
        }

        .input-group {
          margin-bottom: 24px;
          position: relative;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 16px;
          color: rgba(255, 255, 255, 0.6);
          pointer-events: none;
        }

        .login-input {
          width: 100%;
          padding: 14px 16px 14px 48px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-bottom: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 0;
          color: white;
          font-size: 16px;
          transition: all 0.3s ease;
          outline: none;
        }

        .login-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .login-input:focus {
          background: rgba(255, 255, 255, 0.15);
          border-bottom-color: rgba(255, 255, 255, 0.8);
        }

        .remember-container {
          display: flex;
          align-items: center;
          margin-bottom: 24px;
        }

        .remember-checkbox {
          width: 18px;
          height: 18px;
          margin-right: 8px;
          cursor: pointer;
          accent-color: rgba(139, 92, 246, 0.8);
        }

        .remember-label {
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
          cursor: pointer;
          user-select: none;
        }

        .login-button {
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
        }

        .login-button:hover:not(:disabled) {
          background: linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
        }

        .login-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .error-message {
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #fca5a5;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
          text-align: center;
        }
      `}</style>

      <div className="login-container">

        <div className="login-card">
          <div className="logo-container">
            <img src="/header_logo.png" alt="It's Done Services" className="logo" />
          </div>

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <div className="input-wrapper">
                <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <input
                  type="text"
                  className="login-input"
                  placeholder="Gebruikersnaam"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <div className="input-wrapper">
                <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input
                  type="password"
                  className="login-input"
                  placeholder="Wachtwoord"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="remember-container">
              <input
                type="checkbox"
                id="remember-me"
                className="remember-checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label htmlFor="remember-me" className="remember-label">
                Remember me
              </label>
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? 'Inloggen...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
