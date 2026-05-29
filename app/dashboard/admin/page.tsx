'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, NavButton, Icons, Modal } from '@/app/components/ui';

interface User {
  id: number;
  username: string;
  role: string;
  createdAt: string;
}

interface SessionUser {
  userId: number;
  username: string;
  role: string;
  isLoggedIn: boolean;
}

type TabType = 'users' | 'columns';

const AVAILABLE_COLUMNS = [
  { id: 'status', name: 'Status', required: true },
  { id: 'oNumber', name: 'O-nummer', required: true },
  { id: 'sampleDate', name: 'Datum', required: false },
  { id: 'location', name: 'Locatie', required: false },
  { id: 'description', name: 'Omschrijving', required: false },
  { id: 'oilType', name: 'Type olie', required: false },
  { id: 'remarks', name: 'Opmerkingen', required: false },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const router = useRouter();

  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'status', 'oNumber', 'sampleDate', 'location', 'description', 'oilType'
  ]);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'user',
  });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (sessionUser?.role === 'admin') {
      loadUsers();
      loadSettings();
    }
  }, [sessionUser]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();

      if (!data.isLoggedIn || data.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      setSessionUser(data);
    } catch {
      router.push('/login');
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      if (response.ok) setUsers(data);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (response.ok && data.columns) setSelectedColumns(data.columns);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async (key: string, value: any) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (response.ok) {
        setSaveMessage('Instellingen opgeslagen!');
        setTimeout(() => setSaveMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const toggleColumn = async (columnId: string) => {
    const column = AVAILABLE_COLUMNS.find(c => c.id === columnId);
    if (column?.required) return;

    const newColumns = selectedColumns.includes(columnId)
      ? selectedColumns.filter(id => id !== columnId)
      : [...selectedColumns, columnId];

    setSelectedColumns(newColumns);
    await saveSettings('columns', newColumns);
  };

  const resetForm = () => {
    setFormData({ username: '', password: '', role: 'user' });
    setFormError('');
    setEditingUser(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowUserModal(true);
  };

  const openEditModal = (user: User) => {
    setFormData({ username: user.username, password: '', role: user.role });
    setEditingUser(user);
    setShowUserModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';

      const body: any = {
        username: formData.username,
        role: formData.role,
      };

      if (editingUser && formData.password) {
        body.newPassword = formData.password;
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setFormError(data.error || 'Er is een fout opgetreden');
        return;
      }

      setShowUserModal(false);
      resetForm();
      loadUsers();
    } catch {
      setFormError('Er is een fout opgetreden');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Weet je zeker dat je deze gebruiker wilt verwijderen?')) return;

    try {
      const response = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Fout bij verwijderen van gebruiker');
        return;
      }
      loadUsers();
    } catch {
      alert('Fout bij verwijderen van gebruiker');
    }
  };

  const handleResetPassword = async (id: number, username: string) => {
    if (!confirm(`Weet je zeker dat je het wachtwoord van ${username} wilt resetten? De gebruiker moet bij volgende login een nieuw wachtwoord instellen.`)) return;

    try {
      const response = await fetch(`/api/users/${id}/reset-password`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Fout bij resetten wachtwoord');
        return;
      }
      alert(`Wachtwoord van ${username} is gereset. Bij volgende login moet een nieuw wachtwoord worden ingesteld.`);
      loadUsers();
    } catch {
      alert('Fout bij resetten wachtwoord');
    }
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
      title="Instellingen"
      wide
      rightActions={
        <>
          <NavButton onClick={() => router.push('/dashboard/audit-logs')} icon={Icons.Logs} ariaLabel="Audit Logs">
            Audit Logs
          </NavButton>
          <NavButton onClick={() => router.push('/dashboard')} icon={Icons.Back} ariaLabel="Terug">
            Terug
          </NavButton>
        </>
      }
    >
      <h1 className="page-title">Beheer</h1>
      <p className="page-subtitle">Gebruikers en kolomweergave.</p>

      <div className="glass-card glass-card-padded">
        <div style={{ borderBottom: '1px solid var(--border-subtle)', marginBottom: '20px' }}>
          <nav style={{ display: 'flex', gap: '4px', marginBottom: '-1px' }}>
            <button
              onClick={() => setActiveTab('users')}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                color: activeTab === 'users' ? 'var(--accent)' : 'var(--text-secondary)',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'users' ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'color 0.15s',
                fontFamily: 'inherit',
              }}
            >
              Gebruikers
            </button>
            <button
              onClick={() => setActiveTab('columns')}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                color: activeTab === 'columns' ? 'var(--accent)' : 'var(--text-secondary)',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'columns' ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'color 0.15s',
                fontFamily: 'inherit',
              }}
            >
              Kolommen
            </button>
          </nav>
        </div>

        {saveMessage && (
          <div className="alert alert-success" style={{ marginBottom: '16px' }}>
            {saveMessage}
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Gebruikersbeheer
              </h2>
              <button onClick={openAddModal} className="btn btn-primary btn-sm">
                + Nieuwe Gebruiker
              </button>
            </div>

            <div className="table-container">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Gebruikersnaam</th>
                    <th>Rol</th>
                    <th>Aangemaakt</th>
                    <th>Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td style={{ fontWeight: 500 }}>
                        {user.username}
                        {user.id === sessionUser?.userId && (
                          <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-tertiary)' }}>(jij)</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${user.role === 'admin' ? 'badge-purple' : 'badge-info'}`}>
                          {user.role === 'admin' ? 'Admin' : 'Gebruiker'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {new Date(user.createdAt).toLocaleDateString('nl-NL')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => openEditModal(user)} className="btn btn-secondary btn-sm">
                            Bewerken
                          </button>
                          {user.id !== sessionUser?.userId && (
                            <>
                              <button
                                onClick={() => handleResetPassword(user.id, user.username)}
                                className="btn btn-secondary btn-sm"
                                style={{ color: 'var(--warning)' }}
                              >
                                Reset wachtwoord
                              </button>
                              <button onClick={() => handleDelete(user.id)} className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }}>
                                Verwijderen
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'columns' && (
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
              Kolom Configuratie
            </h2>
            <p className="glass-text-secondary" style={{ fontSize: '14px', margin: '0 0 20px 0' }}>
              Selecteer welke kolommen zichtbaar zijn in het overzicht.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {AVAILABLE_COLUMNS.map((column) => {
                const checked = selectedColumns.includes(column.id);
                return (
                  <label
                    key={column.id}
                    htmlFor={column.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: '#fafafa',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      cursor: column.required ? 'default' : 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input
                        type="checkbox"
                        id={column.id}
                        checked={checked}
                        onChange={() => toggleColumn(column.id)}
                        disabled={column.required}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'inherit' }}
                      />
                      <span style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: column.required ? 'var(--text-secondary)' : 'var(--text-primary)',
                      }}>
                        {column.name}
                        {column.required && (
                          <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                            (verplicht)
                          </span>
                        )}
                      </span>
                    </div>
                    <span className={`badge ${checked ? 'badge-success' : 'badge-gray'}`}>
                      {checked ? 'Zichtbaar' : 'Verborgen'}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="alert alert-info" style={{ marginTop: '16px' }}>
              Sommige kolommen zijn verplicht en kunnen niet worden uitgeschakeld.
            </div>
          </div>
        )}
      </div>

      <Modal
        open={showUserModal}
        onClose={() => { setShowUserModal(false); resetForm(); }}
        title={editingUser ? 'Gebruiker bewerken' : 'Nieuwe gebruiker toevoegen'}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label className="glass-label" htmlFor="admin-username">Gebruikersnaam</label>
            <input
              id="admin-username"
              type="text"
              className="glass-input"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>

          {editingUser ? (
            <div className="alert alert-info" style={{ marginBottom: '14px' }}>
              Gebruik de "Reset wachtwoord" knop in het overzicht om het wachtwoord te resetten.
            </div>
          ) : (
            <div className="alert alert-success" style={{ marginBottom: '14px' }}>
              Geen wachtwoord nodig — de gebruiker stelt zelf een wachtwoord in bij eerste login.
            </div>
          )}

          <div style={{ marginBottom: '14px' }}>
            <label className="glass-label" htmlFor="admin-role">Rol</label>
            <select
              id="admin-role"
              className="glass-select"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              required
            >
              <option value="user">Gebruiker</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {formError && (
            <div className="alert alert-danger" style={{ marginBottom: '14px' }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => { setShowUserModal(false); resetForm(); }}
              className="btn btn-secondary"
            >
              Annuleren
            </button>
            <button type="submit" className="btn btn-primary">
              {editingUser ? 'Bijwerken' : 'Toevoegen'}
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
