'use client';

// Inspecties (beheerder en gebruiker, sectie Rapportage): alle inspecties met
// uitkomst en volgende inspectie, te filteren op soort, status en klant.
// Nieuwe inspectie en invullen alleen voor de beheerder. Een tik op een regel
// opent het invulscherm (/dashboard/inspecties/[id]).
//
// Verzamelrapport (beheerder): inspecties aanvinken en er één PDF van maken
// (GET /api/inspecties/rapport?ids=...). Alleen van één klant en één soort;
// anders staat er boven de lijst waarom het niet kan.

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
  const [gekozen, setGekozen] = useState<Set<number>>(new Set());
  const [bezigRapport, setBezigRapport] = useState(false);
  const [rapportFout, setRapportFout] = useState('');

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

  // Verzamelrapport: wat is gekozen (en nog in de lijst), en mag dat samen?
  const keuze = (lijst ?? []).filter((i) => gekozen.has(i.id));
  const wissel = (id: number) =>
    setGekozen((g) => {
      const n = new Set(g);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const keuzeFout =
    new Set(keuze.map((i) => i.klant.id)).size > 1
      ? 'Een verzamelrapport is voor één klant. Je hebt inspecties van verschillende klanten gekozen.'
      : new Set(keuze.map((i) => i.sjabloon)).size > 1
        ? 'Een verzamelrapport is voor één soort inspectie. Je hebt verschillende soorten gekozen.'
        : keuze.length > 50
          ? 'Kies hoogstens 50 inspecties voor één verzamelrapport.'
          : '';
  const concepten = keuze.filter((i) => i.status === 'concept').length;
  // Eerst controleren, zodat een melding van de server (te veel foto's) op het scherm komt in plaats van een kapotte download.
  const verzamelrapport = async () => {
    setBezigRapport(true);
    setRapportFout('');
    try {
      const adres = `/api/inspecties/rapport?ids=${keuze.map((i) => i.id).join(',')}`;
      const res = await fetch(`${adres}&controle=1`);
      if (!res.ok) {
        setRapportFout(await foutTekst(res, 'Het verzamelrapport kon niet worden gemaakt.'));
        return;
      }
      const a = document.createElement('a');
      a.href = adres;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setRapportFout(GEEN_VERBINDING);
    } finally {
      setBezigRapport(false);
    }
  };
  const alleZichtbaarGekozen = zichtbaar.length > 0 && zichtbaar.every((i) => gekozen.has(i.id));

  return (
    <AppShell title="Inspecties" wide user={user}>
      <div className="beheer-kop">
        <div>
          <h1 className="page-title">Inspecties</h1>
          <p className="page-subtitle">Lekken, arbeidsmiddelen en markeringen, met een rapport voor de klant.</p>
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

          {isAdmin && keuze.length > 0 && (
            <div className="card insp-selectie" role="region" aria-label="Verzamelrapport">
              <span className="insp-selectie-tekst">
                <b>{keuze.length}</b> {keuze.length === 1 ? 'inspectie' : 'inspecties'} gekozen
                {concepten > 0 && !keuzeFout ? `, waarvan ${concepten} concept (komt als CONCEPT in het rapport)` : ''}
              </span>
              <div className="knoppenrij">
                {!alleZichtbaarGekozen && (
                  <button type="button" className="btn btn-sm" onClick={() => setGekozen(new Set([...gekozen, ...zichtbaar.map((i) => i.id)]))}>
                    <Icon name="select-all" size={16} />
                    Alle zichtbare
                  </button>
                )}
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setGekozen(new Set())}>
                  <Icon name="clear-selection" size={16} />
                  Niets kiezen
                </button>
                {keuzeFout ? (
                  <button type="button" className="btn" disabled>
                    <Icon name="file-bundle" size={16} />
                    Verzamelrapport
                  </button>
                ) : (
                  <>
                    <a className="btn btn-sm btn-ghost" href={`/api/inspecties/rapport?ids=${keuze.map((i) => i.id).join(',')}&fotos=0`} download>
                      <Icon name="file-pdf" size={16} />
                      Zonder foto&apos;s
                    </a>
                    <button type="button" className="btn" onClick={verzamelrapport} disabled={bezigRapport}>
                      <Icon name="file-bundle" size={16} />
                      {bezigRapport ? 'Bezig...' : 'Verzamelrapport'}
                    </button>
                  </>
                )}
              </div>
              {rapportFout && !keuzeFout && (
                <div className="alert alert-danger" role="alert">
                  <span>{rapportFout}</span>
                </div>
              )}
              {keuzeFout && (
                <div className="alert alert-warning" role="alert">
                  <Icon name="alert-warning" size={20} />
                  <span>{keuzeFout}</span>
                </div>
              )}
            </div>
          )}

          {zichtbaar.length === 0 ? (
            <div className="leeg">
              <Icon name="module-inspecties" size={32} />
              <p style={{ margin: '0 0 12px' }}>
                {lijst.length === 0 ? 'Nog geen inspecties. Begin met Nieuwe inspectie.' : 'Geen inspecties die aan dit filter voldoen.'}
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
                      {isAdmin && (
                        <th className="insp-kies">
                          <label title="Alle zichtbare kiezen voor een verzamelrapport">
                            <input
                              type="checkbox"
                              checked={alleZichtbaarGekozen}
                              aria-label="Alle zichtbare inspecties kiezen"
                              onChange={() =>
                                setGekozen(alleZichtbaarGekozen ? new Set([...gekozen].filter((id) => !zichtbaar.some((i) => i.id === id))) : new Set([...gekozen, ...zichtbaar.map((i) => i.id)]))
                              }
                            />
                          </label>
                        </th>
                      )}
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
                          {isAdmin && (
                            <td data-label="Kiezen" className="insp-kies" onClick={(e) => e.stopPropagation()}>
                              <label>
                                <input type="checkbox" checked={gekozen.has(i.id)} onChange={() => wissel(i.id)} aria-label={`${i.nummer} kiezen voor een verzamelrapport`} />
                                <span className="alleen-mobiel">Kiezen voor verzamelrapport</span>
                              </label>
                            </td>
                          )}
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
