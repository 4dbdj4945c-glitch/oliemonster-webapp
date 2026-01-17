'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--foreground)' }}>Laden...</p>
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
      </div>

      <div className="min-h-screen" style={{ color: 'var(--foreground)' }}>
        {/* Header */}
        <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', paddingTop: '1.5rem' }}>
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
          <div className="glass-card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Filter op actie</label>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="glass-select w-full"
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
                <label className="block text-sm font-medium mb-1" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Filter op gebruiker</label>
                <input
                  type="text"
                  placeholder="Zoek op gebruikersnaam..."
                  value={usernameFilter}
                  onChange={(e) => setUsernameFilter(e.target.value)}
                  className="glass-input w-full"
                />
              </div>
            </div>
          </div>

          <style jsx>{`
            .glass-card {
              background: rgba(255, 255, 255, 0.1);
              backdrop-filter: blur(20px);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 16px;
              padding: 1rem;
              margin-bottom: 1.5rem;
              box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
            }
            .glass-input {
              padding: 12px 16px;
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 12px;
              color: white;
              font-size: 14px;
              transition: all 0.3s ease;
              outline: none;
            }
            .glass-input::placeholder {
              color: rgba(255, 255, 255, 0.5);
            }
            .glass-input:focus {
              background: rgba(255, 255, 255, 0.15);
              border-color: rgba(255, 255, 255, 0.4);
            }
            .glass-select {
              padding: 12px 16px;
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 12px;
              color: white;
              font-size: 14px;
              transition: all 0.3s ease;
              outline: none;
              cursor: pointer;
            }
            .glass-select option {
              background: #2d1b4e;
              color: white;
            }
            .table-container {
              background: rgba(255, 255, 255, 0.1);
              backdrop-filter: blur(20px);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
            }
            .table {
              width: 100%;
              border-collapse: separate;
              border-spacing: 0;
            }
            .table thead {
              background: rgba(255, 255, 255, 0.05);
            }
            .table th {
              padding: 1rem 1.5rem;
              text-align: left;
              font-size: 0.75rem;
              font-weight: 600;
              color: rgba(255, 255, 255, 0.9);
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .table td {
              padding: 1rem 1.5rem;
              font-size: 0.875rem;
              color: white;
              border-top: 1px solid rgba(255, 255, 255, 0.1);
            }
            .table tbody tr:hover {
              background: rgba(255, 255, 255, 0.05);
            }
          `}</style>

          {/* Logs Table */}
          <div className="table-container">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tijdstip</th>
                    <th>Gebruiker</th>
                    <th>Actie</th>
                    <th>Details</th>
                    <th>IP Adres</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                        Geen logs gevonden
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {new Date(log.createdAt).toLocaleString('nl-NL')}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                          {log.username}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-flex',
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '0.375rem',
                            background: log.action.includes('FAILED') ? 'rgba(239, 68, 68, 0.2)' :
                                       log.action.includes('DELETE') ? 'rgba(249, 115, 22, 0.2)' :
                                       log.action.includes('CREATE') ? 'rgba(16, 185, 129, 0.2)' :
                                       log.action.includes('UPDATE') ? 'rgba(59, 130, 246, 0.2)' :
                                       log.action.includes('LOGIN') ? 'rgba(168, 85, 247, 0.2)' :
                                       'rgba(107, 114, 128, 0.2)',
                            color: log.action.includes('FAILED') ? '#fca5a5' :
                                  log.action.includes('DELETE') ? '#fdba74' :
                                  log.action.includes('CREATE') ? '#6ee7b7' :
                                  log.action.includes('UPDATE') ? '#93c5fd' :
                                  log.action.includes('LOGIN') ? '#c4b5fd' :
                                  '#d1d5db'
                          }}>
                            {log.action}
                          </span>
                        </td>
                        <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.details || '-'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {log.ipAddress || '-'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-flex',
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '0.375rem',
                            background: log.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            color: log.success ? '#6ee7b7' : '#fca5a5'
                          }}>
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

          <div className="mt-4 text-sm" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            Toon de laatste {logs.length} logs
          </div>
        </div>
      </div>
    </>
  );
}
