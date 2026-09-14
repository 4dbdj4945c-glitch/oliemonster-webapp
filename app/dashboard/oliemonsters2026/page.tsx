'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PhotoModal from '@/app/components/PhotoModal';
import HelpModal from '@/app/components/HelpModal';
import Tooltip from '@/app/components/Tooltip';
import SampleAttemptsPanel from '@/app/components/SampleAttemptsPanel';
import { AppShell } from '@/app/components/ui';
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
  const [copying, setCopying] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
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

  // Neemt alle niet-geannuleerde monsters van 2025 over als geplande monsters voor 2026.
  const handleCopyFrom2025 = async () => {
    if (!confirm('Alle te nemen monsters van 2025 overnemen naar 2026?\n\nZe worden als "niet genomen" toegevoegd, zonder datum of foto. O-nummers die in 2026 al bestaan worden overgeslagen.')) {
      return;
    }
    setCopying(true);
    setCopyMessage('');
    try {
      const response = await fetch('/api/samples/copy-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromYear: 2025, toYear: 2026 }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Fout bij overnemen van monsters');
        return;
      }
      setCopyMessage(
        data.overgenomen === 0
          ? `Niets overgenomen: alle ${data.bron} monsters van 2025 staan al in 2026.`
          : `${data.overgenomen} monsters overgenomen uit 2025${data.overgeslagen ? `, ${data.overgeslagen} bestonden al` : ''}.`
      );
      loadSamples();
    } catch {
      alert('Fout bij overnemen van monsters');
    } finally {
      setCopying(false);
    }
  };

  return (
    <AppShell
      title="Oliemonsters 2026"
      wide
      user={user}
      onHelp={() => setShowHelpModal(true)}
      onPrint={handleGeneratePdf}
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
          <div className="knoppenrij flex gap-3">
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
              <button
                type="button"
                onClick={handleCopyFrom2025}
                disabled={copying}
                className="btn"
                title="Neem alle te nemen monsters van 2025 over als geplande monsters voor 2026"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                {copying ? 'Bezig...' : 'Overnemen uit 2025'}
              </button>
            )}
            {isAdmin && (
              <button type="button" onClick={openAddModal} className="btn btn-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                Nieuw Monster
              </button>
            )}
          </div>
        </div>
        {copyMessage && (
          <div className="alert alert-success" style={{ marginTop: '12px' }}>{copyMessage}</div>
        )}
      </div>

      {/* Filteren en sorteren */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="filters">
          <div className="filter-veld">
            <label className="label filter-label">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="select filter-select"
            >
              <option value="all">Alle monsters</option>
              <option value="taken">Genomen</option>
              <option value="notTaken">Niet genomen</option>
              <option value="cancelled">Geannuleerd</option>
            </select>
          </div>

          <div className="filter-veld">
            <label className="label filter-label">Sorteren op:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="select filter-select"
            >
              <option value="newest">Laatst toegevoegd</option>
              <option value="oNumber">O-nummer</option>
              <option value="sampleDate">Datum</option>
              <option value="location">Locatie</option>
            </select>
          </div>

          {sortBy !== 'newest' && (
            <div className="filter-veld">
              <label className="label filter-label filter-label-mobiel">Volgorde:</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                className="select filter-select"
              >
                <option value="asc">Oplopend</option>
                <option value="desc">Aflopend</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Statistieken */}
      <div className="stats-grid mb-6">
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
          <table className="table table-kaarten">
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
                  <td colSpan={isAdmin ? 7 : 6} style={{ textAlign: 'center', justifyContent: 'center', padding: '32px', color: 'var(--grijs-500)' }}>
                    Geen monsters gevonden
                  </td>
                </tr>
              ) : (
                getSortedSamples().map((sample) => (
                  <tr key={sample.id} style={{ opacity: sample.isDisabled ? 0.6 : 1 }}>
                    {visibleColumns.includes('status') && (
                      <td data-label="Status" className="kaart-status" style={{ whiteSpace: 'nowrap' }}>
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
                      <td data-label="O-nummer" className="kaart-kop font-medium" style={{
                        whiteSpace: 'nowrap',
                        textDecoration: sample.isDisabled ? 'line-through' : 'none',
                        opacity: sample.isDisabled ? 0.7 : 1
                      }}>
                        {sample.oNumber}
                      </td>
                    )}
                    {visibleColumns.includes('sampleDate') && (
                      <td data-label="Datum" style={{ whiteSpace: 'nowrap' }}>
                        {sample.isTaken && sample.sampleDate ? new Date(sample.sampleDate).toLocaleDateString('nl-NL') : '-'}
                      </td>
                    )}
                    {visibleColumns.includes('location') && (
                      <td data-label="Locatie" style={{ opacity: sample.isDisabled ? 0.7 : 1 }}>
                        {sample.location}
                      </td>
                    )}
                    {visibleColumns.includes('description') && (
                      <td data-label="Omschrijving">
                        {sample.description}
                      </td>
                    )}
                    {visibleColumns.includes('oilType') && (
                      <td data-label="Type olie">
                        {sample.oilType || '-'}
                      </td>
                    )}
                    {visibleColumns.includes('remarks') && (
                      <td data-label="Opmerkingen">
                        {sample.remarks || '-'}
                      </td>
                    )}
                    <td data-label="Foto" style={{ whiteSpace: 'nowrap' }}>
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
                      <td data-label="Acties" className="kaart-acties" style={{ whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => handleAddAttempt(sample)}
                          title="Nieuwe monstername (hermonstering) toevoegen"
                          className="btn btn-sm sm:mr-2.5"
                        >
                          + Hermonstering
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(sample)}
                          className="btn-link sm:mr-3.5"
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

      <style jsx>{`
        /* Filters: op de telefoon twee kolommen met het label boven het veld,
           op desktop een rij met de labels naast de velden. */
        .filters {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px 12px;
        }
        .filter-veld {
          min-width: 0;
        }
        .filter-label {
          margin: 0 0 5px;
        }
        @media (min-width: 641px) {
          .filters {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 12px;
          }
          .filter-veld {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .filter-veld:nth-child(2) {
            margin-left: 8px;
          }
          .filter-label {
            margin: 0;
          }
          .filter-label-mobiel {
            display: none;
          }
          .filter-select {
            width: auto;
          }
        }
      `}</style>
    </AppShell>
  );
}
