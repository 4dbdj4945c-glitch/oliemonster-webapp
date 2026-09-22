'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, Icon } from '@/app/components/ui';

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

  const getActionBadgeClass = (action: string): string => {
    if (action.includes('FAILED')) return 'badge badge-danger';
    if (action.includes('DELETE')) return 'badge badge-warning';
    if (action.includes('CREATE')) return 'badge badge-success';
    if (action.includes('UPDATE')) return 'badge badge-info';
    if (action.includes('LOGIN')) return 'badge badge-navy';
    return 'badge badge-gray';
  };

  if (loading) {
    return <div className="laadscherm">Laden...</div>;
  }

  return (
    <AppShell
      title="Audit Logs"
      wide
      user={user}
    >
      <h1 className="page-title">Audit Logs</h1>
      <p className="page-subtitle">Inzicht in acties en wijzigingen.</p>

      <div className="card" style={{ marginBottom: '16px' }}>
        <p className="section-label">Filters</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="audit-actie">Filter op actie</label>
            <select
              id="audit-actie"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="select"
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
            <label className="label" htmlFor="audit-gebruiker">Filter op gebruiker</label>
            <span className="zoekveld">
              <Icon name="search" />
              <input
                id="audit-gebruiker"
                type="text"
                placeholder="Zoek op gebruikersnaam..."
                value={usernameFilter}
                onChange={(e) => setUsernameFilter(e.target.value)}
                className="input"
              />
            </span>
          </div>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="leeg"><Icon name="empty" size={32} />Geen logs gevonden.</div>
      ) : (
        <div className="table-container">
          <div className="table-scroll">
            <table className="table table-kaarten">
              <thead>
                <tr>
                  <th>Tijdstip</th>
                  <th>Gebruiker</th>
                  <th>Actie</th>
                  <th>Details</th>
                  <th>IP-adres</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="kaart-kop text-secondary sm:whitespace-nowrap" data-label="Tijdstip">
                      {new Date(log.createdAt).toLocaleString('nl-NL')}
                    </td>
                    <td className="sm:whitespace-nowrap" data-label="Gebruiker" style={{ fontWeight: 500 }}>
                      {log.username}
                    </td>
                    <td className="kaart-status sm:whitespace-nowrap" data-label="Actie">
                      <span className={getActionBadgeClass(log.action)}>
                        {log.action}
                      </span>
                    </td>
                    {/* Op desktop afgekapt met puntjes (volledige tekst in de title), op de telefoon volledig en afbreekbaar */}
                    <td className="text-secondary sm:max-w-[360px] sm:truncate [overflow-wrap:anywhere]" data-label="Details" title={log.details || undefined}>
                      {log.details || '-'}
                    </td>
                    <td className="text-secondary sm:whitespace-nowrap" data-label="IP-adres">
                      {log.ipAddress || '-'}
                    </td>
                    <td data-label="Status">
                      <span className={log.success ? 'badge badge-success' : 'badge badge-danger'}>
                        {log.success ? 'Geslaagd' : 'Mislukt'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-secondary" style={{ marginTop: '12px', fontSize: '13px' }}>
        Toont de laatste {logs.length} logs.
      </p>
    </AppShell>
  );
}
