'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/app/components/ThemeToggle';

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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Laden...</p>
      </div>
    );
  }

  return (
    <>
      <div className="fixed top-8 right-8 z-50">
        <ThemeToggle />
      </div>
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <div className="p-8 border rounded w-full max-w-md" style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}>
          <div className="flex flex-col items-center mb-6">
            <img src="/header_logo.png" alt="It's Done Services" className="h-16 mb-4 object-contain" />
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Stel je wachtwoord in</h1>
            <p className="text-sm text-center mt-2" style={{ color: 'var(--text-secondary)' }}>
              Welkom, <strong style={{ color: 'var(--foreground)' }}>{username}</strong>! Dit is je eerste login. Kies een veilig wachtwoord om door te gaan.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>
                Nieuw wachtwoord
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-1 transition-all"
                style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)', borderColor: 'var(--border)' }}
                placeholder="Minimaal 6 karakters"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>
                Bevestig wachtwoord
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-1 transition-all"
                style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)', borderColor: 'var(--border)' }}
                placeholder="Herhaal je wachtwoord"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2 px-4 rounded focus:outline-none transition-all"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--background)' }}
            >
              Wachtwoord instellen
            </button>
          </form>

          <p className="text-xs mt-4 text-center" style={{ color: 'var(--text-secondary)' }}>
            💡 Tip: Kies een wachtwoord dat je niet elders gebruikt en bewaar het op een veilige plek.
          </p>
        </div>
      </div>
    </>
  );
}
