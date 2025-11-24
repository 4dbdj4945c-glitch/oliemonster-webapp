'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/app/components/ThemeToggle';

interface User {
  userId: number;
  username: string;
  role: string;
  isLoggedIn: boolean;
}

interface AuditLog {
  id: number;
  userId: number | null;
  username: string;
  action: string;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  createdAt: string;
}

export default function AuditLogsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [usernameFilter, setUsernameFilter] = useState('');
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadLogs();
    }
  }, [user, actionFilter, usernameFilter]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();

      if (!data.isLoggedIn || data.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      setUser(data);
    } catch (error) {
      router.push('/login');
    }
  };

  const loadLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (usernameFilter) params.set('username', usernameFilter);
      params.set('limit', '100');

      const response = await fetch(`/api/audit-logs?${params}`);
      const data = await response.json();

      if (response.ok) {
        setLogs(data);
      }
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const getActionColor = (action: string) => {
    if (action.includes('FAILED')) return 'text-red-600 bg-red-50';
    if (action.includes('DELETE')) return 'text-orange-600 bg-orange-50';
    if (action.includes('CREATE')) return 'text-green-600 bg-green-50';
    if (action.includes('UPDATE')) return 'text-blue-600 bg-blue-50';
    if (action.includes('LOGIN')) return 'text-purple-600 bg-purple-50';
    return 'text-gray-600 bg-gray-50';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Laden...</p>
      </div>
    );
  }

  return (
    <>
      {/* Top-right controls */}
      <div className="fixed top-8 right-8 flex gap-3 z-50">
        <button
          onClick={() => router.push('/dashboard/admin')}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95"
          style={{
            backgroundColor: 'var(--accent)',
            border: '1px solid var(--accent)',
          }}
          aria-label="Beheer"
        >
          <span className="text-xl" style={{ color: 'var(--background)', lineHeight: 1 }}>⚙</span>
        </button>
        <button
          onClick={() => router.push('/dashboard')}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95"
          style={{
            backgroundColor: 'var(--accent)',
            border: '1px solid var(--accent)',
          }}
          aria-label="Dashboard"
        >
          <span className="text-xl" style={{ color: 'var(--background)', lineHeight: 1 }}>←</span>
        </button>
        <button
          onClick={handleLogout}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95"
          style={{
            backgroundColor: 'var(--accent)',
            border: '1px solid var(--accent)',
          }}
          aria-label="Uitloggen"
        >
          <span className="text-xl" style={{ color: 'var(--background)', lineHeight: 1 }}>→</span>
        </button>
        <ThemeToggle />
      </div>

      <div className="min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
        {/* Header */}
        <div style={{ backgroundColor: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <div>
              <img src="/header_logo.png" alt="It's Done Services" className="h-12 mb-2 object-contain" />
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                Audit Logs - Beveiliging & Controle
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                Welkom, {user?.username} ({user?.role})
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Filter op actie</label>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  <option value="">Alle acties</option>
                  <option value="LOGIN">Login</option>
                  <option value="LOGIN_FAILED">Login Failed</option>
                  <option value="LOGOUT">Logout</option>
                  <option value="CREATE_SAMPLE">Create Sample</option>
                  <option value="UPDATE_SAMPLE">Update Sample</option>
                  <option value="DELETE_SAMPLE">Delete Sample</option>
                  <option value="UPLOAD_PHOTO">Upload Photo</option>
                  <option value="DELETE_PHOTO">Delete Photo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Filter op gebruiker</label>
                <input
                  type="text"
                  placeholder="Zoek op gebruikersnaam..."
                  value={usernameFilter}
                  onChange={(e) => setUsernameFilter(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
            </div>
          </div>

          {/* Logs Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tijdstip
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Gebruiker
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actie
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      IP Adres
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                        Geen logs gevonden
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(log.createdAt).toLocaleString('nl-NL')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {log.username}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${getActionColor(log.action)}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                          {log.details || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {log.ipAddress || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${
                            log.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {log.success ? '✓ Success' : '✗ Failed'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-500">
            Toon de laatste {logs.length} logs
          </div>
        </div>
      </div>
    </>
  );
}
