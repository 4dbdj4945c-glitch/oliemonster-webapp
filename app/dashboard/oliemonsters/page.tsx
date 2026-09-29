'use client';

import { useState, useEffect } from 'react';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import PhotoModal, { type FotoInVenster } from '@/app/components/PhotoModal';
import MonsterNemenModal, { type NeemDoel } from '@/app/components/MonsterNemenModal';
import MonsterActiesModal from '@/app/components/MonsterActiesModal';
import OnbereikbaarModal, { type OnbereikbaarDoel } from '@/app/components/OnbereikbaarModal';
import HelpModal from '@/app/components/HelpModal';
import Tooltip from '@/app/components/Tooltip';
import SampleAttemptsPanel from '@/app/components/SampleAttemptsPanel';
import LaadFout from '@/app/components/LaadFout';
import OngedaanMelding, { type OngedaanInhoud } from '@/app/components/OngedaanMelding';
import MonsterVerwijderBlok, { type VerwijderDoel } from '@/app/components/MonsterVerwijderBlok';
import AfnameOngedaanModal, { type AfnameDoel } from '@/app/components/AfnameOngedaanModal';
import VerwijderdeMonsters from '@/app/components/VerwijderdeMonsters';
import HerstelHulp from '@/app/components/HerstelHulp';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { objectTypeIcoon, objectTypeLabel } from '@/lib/sampleObjects';
import { ANNULEER_REDENEN } from '@/lib/cancelReasons';
import { FOTO_SOORTEN, type FotoSoort } from '@/lib/samplePhotos';
import {
  sampleStatus,
  telStatussen,
  STATUS_BADGE,
  STATUS_ICOON,
  STATUS_LABELS,
  type SampleStatus,
} from '@/lib/sampleStatus';
import PlanningPaneel from '@/app/components/PlanningPaneel';
import { AppShell, Modal, Icon } from '@/app/components/ui';
import { generateSamplesPdf } from '@/lib/generateSamplesPdf';
import { isAlleenLezen } from '@/lib/roles';
import { verkleinFoto } from '@/lib/fotoVerkleinen';

interface User {
  userId: number;
  username: string;
  role: string;
  /** Alleen bij de rol alleen lezen: het analysejaar dat deze gebruiker mag zien. */
  viewYear?: number | null;
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
  /** Foto van het onderdeel waar het monster vandaan komt; photoUrl is het potje */
  partPhotoUrl?: string | null;
  /** Niet bereikbaar: blijft openstaan en telt mee in de planning */
  isUnreachable?: boolean;
  unreachableReason?: string | null;
  unreachableNote?: string | null;
  unreachablePhotoUrl?: string | null;
  unreachableAt?: string | null;
  unreachableBy?: string | null;
}

interface SampleObject {
  id: number;
  name: string;
  objectType: string | null;
}

export default function DashboardPage() {
  const user: User | null = useGebruiker();
  const [samples, setSamples] = useState<OilSample[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSample, setEditingSample] = useState<OilSample | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['status', 'oNumber', 'sampleDate', 'location', 'description', 'oilType']);
  // Het fotovenster kan meer dan één foto tonen: het onderdeel, het potje en het
  // bewijs van Niet bereikbaar.
  const [selectedPhoto, setSelectedPhoto] = useState<{ fotos: FotoInVenster[]; oNumber: string; start: number } | null>(null);
  // Welke foto staat nu te uploaden: "monsterId-soort", want er zijn er twee per monster.
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'oNumber' | 'sampleDate' | 'location' | 'newest'>('newest');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState<'all' | SampleStatus>('all');
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
  // Pas true als de monsterlijst echt geladen is. Zolang dat niet zo is (fout,
  // offline) tonen we alleen de foutmelding: geen tegels met 0, geen lege
  // tabel en geen knoppen die iets aanmaken of overnemen.
  const [lijstGeladen, setLijstGeladen] = useState(false);
  // De planning bestaat, tenzij de server zegt dat de tabellen ontbreken (503).
  // Een storing of geen verbinding laat het tabblad staan; de planning toont
  // dan zelf zijn foutmelding.
  const [planningBestaat, setPlanningBestaat] = useState(true);
  const [objectFilter, setObjectFilter] = useState<string>('all');
  // Tabbladen binnen deze module: de lijst met monsters, de planning of (admin)
  // de prullenbak met verwijderde monsters
  const [tab, setTab] = useState<'lijst' | 'planning' | 'prullenbak'>('lijst');
  // Melding met Ongedaan maken na het verwijderen van een monster
  const [ongedaan, setOngedaan] = useState<OngedaanInhoud | null>(null);
  // Afname ongedaan maken vanuit het bewerkvenster
  const [afnameDoel, setAfnameDoel] = useState<AfnameDoel | null>(null);
  // Annuleren met reden (los monster of alle monsters van een object)
  const [annuleerDoel, setAnnuleerDoel] = useState<OilSample | null>(null);
  const [annuleerBulk, setAnnuleerBulk] = useState(false);
  const [annuleerReden, setAnnuleerReden] = useState(ANNULEER_REDENEN[0].waarde);
  const [annuleerToelichting, setAnnuleerToelichting] = useState('');
  const [annuleerInPdf, setAnnuleerInPdf] = useState(true);
  const [annuleerBezig, setAnnuleerBezig] = useState(false);
  const [annuleerFout, setAnnuleerFout] = useState('');
  // Bevestiging na een actie, bijvoorbeeld hoeveel monsters er geannuleerd zijn
  const [melding, setMelding] = useState('');
  // Monster nemen: het volledige invulscherm in één keer (datum, type olie,
  // opmerking, beide foto's en de knop Niet bereikbaar).
  const [neemDoel, setNeemDoel] = useState<NeemDoel | null>(null);
  // Het monster waarvan het venster Meer open staat (annuleren, hermonstering, ...).
  const [actiesDoel, setActiesDoel] = useState<OilSample | null>(null);
  // Niet bereikbaar: de reden van een monster dat al onbereikbaar was aanpassen.
  const [onbereikbaarDoel, setOnbereikbaarDoel] = useState<OnbereikbaarDoel | null>(null);


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
      setLijstGeladen(true);
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
        if (response.status === 503) setPlanningBestaat(false);
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
    if (statusFilter !== 'all') lijst = lijst.filter((s) => sampleStatus(s) === statusFilter);
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

  // Terugzetten uit de prullenbak: vanuit de melding Ongedaan maken, de
  // prullenbak zelf en de herstelhulp bij Nieuw monster.
  const herstelMonster = async (id: number, oNumber: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/samples/${id}/herstellen`, { method: 'POST' });
      if (!response.ok) {
        setFoutmelding(await foutTekst(response, `${oNumber} is niet teruggezet.`));
        return false;
      }
      setFoutmelding('');
      setMelding(`${oNumber} staat weer in de lijst, met alle monsternames en foto's.`);
      await loadSamples();
      return true;
    } catch (error) {
      setFoutmelding(GEEN_VERBINDING);
      return false;
    }
  };

  // Na Monster verwijderen onderaan het bewerkvenster: venster dicht, rij weg
  // en tien seconden de kans om het terug te draaien.
  const naVerwijderen = (doel: VerwijderDoel) => {
    setShowAddModal(false);
    resetForm();
    setSamples((prev) => prev.filter((s) => s.id !== doel.id));
    setMelding('');
    setOngedaan({
      sleutel: `verwijderd-${doel.id}-${Date.now()}`,
      tekst: `Monster ${doel.oNumber} verwijderd`,
      onOngedaan: () => herstelMonster(doel.id, doel.oNumber),
    });
  };

  // Afname ongedaan maken vanuit het bewerkvenster of het pogingenpaneel: het
  // formulier volgt mee, anders zet Bijwerken het monster meteen weer op genomen.
  const naAfnameOngedaan = () => {
    setAfnameDoel(null);
    setFormData((f) => ({ ...f, isTaken: false, sampleDate: '' }));
    setEditingSample((s) => (s ? { ...s, isTaken: false, sampleDate: null, photoUrl: undefined, partPhotoUrl: null } : s));
    setMelding(`De afname van ${editingSample?.oNumber ?? 'het monster'} is ongedaan gemaakt. Het staat weer op niet genomen.`);
    loadSamples();
  };

  // Statusbadge: altijd icoon plus woord (zie STIJL.md). Vier statussen, uit
  // lib/sampleStatus.ts, zodat de lijst, de tellingen en de PDF hetzelfde zeggen.
  const statusBadge = (sample: OilSample) => {
    const status = sampleStatus(sample);
    const uitleg =
      status === 'geannuleerd'
        ? sample.cancelReason || 'Monster geannuleerd'
        : status === 'niet-bereikbaar'
        ? sample.unreachableReason || 'De locatie was niet te bereiken'
        : undefined;
    return (
      <span className={`badge ${STATUS_BADGE[status]}`} title={uitleg}>
        <Icon name={STATUS_ICOON[status]} size={16} />
        {STATUS_LABELS[status]}
      </span>
    );
  };

  // Alle foto's van een monster, in vaste volgorde: eerst het onderdeel, dan het
  // potje, en als laatste het bewijs dat de locatie niet te bereiken was.
  const fotosVan = (sample: OilSample): FotoInVenster[] => {
    const lijst: FotoInVenster[] = [];
    if (sample.partPhotoUrl) lijst.push({ url: sample.partPhotoUrl, label: 'Foto onderdeel' });
    if (sample.photoUrl) lijst.push({ url: sample.photoUrl, label: 'Foto potje' });
    if (sample.unreachablePhotoUrl) {
      lijst.push({ url: sample.unreachablePhotoUrl, label: 'Foto niet bereikbaar' });
    }
    return lijst;
  };

  // Opent het fotovenster op de aangetikte foto; de andere staan er als tab naast.
  const openFoto = (sample: OilSample, url: string) => {
    const fotos = fotosVan(sample);
    const start = fotos.findIndex((f) => f.url === url);
    setSelectedPhoto({ fotos, oNumber: sample.oNumber, start: start < 0 ? 0 : start });
  };

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
        setFoutmelding(
          `${sample.oNumber} is niet bijgewerkt: ${await foutTekst(response, 'de server gaf geen reden.')}`
        );
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
      // De bulkactie zegt hoeveel monsters er geannuleerd zijn, of dat er niets
      // openstond. Zonder die melding lijkt er niets te gebeuren.
      const uitkomst = await response.json().catch(() => ({}));
      setMelding(
        annuleerBulk
          ? uitkomst?.melding || 'De monsters zijn bijgewerkt.'
          : `${annuleerDoel?.oNumber ?? 'Het monster'} is geannuleerd.`
      );
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

  // Een monster heeft twee foto's, dus de soort gaat mee: "onderdeel" of "potje".
  const handlePhotoUpload = async (sampleId: number, file: File, soort: FotoSoort) => {
    setUploadingPhoto(`${sampleId}-${soort}`);
    try {
      const formData = new FormData();
      formData.append('photo', await verkleinFoto(file));
      formData.append('soort', soort);

      const response = await fetch(`/api/samples/${sampleId}/photo`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        setFoutmelding(await foutTekst(response, 'De foto kon niet worden opgeslagen.'));
        return;
      }
      setFoutmelding('');
      loadSamples();
    } catch (error) {
      setFoutmelding(GEEN_VERBINDING);
    } finally {
      setUploadingPhoto(null);
    }
  };

  // ---- Monster nemen en Niet bereikbaar ----

  // Na het opslaan: melding tonen, venster sluiten en de lijst verversen.
  const naVeldwerk = async (tekst: string) => {
    setNeemDoel(null);
    setOnbereikbaarDoel(null);
    setMelding(tekst);
    await loadSamples();
  };

  // Draait Niet bereikbaar terug: het monster is weer gewoon niet genomen.
  const weerBereikbaar = async (sample: OilSample) => {
    try {
      const response = await fetch(`/api/samples/${sample.id}/unreachable`, { method: 'DELETE' });
      if (!response.ok) {
        setFoutmelding(
          await foutTekst(response, `${sample.oNumber} staat nog steeds als niet bereikbaar.`)
        );
        return;
      }
      setFoutmelding('');
      setMelding(`${sample.oNumber} staat weer op niet genomen.`);
      await loadSamples();
    } catch (error) {
      setFoutmelding(GEEN_VERBINDING);
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
  const magPlannen = planningBestaat && !isAlleenLezen(user?.role);
  const toonLijst =
    tab === 'lijst' || (tab === 'planning' && !magPlannen) || (tab === 'prullenbak' && !isAdmin);
  const objectNaamVanFilter =
    objecten.find((o) => String(o.id) === objectFilter)?.name ?? 'dit object';
  // Alle vier de statussen in één keer geteld (lib/sampleStatus.ts).
  const totalen = telStatussen(samples);

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
        {!lijstGeladen && foutmelding
          ? 'De lijst kon niet worden opgehaald.'
          : samples.length === 0
          ? 'Nog geen monsters in dit jaar.'
          : `${totalen.genomen} van de ${samples.length} monsters genomen${
              totalen['niet-bereikbaar'] ? `, ${totalen['niet-bereikbaar']} niet bereikbaar` : ''
            }${totalen.geannuleerd ? `, ${totalen.geannuleerd} geannuleerd` : ''}.`}
      </p>

      {/* Ophalen of bijwerken mislukt */}
      {foutmelding && <LaadFout melding={foutmelding} onOpnieuw={herlaad} />}
      {melding && (
        <div className="alert alert-success" style={{ marginBottom: '16px' }} role="status">
          {melding}
        </div>
      )}

      {/* Tabbladen: de lijst, de planning van dit jaar en (admin) de prullenbak */}
      {(magPlannen || isAdmin) && (
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
            {magPlannen && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'planning'}
                className={tab === 'planning' ? 'on' : ''}
                onClick={() => setTab('planning')}
              >
                Planning
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'prullenbak'}
                className={tab === 'prullenbak' ? 'on' : ''}
                onClick={() => setTab('prullenbak')}
              >
                Prullenbak
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'planning' && magPlannen && (
        <PlanningPaneel analysisYear={2025} isAdmin={isAdmin} />
      )}

      {tab === 'prullenbak' && isAdmin && (
        <VerwijderdeMonsters
          jaar={2025}
          onHersteld={(oNumber) => {
            setMelding(`${oNumber} staat weer in de lijst, met alle monsternames en foto's.`);
            loadSamples();
          }}
        />
      )}

      {toonLijst && lijstGeladen && (<>
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
          {(!isAlleenLezen(user?.role) || isAdmin) && (
            <div className="knoppenrij flex gap-3">
              {!isAlleenLezen(user?.role) && (
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
              onChange={(e) => setStatusFilter(e.target.value as 'all' | SampleStatus)}
              className="select filter-select"
            >
              <option value="all">Alle monsters</option>
              <option value="genomen">Genomen</option>
              <option value="niet-genomen">Niet genomen</option>
              <option value="niet-bereikbaar">Niet bereikbaar</option>
              <option value="geannuleerd">Geannuleerd</option>
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
            <div className="filter-veld filter-veld-breed">
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
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
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

      {/* Statistieken: totaal plus de vier statussen. Een tik erop filtert. */}
      <div className="stats-grid stats-grid-vijf mb-6">
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
          onClick={() => setStatusFilter('genomen')}
          style={{
            cursor: 'pointer',
            borderLeft: '4px solid var(--groen)',
            borderColor: statusFilter === 'genomen' ? 'var(--groen)' : undefined,
            boxShadow: statusFilter === 'genomen' ? '0 0 0 3px var(--groen-light)' : undefined,
          }}
        >
          <Icon name="status-taken" />
          <p className="stat-value" style={{ color: 'var(--groen-tekst)' }}>{totalen.genomen}</p>
          <p className="stat-label">Genomen</p>
        </div>
        <div
          className="stat-card stat-card-icoon is-niet-genomen"
          onClick={() => setStatusFilter('niet-genomen')}
          style={{
            cursor: 'pointer',
            borderLeft: '4px solid var(--rood)',
            borderColor: statusFilter === 'niet-genomen' ? 'var(--rood)' : undefined,
            boxShadow: statusFilter === 'niet-genomen' ? '0 0 0 3px var(--rood-light)' : undefined,
          }}
        >
          <Icon name="status-not-taken" />
          <p className="stat-value" style={{ color: 'var(--rood-tekst)' }}>{totalen['niet-genomen']}</p>
          <p className="stat-label">Niet genomen</p>
        </div>
        <div
          className="stat-card stat-card-icoon"
          onClick={() => setStatusFilter('niet-bereikbaar')}
          style={{
            cursor: 'pointer',
            borderLeft: '4px solid var(--oranje)',
            borderColor: statusFilter === 'niet-bereikbaar' ? 'var(--oranje)' : undefined,
            boxShadow: statusFilter === 'niet-bereikbaar' ? '0 0 0 3px var(--oranje-light)' : undefined,
          }}
        >
          <Icon name="alert-warning" />
          <p className="stat-value" style={{ color: 'var(--geel-tekst)' }}>{totalen['niet-bereikbaar']}</p>
          <p className="stat-label">Niet bereikbaar</p>
        </div>
        <div
          className="stat-card stat-card-icoon"
          onClick={() => setStatusFilter('geannuleerd')}
          style={{
            cursor: 'pointer',
            borderLeft: '4px solid var(--grijs-400)',
            borderColor: statusFilter === 'geannuleerd' ? 'var(--grijs-400)' : undefined,
            boxShadow: statusFilter === 'geannuleerd' ? '0 0 0 3px var(--grijs-200)' : undefined,
          }}
        >
          <Icon name="status-cancelled" />
          <p className="stat-value" style={{ color: 'var(--grijs-500)' }}>{totalen.geannuleerd}</p>
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
                          {!sample.isDisabled && !sample.isTaken && sample.isUnreachable && (
                            <>
                              {sample.unreachableReason && (
                                <span className="onbereikbaar-reden">{sample.unreachableReason}</span>
                              )}
                              {sample.unreachableNote && (
                                <span className="onbereikbaar-omschrijving">{sample.unreachableNote}</span>
                              )}
                            </>
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
                    <td data-label="Foto">
                      {/* Twee foto's per monster: het onderdeel en het potje. Plus,
                          als het er is, het bewijs dat de locatie niet te bereiken was. */}
                      <span className="foto-cel">
                        {FOTO_SOORTEN.map((soort) => {
                          const url = soort.veld === 'photoUrl' ? sample.photoUrl : sample.partPhotoUrl;
                          const bezig = uploadingPhoto === `${sample.id}-${soort.soort}`;
                          if (url) {
                            return (
                              <button
                                key={soort.soort}
                                type="button"
                                onClick={() => openFoto(sample, url)}
                                className="btn-link"
                                title={`${soort.label} van ${sample.oNumber} bekijken`}
                              >
                                <Icon name={soort.icoon} size={16} />
                                <span className="alleen-desktop">{soort.kort}</span>
                                <span className="alleen-mobiel">{soort.label}</span>
                              </button>
                            );
                          }
                          if (!isAdmin) {
                            return (
                              <span key={soort.soort} className="text-tertiary" style={{ fontSize: '13px' }} title={`Geen ${soort.label.toLowerCase()}`}>
                                <span className="alleen-desktop">Geen {soort.kort.toLowerCase()}</span>
                                <span className="alleen-mobiel">Geen {soort.label.toLowerCase()}</span>
                              </span>
                            );
                          }
                          return (
                            <label key={soort.soort} className="btn-link" style={{ color: 'var(--grijs-500)' }} title={soort.knop}>
                              {bezig ? 'Uploaden...' : (
                                <>
                                  <Icon name="image-upload" size={16} />
                                  <span className="alleen-desktop">{soort.kort}</span>
                                  <span className="alleen-mobiel">{soort.knop}</span>
                                </>
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                disabled={bezig}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handlePhotoUpload(sample.id, file, soort.soort);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          );
                        })}
                        {sample.unreachablePhotoUrl && (
                          <button
                            type="button"
                            onClick={() => openFoto(sample, sample.unreachablePhotoUrl!)}
                            className="btn-link"
                            title={`Foto van de situatie bij ${sample.oNumber}`}
                          >
                            <Icon name="alert-warning" size={16} />
                            <span className="alleen-desktop">Situatie</span>
                            <span className="alleen-mobiel">Foto niet bereikbaar</span>
                          </button>
                        )}
                      </span>
                    </td>
                    {isAdmin && (
                      <td data-label="Acties" className="kaart-acties acties-cel">
                        {/* Monster nemen: het volledige invulscherm in één keer.
                            Alleen zolang het monster nog open staat. De rest
                            (annuleren, hermonstering, niet bereikbaar) zit achter
                            Meer, zodat de rij binnen de tabel blijft. */}
                        {!sample.isDisabled && !sample.isTaken && (
                          <button
                            type="button"
                            onClick={() => setNeemDoel(sample)}
                            className="btn btn-primary btn-sm sm:mr-2.5"
                            title={`${sample.oNumber} nemen: datum, type olie, opmerking en beide foto's in één keer`}
                          >
                            <Icon name="oil-sample" size={16} />
                            Monster nemen
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setActiesDoel(sample)}
                          className="btn btn-sm sm:mr-2.5"
                          aria-haspopup="dialog"
                          title={`Meer handelingen bij ${sample.oNumber}: annuleren, hermonstering${sample.isUnreachable ? ', niet bereikbaar' : ''}`}
                        >
                          <Icon name="menu" size={16} />
                          Meer
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
                  {/* Herstelhulp: nummer van vorig jaar of uit de prullenbak */}
                  {!editingSample && (
                    <HerstelHulp
                      oNumber={formData.oNumber}
                      jaar={2025}
                      bestaatAl={!!oNumberWarning}
                      onOvernemen={(g) =>
                        setFormData((f) => ({
                          ...f,
                          location: g.location,
                          description: g.description,
                          oilType: g.oilType,
                          objectId: objectenBeschikbaar ? g.objectId : f.objectId,
                        }))
                      }
                      onHerstel={async (id, oNumber) => {
                        if (await herstelMonster(id, oNumber)) {
                          setShowAddModal(false);
                          resetForm();
                        }
                      }}
                    />
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

              {/* Afname ongedaan maken: terug naar niet genomen, datum en foto's eraf */}
              {editingSample && isAdmin && editingSample.isTaken && !editingSample.isDisabled && (
                <div className="afname-blok">
                  <p>
                    Per ongeluk of te vroeg op genomen gezet? Zet de laatste monstername terug naar niet genomen.
                  </p>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      setAfnameDoel({
                        sampleId: editingSample.id,
                        oNumber: editingSample.oNumber,
                        sampleDate: editingSample.sampleDate,
                        heeftFotoPotje: !!editingSample.photoUrl,
                        heeftFotoOnderdeel: !!editingSample.partPhotoUrl,
                        aantalPogingen: editingSample.attemptsCount ?? 1,
                      })
                    }
                  >
                    <Icon name="reset" size={16} />
                    Afname ongedaan maken
                  </button>
                </div>
              )}

              {editingSample && (
                <div style={{ marginTop: '20px' }}>
                  <SampleAttemptsPanel
                    sampleId={editingSample.id}
                    oNumber={editingSample.oNumber}
                    isAdmin={isAdmin}
                    onPhotoClick={(url, label) => setSelectedPhoto({ fotos: [{ url, label }], oNumber: label, start: 0 })}
                    onChange={() => loadSamples()}
                    onAfnameOngedaan={naAfnameOngedaan}
                  />
                </div>
              )}

              {/* Het enige plekje waar een heel monster weg kan, apart en onderaan */}
              {editingSample && isAdmin && (
                <MonsterVerwijderBlok
                  key={`verwijder-${editingSample.id}`}
                  doel={{
                    id: editingSample.id,
                    oNumber: editingSample.oNumber,
                    attemptsCount: editingSample.attemptsCount,
                    isTaken: editingSample.isTaken,
                    sampleDate: editingSample.sampleDate,
                    photoUrl: editingSample.photoUrl,
                    partPhotoUrl: editingSample.partPhotoUrl,
                  }}
                  onVerwijderd={naVerwijderen}
                />
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

      {/* Afname ongedaan maken: bevestiging met wat er verdwijnt */}
      <AfnameOngedaanModal
        key={`afname-${afnameDoel?.sampleId ?? 'geen'}`}
        doel={afnameDoel}
        onClose={() => setAfnameDoel(null)}
        onKlaar={naAfnameOngedaan}
      />

      {/* Na verwijderen: tien seconden Ongedaan maken */}
      <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />

      {/* Monster nemen: alles in één scherm, met de knop Niet bereikbaar erin */}
      <MonsterActiesModal
        doel={actiesDoel}
        onClose={() => setActiesDoel(null)}
        onRedenAanpassen={() => actiesDoel && setOnbereikbaarDoel(actiesDoel)}
        onWeerBereikbaar={() => actiesDoel && weerBereikbaar(actiesDoel)}
        onTerugdraaien={() => actiesDoel && draaiAnnuleringTerug(actiesDoel)}
        onAnnuleren={() => actiesDoel && openAnnuleren(actiesDoel)}
        onHermonstering={() => actiesDoel && handleAddAttempt(actiesDoel)}
      />

      <MonsterNemenModal
        key={`nemen-${neemDoel?.id ?? 'geen'}`}
        doel={neemDoel}
        onClose={() => setNeemDoel(null)}
        onKlaar={naVeldwerk}
      />

      {/* Niet bereikbaar: reden en omschrijving van een openstaand monster */}
      <OnbereikbaarModal
        key={`onbereikbaar-${onbereikbaarDoel?.id ?? 'geen'}`}
        doel={onbereikbaarDoel}
        onClose={() => setOnbereikbaarDoel(null)}
        onKlaar={naVeldwerk}
      />

      {/* Foto */}
      {selectedPhoto && (
        <PhotoModal
          fotos={selectedPhoto.fotos}
          startIndex={selectedPhoto.start}
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
        /* Knop over de volle breedte van het filterraster: op de telefoon past
           hij niet in een kolom van de helft. */
        .filter-veld-breed {
          grid-column: 1 / -1;
        }
        .filter-veld-breed :global(.btn) {
          width: 100%;
          min-height: 44px;
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
          .filter-veld-breed :global(.btn) {
            width: auto;
            min-height: 0;
          }
          .filter-select {
            width: auto;
          }
        }
      `}</style>
    </AppShell>
  );
}
