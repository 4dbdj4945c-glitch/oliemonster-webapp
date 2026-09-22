'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, Modal, Icon } from '@/app/components/ui';
import ProspectDetail from '@/app/components/ProspectDetail';
import ProspectContactForm from '@/app/components/ProspectContactForm';
import { isOilViewer2025 } from '@/lib/roles';
import {
  PROSPECT_STATUSSEN,
  STATUS_LABELS,
  LOPENDE_STATUSSEN,
  SEGMENT_LABELS,
  OPVOLGEN_NA_DAGEN,
  segmentLabel,
  kwartaalGrenzen,
  eindeVanDezeWeek,
  actieStaatOpen,
  dagenGeleden,
  datumNL,
  datumVoorVeld,
  euroTekst,
  type ProspectRegel,
  type ProspectStatusNaam,
} from '@/lib/prospects';

interface User {
  userId: number;
  username: string;
  role: string;
  isLoggedIn: boolean;
}

type Sortering = 'score' | 'afstand' | 'actie' | 'naam';

interface ActieItem {
  prospect: ProspectRegel;
  reden: string;
  urgent: boolean;
  sorteer: number;
}

const leegFormulier = {
  bedrijfsnaam: '',
  plaats: '',
  segment: '',
  provincie: '',
  website: '',
  email: '',
  telefoon: '',
  contactpersoon: '',
  functie: '',
  linkedin: '',
  omvang: '',
  activiteit: '',
  aanknopingspunt: '',
  signaal: '',
  bron: '',
  score: '',
  scoreReden: '',
  afstandKm: '',
  status: 'NIEUW' as ProspectStatusNaam,
  kanaal: 'MAIL' as 'MAIL' | 'LINKEDIN',
  afgemeldOp: '',
  geschatteWaarde: '',
  volgendeActie: '',
  volgendeActieOp: '',
  notities: '',
};

type Formulier = typeof leegFormulier;

export default function AcquisitiePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [prospects, setProspects] = useState<ProspectRegel[]>([]);
  const [laden, setLaden] = useState(true);
  const [laadFout, setLaadFout] = useState('');

  // Filters
  const [zoek, setZoek] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [scoreFilter, setScoreFilter] = useState('');
  const [provincieFilter, setProvincieFilter] = useState('');
  const [sortering, setSortering] = useState<Sortering>('score');
  const [metArchief, setMetArchief] = useState(false);

  // Vensters
  const [detailId, setDetailId] = useState<number | null>(null);
  const [snelContact, setSnelContact] = useState<ProspectRegel | null>(null);
  const [formulierOpen, setFormulierOpen] = useState(false);
  const [bewerktId, setBewerktId] = useState<number | null>(null);
  const [formulier, setFormulier] = useState<Formulier>({ ...leegFormulier });
  const [formFout, setFormFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const controleer = async () => {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!data.isLoggedIn) { router.push('/login'); return; }
        if (data.requiresPasswordChange) { router.push('/set-password'); return; }
        if (isOilViewer2025(data.role)) { router.replace('/dashboard/oliemonsters'); return; }
        setUser(data);
      } catch {
        router.push('/login');
      }
    };
    controleer();
  }, [router]);

  const laadProspects = useCallback(async () => {
    try {
      const res = await fetch(`/api/prospects${metArchief ? '?archief=1' : ''}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setLaadFout(err.error || 'De prospects konden niet opgehaald worden.');
        setProspects([]);
        return;
      }
      setProspects(await res.json());
      setLaadFout('');
    } catch {
      setLaadFout('De prospects konden niet opgehaald worden.');
    } finally {
      setLaden(false);
    }
  }, [metArchief]);

  useEffect(() => {
    if (user) laadProspects();
  }, [user, laadProspects]);

  /* ---------- Cijfers bovenaan ---------- */

  const cijfers = useMemo(() => {
    const actief = prospects.filter((p) => !p.archief);
    const inPijplijn = actief.filter((p) => (LOPENDE_STATUSSEN as string[]).includes(p.status));
    const waarde = inPijplijn.reduce((som, p) => som + (p.geschatteWaarde ?? 0), 0);

    // Acties tot en met zondag van deze week, plus alles wat al te laat is.
    const eindeWeek = eindeVanDezeWeek();
    const acties = actief.filter((p) => actieStaatOpen(p, eindeWeek)).length;

    const { start, eind } = kwartaalGrenzen(new Date());
    const nieuweKlanten = prospects.filter((p) => {
      if (p.status !== 'KLANT' || !p.klantSindsOp) return false;
      const d = new Date(p.klantSindsOp);
      return d >= start && d < eind;
    }).length;

    const perStatus: Record<string, number> = {};
    for (const p of actief) perStatus[p.status] = (perStatus[p.status] ?? 0) + 1;

    return { inPijplijn: inPijplijn.length, waarde, acties, nieuweKlanten, perStatus };
  }, [prospects]);

  /* ---------- Wat moet er vandaag gebeuren ---------- */

  const actielijst = useMemo<ActieItem[]>(() => {
    const items: ActieItem[] = [];
    for (const p of prospects) {
      if (p.archief || p.status === 'KLANT' || p.status === 'AFGEWEZEN') continue;
      if (p.afgemeldOp) continue;  // afgemeld, dus niet meer benaderen

      const dagenTeLaat = dagenGeleden(p.volgendeActieOp);
      if (p.volgendeActieOp && dagenTeLaat !== null && dagenTeLaat >= 0) {
        items.push({
          prospect: p,
          reden: dagenTeLaat === 0 ? 'Staat voor vandaag' : `${dagenTeLaat} ${dagenTeLaat === 1 ? 'dag' : 'dagen'} te laat`,
          urgent: dagenTeLaat > 0,
          sorteer: dagenTeLaat,
        });
        continue;
      }

      if (p.status === 'BENADERD') {
        const sinds = dagenGeleden(p.laatsteContactOp ?? p.createdAt);
        if (sinds !== null && sinds >= OPVOLGEN_NA_DAGEN) {
          items.push({
            prospect: p,
            reden: `${sinds} dagen benaderd zonder reactie, tijd om op te volgen`,
            urgent: false,
            sorteer: sinds,
          });
        }
      }
    }
    return items.sort((a, b) => b.sorteer - a.sorteer);
  }, [prospects]);

  /* ---------- Filteren en sorteren ---------- */

  const provincies = useMemo(
    () => Array.from(new Set(prospects.map((p) => p.provincie).filter(Boolean) as string[])).sort(),
    [prospects]
  );

  const zichtbaar = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    const lijst = prospects.filter((p) => {
      if (segmentFilter && (p.segment ?? '').toLowerCase() !== segmentFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      if (scoreFilter && (p.score ?? 0) < parseInt(scoreFilter, 10)) return false;
      if (provincieFilter && p.provincie !== provincieFilter) return false;
      if (term) {
        const hooi = `${p.bedrijfsnaam} ${p.plaats} ${p.contactpersoon ?? ''} ${p.aanknopingspunt ?? ''}`.toLowerCase();
        if (!hooi.includes(term)) return false;
      }
      return true;
    });

    const achteraan = (waarde: number | null | undefined) => (waarde === null || waarde === undefined);

    return lijst.sort((a, b) => {
      if (sortering === 'score') {
        if (achteraan(a.score) !== achteraan(b.score)) return achteraan(a.score) ? 1 : -1;
        if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
        return a.bedrijfsnaam.localeCompare(b.bedrijfsnaam, 'nl');
      }
      if (sortering === 'afstand') {
        if (achteraan(a.afstandKm) !== achteraan(b.afstandKm)) return achteraan(a.afstandKm) ? 1 : -1;
        if ((a.afstandKm ?? 0) !== (b.afstandKm ?? 0)) return (a.afstandKm ?? 0) - (b.afstandKm ?? 0);
        return a.bedrijfsnaam.localeCompare(b.bedrijfsnaam, 'nl');
      }
      if (sortering === 'actie') {
        if (!a.volgendeActieOp !== !b.volgendeActieOp) return a.volgendeActieOp ? -1 : 1;
        if (a.volgendeActieOp && b.volgendeActieOp) {
          return new Date(a.volgendeActieOp).getTime() - new Date(b.volgendeActieOp).getTime();
        }
        return a.bedrijfsnaam.localeCompare(b.bedrijfsnaam, 'nl');
      }
      return a.bedrijfsnaam.localeCompare(b.bedrijfsnaam, 'nl');
    });
  }, [prospects, zoek, segmentFilter, statusFilter, scoreFilter, provincieFilter, sortering]);

  const groepen = useMemo(() => {
    return PROSPECT_STATUSSEN
      .map((status) => ({ status, regels: zichtbaar.filter((p) => p.status === status) }))
      .filter((groep) => groep.regels.length > 0);
  }, [zichtbaar]);

  /* ---------- Wijzigen ---------- */

  const wijzigStatus = async (prospect: ProspectRegel, status: ProspectStatusNaam) => {
    const res = await fetch(`/api/prospects/${prospect.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Status wijzigen mislukt.');
      return;
    }
    await laadProspects();
  };

  const openNieuw = () => {
    setBewerktId(null);
    setFormulier({ ...leegFormulier });
    setFormFout('');
    setFormulierOpen(true);
  };

  const openBewerken = (p: ProspectRegel) => {
    setBewerktId(p.id);
    setFormulier({
      bedrijfsnaam: p.bedrijfsnaam,
      plaats: p.plaats,
      segment: p.segment ?? '',
      provincie: p.provincie ?? '',
      website: p.website ?? '',
      email: p.email ?? '',
      telefoon: p.telefoon ?? '',
      contactpersoon: p.contactpersoon ?? '',
      functie: p.functie ?? '',
      linkedin: p.linkedin ?? '',
      omvang: p.omvang ?? '',
      activiteit: p.activiteit ?? '',
      aanknopingspunt: p.aanknopingspunt ?? '',
      signaal: p.signaal ?? '',
      bron: p.bron ?? '',
      score: p.score ? String(p.score) : '',
      scoreReden: p.scoreReden ?? '',
      afstandKm: p.afstandKm !== null && p.afstandKm !== undefined ? String(p.afstandKm) : '',
      status: p.status,
      kanaal: p.kanaal === 'LINKEDIN' ? 'LINKEDIN' : 'MAIL',
      afgemeldOp: datumVoorVeld(p.afgemeldOp),
      geschatteWaarde: p.geschatteWaarde ? String(p.geschatteWaarde) : '',
      volgendeActie: p.volgendeActie ?? '',
      volgendeActieOp: datumVoorVeld(p.volgendeActieOp),
      notities: p.notities ?? '',
    });
    setFormFout('');
    setFormulierOpen(true);
  };

  const bewaarFormulier = async () => {
    if (!formulier.bedrijfsnaam.trim() || !formulier.plaats.trim()) {
      setFormFout('Bedrijfsnaam en plaats zijn verplicht.');
      return;
    }
    setBezig(true);
    try {
      const url = bewerktId ? `/api/prospects/${bewerktId}` : '/api/prospects';
      const res = await fetch(url, {
        method: bewerktId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formulier,
          score: formulier.score === '' ? null : formulier.score,
          afstandKm: formulier.afstandKm === '' ? null : formulier.afstandKm,
          geschatteWaarde: formulier.geschatteWaarde === '' ? null : formulier.geschatteWaarde,
          volgendeActieOp: formulier.volgendeActieOp || null,
          afgemeldOp: formulier.afgemeldOp || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFormFout(err.error || 'Opslaan mislukt.');
        return;
      }
      setFormulierOpen(false);
      await laadProspects();
    } finally {
      setBezig(false);
    }
  };

  const exporteer = async () => {
    try {
      const res = await fetch(`/api/prospects/export${metArchief ? '?archief=1' : ''}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Exporteren mislukt.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `prospects-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Exporteren mislukt.');
    }
  };

  const detailProspect = prospects.find((p) => p.id === detailId) ?? null;

  return (
    <AppShell
      title="Acquisitie"
      user={user}
      onHelp={() => setHelpOpen(true)}
      rightActions={
        isAdmin ? (
          <button type="button" className="nav-btn nav-btn-primary" onClick={openNieuw}>
            <Icon name="plus" size={16} />
            <span className="lang">Nieuwe prospect</span>
            <span className="kort">Nieuw</span>
          </button>
        ) : undefined
      }
    >
      <style jsx>{`
        .archief-schakel {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--grijs-700);
        }
        .help-lijst {
          margin: 0;
          padding-left: 20px;
        }
        .help-lijst li {
          font-size: 14px;
          line-height: 1.6;
          color: var(--grijs-700);
          margin-bottom: 8px;
        }
      `}</style>

      <h1 className="page-title">Acquisitie</h1>
      <p className="page-subtitle">
        Je werkbank voor nieuwe klanten: wie benader je, wanneer, en wat kwam eruit.
      </p>

      {laadFout && (
        <div className="alert alert-warning" style={{ marginBottom: '18px' }}>
          <Icon name="alert-warning" size={16} />
          {laadFout}
        </div>
      )}

      {laden ? (
        <p className="laden">Laden...</p>
      ) : (
        <>
          {/* Cijfers */}
          <div className="stats-grid" style={{ marginBottom: '22px' }}>
            <div className="stat-card stat-card-icoon">
              <Icon name="module-acquisitie" />
              <div className="stat-value">{cijfers.inPijplijn}</div>
              <div className="stat-label">In de pijplijn</div>
            </div>
            <div className="stat-card stat-card-icoon">
              <Icon name="clock" />
              <div className="stat-value">{cijfers.acties}</div>
              <div className="stat-label">Acties deze week</div>
            </div>
            <div className="stat-card stat-card-icoon">
              <Icon name="euro" />
              <div className="stat-value">{euroTekst(cijfers.waarde)}</div>
              <div className="stat-label">Waarde in de pijplijn</div>
            </div>
            <div className="stat-card stat-card-icoon">
              <Icon name="handshake" />
              <div className="stat-value">{cijfers.nieuweKlanten}</div>
              <div className="stat-label">Nieuwe klanten dit kwartaal</div>
            </div>
          </div>

          {/* Wat moet er vandaag gebeuren */}
          <div className="card acq-sectie">
            <div className="section-label" style={{ marginBottom: '12px' }}>Wat moet er vandaag gebeuren</div>
            {actielijst.length === 0 ? (
              <div className="leeg">
                <Icon name="empty" size={32} />
                Niets staat open. Goed moment om een paar nieuwe bedrijven te benaderen.
              </div>
            ) : (
              <ul className="acq-acties">
                {actielijst.map(({ prospect, reden, urgent }) => (
                  <li key={prospect.id} className="acq-actie">
                    <div className="acq-actie-tekst">
                      <div className="acq-actie-naam">{prospect.bedrijfsnaam}</div>
                      <div className="acq-actie-regel">
                        {prospect.volgendeActie || 'Geen actie ingevuld, bepaal de volgende stap'}
                      </div>
                      <div className="acq-actie-sub">
                        <span className={`badge ${urgent ? 'badge-danger' : 'badge-warning'}`}>{reden}</span>
                        {' '}
                        {prospect.plaats} · {STATUS_LABELS[prospect.status]}
                        {prospect.volgendeActieOp ? ` · gepland ${datumNL(prospect.volgendeActieOp)}` : ''}
                      </div>
                    </div>
                    <div className="acq-actie-knoppen">
                      {isAdmin && (
                        <button type="button" className="btn btn-sm btn-blue" onClick={() => setSnelContact(prospect)}>
                          <Icon name="comment" size={16} />Vastleggen
                        </button>
                      )}
                      <button type="button" className="btn btn-sm" onClick={() => setDetailId(prospect.id)}>Openen</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Filters */}
          <div className="section-label" style={{ marginBottom: '10px' }}>Pijplijn</div>
          <div className="acq-filters">
            <span className="zoekveld">
              <Icon name="search" />
              <input
                type="search"
                className="input"
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                placeholder="Zoek op naam, plaats of aanknopingspunt"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label="Zoeken"
              />
            </span>
            <select className="select" value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)} aria-label="Segment">
              <option value="">Alle segmenten</option>
              {Object.entries(SEGMENT_LABELS).map(([waarde, label]) => (
                <option key={waarde} value={waarde}>{label}</option>
              ))}
            </select>
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
              <option value="">Alle statussen</option>
              {PROSPECT_STATUSSEN.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]} ({cijfers.perStatus[s] ?? 0})</option>
              ))}
            </select>
            <select className="select" value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value)} aria-label="Score">
              <option value="">Alle scores</option>
              <option value="5">Score 5</option>
              <option value="4">Score 4 en hoger</option>
              <option value="3">Score 3 en hoger</option>
            </select>
            <select className="select" value={provincieFilter} onChange={(e) => setProvincieFilter(e.target.value)} aria-label="Provincie">
              <option value="">Alle provincies</option>
              {provincies.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="select" value={sortering} onChange={(e) => setSortering(e.target.value as Sortering)} aria-label="Sorteren">
              <option value="score">Hoogste score eerst</option>
              <option value="afstand">Dichtstbij eerst</option>
              <option value="actie">Eerstvolgende actie</option>
              <option value="naam">Op naam</option>
            </select>
          </div>

          <div className="knoppenrij" style={{ marginBottom: '14px' }}>
            {isAdmin && (
              <button type="button" className="btn" onClick={() => setImportOpen(true)}>
                <Icon name="upload" />Importeren
              </button>
            )}
            <button type="button" className="btn" onClick={exporteer}>
              <Icon name="download" />Exporteren
            </button>
            <label className="archief-schakel">
              <input type="checkbox" checked={metArchief} onChange={(e) => setMetArchief(e.target.checked)} />
              Archief tonen
            </label>
          </div>

          {/* Pijplijn */}
          {zichtbaar.length === 0 ? (
            <div className="leeg">
              <Icon name="empty" size={32} />
              {prospects.length === 0
                ? 'Nog geen prospects. Importeer de lijst of voeg er zelf een toe.'
                : 'Geen prospects die aan deze filters voldoen.'}
            </div>
          ) : (
            groepen.map((groep) => {
              const waarde = groep.regels.reduce((som, p) => som + (p.geschatteWaarde ?? 0), 0);
              return (
                <div key={groep.status} className="acq-groep">
                  <div className="acq-groep-kop">
                    <span className="section-label">{STATUS_LABELS[groep.status]}</span>
                    <span className="badge badge-gray">{groep.regels.length}</span>
                    {waarde > 0 && <span className="acq-groep-waarde">{euroTekst(waarde)}</span>}
                  </div>
                  <div className="acq-kaarten">
                    {groep.regels.map((p) => (
                      <div key={p.id} className="acq-kaart">
                        <button type="button" className="acq-kaart-open" onClick={() => setDetailId(p.id)}>
                          <span className="acq-kaart-naam">{p.bedrijfsnaam}</span>
                          <span className="acq-kaart-sub">
                            {p.plaats}{p.provincie ? `, ${p.provincie}` : ''} · {segmentLabel(p.segment)}
                          </span>
                        </button>
                        <div className="acq-kaart-regel" style={{ gap: '12px' }}>
                          {p.score !== null && (
                            <span className="acq-score" title={`Score ${p.score} van 5`}>
                              <Icon name="star" size={16} />{p.score}
                            </span>
                          )}
                          {p.afstandKm !== null && (
                            <span className="acq-score"><Icon name="map-pin" size={16} />{p.afstandKm} km</span>
                          )}
                          {p.geschatteWaarde ? (
                            <span className="acq-score">{euroTekst(p.geschatteWaarde)}</span>
                          ) : null}
                        </div>
                        {p.volgendeActie && (
                          <div className="acq-kaart-regel">
                            <Icon name="clock" size={16} />
                            <span>
                              {p.volgendeActie}
                              {p.volgendeActieOp ? `, ${datumNL(p.volgendeActieOp)}` : ''}
                            </span>
                          </div>
                        )}
                        {p.afgemeldOp && <span className="badge badge-danger" style={{ alignSelf: 'flex-start' }}>Afgemeld, niet meer mailen</span>}
                        {p.archief && <span className="badge badge-gray" style={{ alignSelf: 'flex-start' }}>In archief</span>}
                        <div className="acq-kaart-voet">
                          <select
                            className="select"
                            value={p.status}
                            onChange={(e) => wijzigStatus(p, e.target.value as ProspectStatusNaam)}
                            aria-label={`Status van ${p.bedrijfsnaam}`}
                            disabled={!isAdmin}
                          >
                            {PROSPECT_STATUSSEN.map((s) => (
                              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                          {isAdmin && (
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => setSnelContact(p)}
                              title="Contactmoment vastleggen"
                              aria-label={`Contactmoment vastleggen bij ${p.bedrijfsnaam}`}
                            >
                              <Icon name="comment" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {/* Detail */}
      <Modal
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        title={detailProspect?.bedrijfsnaam ?? 'Prospect'}
        size="lg"
      >
        {detailId !== null && (
          <ProspectDetail
            prospectId={detailId}
            isAdmin={!!isAdmin}
            onGewijzigd={laadProspects}
            onBewerken={(p) => { setDetailId(null); openBewerken(p); }}
            onVerwijderd={() => { setDetailId(null); laadProspects(); }}
          />
        )}
      </Modal>

      {/* Snel een contactmoment vastleggen */}
      <Modal
        open={snelContact !== null}
        onClose={() => setSnelContact(null)}
        title={snelContact ? `Contact met ${snelContact.bedrijfsnaam}` : 'Contactmoment'}
        size="md"
      >
        {snelContact && (
          <ProspectContactForm
            prospect={snelContact}
            onOpgeslagen={async () => { setSnelContact(null); await laadProspects(); }}
            onAnnuleren={() => setSnelContact(null)}
          />
        )}
      </Modal>

      {/* Prospect toevoegen of bewerken */}
      <Modal
        open={formulierOpen}
        onClose={() => setFormulierOpen(false)}
        title={bewerktId ? 'Prospect bewerken' : 'Nieuwe prospect'}
        size="lg"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setFormulierOpen(false)}>Annuleren</button>
            <button type="button" className="btn btn-primary" onClick={bewaarFormulier} disabled={bezig}>Opslaan</button>
          </>
        }
      >
        <div className="acq-velden">
          <Veld label="Bedrijfsnaam" waarde={formulier.bedrijfsnaam} zet={(v) => setFormulier({ ...formulier, bedrijfsnaam: v })} />
          <Veld label="Plaats" waarde={formulier.plaats} zet={(v) => setFormulier({ ...formulier, plaats: v })} />
          <div>
            <label className="label">Segment</label>
            <select className="select" value={formulier.segment} onChange={(e) => setFormulier({ ...formulier, segment: e.target.value })}>
              <option value="">Kies een segment</option>
              {Object.entries(SEGMENT_LABELS).map(([waarde, label]) => (
                <option key={waarde} value={waarde}>{label}</option>
              ))}
            </select>
          </div>
          <Veld label="Provincie" waarde={formulier.provincie} zet={(v) => setFormulier({ ...formulier, provincie: v })} />
          <Veld label="Website" waarde={formulier.website} zet={(v) => setFormulier({ ...formulier, website: v })} placeholder="https://" />
          <Veld label="LinkedIn" waarde={formulier.linkedin} zet={(v) => setFormulier({ ...formulier, linkedin: v })} placeholder="https://linkedin.com/company/..." />
          <Veld label="Mailadres" waarde={formulier.email} zet={(v) => setFormulier({ ...formulier, email: v })} />
          <Veld label="Telefoon" waarde={formulier.telefoon} zet={(v) => setFormulier({ ...formulier, telefoon: v })} />
          <Veld label="Contactpersoon" waarde={formulier.contactpersoon} zet={(v) => setFormulier({ ...formulier, contactpersoon: v })} />
          <Veld label="Functie" waarde={formulier.functie} zet={(v) => setFormulier({ ...formulier, functie: v })} />
          <Veld label="Omvang" waarde={formulier.omvang} zet={(v) => setFormulier({ ...formulier, omvang: v })} placeholder="bv. 50-100" />
          <Veld label="Afstand vanaf Heeze (km)" waarde={formulier.afstandKm} zet={(v) => setFormulier({ ...formulier, afstandKm: v })} numeriek />
          <div className="acq-velden-breed">
            <label className="label">Wat ze doen</label>
            <textarea className="textarea" rows={2} value={formulier.activiteit} onChange={(e) => setFormulier({ ...formulier, activiteit: e.target.value })} />
          </div>
          <div className="acq-velden-breed">
            <label className="label">Aanknopingspunt</label>
            <textarea className="textarea" rows={2} value={formulier.aanknopingspunt} onChange={(e) => setFormulier({ ...formulier, aanknopingspunt: e.target.value })} placeholder="Waarom heeft dit bedrijf jou nodig" />
          </div>
          <div className="acq-velden-breed">
            <label className="label">Signaal</label>
            <input className="input" value={formulier.signaal} onChange={(e) => setFormulier({ ...formulier, signaal: e.target.value })} placeholder="bv. vacature onderhoudsmonteur, 3 sep 2026" />
          </div>
          <Veld label="Bron (URL)" waarde={formulier.bron} zet={(v) => setFormulier({ ...formulier, bron: v })} />
          <div>
            <label className="label">Score</label>
            <select className="select" value={formulier.score} onChange={(e) => setFormulier({ ...formulier, score: e.target.value })}>
              <option value="">Geen score</option>
              {[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="acq-velden-breed">
            <label className="label">Reden van de score</label>
            <input className="input" value={formulier.scoreReden} onChange={(e) => setFormulier({ ...formulier, scoreReden: e.target.value })} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="select" value={formulier.status} onChange={(e) => setFormulier({ ...formulier, status: e.target.value as ProspectStatusNaam })}>
              {PROSPECT_STATUSSEN.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Benaderen via</label>
            <select className="select" value={formulier.kanaal} onChange={(e) => setFormulier({ ...formulier, kanaal: e.target.value as 'MAIL' | 'LINKEDIN' })}>
              <option value="MAIL">Mail</option>
              <option value="LINKEDIN">LinkedIn</option>
            </select>
            <p className="hint">Je benadert een bedrijf via een kanaal tegelijk.</p>
          </div>
          <div>
            <label className="label">Afgemeld op</label>
            <input type="date" className="input" value={formulier.afgemeldOp} onChange={(e) => setFormulier({ ...formulier, afgemeldOp: e.target.value })} />
            <p className="hint">Vul dit in als ze geen mail meer willen. Ze vallen dan uit je actielijst.</p>
          </div>
          <Veld label="Geschatte waarde" waarde={formulier.geschatteWaarde} zet={(v) => setFormulier({ ...formulier, geschatteWaarde: v.replace(/[^0-9]/g, '') })} numeriek />
          <Veld label="Volgende actie" waarde={formulier.volgendeActie} zet={(v) => setFormulier({ ...formulier, volgendeActie: v })} />
          <div>
            <label className="label">Wanneer</label>
            <input type="date" className="input" value={formulier.volgendeActieOp} onChange={(e) => setFormulier({ ...formulier, volgendeActieOp: e.target.value })} />
          </div>
          <div className="acq-velden-breed">
            <label className="label">Notities</label>
            <textarea className="textarea" rows={3} value={formulier.notities} onChange={(e) => setFormulier({ ...formulier, notities: e.target.value })} />
          </div>
          {formFout && <div className="alert alert-danger acq-velden-breed"><Icon name="alert-danger" size={16} />{formFout}</div>}
        </div>
      </Modal>

      {/* Importeren */}
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onKlaar={laadProspects}
      />

      {/* Help */}
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Zo werkt Acquisitie" size="md">
        <ol className="help-lijst">
          <li>Importeer de prospectlijst uit het onderzoek met de knop Importeren, of voeg zelf een bedrijf toe.</li>
          <li>Kijk elke werkdag eerst bij Wat moet er vandaag gebeuren. Daar staat alles wat open staat en alles wat langer dan {OPVOLGEN_NA_DAGEN} dagen op Benaderd staat zonder reactie.</li>
          <li>Heb je gemaild of een bericht op LinkedIn gestuurd, leg dat dan vast met Vastleggen. Zet in hetzelfde scherm de status en de volgende actie.</li>
          <li>De status wissel je vanaf een kaartje in de pijplijn met het keuzelijstje onderaan de kaart.</li>
          <li>Onder Exporteren haal je de hele lijst als CSV binnen, met status en volgende actie erbij.</li>
        </ol>
      </Modal>
    </AppShell>
  );
}

/* ---------- Klein veldje voor het formulier ---------- */

function Veld({
  label,
  waarde,
  zet,
  placeholder,
  numeriek = false,
}: {
  label: string;
  waarde: string;
  zet: (waarde: string) => void;
  placeholder?: string;
  numeriek?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        value={waarde}
        onChange={(e) => zet(e.target.value)}
        placeholder={placeholder}
        inputMode={numeriek ? 'numeric' : undefined}
        autoComplete="off"
      />
    </div>
  );
}

/* ---------- Importvenster ---------- */

interface ImportResultaat {
  toegevoegd: number;
  overgeslagen: number;
  overgeslagenNamen: string[];
  fouten: { regel: number; reden: string }[];
  onbekendeKolommen: string[];
}

function ImportModal({ open, onClose, onKlaar }: { open: boolean; onClose: () => void; onKlaar: () => void }) {
  const [csv, setCsv] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [resultaat, setResultaat] = useState<ImportResultaat | null>(null);

  const kolommen = 'bedrijfsnaam, segment, plaats, provincie, website, telefoon, email, contactpersoon, functie, linkedin, omvang, activiteit, aanknopingspunt, signaal, bron, score, score_reden, afstand_km';

  const kiesBestand = async (bestand: File | null | undefined) => {
    if (!bestand) return;
    setCsv(await bestand.text());
    setResultaat(null);
    setFout('');
  };

  const importeer = async () => {
    if (!csv.trim()) {
      setFout('Plak eerst een CSV of kies een bestand.');
      return;
    }
    setBezig(true);
    setFout('');
    try {
      const res = await fetch('/api/prospects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFout(data.error || 'Importeren mislukt.');
        return;
      }
      setResultaat(data as ImportResultaat);
      setCsv('');
      onKlaar();
    } finally {
      setBezig(false);
    }
  };

  const sluit = () => {
    setResultaat(null);
    setFout('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={sluit}
      title="Prospects importeren"
      size="lg"
      footer={
        <>
          <button type="button" className="btn" onClick={sluit}>Sluiten</button>
          <button type="button" className="btn btn-primary" onClick={importeer} disabled={bezig}>
            {bezig ? 'Bezig...' : 'Importeren'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <p className="hint" style={{ margin: 0 }}>
          Plak de inhoud van prospects.csv of kies het bestand. De eerste regel moet de kolomnamen bevatten.
          Bedrijven die al in de lijst staan (zelfde naam en plaats) worden overgeslagen, er wordt niets overschreven.
        </p>

        <div>
          <label className="label">Kolommen</label>
          <p className="acq-voorbeeld">{kolommen}</p>
        </div>

        <div>
          <label className="label" htmlFor="import-bestand">Bestand kiezen</label>
          <input
            id="import-bestand"
            type="file"
            accept=".csv,text/csv"
            className="input"
            onChange={(e) => kiesBestand(e.target.files?.[0])}
          />
        </div>

        <div>
          <label className="label" htmlFor="import-csv">Of plakken</label>
          <textarea
            id="import-csv"
            className="textarea"
            rows={8}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder="bedrijfsnaam,segment,plaats,..."
            spellCheck={false}
          />
        </div>

        {fout && <div className="alert alert-danger"><Icon name="alert-danger" size={16} />{fout}</div>}

        {resultaat && (
          <div className="alert alert-success">
            <Icon name="alert-success" size={16} />
            <span>
              {resultaat.toegevoegd} toegevoegd, {resultaat.overgeslagen} overgeslagen omdat ze al in de lijst stonden.
              {resultaat.fouten.length > 0 && ` ${resultaat.fouten.length} regels zijn overgeslagen omdat bedrijfsnaam of plaats ontbrak.`}
              {resultaat.onbekendeKolommen.length > 0 && ` Onbekende kolommen genegeerd: ${resultaat.onbekendeKolommen.join(', ')}.`}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
