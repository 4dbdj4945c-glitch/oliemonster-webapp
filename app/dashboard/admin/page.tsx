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

export default function AdminPage() {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const router = useRouter();

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

    // Validatie: als nieuwe gebruiker, wachtwoord verplicht
    if (!editingUser && !formData.password) {
      setFormError('Wachtwoord is verplicht voor nieuwe gebruikers');
      return;
    }

    try {
      const url = editingUser 
        ? `/api/users/${editingUser.id}`
        : '/api/users';
      
      const method = editingUser ? 'PUT' : 'POST';

      const body: any = {
        username: formData.username,
        role: formData.role,
      };

      if (editingUser && formData.password) {
        body.newPassword = formData.password;
      } else if (!editingUser) {
        body.password = formData.password;
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-600">Laden...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Beheer Paneel
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Instellingen en gebruikersbeheer
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
            >
              Terug naar Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Gebruikersbeheer Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Gebruikersbeheer</h2>
            <button
              onClick={openAddModal}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              + Nieuwe Gebruiker
            </button>
          </div>

          {/* Users Table */}
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
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                      Geen gebruikers gevonden
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
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
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Verwijderen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Wachtwoord {editingUser && '(laat leeg om niet te wijzigen)'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  required={!editingUser}
                  placeholder={editingUser ? 'Optioneel' : ''}
                />
              </div>

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
  );
}
