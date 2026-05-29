'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, NavButton, Icons } from '@/app/components/ui';

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

  useEffect(() => { checkAuth(); }, []);

  useEffect(() => {
    if (user) loadLogs();
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
    } catch {
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
      if (response.ok) setLogs(data);
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

  const getActionBadgeClass = (action: string): string => {
    if (action.includes('FAILED')) return 'badge badge-danger';
    if (action.includes('DELETE')) return 'badge badge-warning';
    if (action.includes('CREATE')) return 'badge badge-success';
    if (action.includes('UPDATE')) return 'badge badge-info';
    if (action.includes('LOGIN')) return 'badge badge-purple';
    return 'badge badge-gray';
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f7' }}>
        <p style={{ color: '#64748B', fontSize: '15px' }}>Laden...</p>
      </div>
    );
  }

  return (
    <AppShell
      title="Audit Logs"
      wide
      rightActions={
        <>
          <NavButton onClick={() => router.push('/dashboard/admin')} icon={Icons.Settings} ariaLabel="Instellingen">
            Instellingen
          </NavButton>
          <NavButton onClick={() => router.push('/dashboard')} icon={Icons.Back} ariaLabel="Terug">
            Terug
          </NavButton>
          <NavButton onClick={handleLogout} icon={Icons.Logout} danger ariaLabel="Uitloggen">
            Uitloggen
          </NavButton>
        </>
      }
    >
      <h1 className="page-title">Audit Logs</h1>
      <p className="page-subtitle">Inzicht in acties en wijzigingen.</p>

      <div className="glass-card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <div>
            <label className="glass-label">Filter op actie</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="glass-select"
            >
              <option value="">Alle acties</option>
              <option value="LOGIN">Login</option>
              <option value="LOGIN_FAILED">Login Failed</option>
              <option value="LOGOUT">Logout</option>
              <option value="CREATE_SAMPLE">Create Sample</option>
              <option value="UPDATE_SAMPLE">Update Sample</option>
              <option value="DELETE_SAMPLE">Delete Sample</option>
              <option value="CREATE_ATTEMPT">Create Attempt</option>
              <option value="UPDATE_ATTEMPT">Update Attempt</option>
              <option value="DELETE_ATTEMPT">Delete Attempt</option>
              <option value="UPLOAD_PHOTO">Upload Photo</option>
              <option value="DELETE_PHOTO">Delete Photo</option>
            </select>
          </div>
          <div>
            <label className="glass-label">Filter op gebruiker</label>
            <input
              type="text"
              placeholder="Zoek op gebruikersnaam..."
              value={usernameFilter}
              onChange={(e) => setUsernameFilter(e.target.value)}
              className="glass-input"
            />
          </div>
        </div>
      </div>

      <div className="table-container">
        <div style={{ overflowX: 'auto' }}>
          <table className="glass-table">
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
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    Geen logs gevonden
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {new Date(log.createdAt).toLocaleString('nl-NL')}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                      {log.username}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className={getActionBadgeClass(log.action)}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {log.details || '-'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {log.ipAddress || '-'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className={log.success ? 'badge badge-success' : 'badge badge-danger'}>
                        {log.success ? 'Success' : 'Failed'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
        Toon de laatste {logs.length} logs
      </div>
    </AppShell>
  );
}
