'use client';

// Inspecties (beheerder en gebruiker, sectie Rapportage): alle inspecties met
// uitkomst en volgende inspectie, te filteren op soort, status en klant.
// Nieuwe inspectie en invullen alleen voor de beheerder. Een tik op een regel
// opent het invulscherm (/dashboard/inspecties/[id]).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { AppShell, Icon, Laden } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import NieuweInspectie, { type InstallatieKeuze } from '@/app/components/inspecties/NieuweInspectie';
import { dagKort, type InspectieInLijst } from '@/app/components/inspecties/types';
import type { ObjectKeuze } from '@/app/components/klanten/types';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { INSPECTIE_STATUS_BADGE, INSPECTIE_STATUS_LABELS, SJABLONEN, SJABLOON_SLEUTELS, type SjabloonSleutel } from '@/lib/inspecties/sjablonen';
import { ROLE_ADMIN } from '@/lib/roles';

type Soort = 'alle' | SjabloonSleutel;

export default function InspectiesPagina() {
  const user = useGebruiker();
  const router = useRouter();
  const isAdmin = user.role === ROLE_ADMIN;
  const [lijst, setLijst] = useState<InspectieInLijst[] | null>(null);
  const [fout, setFout] = useState('');
  const [soort, setSoort] = useState<Soort>('alle');
  const [status, setStatus] = useState('');
  const [klant, setKlant] = useState('');
  const [nieuw, setNieuw] = useState(false);
  const [objecten, setObjecten] = useState<ObjectKeuze[]>([]);
  const [installaties, setInstallaties] = useState<InstallatieKeuze[]>([]);

  const laad = useCallback(async () => {
    try {
      const res = await fetch('/api/inspecties');
      if (!res.ok) {
        setFout(await foutTekst(res, 'De inspecties konden niet worden opgehaald.'));
        return;
      }
      const data: InspectieInLijst[] = await res.json();
      setLijst(data);
      setFout('');
    } catch {
      setFout(GEEN_VERBINDING);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laad();
  }, [laad]);

  const openNieuw = async () => {
    setNieuw(true);
    try {
      const [o, i] = await Promise.all([fetch('/api/sample-objects'), fetch('/api/installaties')]);
      if (o.ok) setObjecten(await o.json());
      if (i.ok) setInstallaties(await i.json());
    } catch {
      // Het venster meldt zelf dat er geen objecten zijn.
    }
  };

  // Vanuit de knop Nieuw in de onderbalk: /dashboard/inspecties?nieuw=1 opent meteen Nieuwe inspectie.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (new URLSearchParams(window.location.search).get('nieuw') === '1') openNieuw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const klanten = useMemo(() => {
    const m = new Map<number, string>();
    for (const i of lijst ?? []) m.set(i.klant.id, i.klant.naam);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'nl'));
  }, [lijst]);

  const zichtbaar = (lijst ?? []).filter(
    (i) => (soort === 'alle' || i.sjabloon === soort) && (!status || i.status === status) && (!klant || String(i.klant.id) === klant)
  );
  const open = (i: InspectieInLijst) => router.push(`/dashboard/inspecties/${i.id}`);

  return (
    <AppShell title="Inspecties" wide user={user}>
      <div className="beheer-kop">
        <div>
          <h1 className="page-title">Inspecties</h1>
          <p className="page-subtitle">Persluchtlekken en arbeidsmiddelen, met een rapport voor de klant.</p>
        </div>
        {isAdmin && (
          <div className="knoppenrij beheer-knoppen">
            <button type="button" className="btn btn-primary" onClick={openNieuw}>
              <Icon name="plus" size={16} />
              Nieuwe inspectie
            </button>
          </div>
        )}
      </div>

      {fout && <LaadFout melding={fout} onOpnieuw={laad} />}

      {lijst === null ? (
        fout ? null : <Laden regels={4} soort="lijst" />
      ) : (
        <>
          <div className="card insp-filters">
            <div className="dossier-chips" role="group" aria-label="Soort inspectie">
              {(['alle', ...SJABLOON_SLEUTELS] as Soort[]).map((k) => {
                const n = k === 'alle' ? lijst.length : lijst.filter((i) => i.sjabloon === k).length;
                return (
                  <button key={k} type="button" className={`dossier-chip${soort === k ? ' on' : ''}`} aria-pressed={soort === k} onClick={() => setSoort(k)}>
                    {k === 'alle' ? 'Alle' : SJABLONEN[k].naam} <span className="dossier-chip-aantal">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="insp-filter-velden">
              <div className="beheer-filter">
                <label className="label" htmlFor="filter-status">Status</label>
                <select id="filter-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Alle</option>
                  <option value="concept">Concept</option>
                  <option value="afgerond">Afgerond</option>
                </select>
              </div>
              <div className="beheer-filter">
                <label className="label" htmlFor="filter-klant">Klant</label>
                <select id="filter-klant" className="select" value={klant} onChange={(e) => setKlant(e.target.value)}>
                  <option value="">Alle klanten</option>
                  {klanten.map(([id, naam]) => (
                    <option key={id} value={String(id)}>{naam}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {zichtbaar.length === 0 ? (
            <div className="leeg">
              <Icon name="module-inspecties" size={32} />
              <p style={{ margin: '0 0 12px' }}>
                {lijst.length === 0 ? 'Nog geen inspecties. Begin met een lekkeninspectie of een inspectie van arbeidsmiddelen.' : 'Geen inspecties die aan dit filter voldoen.'}
              </p>
              {isAdmin && lijst.length === 0 && (
                <button type="button" className="btn btn-sm" onClick={openNieuw}>
                  <Icon name="plus" size={16} />
                  Nieuwe inspectie
                </button>
              )}
            </div>
          ) : (
            <div className="table-container">
              <div className="table-scroll">
                <table className="table table-kaarten beheer-tabel insp-tabel">
                  <thead>
                    <tr>
                      <th>Inspectie</th>
                      <th>Klant en object</th>
                      <th>Datum</th>
                      <th>Uitkomst</th>
                      <th>Volgende</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zichtbaar.map((i) => {
                      const s = SJABLONEN[i.sjabloon];
                      return (
                        <tr key={i.id} className="rij-link" onClick={() => open(i)}>
                          <td data-label="Inspectie" className="kaart-kop">
                            <a
                              href={`/dashboard/inspecties/${i.id}`}
                              className="beheer-naam"
                              onClick={(e) => {
                                e.preventDefault();
                                open(i);
                              }}
                            >
                              <Icon name={s.icoon} size={16} />
                              {s.naam}
                            </a>
                            <span className="badge badge-gray code-badge insp-nummer">{i.nummer}</span>
                          </td>
                          <td data-label="Klant en object">
                            <span className="insp-klant">
                              <b>{i.klant.naam}</b>
                              <span>{i.installatie ? `${i.object.name}, ${i.installatie.naam}` : i.object.name}</span>
                            </span>
                          </td>
                          <td data-label="Datum" className="getal insp-dag">{dagKort(i.datum)}</td>
                          <td data-label="Uitkomst">
                            <span className="insp-uitkomst-cel">
                            {i.uitkomst}
                            {i.waarschuwingen > 0 && (
                              <span className="insp-waarschuwing-klein">
                                <Icon name="alert-warning" size={16} />
                                Doorverwijzen naar aangewezen instelling
                              </span>
                            )}
                            </span>
                          </td>
                          <td data-label="Volgende" className="getal insp-dag">{dagKort(i.volgende)}</td>
                          <td data-label="Status">
                            <span className={`badge ${INSPECTIE_STATUS_BADGE[i.status]}`}>
                              <Icon name={i.status === 'afgerond' ? 'status-taken' : 'pencil'} size={16} />
                              {INSPECTIE_STATUS_LABELS[i.status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {nieuw && (
        <NieuweInspectie
          objecten={objecten}
          installaties={installaties}
          onClose={() => setNieuw(false)}
          onGemaakt={(id) => router.push(`/dashboard/inspecties/${id}`)}
        />
      )}
    </AppShell>
  );
}
