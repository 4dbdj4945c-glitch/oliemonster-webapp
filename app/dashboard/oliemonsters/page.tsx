'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PhotoModal from '@/app/components/PhotoModal';
import HelpModal from '@/app/components/HelpModal';
import Tooltip from '@/app/components/Tooltip';
import SampleAttemptsPanel from '@/app/components/SampleAttemptsPanel';

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
  oilType?: string;
  remarks?: string;
  isTaken: boolean;
  isDisabled?: boolean;
  photoUrl?: string;
  attemptsCount?: number;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [samples, setSamples] = useState<OilSample[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSample, setEditingSample] = useState<OilSample | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['status', 'oNumber', 'sampleDate', 'location', 'description', 'oilType']);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; oNumber: string } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'oNumber' | 'sampleDate' | 'location' | 'newest'>('newest');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'taken' | 'notTaken' | 'cancelled'>('all');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const router = useRouter();

  // Form state
  const [formData, setFormData] = useState({
    oNumber: '',
    sampleDate: '',
    location: '',
    description: '',
    oilType: '',
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
        if (data.columns) setVisibleColumns(data.columns);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
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
      const params = new URLSearchParams({ year: '2025' });
      if (search) params.set('search', search);
      const response = await fetch(`/api/samples?${params.toString()}`);
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

  const getFilteredSamples = () => {
    if (statusFilter === 'all') return samples;
    if (statusFilter === 'taken') return samples.filter(s => s.isTaken && !s.isDisabled);
    if (statusFilter === 'notTaken') return samples.filter(s => !s.isTaken && !s.isDisabled);
    if (statusFilter === 'cancelled') return samples.filter(s => s.isDisabled);
    return samples;
  };

  const getSortedSamples = () => {
    const sorted = [...getFilteredSamples()];

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
      oilType: '',
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
      oilType: sample.oilType || '',
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
        body: JSON.stringify({ ...formData, analysisYear: 2025 }),
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

  const handleAddAttempt = async (sample: OilSample) => {
    if (!confirm(`Nieuwe monstername (hermonstering) toevoegen aan ${sample.oNumber}?\n\nDeze wordt als "gepland" aangemaakt. Open daarna de details om datum/foto/opmerking in te vullen en de status op "genomen" te zetten.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/samples/${sample.id}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isTaken: false }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fout bij aanmaken monstername');
        return;
      }
      await loadSamples();
      openEditModal({ ...sample, attemptsCount: (sample.attemptsCount ?? 0) + 1 });
    } catch (e) {
      alert('Fout bij aanmaken monstername');
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
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--foreground)' }}>Laden...</p>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        .dashboard-container {
          min-height: 100vh;
          color: #1d1d1f;
        }

        .dashboard-header {
          background: rgba(255, 255, 255, 0.72);
          backdrop-filter: saturate(180%) blur(28px);
          -webkit-backdrop-filter: saturate(180%) blur(28px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.4);
          box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6);
          position: sticky;
          top: 0;
          z-index: 40;
        }
        .nav-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 11px;
          background: rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 7px;
          color: #1d1d1f;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s, box-shadow 0.15s, transform 0.15s;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.7);
        }
        .nav-btn:hover {
          background: rgba(255, 255, 255, 0.75);
          box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8);
        }
        .nav-btn-danger {
          color: #FF3B30;
          background: rgba(255, 59, 48, 0.08);
          border-color: rgba(255, 59, 48, 0.25);
        }
        .nav-btn-danger:hover {
          background: rgba(255, 59, 48, 0.16);
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.65);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.55);
          border-radius: 14px;
          padding: 1rem;
          margin-bottom: 1rem;
          box-shadow:
            0 10px 30px rgba(15, 23, 42, 0.08),
            0 2px 6px rgba(15, 23, 42, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.7);
        }

        .glass-input {
          width: 100%;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 8px;
          color: #1d1d1f;
          font-size: 14px;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
          outline: none;
          font-family: inherit;
          box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .glass-input::placeholder {
          color: #aeaeb2;
        }

        .glass-input:focus {
          border-color: #007AFF;
          box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15), inset 0 1px 2px rgba(15, 23, 42, 0.04);
          background: rgba(255, 255, 255, 0.95);
        }

        .glass-select {
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 8px;
          color: #1d1d1f;
          font-size: 14px;
          outline: none;
          cursor: pointer;
          font-family: inherit;
          box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .glass-select:focus {
          border-color: #007AFF;
          box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15), inset 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .glass-select option {
          background: white;
          color: #1d1d1f;
        }

        .glass-button {
          background: #007AFF;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px 20px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.15s, box-shadow 0.15s, transform 0.15s;
          white-space: nowrap;
          font-family: inherit;
          box-shadow: 0 2px 8px rgba(0, 122, 255, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.25);
        }

        .glass-button:hover:not(:disabled) {
          background: #0071E3;
          box-shadow: 0 4px 16px rgba(0, 122, 255, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3);
        }

        .glass-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .stat-card {
          background: rgba(255, 255, 255, 0.65);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.55);
          border-radius: 14px;
          padding: 1.25rem 1.5rem;
          box-shadow:
            0 10px 30px rgba(15, 23, 42, 0.08),
            0 2px 6px rgba(15, 23, 42, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.7);
        }

        .stat-value {
          font-size: 2rem;
          font-weight: 700;
          color: #1d1d1f;
        }

        .stat-label {
          font-size: 0.8rem;
          color: #6e6e73;
          margin-bottom: 0.25rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .table-container {
          background: rgba(255, 255, 255, 0.65);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.55);
          border-radius: 14px;
          overflow: hidden;
          box-shadow:
            0 10px 30px rgba(15, 23, 42, 0.08),
            0 2px 6px rgba(15, 23, 42, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.7);
        }

        .table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }

        .table thead {
          background: rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .table th {
          padding: 0.875rem 1.25rem;
          text-align: left;
          font-size: 0.72rem;
          font-weight: 600;
          color: #6e6e73;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .table td {
          padding: 0.875rem 1.25rem;
          font-size: 0.875rem;
          color: #1d1d1f;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
        }

        .table tbody tr:hover {
          background: rgba(255, 255, 255, 0.4);
        }

        .badge {
          display: inline-flex;
          padding: 4px 10px;
          font-size: 0.75rem;
          font-weight: 600;
          border-radius: 9999px;
        }

        .badge-success {
          background: rgba(52, 199, 89, 0.12);
          color: #1a7f37;
        }

        .badge-danger {
          background: rgba(255, 59, 48, 0.1);
          color: #CC2900;
        }

        .badge-gray {
          background: rgba(0, 0, 0, 0.06);
          color: #6e6e73;
        }
      `}</style>

      <div className="dashboard-container" style={{ minHeight: '100vh', background: '#f5f5f7' }}>
        {/* Header */}
        <div className="dashboard-header">
          <div className="max-w-7xl mx-auto px-6" style={{ height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img src="/header_logo.png" alt="It's Done Services" style={{ height: '22px', objectFit: 'contain', filter: 'invert(1)' }} />
              <span style={{ width: '1px', height: '16px', background: 'rgba(0,0,0,0.12)', display: 'inline-block' }} />
              <span style={{ color: '#6e6e73', fontSize: '13px', fontWeight: 500 }}>Oliemonsters 2025</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button onClick={() => router.push('/dashboard')} className="nav-btn" aria-label="Terug">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/></svg>
                Terug
              </button>
              {user?.role === 'admin' && (
                <button onClick={() => router.push('/dashboard/admin')} className="nav-btn" aria-label="Instellingen">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  Instellingen
                </button>
              )}
              <button onClick={() => setShowHelpModal(true)} className="nav-btn" aria-label="Help">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Help
              </button>
              <button onClick={handleLogout} className="nav-btn nav-btn-danger" aria-label="Uitloggen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Uitloggen
              </button>
            </div>
          </div>
        </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Search & Add */}
        <div className="glass-card">
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              placeholder="Zoek op o-nummer, locatie of omschrijving..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input flex-1"
            />
            {user?.role === 'admin' && (
              <button
                onClick={openAddModal}
                className="glass-button"
              >
                + Nieuw Monster
              </button>
            )}
          </div>
        </div>

        {/* Sort & Filter Controls */}
        <div className="glass-card">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center flex-wrap">
            <label className="text-sm font-medium" style={{ color: '#1d1d1f' }}>Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="glass-select"
            >
              <option value="all">Alle monsters</option>
              <option value="taken">Genomen</option>
              <option value="notTaken">Niet genomen</option>
              <option value="cancelled">Geannuleerd</option>
            </select>

            <label className="text-sm font-medium" style={{ color: '#1d1d1f', marginLeft: '0.5rem' }}>Sorteren op:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="glass-select"
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
                className="glass-select"
              >
                <option value="asc">Oplopend</option>
                <option value="desc">Aflopend</option>
              </select>
            )}
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div
            className="stat-card"
            onClick={() => setStatusFilter('all')}
            style={{ cursor: 'pointer', outline: statusFilter === 'all' ? '2px solid #007AFF' : 'none' }}
          >
            <p className="stat-label">Totaal monsters</p>
            <p className="stat-value">{samples.length}</p>
          </div>
          <div
            className="stat-card"
            onClick={() => setStatusFilter('taken')}
            style={{ borderLeft: '4px solid #34C759', cursor: 'pointer', outline: statusFilter === 'taken' ? '2px solid #34C759' : 'none' }}
          >
            <p className="stat-label">Genomen</p>
            <p className="stat-value" style={{ color: '#1a7f37' }}>
              {samples.filter(s => s.isTaken && !s.isDisabled).length}
            </p>
          </div>
          <div
            className="stat-card"
            onClick={() => setStatusFilter('notTaken')}
            style={{ borderLeft: '4px solid #FF3B30', cursor: 'pointer', outline: statusFilter === 'notTaken' ? '2px solid #FF3B30' : 'none' }}
          >
            <p className="stat-label">Niet genomen</p>
            <p className="stat-value" style={{ color: '#CC2900' }}>
              {samples.filter(s => !s.isTaken && !s.isDisabled).length}
            </p>
          </div>
          <div
            className="stat-card"
            onClick={() => setStatusFilter('cancelled')}
            style={{ borderLeft: '4px solid #aeaeb2', cursor: 'pointer', outline: statusFilter === 'cancelled' ? '2px solid #aeaeb2' : 'none' }}
          >
            <p className="stat-label">Geannuleerd</p>
            <p className="stat-value" style={{ color: '#6e6e73' }}>
              {samples.filter(s => s.isDisabled).length}
            </p>
          </div>
        </div>

        {/* Samples Table */}
        <div className="table-container">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  {visibleColumns.includes('status') && (<th>Status</th>)}
                  {visibleColumns.includes('oNumber') && (<th>O-nummer</th>)}
                  {visibleColumns.includes('sampleDate') && (<th>Datum</th>)}
                  {visibleColumns.includes('location') && (<th>Locatie</th>)}
                  {visibleColumns.includes('description') && (<th>Omschrijving</th>)}
                  {visibleColumns.includes('oilType') && (<th>Type olie</th>)}
                  {visibleColumns.includes('remarks') && (<th>Opmerkingen</th>)}
                  <th>Foto</th>
                  {user?.role === 'admin' && (<th>Acties</th>)}
                </tr>
              </thead>
              <tbody>
                {samples.length === 0 ? (
                  <tr>
                    <td colSpan={user?.role === 'admin' ? 7 : 6} style={{ textAlign: 'center', padding: '2rem', color: '#6e6e73' }}>
                      Geen monsters gevonden
                    </td>
                  </tr>
                ) : (
                  getSortedSamples().map((sample) => (
                    <tr key={sample.id} style={{ opacity: sample.isDisabled ? 0.6 : 1 }}>
                      {visibleColumns.includes('status') && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              className={`badge ${
                                sample.isDisabled
                                  ? 'badge-gray'
                                  : sample.isTaken
                                  ? 'badge-success'
                                  : 'badge-danger'
                              }`}
                              title={sample.isDisabled ? sample.remarks || 'Monster geannuleerd' : ''}
                            >
                              {sample.isDisabled ? '⊘ Geannuleerd' : sample.isTaken ? 'Genomen' : 'Niet genomen'}
                            </span>
                            {(sample.attemptsCount ?? 0) > 1 && (
                              <span
                                title={`${sample.attemptsCount} monsternames (incl. hermonstering)`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  minWidth: '22px',
                                  height: '22px',
                                  padding: '0 7px',
                                  borderRadius: '9999px',
                                  background: '#1d1d1f',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  lineHeight: 1,
                                }}
                              >
                                {sample.attemptsCount}×
                              </span>
                            )}
                          </span>
                        </td>
                      )}
                      {visibleColumns.includes('oNumber') && (
                        <td style={{ 
                          whiteSpace: 'nowrap', 
                          fontWeight: 500,
                          textDecoration: sample.isDisabled ? 'line-through' : 'none',
                          opacity: sample.isDisabled ? 0.7 : 1 
                        }}>
                          {sample.oNumber}
                        </td>
                      )}
                      {visibleColumns.includes('sampleDate') && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {sample.isTaken && sample.sampleDate ? new Date(sample.sampleDate).toLocaleDateString('nl-NL') : '-'}
                        </td>
                      )}
                      {visibleColumns.includes('location') && (
                        <td style={{ opacity: sample.isDisabled ? 0.7 : 1 }}>
                          {sample.location}
                        </td>
                      )}
                      {visibleColumns.includes('description') && (
                        <td>
                          {sample.description}
                        </td>
                      )}
                      {visibleColumns.includes('oilType') && (
                        <td>
                          {sample.oilType || '-'}
                        </td>
                      )}
                      {visibleColumns.includes('remarks') && (
                        <td>
                          {sample.remarks || '-'}
                        </td>
                      )}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {sample.photoUrl ? (
                          <button
                            onClick={() => setSelectedPhoto({ url: sample.photoUrl!, oNumber: sample.oNumber })}
                            style={{
                              color: '#007AFF',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              background: 'none',
                              border: 'none',
                              transition: 'color 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#0071E3'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#007AFF'}
                          >
                            📷 Bekijk foto
                          </button>
                        ) : user?.role === 'admin' ? (
                          <label style={{
                            cursor: 'pointer',
                            color: '#6e6e73',
                            transition: 'color 0.15s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#007AFF'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#6e6e73'}>
                            {uploadingPhoto === sample.id ? '↻ Uploaden...' : '+ Upload foto'}
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              disabled={uploadingPhoto === sample.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoUpload(sample.id, file);
                              }}
                            />
                          </label>
                        ) : (
                          <span style={{ color: '#aeaeb2' }}>Geen foto</span>
                        )}
                      </td>
                      {user?.role === 'admin' && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => handleAddAttempt(sample)}
                            title="Nieuwe monstername (hermonstering) toevoegen"
                            style={{
                              background: 'rgba(0, 122, 255, 0.08)',
                              border: '1px solid rgba(0, 122, 255, 0.2)',
                              color: '#007AFF',
                              cursor: 'pointer',
                              marginRight: '0.5rem',
                              fontSize: '13px',
                              fontWeight: 600,
                              padding: '3px 9px',
                              borderRadius: '6px',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 122, 255, 0.15)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 122, 255, 0.08)'}
                          >
                            + Hermonstering
                          </button>
                          <button
                            onClick={() => openEditModal(sample)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#007AFF',
                              cursor: 'pointer',
                              marginRight: '1rem',
                              fontSize: '13px',
                              fontWeight: 500,
                              transition: 'color 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#0071E3'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#007AFF'}
                          >
                            Bewerken
                          </button>
                          <button
                            onClick={() => handleDelete(sample.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#FF3B30',
                              cursor: 'pointer',
                              fontSize: '13px',
                              fontWeight: 500,
                              transition: 'color 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#CC2900'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#FF3B30'}
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
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}>
          <div style={{
            background: '#ffffff',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '18px',
            padding: '2rem',
            maxWidth: editingSample ? '720px' : '480px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)'
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: '#1d1d1f' }}>
              {editingSample ? 'Monster bewerken' : 'Nieuw monster toevoegen'}
            </h2>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#3c3c43', marginBottom: '0.5rem' }}>
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
                  className="glass-input"
                  style={{
                    borderColor: oNumberWarning ? '#fca5a5' : 'rgba(255, 255, 255, 0.2)'
                  }}
                  required
                />
                {oNumberWarning && (
                  <p style={{ color: '#fca5a5', fontSize: '0.875rem', marginTop: '0.25rem', fontWeight: 600 }}>
                    {oNumberWarning}
                  </p>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#3c3c43', marginBottom: '0.5rem' }}>
                  Datum afname {!formData.isTaken && '(optioneel - alleen voor genomen monsters)'}
                </label>
                <input
                  type="date"
                  value={formData.sampleDate}
                  onChange={(e) => setFormData({ ...formData, sampleDate: e.target.value })}
                  disabled={!formData.isTaken}
                  className="glass-input"
                  style={{ opacity: !formData.isTaken ? 0.5 : 1, cursor: !formData.isTaken ? 'not-allowed' : 'text' }}
                  required={formData.isTaken}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#3c3c43', marginBottom: '0.5rem' }}>
                  Locatie
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="glass-input"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#3c3c43', marginBottom: '0.5rem' }}>
                  Omschrijving
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="glass-input"
                  rows={3}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#3c3c43', marginBottom: '0.5rem' }}>
                  Type olie (optioneel)
                </label>
                <input
                  type="text"
                  value={formData.oilType}
                  onChange={(e) => setFormData({ ...formData, oilType: e.target.value })}
                  className="glass-input"
                  placeholder="Bijv. motorolie, hydraulische olie, etc."
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#3c3c43', marginBottom: '0.5rem' }}>
                  Opmerkingen (optioneel)
                </label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="glass-input"
                  rows={2}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  id="isTaken"
                  checked={formData.isTaken}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    setFormData({ 
                      ...formData, 
                      isTaken: isChecked,
                      sampleDate: isChecked ? formData.sampleDate : ''
                    });
                  }}
                  style={{ width: '18px', height: '18px', marginRight: '0.5rem', cursor: 'pointer', accentColor: '#007AFF' }}
                />
                <label htmlFor="isTaken" style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.9)', cursor: 'pointer' }}>
                  Monster is genomen
                </label>
              </div>

              {formError && (
                <div style={{ color: '#CC2900', fontSize: '0.875rem', background: 'rgba(255, 59, 48, 0.08)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255, 59, 48, 0.2)' }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="submit"
                  disabled={!!oNumberWarning}
                  className="glass-button"
                  style={{ flex: 1 }}
                >
                  {editingSample ? 'Bijwerken' : 'Toevoegen'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.5rem',
                    background: '#f5f5f7',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    borderRadius: '8px',
                    color: '#1d1d1f',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                    fontFamily: 'inherit'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#ebebed'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#f5f5f7'}
                >
                  Annuleren
                </button>
              </div>
            </form>

            {editingSample && (
              <div style={{ marginTop: '1.5rem' }}>
                <SampleAttemptsPanel
                  sampleId={editingSample.id}
                  oNumber={editingSample.oNumber}
                  isAdmin={user?.role === 'admin'}
                  onPhotoClick={(url, label) => setSelectedPhoto({ url, oNumber: label })}
                  onChange={() => loadSamples()}
                />
              </div>
            )}
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

      </div>
    </>
  );
}
