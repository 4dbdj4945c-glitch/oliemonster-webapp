'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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

type TabType = 'users' | 'theme' | 'columns';

const THEMES = [
  { id: 'blue', name: 'Blauw (Standaard)', primary: 'blue', secondary: 'gray' },
  { id: 'green', name: 'Groen', primary: 'green', secondary: 'teal' },
  { id: 'purple', name: 'Paars', primary: 'purple', secondary: 'pink' },
  { id: 'red', name: 'Rood', primary: 'red', secondary: 'orange' },
  { id: 'dark', name: 'Donker', primary: 'gray', secondary: 'slate' },
];

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

  // Settings state
  const [selectedTheme, setSelectedTheme] = useState('blue');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'status', 'oNumber', 'sampleDate', 'location', 'description', 'oilType'
  ]);

  // Form state
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
    } catch (error) {
      router.push('/login');
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/users');
      const data = await response.json();

      if (response.ok) {
        setUsers(data);
      }
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

      if (response.ok) {
        if (data.theme) setSelectedTheme(data.theme);
        if (data.columns) setSelectedColumns(data.columns);
      }
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

  const handleThemeChange = async (themeId: string) => {
    setSelectedTheme(themeId);
    await saveSettings('theme', themeId);
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
    setFormData({
      username: '',
      password: '',
      role: 'user',
    });
    setFormError('');
    setEditingUser(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowUserModal(true);
  };

  const openEditModal = (user: User) => {
    setFormData({
      username: user.username,
      password: '',
      role: user.role,
    });
    setEditingUser(user);
    setShowUserModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Wachtwoord is niet meer verplicht - gebruiker stelt het zelf in bij eerste login

    try {
      const url = editingUser 
        ? `/api/users/${editingUser.id}`
        : '/api/users';
      
      const method = editingUser ? 'PUT' : 'POST';

      const body: any = {
        username: formData.username,
        role: formData.role,
      };

      // Voor bewerken: optioneel nieuw wachtwoord via edit endpoint
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
    } catch (error) {
      setFormError('Er is een fout opgetreden');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Weet je zeker dat je deze gebruiker wilt verwijderen?')) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Fout bij verwijderen van gebruiker');
        return;
      }

      loadUsers();
    } catch (error) {
      alert('Fout bij verwijderen van gebruiker');
    }
  };

  const handleResetPassword = async (id: number, username: string) => {
    if (!confirm(`Weet je zeker dat je het wachtwoord van ${username} wilt resetten? De gebruiker moet bij volgende login een nieuw wachtwoord instellen.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${id}/reset-password`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Fout bij resetten wachtwoord');
        return;
      }

      alert(`Wachtwoord van ${username} is gereset. Bij volgende login moet een nieuw wachtwoord worden ingesteld.`);
      loadUsers();
    } catch (error) {
      alert('Fout bij resetten wachtwoord');
    }
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
      <style jsx>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }
        .glass-button {
          background: linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%);
          color: white;
          border: none;
          border-radius: 12px;
          padding: 12px 24px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .glass-button:hover {
          background: linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
        }
        .tab-button {
          padding: 0.75rem 1.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.6);
          border-bottom: 2px solid transparent;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .tab-button:hover {
          color: rgba(255, 255, 255, 0.9);
        }
        .tab-button-active {
          color: #8b5cf6;
          border-bottom-color: #8b5cf6;
        }
      `}</style>
      <div className="min-h-screen" style={{ color: 'var(--foreground)' }}>
        {/* Header */}
        <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', paddingTop: '1.5rem' }}>
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: 'white', letterSpacing: '-0.02em' }}>
                It's Done Services - Beheer
              </h1>
              <p style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)', marginTop: '0.25rem' }}>
                Oliemonster Analyse - Instellingen
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={() => router.push('/dashboard/audit-logs')}
                className="glass-button"
              >
                📋 Audit Logs
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="glass-button"
              >
                Terug naar Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="glass-card">
          <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <nav style={{ display: 'flex', marginBottom: '-2px' }}>
              <button
                onClick={() => setActiveTab('users')}
                className={`tab-button ${activeTab === 'users' ? 'tab-button-active' : ''}`}
              >
                👥 Gebruikers
              </button>
              <button
                onClick={() => setActiveTab('theme')}
                className={`tab-button ${activeTab === 'theme' ? 'tab-button-active' : ''}`}
              >
                🎨 Thema
              </button>
              <button
                onClick={() => setActiveTab('columns')}
                className={`tab-button ${activeTab === 'columns' ? 'tab-button-active' : ''}`}
              >
                📊 Kolommen
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div style={{ padding: '1.5rem' }}>
            {saveMessage && (
              <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
                {saveMessage}
              </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Gebruikersbeheer</h2>
                  <button
                    onClick={openAddModal}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                  >
                    + Nieuwe Gebruiker
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Gebruikersnaam
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rol
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Aangemaakt
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Acties
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map((user) => (
                        <tr key={user.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {user.username}
                            {user.id === sessionUser?.userId && (
                              <span className="ml-2 text-xs text-gray-500">(jij)</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                user.role === 'admin'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {user.role === 'admin' ? 'Admin' : 'Gebruiker'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(user.createdAt).toLocaleDateString('nl-NL')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => openEditModal(user)}
                              className="text-blue-600 hover:text-blue-900 mr-4"
                            >
                              Bewerken
                            </button>
                            {user.id !== sessionUser?.userId && (
                              <>
                                <button
                                  onClick={() => handleResetPassword(user.id, user.username)}
                                  className="text-orange-600 hover:text-orange-900 mr-4"
                                >
                                  Reset Wachtwoord
                                </button>
                                <button
                                  onClick={() => handleDelete(user.id)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  Verwijderen
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Theme Tab */}
            {activeTab === 'theme' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-6">Kleurthema</h2>
                <p className="text-gray-600 mb-6">
                  Selecteer een kleurthema voor de applicatie
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {THEMES.map((theme) => (
                    <div
                      key={theme.id}
                      onClick={() => handleThemeChange(theme.id)}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                        selectedTheme === theme.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center mb-3">
                        <div
                          className={`w-8 h-8 rounded-full bg-${theme.primary}-500 mr-2`}
                        ></div>
                        <div
                          className={`w-8 h-8 rounded-full bg-${theme.secondary}-500`}
                        ></div>
                      </div>
                      <h3 className="font-semibold text-gray-900">{theme.name}</h3>
                      {selectedTheme === theme.id && (
                        <p className="text-sm text-blue-600 mt-2">✓ Actief</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="text-sm text-yellow-800">
                    💡 Tip: Thema wijzigingen worden direct toegepast na het selecteren.
                  </p>
                </div>
              </div>
            )}

            {/* Columns Tab */}
            {activeTab === 'columns' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-6">Kolom Configuratie</h2>
                <p className="text-gray-600 mb-6">
                  Selecteer welke kolommen zichtbaar zijn in het overzicht
                </p>

                <div className="space-y-3">
                  {AVAILABLE_COLUMNS.map((column) => (
                    <div
                      key={column.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id={column.id}
                          checked={selectedColumns.includes(column.id)}
                          onChange={() => toggleColumn(column.id)}
                          disabled={column.required}
                          className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <label
                          htmlFor={column.id}
                          className={`ml-3 text-sm font-medium ${
                            column.required ? 'text-gray-500' : 'text-gray-900'
                          }`}
                        >
                          {column.name}
                          {column.required && (
                            <span className="ml-2 text-xs text-gray-500">(verplicht)</span>
                          )}
                        </label>
                      </div>
                      <span
                        className={`text-sm ${
                          selectedColumns.includes(column.id)
                            ? 'text-green-600'
                            : 'text-gray-400'
                        }`}
                      >
                        {selectedColumns.includes(column.id) ? '✓ Zichtbaar' : 'Verborgen'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-sm text-blue-800">
                    ℹ️ Sommige kolommen zijn verplicht en kunnen niet worden uitgeschakeld.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4 text-gray-900">
              {editingUser ? 'Gebruiker bewerken' : 'Nieuwe gebruiker toevoegen'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gebruikersnaam
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  required
                />
              </div>

              {editingUser && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mb-4">
                  💡 Gebruik de "Reset Wachtwoord" knop in het overzicht om het wachtwoord te resetten.
                </div>
              )}

              {!editingUser && (
                <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
                  ℹ️ Geen wachtwoord nodig - de gebruiker stelt zelf een wachtwoord in bij eerste login.
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rol
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  required
                >
                  <option value="user">Gebruiker</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {formError && (
                <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
                  {formError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
                >
                  {editingUser ? 'Bijwerken' : 'Toevoegen'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUserModal(false);
                    resetForm();
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded hover:bg-gray-400"
                >
                  Annuleren
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
