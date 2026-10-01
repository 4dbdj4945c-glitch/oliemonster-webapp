'use client';

// De oliemonsterpagina van één analysejaar (/dashboard/oliemonsters/[jaar]).
// Vroeger waren er twee kopieën (2025 en 2026); nu is het jaar een filter en
// werkt elk jaar vanzelf, ook een jaar zonder monsters.
//
// Wat een kijker (rol alleen lezen) ziet, is precies wat hij op de oude
// jaarpagina zag: de lijst, de tellingen, de filters en de foto's. Geen tabs,
// geen objectkolom, geen PDF en geen knoppen die iets wijzigen.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import PhotoModal, { type FotoInVenster } from '@/app/components/PhotoModal';
import MonsterNemenModal, { type NeemDoel } from '@/app/components/MonsterNemenModal';
import MonsterActiesModal from '@/app/components/MonsterActiesModal';
import OnbereikbaarModal, { type OnbereikbaarDoel } from '@/app/components/OnbereikbaarModal';
import HelpModal from '@/app/components/HelpModal';
import LaadFout from '@/app/components/LaadFout';
import OngedaanMelding, { type OngedaanInhoud } from '@/app/components/OngedaanMelding';
import type { VerwijderDoel } from '@/app/components/MonsterVerwijderBlok';
import VerwijderdeMonsters from '@/app/components/VerwijderdeMonsters';
import PlanningPaneel from '@/app/components/PlanningPaneel';
import { AppShell, Icon, Laden } from '@/app/components/ui';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { type FotoSoort } from '@/lib/samplePhotos';
import { telStatussen, type SampleStatus } from '@/lib/sampleStatus';
import { generateSamplesPdf } from '@/lib/generateSamplesPdf';
import { isAlleenLezen } from '@/lib/roles';
import { oliemonsterPad } from '@/lib/modules';
import { verkleinFoto } from '@/lib/fotoVerkleinen';
import AnnuleerModal, { type AnnuleerDoel } from './AnnuleerModal';
import MonsterFilters from './MonsterFilters';
import MonsterFormulier from './MonsterFormulier';
import MonsterTabel from './MonsterTabel';
import MonsterTellingen, { StatusChips } from './MonsterTellingen';
import { zichtbareMonsters } from './monsterLijst';
import { useKolommen } from './useKolommen';
import { useMonsters } from './useMonsters';
import { useObjecten } from './useObjecten';
import type { OilSample, Sortering } from './types';

export default function OliemonstersPagina({ jaar }: { jaar: number }) {
  const user = useGebruiker();
  const router = useRouter();
  const isAdmin = user.role === 'admin';
  const alleenLezen = isAlleenLezen(user.role);

  const [search, setSearch] = useState('');
  const { samples, setSamples, loading, lijstGeladen, foutmelding, setFoutmelding, loadSamples } =
    useMonsters(jaar, search);
  const { visibleColumns, loadSettings } = useKolommen(setFoutmelding);
  // Een kijker mag de objecten niet ophalen: overslaan, anders een 403 en een rode balk.
  const { objecten, objectenBeschikbaar, planningBestaat, loadObjecten } = useObjecten(
    jaar,
    alleenLezen,
    setFoutmelding
  );

  // Welke jaren je kunt kiezen. Een kijker met een vast jaar krijgt geen keuze.
  const [jaren, setJaren] = useState<number[] | null>(null);
  const magJaarKiezen = !(alleenLezen && user.viewYear !== null);

  const [editing, setEditing] = useState<{ sample: OilSample | null } | null>(null);
  // Het fotovenster kan meer dan één foto tonen: het onderdeel, het potje en het
  // bewijs van Niet bereikbaar.
  const [selectedPhoto, setSelectedPhoto] = useState<{ fotos: FotoInVenster[]; oNumber: string; start: number } | null>(null);
  // Welke foto staat nu te uploaden: "monsterId-soort", want er zijn er twee per monster.
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<Sortering>('newest');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState<'all' | SampleStatus>('all');
  const [objectFilter, setObjectFilter] = useState<string>('all');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  // Welk monster staat nu in de wacht bij het aantikken van de status
  const [statusBezig, setStatusBezig] = useState<number | null>(null);
  // Tabbladen: de lijst, de planning of (admin) de prullenbak
  const [tab, setTab] = useState<'lijst' | 'planning' | 'prullenbak'>('lijst');
  const [ongedaan, setOngedaan] = useState<OngedaanInhoud | null>(null);
  const [annuleerDoel, setAnnuleerDoel] = useState<AnnuleerDoel | null>(null);
  // Bevestiging na een actie, bijvoorbeeld hoeveel monsters er geannuleerd zijn
  const [melding, setMelding] = useState('');
  const [neemDoel, setNeemDoel] = useState<NeemDoel | null>(null);
  const [actiesDoel, setActiesDoel] = useState<OilSample | null>(null);
  const [onbereikbaarDoel, setOnbereikbaarDoel] = useState<OnbereikbaarDoel | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  // Compacte lijst op de telefoon: de filters zitten achter een knop.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // De kijker houdt de lijst zoals hij hem kende; de rest krijgt de compacte kaarten.
  const compact = !alleenLezen;

  useEffect(() => {
    if (!magJaarKiezen) return;
    let actueel = true;
    fetch('/api/samples/jaren')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { jaren: { jaar: number }[] } | null) => {
        if (!actueel || !data) return;
        // De jaren met monsters, het huidige en het volgende jaar, en het jaar
        // van deze pagina (ook als dat leeg is).
        const nu = new Date().getFullYear();
        const set = new Set([...data.jaren.map((j) => j.jaar), nu, nu + 1, jaar]);
        setJaren([...set].sort((a, b) => b - a));
      })
      .catch(() => {});
    return () => {
      actueel = false;
    };
  }, [jaar, magJaarKiezen]);

  // Knop "Opnieuw proberen" in de foutmelding: alles opnieuw ophalen.
  const herlaad = useCallback(() => {
    setFoutmelding('');
    loadSettings();
    loadObjecten();
    loadSamples();
  }, [setFoutmelding, loadSettings, loadObjecten, loadSamples]);

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
    } catch {
      setFoutmelding(GEEN_VERBINDING);
      return false;
    }
  };

  // Na Monster verwijderen onderaan het bewerkvenster: venster dicht, rij weg
  // en tien seconden de kans om het terug te draaien.
  const naVerwijderen = (doel: VerwijderDoel) => {
    setEditing(null);
    setSamples((prev) => prev.filter((s) => s.id !== doel.id));
    setMelding('');
    setOngedaan({
      sleutel: `verwijderd-${doel.id}-${Date.now()}`,
      tekst: `Monster ${doel.oNumber} verwijderd`,
      onOngedaan: () => herstelMonster(doel.id, doel.oNumber),
    });
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

  const openFoto = (sample: OilSample, url: string) => {
    const fotos = fotosVan(sample);
    const start = fotos.findIndex((f) => f.url === url);
    setSelectedPhoto({ fotos, oNumber: sample.oNumber, start: start < 0 ? 0 : start });
  };

  // Na een wijziging: de bijgewerkte regel uit het antwoord in de lijst zetten,
  // in plaats van de hele lijst opnieuw op te halen. Zonder regel (oudere
  // server) of met een zoekopdracht (past hij er nog in?) toch de hele lijst.
  const zetRegel = async (monster: OilSample | null | undefined) => {
    if (!monster || search.trim() !== '') {
      await loadSamples();
      return;
    }
    setSamples((prev) => (prev.some((s) => s.id === monster.id) ? prev.map((s) => (s.id === monster.id ? monster : s)) : [monster, ...prev]));
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
        setFoutmelding(`${sample.oNumber} is niet bijgewerkt: ${await foutTekst(response, 'de server gaf geen reden.')}`);
        return;
      }
      setFoutmelding('');
      const data = await response.json().catch(() => null);
      await zetRegel(data?.monster);
    } catch {
      setSamples((prev) => prev.map((s) => (s.id === sample.id ? sample : s)));
      setFoutmelding(`${sample.oNumber} is niet opgeslagen: geen verbinding met de server.`);
    } finally {
      setStatusBezig(null);
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
    } catch {
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
      setEditing({ sample: { ...sample, attemptsCount: (sample.attemptsCount ?? 0) + 1 } });
    } catch {
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
      const response = await fetch(`/api/samples/${sampleId}/photo`, { method: 'POST', body: formData });
      if (!response.ok) {
        setFoutmelding(await foutTekst(response, 'De foto kon niet worden opgeslagen.'));
        return;
      }
      setFoutmelding('');
      loadSamples();
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    } finally {
      setUploadingPhoto(null);
    }
  };

  // Na Monster nemen of Niet bereikbaar: melding, venster dicht, en de regel
  // uit het antwoord (Monster nemen), anders de lijst verversen.
  const naVeldwerk = async (tekst: string, monster?: OilSample | null) => {
    setNeemDoel(null);
    setOnbereikbaarDoel(null);
    setMelding(tekst);
    await zetRegel(monster);
  };

  // Draait Niet bereikbaar terug: het monster is weer gewoon niet genomen.
  const weerBereikbaar = async (sample: OilSample) => {
    try {
      const response = await fetch(`/api/samples/${sample.id}/unreachable`, { method: 'DELETE' });
      if (!response.ok) {
        setFoutmelding(await foutTekst(response, `${sample.oNumber} staat nog steeds als niet bereikbaar.`));
        return;
      }
      setFoutmelding('');
      setMelding(`${sample.oNumber} staat weer op niet genomen.`);
      await loadSamples();
    } catch {
      setFoutmelding(GEEN_VERBINDING);
    }
  };

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      // Altijd het volledige jaaroverzicht (filter en zoeken tellen niet mee)
      const response = await fetch(`/api/samples?year=${jaar}`);
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Fout bij ophalen van monsters voor PDF');
        return;
      }
      await generateSamplesPdf(data, jaar);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Fout bij genereren van PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Neemt alle monsters van het vorige jaar (ook de daar geannuleerde) over als
  // geplande monsters voor dit jaar.
  const vorigJaar = jaar - 1;
  const handleCopyFromVorigJaar = async () => {
    if (!confirm(`Alle monsters van ${vorigJaar} overnemen naar ${jaar}?\n\nZe worden als "niet genomen" toegevoegd (ook de in ${vorigJaar} geannuleerde), zonder datum of foto. O-nummers die in ${jaar} al bestaan worden overgeslagen.`)) {
      return;
    }
    setCopying(true);
    setCopyMessage('');
    try {
      const response = await fetch('/api/samples/copy-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromYear: vorigJaar, toYear: jaar }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Fout bij overnemen van monsters');
        return;
      }
      setCopyMessage(
        data.bron === 0
          ? `Niets overgenomen: in ${vorigJaar} staan geen monsters.`
          : data.overgenomen === 0
          ? `Niets overgenomen: alle ${data.bron} monsters van ${vorigJaar} staan al in ${jaar}.`
          : `${data.overgenomen} monsters overgenomen uit ${vorigJaar}${data.overgeslagen ? `, ${data.overgeslagen} bestonden al` : ''}.`
      );
      loadSamples();
    } catch {
      alert('Fout bij overnemen van monsters');
    } finally {
      setCopying(false);
    }
  };

  // Laden: de kijker houdt het oude laadscherm; de rest ziet de schil met de
  // titel en een skelet van de lijst.
  if (loading && alleenLezen) {
    return <div className="laadscherm">Laden...</div>;
  }
  if (loading) {
    return (
      <AppShell title={`Oliemonsters ${jaar}`} wide user={user}>
        <h1 className="page-title">Oliemonsters {jaar}</h1>
        <p className="page-subtitle">De monsters worden opgehaald.</p>
        <Laden label="Monsters laden" regels={4} soort="lijst" />
      </AppShell>
    );
  }

  const zichtbareSamples = zichtbareMonsters(samples, {
    status: statusFilter,
    object: objectFilter,
    sortBy,
    sortOrder,
  });
  const filterActief = statusFilter !== 'all' || objectFilter !== 'all' || search.trim() !== '';
  // De planning krijgt een kijker niet te zien; de API weigert hem ook.
  const magPlannen = planningBestaat && !alleenLezen;
  const toonLijst =
    tab === 'lijst' || (tab === 'planning' && !magPlannen) || (tab === 'prullenbak' && !isAdmin);
  const objectNaamVanFilter = objecten.find((o) => String(o.id) === objectFilter)?.name ?? 'dit object';
  // Alle vier de statussen in één keer geteld (lib/sampleStatus.ts).
  const totalen = telStatussen(samples);
  // Overnemen uit vorig jaar: alleen zolang dit jaar nog leeg is.
  const kanOvernemen = isAdmin && lijstGeladen && samples.length === 0 && !search;

  const wisFilter = () => {
    setStatusFilter('all');
    setObjectFilter('all');
    setSearch('');
  };

  return (
    <AppShell
      title={`Oliemonsters ${jaar}`}
      wide
      user={user}
      onHelp={() => setShowHelpModal(true)}
      onPrint={handleGeneratePdf}
    >
      <h1 className="page-title">Oliemonsters {jaar}</h1>
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
            <button type="button" role="tab" aria-selected={tab === 'lijst'} className={tab === 'lijst' ? 'on' : ''} onClick={() => setTab('lijst')}>
              Lijst
            </button>
            {magPlannen && (
              <button type="button" role="tab" aria-selected={tab === 'planning'} className={tab === 'planning' ? 'on' : ''} onClick={() => setTab('planning')}>
                Planning
              </button>
            )}
            {isAdmin && (
              <button type="button" role="tab" aria-selected={tab === 'prullenbak'} className={tab === 'prullenbak' ? 'on' : ''} onClick={() => setTab('prullenbak')}>
                Prullenbak
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'planning' && magPlannen && <PlanningPaneel analysisYear={jaar} isAdmin={isAdmin} />}

      {tab === 'prullenbak' && isAdmin && (
        <VerwijderdeMonsters
          jaar={jaar}
          onHersteld={(oNumber) => {
            setMelding(`${oNumber} staat weer in de lijst, met alle monsternames en foto's.`);
            loadSamples();
          }}
        />
      )}

      {toonLijst && lijstGeladen && (<div className={compact ? `monsterlijst-compact${filtersOpen ? ' filters-open' : ''}` : undefined}>
        {/* Zoeken en toevoegen */}
        <div className="card zoekkaart" style={{ marginBottom: '16px' }}>
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
            {/* Een kijker heeft hier geen knoppen: geen PDF en niets toevoegen */}
            {(!alleenLezen || isAdmin) && (
              <div className="knoppenrij flex gap-3">
                {compact && (
                  <button
                    type="button"
                    className={`btn knop-filter${filtersOpen ? ' on' : ''}`}
                    onClick={() => setFiltersOpen((v) => !v)}
                    aria-expanded={filtersOpen}
                  >
                    <Icon name="filter" />
                    Filter
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleGeneratePdf}
                  disabled={generatingPdf}
                  className="btn knop-pdf"
                  title={`Download een PDF met alle oliemonsters van ${jaar} en de datum waarop ze zijn genomen`}
                >
                  <Icon name="file-pdf" />
                  {generatingPdf ? 'Bezig...' : 'PDF genereren'}
                </button>
                {kanOvernemen && (
                  <button
                    type="button"
                    onClick={handleCopyFromVorigJaar}
                    disabled={copying}
                    className="btn"
                    title={`Neem alle monsters van ${vorigJaar} over als geplande monsters voor ${jaar}`}
                  >
                    <Icon name="copy-year" />
                    {copying ? 'Bezig...' : `Overnemen uit ${vorigJaar}`}
                  </button>
                )}
                {isAdmin && (
                  <button type="button" onClick={() => setEditing({ sample: null })} className="btn btn-primary">
                    <Icon name="plus" />
                    Nieuw monster
                  </button>
                )}
              </div>
            )}
          </div>
          {copyMessage && (
            <div className="alert alert-success" style={{ marginTop: '12px' }}>{copyMessage}</div>
          )}
        </div>

        <MonsterFilters
          statusFilter={statusFilter}
          onStatus={setStatusFilter}
          objecten={objectenBeschikbaar ? objecten : null}
          objectFilter={objectFilter}
          onObject={setObjectFilter}
          onBulkAnnuleren={
            isAdmin && objectenBeschikbaar && objectFilter !== 'all' && objectFilter !== 'geen'
              ? () => setAnnuleerDoel({ soort: 'object', objectId: parseInt(objectFilter), objectNaam: objectNaamVanFilter, jaar })
              : undefined
          }
          sortBy={sortBy}
          onSortBy={setSortBy}
          sortOrder={sortOrder}
          onSortOrder={setSortOrder}
          jaren={magJaarKiezen ? jaren : null}
          jaar={jaar}
          onJaar={(j) => router.push(oliemonsterPad(j))}
        />

        <MonsterTellingen totaal={samples.length} totalen={totalen} statusFilter={statusFilter} onFilter={setStatusFilter} />
        {compact && (
          <StatusChips totaal={samples.length} totalen={totalen} statusFilter={statusFilter} onFilter={setStatusFilter} />
        )}

        <MonsterTabel
          samples={zichtbareSamples}
          jaar={jaar}
          visibleColumns={visibleColumns}
          objectenBeschikbaar={objectenBeschikbaar}
          isAdmin={isAdmin}
          foutmelding={!!foutmelding}
          filterActief={filterActief}
          statusBezig={statusBezig}
          uploadingPhoto={uploadingPhoto}
          onToggleStatus={toggleStatus}
          onOpenFoto={openFoto}
          onUpload={handlePhotoUpload}
          onNemen={setNeemDoel}
          onMeer={setActiesDoel}
          onBewerk={(s) => setEditing({ sample: s })}
          onWisFilter={wisFilter}
          onNieuw={() => setEditing({ sample: null })}
          overnemen={kanOvernemen ? { vanJaar: vorigJaar, bezig: copying, onOvernemen: handleCopyFromVorigJaar } : null}
          compact={compact}
        />
      </div>)}

      {/* Toevoegen / bewerken */}
      {editing && (
        <MonsterFormulier
          key={editing.sample?.id ?? 'nieuw'}
          sample={editing.sample}
          jaar={jaar}
          isAdmin={isAdmin}
          samples={samples}
          objecten={objecten}
          objectenBeschikbaar={objectenBeschikbaar}
          onClose={() => setEditing(null)}
          onOpgeslagen={(monster) => {
            setEditing(null);
            zetRegel(monster);
          }}
          onVernieuw={loadSamples}
          onVerwijderd={naVerwijderen}
          onHerstel={herstelMonster}
          onFoto={(url, label) => setSelectedPhoto({ fotos: [{ url, label }], oNumber: label, start: 0 })}
          onMelding={setMelding}
        />
      )}

      {/* Annuleren met reden */}
      <AnnuleerModal
        key={annuleerDoel ? (annuleerDoel.soort === 'object' ? `object-${annuleerDoel.objectId}` : `monster-${annuleerDoel.sample.id}`) : 'geen'}
        doel={annuleerDoel}
        onClose={() => setAnnuleerDoel(null)}
        onKlaar={async (tekst) => {
          setMelding(tekst);
          setAnnuleerDoel(null);
          await loadSamples();
        }}
      />

      {/* Na verwijderen: tien seconden Ongedaan maken */}
      <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />

      {/* Meer: annuleren, hermonstering, niet bereikbaar */}
      <MonsterActiesModal
        doel={actiesDoel}
        onClose={() => setActiesDoel(null)}
        onRedenAanpassen={() => actiesDoel && setOnbereikbaarDoel(actiesDoel)}
        onWeerBereikbaar={() => actiesDoel && weerBereikbaar(actiesDoel)}
        onTerugdraaien={() => actiesDoel && draaiAnnuleringTerug(actiesDoel)}
        onAnnuleren={() => actiesDoel && setAnnuleerDoel({ soort: 'monster', sample: actiesDoel })}
        onHermonstering={() => actiesDoel && handleAddAttempt(actiesDoel)}
      />

      {/* Monster nemen: alles in één scherm, met de knop Niet bereikbaar erin */}
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

      {selectedPhoto && (
        <PhotoModal
          fotos={selectedPhoto.fotos}
          startIndex={selectedPhoto.start}
          onClose={() => setSelectedPhoto(null)}
          sampleNumber={selectedPhoto.oNumber}
        />
      )}

      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} userRole={user.role || 'user'} />
    </AppShell>
  );
}
