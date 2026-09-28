'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PhotoModal from '@/app/components/PhotoModal';
import HelpModal from '@/app/components/HelpModal';
import Tooltip from '@/app/components/Tooltip';
import SampleAttemptsPanel from '@/app/components/SampleAttemptsPanel';
import LaadFout from '@/app/components/LaadFout';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { objectTypeIcoon, objectTypeLabel } from '@/lib/sampleObjects';
import { ANNULEER_REDENEN } from '@/lib/cancelReasons';
import PlanningPaneel from '@/app/components/PlanningPaneel';
import { AppShell, Modal, Icon } from '@/app/components/ui';
import { generateSamplesPdf } from '@/lib/generateSamplesPdf';
import { isOilViewer2025 } from '@/lib/roles';

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
  objectId?: number | null;
  object?: { id: number; name: string; objectType?: string | null } | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancelReasonInPdf?: boolean;
}

interface SampleObject {
  id: number;
  name: string;
  objectType: string | null;
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
  // Melding boven de lijst als ophalen of bijwerken mislukt. Zonder deze melding
  // is "kon niet laden" niet te onderscheiden van "er zijn geen monsters".
  const [foutmelding, setFoutmelding] = useState('');
  // Welk monster staat nu in de wacht bij het aantikken van de status
  const [statusBezig, setStatusBezig] = useState<number | null>(null);
  // Objecten (planningsmodule). Zolang ./db-push-planning.sh nog niet gedraaid is
  // bestaan ze niet; dan blijven de kolom en het filter gewoon weg.
  const [objecten, setObjecten] = useState<SampleObject[]>([]);
  const [objectenBeschikbaar, setObjectenBeschikbaar] = useState(false);
  const [objectFilter, setObjectFilter] = useState<string>('all');
  // Tabbladen binnen deze module: de lijst met monsters of de planning
  const [tab, setTab] = useState<'lijst' | 'planning'>('lijst');
  // Annuleren met reden (los monster of alle monsters van een object)
  const [annuleerDoel, setAnnuleerDoel] = useState<OilSample | null>(null);
  const [annuleerBulk, setAnnuleerBulk] = useState(false);
  const [annuleerReden, setAnnuleerReden] = useState(ANNULEER_REDENEN[0].waarde);
  const [annuleerToelichting, setAnnuleerToelichting] = useState('');
  const [annuleerInPdf, setAnnuleerInPdf] = useState(true);
  const [annuleerBezig, setAnnuleerBezig] = useState(false);
  const [annuleerFout, setAnnuleerFout] = useState('');

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
    objectId: '',
  });
  const [formError, setFormError] = useState('');
  const [oNumberWarning, setONumberWarning] = useState('');

  useEffect(() => {
    checkAuth();
    loadSettings();
  }, []);

  useEffect(() => {
    if (user) loadObjecten();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (user) {
      loadSamples();
    }
  }, [user, search]);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        setFoutmelding(
          await foutTekst(response, 'De kolominstellingen konden niet worden opgehaald, je ziet de standaardkolommen.')
        );
        return;
      }
      const data = await response.json();
      if (data.columns) setVisibleColumns(data.columns);
    } catch (error) {
      setFoutmelding(GEEN_VERBINDING);
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
      if (!response.ok) {
        setFoutmelding(await foutTekst(response, 'De monsters konden niet worden opgehaald.'));
        return;
      }
      setSamples(await response.json());
      setFoutmelding('');
    } catch (error) {
      setFoutmelding(GEEN_VERBINDING);
    } finally {
      setLoading(false);
    }
  };

  const loadObjecten = async () => {
    try {
      const response = await fetch('/api/sample-objects?year=2025');
      if (!response.ok) {
        // 503 betekent: de tabellen staan er nog niet. Dan laten we de kolom en
        // het filter weg in plaats van een melding te tonen.
        setObjectenBeschikbaar(false);
        if (response.status !== 503) {
          setFoutmelding(await foutTekst(response, 'De objecten konden niet worden opgehaald.'));
        }
        return;
      }
      setObjecten(await response.json());
      setObjectenBeschikbaar(true);
    } catch (error) {
      setObjectenBeschikbaar(false);
    }
  };

  // Knop "Opnieuw proberen" in de foutmelding: alles opnieuw ophalen.
  const herlaad = () => {
    setFoutmelding('');
    loadSettings();
    loadObjecten();
    loadSamples();
  };

  const getFilteredSamples = () => {
    let lijst = samples;
    if (statusFilter === 'taken') lijst = lijst.filter(s => s.isTaken && !s.isDisabled);
    else if (statusFilter === 'notTaken') lijst = lijst.filter(s => !s.isTaken && !s.isDisabled);
    else if (statusFilter === 'cancelled') lijst = lijst.filter(s => s.isDisabled);
    if (objectFilter === 'geen') lijst = lijst.filter(s => !s.objectId);
    else if (objectFilter !== 'all') lijst = lijst.filter(s => String(s.objectId ?? '') === objectFilter);
    return lijst;
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
      objectId: '',
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
      objectId: sample.objectId ? String(sample.objectId) : '',
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
        // objectId alleen meesturen als de objecten bestaan, anders raakt de
        // server een kolom aan die er nog niet is.
        body: JSON.stringify({
          ...formData,
          objectId: objectenBeschikbaar ? (formData.objectId === '' ? null : parseInt(formData.objectId)) : undefined,
          analysisYear: 2025,
        }),
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

      if (!response.ok) {
        setFoutmelding(await foutTekst(response, 'Het monster kon niet worden verwijderd.'));
        return;
      }
      loadSamples();
    } catch (error) {
      setFoutmelding(GEEN_VERBINDING);
    }
  };

  // Statusbadge: altijd icoon plus woord (zie STIJL.md).
  const statusBadge = (sample: OilSample) => (
    <span
      className={`badge ${
        sample.isDisabled ? 'badge-gray' : sample.isTaken ? 'badge-success' : 'badge-danger'
      }`}
      title={sample.isDisabled ? sample.cancelReason || 'Monster geannuleerd' : undefined}
    >
      <Icon name={sample.isDisabled ? 'status-cancelled' : sample.isTaken ? 'status-taken' : 'status-not-taken'} size={16} />
      {sample.isDisabled ? 'Geannuleerd' : sample.isTaken ? 'Genomen' : 'Niet genomen'}
    </span>
  );

  // Eén tik op de status: meteen omzetten in het scherm, en terugdraaien met een
  // melding als de server het niet aanneemt.
  const toggleStatus = async (sample: OilSample) => {
    if (sample.isDisabled || statusBezig !== null) return;
    const naarGenomen = !sample.isTaken;
    const vandaag = new Date().toISOString().split('T')[0];
    const datum = sample.sampleDate ? sample.sampleDate.split('T')[0] : vandaag;

    setStatusBezig(sample.id);
    setSamples((prev) =>
      prev.map((s) =>
        s.id === sample.id
          ? { ...s, isTaken: naarGenomen, sampleDate: naarGenomen ? `${datum}T00:00:00.000Z` : null }
          : s
      )
    );

    try {
      const response = await fetch(`/api/samples/${sample.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isTaken: naarGenomen, sampleDate: naarGenomen ? datum : null }),
      });
      if (!response.ok) {
        setSamples((prev) => prev.map((s) => (s.id === sample.id ? sample : s)));
        setFoutmelding(await foutTekst(response, `${sample.oNumber} is niet bijgewerkt.`));
        return;
      }
      setFoutmelding('');
      await loadSamples();
    } catch (error) {
      setSamples((prev) => prev.map((s) => (s.id === sample.id ? sample : s)));
      setFoutmelding(`${sample.oNumber} is niet opgeslagen: geen verbinding met de server.`);
    } finally {
      setStatusBezig(null);
    }
  };

  // ---- Annuleren ----
  const openAnnuleren = (sample: OilSample) => {
    setAnnuleerDoel(sample);
    setAnnuleerBulk(false);
    setAnnuleerReden(ANNULEER_REDENEN[0].waarde);
    setAnnuleerToelichting('');
    setAnnuleerInPdf(true);
    setAnnuleerFout('');
  };

  const openBulkAnnuleren = () => {
    setAnnuleerDoel(null);
    setAnnuleerBulk(true);
    setAnnuleerReden(ANNULEER_REDENEN[0].waarde);
    setAnnuleerToelichting('');
    setAnnuleerInPdf(true);
    setAnnuleerFout('');
  };

  const sluitAnnuleren = () => {
    setAnnuleerDoel(null);
    setAnnuleerBulk(false);
    setAnnuleerFout('');
  };

  const bevestigAnnuleren = async () => {
    setAnnuleerBezig(true);
    setAnnuleerFout('');
    try {
      const body = {
        reason: annuleerReden,
        toelichting: annuleerToelichting,
        cancelReasonInPdf: annuleerInPdf,
      };
      const response = annuleerBulk
        ? await fetch('/api/samples/cancel-bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, objectId: parseInt(objectFilter), analysisYear: 2025 }),
          })
        : await fetch(`/api/samples/${annuleerDoel!.id}/cancel`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      if (!response.ok) {
        setAnnuleerFout(await foutTekst(response, 'Het annuleren is niet gelukt.'));
        return;
      }
      sluitAnnuleren();
      await loadSamples();
    } catch (error) {
      setAnnuleerFout(GEEN_VERBINDING);
    } finally {
      setAnnuleerBezig(false);
    }
  };

  const draaiAnnuleringTerug = async (sample: OilSample) => {
    try {
      const response = await fetch(`/api/samples/${sample.id}/uncancel`, { method: 'PATCH' });
      if (!response.ok) {
        setFoutmelding(await foutTekst(response, `De annulering van ${sample.oNumber} is niet teruggedraaid.`));
        return;
      }
      setFoutmelding('');
      await loadSamples();
    } catch (error) {
      setFoutmelding(GEEN_VERBINDING);
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
      const response = await fetch('/api/samples?year=2025');
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Fout bij ophalen van monsters voor PDF');
        return;
      }
      await generateSamplesPdf(data, 2025);
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

  // Wat er nu echt in de tabel staat: gefilterd en gesorteerd. De lege staat moet
  // hierop kijken, niet op de volledige lijst, anders krijg je een tabelkop met
  // niets eronder zodra een filter geen treffers heeft.
  const zichtbareSamples = getSortedSamples();
  const filterActief = statusFilter !== 'all' || objectFilter !== 'all' || search.trim() !== '';
  // Kolommen: de zichtbare kolommen plus Foto, plus Acties voor een admin.
  const kolomAantal = visibleColumns.length + 1 + (objectenBeschikbaar ? 1 : 0) + (isAdmin ? 1 : 0);
  // De beperkte kijker krijgt de planning niet te zien; de API weigert hem ook.
  const magPlannen = objectenBeschikbaar && !isOilViewer2025(user?.role);
  const objectNaamVanFilter =
    objecten.find((o) => String(o.id) === objectFilter)?.name ?? 'dit object';
  const aantalGenomen = samples.filter((s) => s.isTaken && !s.isDisabled).length;
  const aantalGeannuleerd = samples.filter((s) => s.isDisabled).length;

  const wisFilter = () => {
    setStatusFilter('all');
    setObjectFilter('all');
    setSearch('');
  };

  return (
    <AppShell
      title="Oliemonsters 2025"
      wide
      user={user}
      onHelp={() => setShowHelpModal(true)}
      onPrint={handleGeneratePdf}
    >
      <h1 className="page-title">Oliemonsters 2025</h1>
      <p className="page-subtitle">
        {foutmelding && samples.length === 0
          ? 'De lijst kon niet worden opgehaald.'
          : samples.length === 0
          ? 'Nog geen monsters in dit jaar.'
          : `${aantalGenomen} van de ${samples.length} monsters genomen${
              aantalGeannuleerd ? `, ${aantalGeannuleerd} geannuleerd` : ''
            }.`}
      </p>

      {/* Ophalen of bijwerken mislukt */}
      {foutmelding && <LaadFout melding={foutmelding} onOpnieuw={herlaad} />}

      {/* Tabbladen: de lijst of de planning van dit jaar */}
      {magPlannen && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '16px' }}>
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'lijst'}
              className={tab === 'lijst' ? 'on' : ''}
              onClick={() => setTab('lijst')}
            >
              Lijst
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'planning'}
              className={tab === 'planning' ? 'on' : ''}
              onClick={() => setTab('planning')}
            >
              Planning
            </button>
          </div>
        </div>
      )}

      {tab === 'planning' && magPlannen && (
        <PlanningPaneel analysisYear={2025} isAdmin={isAdmin} />
      )}

      {(tab !== 'planning' || !magPlannen) && (<>
      {/* Zoeken en toevoegen */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="zoekveld flex-1">
            <Icon name="search" />
            <input
              type="text"
              placeholder="Zoek op o-nummer, locatie of omschrijving..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
              aria-label="Zoeken"
            />
          </label>
          {(!isOilViewer2025(user?.role) || isAdmin) && (
            <div className="knoppenrij flex gap-3">
              {!isOilViewer2025(user?.role) && (
                <button
                  type="button"
                  onClick={handleGeneratePdf}
                  disabled={generatingPdf}
                  className="btn"
                  title="Download een PDF met alle oliemonsters van 2025 en de datum waarop ze zijn genomen"
                >
                  <Icon name="file-pdf" />
                  {generatingPdf ? 'Bezig...' : 'PDF genereren'}
                </button>
              )}
              {isAdmin && (
                <button type="button" onClick={openAddModal} className="btn btn-primary">
                  <Icon name="plus" />
                  Nieuw monster
                </button>
              )}
            </div>
          )}
        </div>
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

          {objectenBeschikbaar && (
            <div className="filter-veld">
              <label className="label filter-label" htmlFor="filter-object">Object:</label>
              <select
                id="filter-object"
                value={objectFilter}
                onChange={(e) => setObjectFilter(e.target.value)}
                className="select filter-select"
              >
                <option value="all">Alle objecten</option>
                <option value="geen">Zonder object</option>
                {objecten.map((o) => (
                  <option key={o.id} value={String(o.id)}>{o.name}</option>
                ))}
              </select>
            </div>
          )}

          {isAdmin && objectenBeschikbaar && objectFilter !== 'all' && objectFilter !== 'geen' && (
            <div className="filter-veld">
              <button type="button" className="btn btn-sm" onClick={openBulkAnnuleren}>
                <Icon name="status-cancelled" size={16} />
                Alle monsters van dit object annuleren
              </button>
            </div>
          )}

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
          className="stat-card stat-card-icoon"
          onClick={() => setStatusFilter('all')}
          style={{
            cursor: 'pointer',
            borderColor: statusFilter === 'all' ? 'var(--blue)' : undefined,
            boxShadow: statusFilter === 'all' ? '0 0 0 3px var(--blue-light)' : undefined,
          }}
        >
          <Icon name="total" />
          <p className="stat-value">{samples.length}</p>
          <p className="stat-label">Totaal monsters</p>
        </div>
        <div
          className="stat-card stat-card-icoon is-genomen"
          onClick={() => setStatusFilter('taken')}
          style={{
            cursor: 'pointer',
            borderLeft: '4px solid var(--groen)',
            borderColor: statusFilter === 'taken' ? 'var(--groen)' : undefined,
            boxShadow: statusFilter === 'taken' ? '0 0 0 3px var(--groen-light)' : undefined,
          }}
        >
          <Icon name="status-taken" />
          <p className="stat-value" style={{ color: 'var(--groen-tekst)' }}>
            {samples.filter(s => s.isTaken && !s.isDisabled).length}
          </p>
          <p className="stat-label">Genomen</p>
        </div>
        <div
          className="stat-card stat-card-icoon is-niet-genomen"
          onClick={() => setStatusFilter('notTaken')}
          style={{
            cursor: 'pointer',
            borderLeft: '4px solid var(--rood)',
            borderColor: statusFilter === 'notTaken' ? 'var(--rood)' : undefined,
            boxShadow: statusFilter === 'notTaken' ? '0 0 0 3px var(--rood-light)' : undefined,
          }}
        >
          <Icon name="status-not-taken" />
          <p className="stat-value" style={{ color: 'var(--rood-tekst)' }}>
            {samples.filter(s => !s.isTaken && !s.isDisabled).length}
          </p>
          <p className="stat-label">Niet genomen</p>
        </div>
        <div
          className="stat-card stat-card-icoon"
          onClick={() => setStatusFilter('cancelled')}
          style={{
            cursor: 'pointer',
            borderLeft: '4px solid var(--grijs-400)',
            borderColor: statusFilter === 'cancelled' ? 'var(--grijs-400)' : undefined,
            boxShadow: statusFilter === 'cancelled' ? '0 0 0 3px var(--grijs-200)' : undefined,
          }}
        >
          <Icon name="status-cancelled" />
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
                {objectenBeschikbaar && (<th>Object</th>)}
                {visibleColumns.includes('location') && (<th>Locatie</th>)}
                {visibleColumns.includes('description') && (<th>Omschrijving</th>)}
                {visibleColumns.includes('oilType') && (<th>Type olie</th>)}
                {visibleColumns.includes('remarks') && (<th>Opmerkingen</th>)}
                <th>Foto</th>
                {isAdmin && (<th>Acties</th>)}
              </tr>
            </thead>
            <tbody>
              {zichtbareSamples.length === 0 ? (
                // Geen rijen: fout, filter zonder treffers of echt nog niets. Bij een
                // fout staat de melding al boven de lijst, dan hier geen tekst.
                foutmelding ? null : (
                  <tr>
                    <td colSpan={kolomAantal} className="td-leeg">
                      <div className="leeg leeg-in-tabel">
                        <Icon name="empty" size={32} />
                        {filterActief ? (
                          <>
                            <p style={{ margin: '0 0 12px' }}>Geen monsters die aan dit filter voldoen.</p>
                            <button type="button" className="btn btn-sm" onClick={wisFilter}>
                              <Icon name="clear-selection" size={16} />
                              Filter wissen
                            </button>
                          </>
                        ) : (
                          <>
                            <p style={{ margin: '0 0 12px' }}>Nog geen monsters voor 2025.</p>
                            {isAdmin && (
                              <button type="button" className="btn btn-primary btn-sm" onClick={openAddModal}>
                                <Icon name="plus" size={16} />
                                Nieuw monster
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              ) : (
                zichtbareSamples.map((sample) => (
                  <tr key={sample.id} style={{ opacity: sample.isDisabled ? 0.6 : 1 }}>
                    {visibleColumns.includes('status') && (
                      <td data-label="Status" className="kaart-status" style={{ whiteSpace: 'nowrap' }}>
                        <span className="status-cel">
                          {/* Hoofdhandeling: één tik zet het monster op genomen of niet genomen */}
                          {isAdmin && !sample.isDisabled ? (
                            <button
                              type="button"
                              className={`status-knop${statusBezig === sample.id ? ' status-knop-bezig' : ''}`}
                              onClick={() => toggleStatus(sample)}
                              disabled={statusBezig === sample.id}
                              aria-pressed={sample.isTaken}
                              title={
                                sample.isTaken
                                  ? `${sample.oNumber} op niet genomen zetten`
                                  : `${sample.oNumber} op genomen zetten, met de datum van vandaag`
                              }
                            >
                              {statusBadge(sample)}
                            </button>
                          ) : (
                            statusBadge(sample)
                          )}
                          {sample.isDisabled && sample.cancelReason && (
                            <span className="annuleer-reden">{sample.cancelReason}</span>
                          )}
                          {(sample.attemptsCount ?? 0) > 1 && (
                            <span
                              className="badge badge-navy"
                              title={`${sample.attemptsCount} monsternames (incl. hermonstering)`}
                            >
                              <Icon name="resample" size={16} />
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
                    {objectenBeschikbaar && (
                      <td data-label="Object">
                        {sample.object ? (
                          <span className="badge badge-gray" title={objectTypeLabel(sample.object.objectType)}>
                            <Icon name={objectTypeIcoon(sample.object.objectType)} size={16} />
                            {sample.object.name}
                          </span>
                        ) : (
                          '-'
                        )}
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
                          <Icon name="camera" size={16} />
                          Bekijk foto
                        </button>
                      ) : isAdmin ? (
                        <label className="btn-link" style={{ color: 'var(--grijs-500)' }}>
                          {uploadingPhoto === sample.id ? 'Uploaden...' : <><Icon name="image-upload" size={16} />Upload foto</>}
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
                        {sample.isDisabled ? (
                          <button
                            type="button"
                            onClick={() => draaiAnnuleringTerug(sample)}
                            className="btn btn-sm sm:mr-2.5"
                            title="Annulering terugdraaien"
                          >
                            <Icon name="reset" size={16} />
                            Terugdraaien
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openAnnuleren(sample)}
                            className="btn btn-sm sm:mr-2.5"
                            title="Monster annuleren met een reden"
                          >
                            <Icon name="status-cancelled" size={16} />
                            Annuleren
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAddAttempt(sample)}
                          title="Nieuwe monstername (hermonstering) toevoegen"
                          className="btn btn-sm sm:mr-2.5"
                        >
                          <Icon name="resample" size={16} />
                          Hermonstering
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(sample)}
                          className="icon-btn sm:mr-1"
                          title="Bewerken"
                          aria-label={`${sample.oNumber} bewerken`}
                        >
                          <Icon name="pencil" size={16} />
                          <span className="alleen-mobiel">Bewerken</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(sample.id)}
                          className="icon-btn icon-btn-danger icon-btn-verwijder"
                          title="Verwijderen"
                          aria-label={`${sample.oNumber} verwijderen`}
                        >
                          <Icon name="trash" size={16} />
                          <span className="alleen-mobiel">Verwijderen</span>
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

      </>)}

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
                  <label className="label" htmlFor="veld-onummer">O-nummer</label>
                  <input
                    id="veld-onummer"
                    type="text"
                    aria-describedby={oNumberWarning ? 'veld-onummer-fout' : undefined}
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
                    <p id="veld-onummer-fout" role="alert" style={{ color: 'var(--rood)', fontSize: '13px', marginTop: '4px', fontWeight: 600 }}>
                      {oNumberWarning}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label" htmlFor="veld-datum">
                    Datum afname {!formData.isTaken && '(optioneel, alleen voor genomen monsters)'}
                  </label>
                  <input
                    id="veld-datum"
                    type="date"
                    value={formData.sampleDate}
                    onChange={(e) => setFormData({ ...formData, sampleDate: e.target.value })}
                    disabled={!formData.isTaken}
                    className="input"
                    required={formData.isTaken}
                  />
                </div>

                {objectenBeschikbaar && (
                  <div>
                    <label className="label" htmlFor="veld-object">Object</label>
                    <select
                      id="veld-object"
                      value={formData.objectId}
                      onChange={(e) => setFormData({ ...formData, objectId: e.target.value })}
                      className="select"
                    >
                      <option value="">Geen object</option>
                      {objecten.map((o) => (
                        <option key={o.id} value={String(o.id)}>{o.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="label" htmlFor="veld-locatie">Locatie</label>
                  <input
                    id="veld-locatie"
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="input"
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="veld-omschrijving">Omschrijving</label>
                  <textarea
                    id="veld-omschrijving"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="textarea"
                    rows={3}
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="veld-olietype">Type olie (optioneel)</label>
                  <input
                    id="veld-olietype"
                    type="text"
                    value={formData.oilType}
                    onChange={(e) => setFormData({ ...formData, oilType: e.target.value })}
                    className="input"
                    placeholder="Bijv. motorolie, hydraulische olie, etc."
                  />
                </div>

                <div>
                  <label className="label" htmlFor="veld-opmerkingen">Opmerkingen (optioneel)</label>
                  <textarea
                    id="veld-opmerkingen"
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


      {/* Annuleren met reden */}
      <Modal
        open={annuleerDoel !== null || annuleerBulk}
        onClose={sluitAnnuleren}
        title={
          annuleerBulk
            ? `Alle monsters van ${objectNaamVanFilter} annuleren`
            : `${annuleerDoel?.oNumber ?? ''} annuleren`
        }
        footer={
          <>
            <button type="button" className="btn" onClick={sluitAnnuleren}>Terug</button>
            <button type="button" className="btn btn-danger" onClick={bevestigAnnuleren} disabled={annuleerBezig}>
              <Icon name="status-cancelled" size={16} />
              {annuleerBezig ? 'Bezig...' : 'Annuleren bevestigen'}
            </button>
          </>
        }
      >
        <p style={{ marginTop: 0, marginBottom: '14px' }}>
          {annuleerBulk
            ? `Alle nog niet genomen monsters van ${objectNaamVanFilter} krijgen deze reden. Al genomen monsters blijven staan.`
            : 'Het monster blijft in de lijst staan, telt niet mee in de planning en je kunt dit terugdraaien.'}
        </p>

        <div className="veld">
          <label className="label" htmlFor="annuleer-reden">Reden</label>
          <select
            id="annuleer-reden"
            className="select"
            value={annuleerReden}
            onChange={(e) => setAnnuleerReden(e.target.value)}
          >
            {ANNULEER_REDENEN.map((r) => (
              <option key={r.waarde} value={r.waarde}>{r.label}</option>
            ))}
          </select>
        </div>

        <div className="veld">
          <label className="label" htmlFor="annuleer-toelichting">
            Toelichting {ANNULEER_REDENEN.find((r) => r.waarde === annuleerReden)?.toelichtingNodig ? '' : '(optioneel)'}
          </label>
          <textarea
            id="annuleer-toelichting"
            className="textarea"
            rows={2}
            value={annuleerToelichting}
            onChange={(e) => setAnnuleerToelichting(e.target.value)}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--navy)' }}>
          <input
            type="checkbox"
            checked={annuleerInPdf}
            onChange={(e) => setAnnuleerInPdf(e.target.checked)}
            style={{ width: '18px', height: '18px' }}
          />
          Reden ook in de PDF voor de klant
        </label>

        {annuleerFout && <div className="alert alert-danger" style={{ marginTop: '12px' }}>{annuleerFout}</div>}
      </Modal>

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
