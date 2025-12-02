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
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-600">Laden...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/header_logo.png" alt="It's Done Services" className="h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">Stel je wachtwoord in</h1>
          <p className="text-sm text-gray-600 mt-2">
            Welkom, <strong>{username}</strong>! Dit is je eerste login. Kies een veilig wachtwoord om door te gaan.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nieuw wachtwoord
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              placeholder="Minimaal 6 karakters"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bevestig wachtwoord
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded"
          >
            Wachtwoord instellen
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-4 text-center">
          💡 Tip: Kies een wachtwoord dat je niet elders gebruikt en bewaar het op een veilige plek.
        </p>
      </div>
    </div>
  );
}
