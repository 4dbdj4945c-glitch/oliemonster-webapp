'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTheme } from '@/lib/theme';
import ThemeToggle from '@/app/components/ThemeToggle';
import PhotoModal from '@/app/components/PhotoModal';
import HelpModal from '@/app/components/HelpModal';
import DashboardSettingsModal, { DashboardSettings } from '@/app/components/DashboardSettingsModal';

interface User {
  userId: number;
  username: string;
  role: string;
  isLoggedIn: boolean;
}

interface OilSample {
  id: number;
  oNumber: string;
  sampleDate: string | null;
  location: string;
  description: string;
  remarks?: string;
  isTaken: boolean;
  photoUrl?: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [samples, setSamples] = useState<OilSample[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSample, setEditingSample] = useState<OilSample | null>(null);
  const [theme, setTheme] = useState('blue');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['status', 'oNumber', 'sampleDate', 'location', 'description']);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; oNumber: string } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'oNumber' | 'sampleDate' | 'location' | 'newest'>('newest');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>({
    title: 'Overzicht afname oliemonsters i.o.v. Mourik Infra B.V.',
    subtitle: 'Welkom, {username} ({role})'
  });
  const router = useRouter();
  const themeColors = getTheme(theme);

  // Form state
  const [formData, setFormData] = useState({
    oNumber: '',
    sampleDate: '',
    location: '',
    description: '',
    remarks: '',
    isTaken: false,
  });
  const [formError, setFormError] = useState('');
  const [oNumberWarning, setONumberWarning] = useState('');

  useEffect(() => {
    checkAuth();
    loadSettings();
  }, []);

  useEffect(() => {
    if (user) {
      loadSamples();
    }
  }, [user, search]);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();

      if (response.ok) {
        if (data.theme) setTheme(data.theme);
        if (data.columns) setVisibleColumns(data.columns);
        if (data.dashboardTexts) {
          setDashboardSettings(data.dashboardTexts);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveDashboardSettings = async (settings: DashboardSettings) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'dashboardTexts',
          value: settings
        })
      });

      if (response.ok) {
        setDashboardSettings(settings);
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving dashboard settings:', error);
      throw error;
    }
  };

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();

      if (!data.isLoggedIn) {
        router.push('/login');
        return;
      }

      // Redirect naar set-password als wachtwoord moet worden ingesteld
      if (data.requiresPasswordChange) {
        router.push('/set-password');
        return;
      }

      setUser(data);
    } catch (error) {
      router.push('/login');
    }
  };

  const loadSamples = async () => {
    try {
      const url = search 
        ? `/api/samples?search=${encodeURIComponent(search)}`
        : '/api/samples';
      
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        setSamples(data);
      }
    } catch (error) {
      console.error('Error loading samples:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSortedSamples = () => {
    const sorted = [...samples];

    if (sortBy === 'newest') {
      // Sorteer op ID (laatst toegevoegd)
      return sorted.sort((a, b) => b.id - a.id);
    }

    sorted.sort((a, b) => {
      let compareA: string | number;
      let compareB: string | number;

      if (sortBy === 'sampleDate') {
        // Handle null dates - put them at the end
        if (!a.sampleDate && !b.sampleDate) return 0;
        if (!a.sampleDate) return 1;
        if (!b.sampleDate) return -1;
        compareA = new Date(a.sampleDate).getTime();
        compareB = new Date(b.sampleDate).getTime();
      } else if (sortBy === 'oNumber') {
        compareA = a.oNumber.toLowerCase();
        compareB = b.oNumber.toLowerCase();
      } else if (sortBy === 'location') {
        compareA = a.location.toLowerCase();
        compareB = b.location.toLowerCase();
      } else {
        return 0;
      }

      if (sortOrder === 'asc') {
        return compareA < compareB ? -1 : compareA > compareB ? 1 : 0;
      } else {
        return compareA > compareB ? -1 : compareA < compareB ? 1 : 0;
      }
    });

    return sorted;
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const resetForm = () => {
    setFormData({
      oNumber: '',
      sampleDate: '',
      location: '',
      description: '',
      remarks: '',
      isTaken: false,
    });
    setFormError('');
    setONumberWarning('');
    setEditingSample(null);
  };

  const checkONumberExists = async (oNumber: string) => {
    if (!oNumber || oNumber.trim() === '') {
      setONumberWarning('');
      return;
    }

    // Don't check if we're editing and the o-number hasn't changed
    if (editingSample && editingSample.oNumber === oNumber) {
      setONumberWarning('');
      return;
    }

    // Check if o-number exists in current samples list
    const exists = samples.some(sample => 
      sample.oNumber.toLowerCase() === oNumber.toLowerCase() && 
      (!editingSample || sample.id !== editingSample.id)
    );

    if (exists) {
      setONumberWarning('⚠️ Dit o-nummer bestaat al!');
    } else {
      setONumberWarning('');
    }
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (sample: OilSample) => {
    setFormData({
      oNumber: sample.oNumber,
      sampleDate: sample.sampleDate ? sample.sampleDate.split('T')[0] : '',
      location: sample.location,
      description: sample.description,
      remarks: sample.remarks || '',
      isTaken: sample.isTaken,
    });
    setEditingSample(sample);
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    try {
      const url = editingSample 
        ? `/api/samples/${editingSample.id}`
        : '/api/samples';
      
      const method = editingSample ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setFormError(data.error || 'Er is een fout opgetreden');
        return;
      }

      setShowAddModal(false);
      resetForm();
      loadSamples();
    } catch (error) {
      setFormError('Er is een fout opgetreden');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Weet je zeker dat je dit monster wilt verwijderen?')) {
      return;
    }

    try {
      const response = await fetch(`/api/samples/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadSamples();
      }
    } catch (error) {
      alert('Fout bij verwijderen van monster');
    }
  };

  const handlePhotoUpload = async (sampleId: number, file: File) => {
    setUploadingPhoto(sampleId);
    try {
      const formData = new FormData();
      formData.append('photo', file);

      const response = await fetch(`/api/samples/${sampleId}/photo`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        loadSamples();
      } else {
        const data = await response.json();
        alert(data.error || 'Fout bij uploaden van foto');
      }
    } catch (error) {
      alert('Fout bij uploaden van foto');
    } finally {
      setUploadingPhoto(null);
    }
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
      <div className="min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
        {/* Header */}
        <div style={{ backgroundColor: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <img src="/header_logo.png" alt="It's Done Services" className="h-12 mb-2 object-contain" />
                {user?.role === 'admin' && (
                  <button
                    onClick={() => setShowSettingsModal(true)}
                    className="mb-2 p-1.5 rounded transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                    title="Teksten bewerken"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                    </svg>
                  </button>
                )}
              </div>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {dashboardSettings.title}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {dashboardSettings.subtitle
                  .replace('{username}', user?.username || '')
                  .replace('{role}', user?.role || '')}
              </p>
            </div>
            {/* Menu controls */}
            <div className="flex gap-3 flex-shrink-0">
              {user?.role === 'admin' && (
                <button
                  onClick={() => router.push('/dashboard/admin')}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95"
                  style={{
                    backgroundColor: 'var(--accent)',
                    border: '1px solid var(--accent)',
                  }}
                  aria-label="Beheer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" style={{ color: 'var(--background)' }}>
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setShowHelpModal(true)}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95"
                style={{
                  backgroundColor: 'var(--accent)',
                  border: '1px solid var(--accent)',
                }}
                aria-label="Help"
              >
                <span className="text-xl font-bold" style={{ color: 'var(--background)', lineHeight: 1 }}>?</span>
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
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Search & Add */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              placeholder="Zoek op o-nummer, locatie of omschrijving..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 ${themeColors.primary.focus} text-gray-900`}
            />
            {user?.role === 'admin' && (
              <button
                onClick={openAddModal}
                className={`${themeColors.accent.bg} ${themeColors.accent.bgHover} text-white px-6 py-2 rounded whitespace-nowrap`}
              >
                + Nieuw Monster
              </button>
            )}
          </div>
        </div>

        {/* Sort Controls */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <label className="text-sm font-medium text-gray-700">Sorteren op:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            >
              <option value="newest">Laatst toegevoegd</option>
              <option value="oNumber">O-nummer</option>
              <option value="sampleDate">Datum</option>
              <option value="location">Locatie</option>
            </select>
            
            {sortBy !== 'newest' && (
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              >
                <option value="asc">Oplopend</option>
                <option value="desc">Aflopend</option>
              </select>
            )}
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow" style={{ borderLeft: '4px solid #3b82f6' }}>
            <p className="text-sm text-gray-600 mb-1">Totaal monsters</p>
            <p className="text-3xl font-bold text-gray-900">{samples.length}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow" style={{ borderLeft: '4px solid #10b981' }}>
            <p className="text-sm text-gray-600 mb-1">Genomen</p>
            <p className="text-3xl font-bold text-green-600">
              {samples.filter(s => s.isTaken).length}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow" style={{ borderLeft: '4px solid #ef4444' }}>
            <p className="text-sm text-gray-600 mb-1">Niet genomen</p>
            <p className="text-3xl font-bold text-red-600">
              {samples.filter(s => !s.isTaken).length}
            </p>
          </div>
        </div>

        {/* Samples Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {visibleColumns.includes('status') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  )}
                  {visibleColumns.includes('oNumber') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      O-nummer
                    </th>
                  )}
                  {visibleColumns.includes('sampleDate') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Datum
                    </th>
                  )}
                  {visibleColumns.includes('location') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Locatie
                    </th>
                  )}
                  {visibleColumns.includes('description') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Omschrijving
                    </th>
                  )}
                  {visibleColumns.includes('remarks') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Opmerkingen
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Foto
                  </th>
                  {user?.role === 'admin' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acties
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {samples.length === 0 ? (
                  <tr>
                    <td colSpan={user?.role === 'admin' ? 7 : 6} className="px-6 py-4 text-center text-gray-500">
                      Geen monsters gevonden
                    </td>
                  </tr>
                ) : (
                  getSortedSamples().map((sample) => (
                    <tr key={sample.id}>
                      {visibleColumns.includes('status') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                              sample.isTaken
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {sample.isTaken ? 'Genomen' : 'Niet genomen'}
                          </span>
                        </td>
                      )}
                      {visibleColumns.includes('oNumber') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {sample.oNumber}
                        </td>
                      )}
                      {visibleColumns.includes('sampleDate') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {sample.isTaken && sample.sampleDate ? new Date(sample.sampleDate).toLocaleDateString('nl-NL') : '-'}
                        </td>
                      )}
                      {visibleColumns.includes('location') && (
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {sample.location}
                        </td>
                      )}
                      {visibleColumns.includes('description') && (
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {sample.description}
                        </td>
                      )}
                      {visibleColumns.includes('remarks') && (
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {sample.remarks || '-'}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {sample.photoUrl ? (
                          <button
                            onClick={() => setSelectedPhoto({ url: sample.photoUrl!, oNumber: sample.oNumber })}
                            className="text-blue-600 hover:text-blue-900 underline"
                          >
                            📷 Bekijk foto
                          </button>
                        ) : user?.role === 'admin' ? (
                          <label className="cursor-pointer text-gray-500 hover:text-gray-700">
                            {uploadingPhoto === sample.id ? '↻ Uploaden...' : '+ Upload foto'}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={uploadingPhoto === sample.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoUpload(sample.id, file);
                              }}
                            />
                          </label>
                        ) : (
                          <span className="text-gray-400">Geen foto</span>
                        )}
                      </td>
                      {user?.role === 'admin' && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => openEditModal(sample)}
                            className={`${themeColors.primary.text} ${themeColors.primary.textHover} mr-4`}
                          >
                            Bewerken
                          </button>
                          <button
                            onClick={() => handleDelete(sample.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Verwijderen
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4 text-gray-900">
              {editingSample ? 'Monster bewerken' : 'Nieuw monster toevoegen'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  O-nummer
                </label>
                <input
                  type="text"
                  value={formData.oNumber}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, oNumber: value });
                    checkONumberExists(value);
                  }}
                  onBlur={(e) => checkONumberExists(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${themeColors.primary.focus} text-gray-900 ${
                    oNumberWarning ? 'border-red-500' : 'border-gray-300'
                  }`}
                  required
                />
                {oNumberWarning && (
                  <p className="text-red-600 text-sm mt-1 font-semibold">
                    {oNumberWarning}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Datum afname {!formData.isTaken && '(optioneel - alleen voor genomen monsters)'}
                </label>
                <input
                  type="date"
                  value={formData.sampleDate}
                  onChange={(e) => setFormData({ ...formData, sampleDate: e.target.value })}
                  disabled={!formData.isTaken}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 ${themeColors.primary.focus} text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed`}
                  required={formData.isTaken}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Locatie
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 ${themeColors.primary.focus} text-gray-900`}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Omschrijving
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 ${themeColors.primary.focus} text-gray-900`}
                  rows={3}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opmerkingen (optioneel)
                </label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 ${themeColors.primary.focus} text-gray-900`}
                  rows={2}
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isTaken"
                  checked={formData.isTaken}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    setFormData({ 
                      ...formData, 
                      isTaken: isChecked,
                      // Clear date if unchecking
                      sampleDate: isChecked ? formData.sampleDate : ''
                    });
                  }}
                  className={`h-4 w-4 ${themeColors.primary.text} ${themeColors.primary.focus} border-gray-300 rounded`}
                />
                <label htmlFor="isTaken" className="ml-2 block text-sm text-gray-900">
                  Monster is genomen
                </label>
              </div>

              {formError && (
                <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
                  {formError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!!oNumberWarning}
                  className={`flex-1 ${themeColors.primary.bg} ${themeColors.primary.bgHover} text-white py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {editingSample ? 'Bijwerken' : 'Toevoegen'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
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

      {/* Photo Modal */}
      {selectedPhoto && (
        <PhotoModal
          photoUrl={selectedPhoto.url}
          onClose={() => setSelectedPhoto(null)}
          sampleNumber={selectedPhoto.oNumber}
        />
      )}

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        userRole={user?.role || 'user'}
      />

      {/* Dashboard Settings Modal (alleen voor admins) */}
      {user?.role === 'admin' && (
        <DashboardSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          onSave={saveDashboardSettings}
          currentSettings={dashboardSettings}
        />
      )}
      </div>
    </>
  );
}
