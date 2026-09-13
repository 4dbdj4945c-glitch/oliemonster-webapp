'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PhotoModal from '@/app/components/PhotoModal';
import HelpModal from '@/app/components/HelpModal';
import Tooltip from '@/app/components/Tooltip';
import SampleAttemptsPanel from '@/app/components/SampleAttemptsPanel';
import { AppShell, NavButton, Icons } from '@/app/components/ui';
import { generateSamplesPdf } from '@/lib/generateSamplesPdf';

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
  const [generatingPdf, setGeneratingPdf] = useState(false);
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

      // Beperkte kijker mag 2026 niet zien; stuur naar 2025.
      if (data.role === 'viewer_oil2025') {
        router.replace('/dashboard/oliemonsters');
        return;
      }

      setUser(data);
    } catch (error) {
      router.push('/login');
    }
  };

  const loadSamples = async () => {
    try {
      const params = new URLSearchParams({ year: '2026' });
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
      setONumberWarning('Dit o-nummer bestaat al.');
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
        body: JSON.stringify({ ...formData, analysisYear: 2026 }),
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

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      // Haal altijd het volledige jaaroverzicht op (negeer filter/zoeken)
      const response = await fetch('/api/samples?year=2026');
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Fout bij ophalen van monsters voor PDF');
        return;
      }
      await generateSamplesPdf(data, 2026);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Fout bij genereren van PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) {
    return <div className="laadscherm">Laden...</div>;
  }

  const isAdmin = user?.role === 'admin';

  return (
    <AppShell
      title="Oliemonsters 2026"
      wide
      rightActions={
        <>
          <NavButton icon={Icons.Back} ariaLabel="Terug" onClick={() => router.push('/dashboard')}>Terug</NavButton>
          {isAdmin && (
            <NavButton icon={Icons.Settings} ariaLabel="Instellingen" onClick={() => router.push('/dashboard/admin')}>Instellingen</NavButton>
          )}
          <NavButton icon={Icons.Help} ariaLabel="Help" onClick={() => setShowHelpModal(true)}>Help</NavButton>
          <NavButton icon={Icons.Logout} ariaLabel="Uitloggen" danger onClick={handleLogout}>Uitloggen</NavButton>
        </>
      }
    >
      {/* Zoeken en toevoegen */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Zoek op o-nummer, locatie of omschrijving..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input flex-1"
          />
          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={generatingPdf}
            className="btn"
            title="Download een PDF met alle oliemonsters van 2026 en de datum waarop ze zijn genomen"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>
            {generatingPdf ? 'Bezig...' : 'PDF genereren'}
          </button>
          {isAdmin && (
            <button type="button" onClick={openAddModal} className="btn btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
              Nieuw Monster
            </button>
          )}
        </div>
      </div>

      {/* Filteren en sorteren */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
          <label className="label" style={{ margin: 0 }}>Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="select"
            style={{ width: 'auto' }}
          >
            <option value="all">Alle monsters</option>
            <option value="taken">Genomen</option>
            <option value="notTaken">Niet genomen</option>
            <option value="cancelled">Geannuleerd</option>
          </select>

          <label className="label" style={{ margin: 0, marginLeft: '8px' }}>Sorteren op:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="select"
            style={{ width: 'auto' }}
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
              className="select"
              style={{ width: 'auto' }}
            >
              <option value="asc">Oplopend</option>
              <option value="desc">Aflopend</option>
            </select>
          )}
        </div>
      </div>

      {/* Statistieken */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div
          className="stat-card"
          onClick={() => setStatusFilter('all')}
          style={{
            cursor: 'pointer',
            borderColor: statusFilter === 'all' ? 'var(--blue)' : undefined,
            boxShadow: statusFilter === 'all' ? '0 0 0 3px var(--blue-light)' : undefined,
          }}
        >
          <p className="stat-value">{samples.length}</p>
          <p className="stat-label">Totaal monsters</p>
        </div>
        <div
          className="stat-card"
          onClick={() => setStatusFilter('taken')}
          style={{
            cursor: 'pointer',
            borderLeft: '4px solid var(--groen)',
            borderColor: statusFilter === 'taken' ? 'var(--groen)' : undefined,
            boxShadow: statusFilter === 'taken' ? '0 0 0 3px var(--groen-light)' : undefined,
          }}
        >
          <p className="stat-value" style={{ color: 'var(--groen-tekst)' }}>
            {samples.filter(s => s.isTaken && !s.isDisabled).length}
          </p>
          <p className="stat-label">Genomen</p>
        </div>
        <div
          className="stat-card"
          onClick={() => setStatusFilter('notTaken')}
          style={{
            cursor: 'pointer',
            borderLeft: '4px solid var(--rood)',
            borderColor: statusFilter === 'notTaken' ? 'var(--rood)' : undefined,
            boxShadow: statusFilter === 'notTaken' ? '0 0 0 3px var(--rood-light)' : undefined,
          }}
        >
          <p className="stat-value" style={{ color: 'var(--rood-tekst)' }}>
            {samples.filter(s => !s.isTaken && !s.isDisabled).length}
          </p>
          <p className="stat-label">Niet genomen</p>
        </div>
        <div
          className="stat-card"
          onClick={() => setStatusFilter('cancelled')}
          style={{
            cursor: 'pointer',
            borderLeft: '4px solid var(--grijs-400)',
            borderColor: statusFilter === 'cancelled' ? 'var(--grijs-400)' : undefined,
            boxShadow: statusFilter === 'cancelled' ? '0 0 0 3px var(--grijs-200)' : undefined,
          }}
        >
          <p className="stat-value" style={{ color: 'var(--grijs-500)' }}>
            {samples.filter(s => s.isDisabled).length}
          </p>
          <p className="stat-label">Geannuleerd</p>
        </div>
      </div>

      {/* Tabel met monsters */}
      <div className="table-container">
        <div className="table-scroll">
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
                {isAdmin && (<th>Acties</th>)}
              </tr>
            </thead>
            <tbody>
              {samples.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} style={{ textAlign: 'center', padding: '32px', color: 'var(--grijs-500)' }}>
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
                            {sample.isDisabled ? 'Geannuleerd' : sample.isTaken ? 'Genomen' : 'Niet genomen'}
                          </span>
                          {(sample.attemptsCount ?? 0) > 1 && (
                            <span
                              className="badge badge-navy"
                              title={`${sample.attemptsCount} monsternames (incl. hermonstering)`}
                            >
                              {sample.attemptsCount}x
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
                          type="button"
                          onClick={() => setSelectedPhoto({ url: sample.photoUrl!, oNumber: sample.oNumber })}
                          className="btn-link"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                          Bekijk foto
                        </button>
                      ) : isAdmin ? (
                        <label className="btn-link" style={{ color: 'var(--grijs-500)' }}>
                          {uploadingPhoto === sample.id ? 'Uploaden...' : '+ Upload foto'}
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
                        <span className="text-tertiary">Geen foto</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => handleAddAttempt(sample)}
                          title="Nieuwe monstername (hermonstering) toevoegen"
                          className="btn btn-sm"
                          style={{ marginRight: '10px' }}
                        >
                          + Hermonstering
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(sample)}
                          className="btn-link"
                          style={{ marginRight: '14px' }}
                        >
                          Bewerken
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(sample.id)}
                          className="btn-link btn-link-danger"
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

      {/* Toevoegen / bewerken */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className={`modal-content${editingSample ? ' modal-content-lg' : ''}`}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingSample ? 'Monster bewerken' : 'Nieuw monster toevoegen'}
              </h2>
            </div>

            <div className="modal-body">
              <form id="sample-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="label">O-nummer</label>
                  <input
                    type="text"
                    value={formData.oNumber}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({ ...formData, oNumber: value });
                      checkONumberExists(value);
                    }}
                    onBlur={(e) => checkONumberExists(e.target.value)}
                    className="input"
                    style={oNumberWarning ? { borderColor: 'var(--rood)' } : undefined}
                    required
                  />
                  {oNumberWarning && (
                    <p style={{ color: 'var(--rood)', fontSize: '13px', marginTop: '4px', fontWeight: 600 }}>
                      {oNumberWarning}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">
                    Datum afname {!formData.isTaken && '(optioneel, alleen voor genomen monsters)'}
                  </label>
                  <input
                    type="date"
                    value={formData.sampleDate}
                    onChange={(e) => setFormData({ ...formData, sampleDate: e.target.value })}
                    disabled={!formData.isTaken}
                    className="input"
                    required={formData.isTaken}
                  />
                </div>

                <div>
                  <label className="label">Locatie</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="input"
                    required
                  />
                </div>

                <div>
                  <label className="label">Omschrijving</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="textarea"
                    rows={3}
                    required
                  />
                </div>

                <div>
                  <label className="label">Type olie (optioneel)</label>
                  <input
                    type="text"
                    value={formData.oilType}
                    onChange={(e) => setFormData({ ...formData, oilType: e.target.value })}
                    className="input"
                    placeholder="Bijv. motorolie, hydraulische olie, etc."
                  />
                </div>

                <div>
                  <label className="label">Opmerkingen (optioneel)</label>
                  <textarea
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    className="textarea"
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
                    style={{ width: '18px', height: '18px', marginRight: '8px' }}
                  />
                  <label htmlFor="isTaken" style={{ fontSize: '14px', color: 'var(--navy)', cursor: 'pointer' }}>
                    Monster is genomen
                  </label>
                </div>

                {formError && (
                  <div className="alert alert-danger">
                    {formError}
                  </div>
                )}
              </form>

              {editingSample && (
                <div style={{ marginTop: '20px' }}>
                  <SampleAttemptsPanel
                    sampleId={editingSample.id}
                    oNumber={editingSample.oNumber}
                    isAdmin={isAdmin}
                    onPhotoClick={(url, label) => setSelectedPhoto({ url, oNumber: label })}
                    onChange={() => loadSamples()}
                  />
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
              >
                Annuleren
              </button>
              <button
                type="submit"
                form="sample-form"
                disabled={!!oNumberWarning}
                className="btn btn-primary"
              >
                {editingSample ? 'Bijwerken' : 'Toevoegen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Foto */}
      {selectedPhoto && (
        <PhotoModal
          photoUrl={selectedPhoto.url}
          onClose={() => setSelectedPhoto(null)}
          sampleNumber={selectedPhoto.oNumber}
        />
      )}

      {/* Help */}
      <HelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        userRole={user?.role || 'user'}
      />
    </AppShell>
  );
}
