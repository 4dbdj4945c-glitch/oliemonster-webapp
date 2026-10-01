'use client';

// Werkbonnen (sectie Rapportage, in de code nog dagrapporten): het verslag per
// bezoek, getekend door de klant of afgerond zonder handtekening. Een tik op een
// regel opent de werkbon; een nieuwe werkbon voor een losse klant alleen als
// beheerder (bij een planningsdag: in het veldscherm).

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { AppShell, Icon, Laden } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import NieuwDagrapport from '@/app/components/dagrapport/NieuwDagrapport';
import { urenTekst, type DagrapportInLijst } from '@/app/components/dagrapport/types';
import WerkbonStatusBadge from '@/app/components/dagrapport/WerkbonStatus';
import { soortWerkLabel, STATUS_LABEL, WERKBON_STATUSSEN, type WerkbonStatus } from '@/lib/werkbon';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { dagKort } from '@/lib/contracten';
import { ROLE_ADMIN } from '@/lib/roles';

type Filter = 'alle' | WerkbonStatus;

export default function DagrapportenPagina() {
  const user = useGebruiker();
  const router = useRouter();
  const isAdmin = user.role === ROLE_ADMIN;
  const [lijst, setLijst] = useState<DagrapportInLijst[] | null>(null);
  const [fout, setFout] = useState('');
  const [filter, setFilter] = useState<Filter>('alle');
  const [nieuw, setNieuw] = useState(false);

  const laad = useCallback(async () => {
    try {
      const res = await fetch('/api/dagrapporten');
      if (!res.ok) {
        setFout(await foutTekst(res, 'De werkbonnen konden niet worden opgehaald.'));
        return;
      }
      const data: DagrapportInLijst[] = await res.json();
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

  const zichtbaar = (lijst ?? []).filter((d) => filter === 'alle' || d.status === filter);
  const open = (d: DagrapportInLijst) => router.push(`/dashboard/dagrapporten/${d.id}`);

  return (
    <AppShell title="Werkbonnen" wide user={user}>
      <div className="beheer-kop">
        <div>
          <h1 className="page-title">Werkbonnen</h1>
          <p className="page-subtitle">Wat er bij een bezoek gedaan is: tijd, materialen, foto&apos;s en zo nodig de handtekening van de klant. Geen factuur.</p>
        </div>
        {isAdmin && (
          <div className="knoppenrij beheer-knoppen">
            <button type="button" className="btn btn-primary" onClick={() => setNieuw(true)}>
              <Icon name="plus" size={16} />
              Nieuwe werkbon
            </button>
          </div>
        )}
      </div>

      {fout && <LaadFout melding={fout} onOpnieuw={laad} />}

      {lijst === null ? (
        fout ? null : <Laden regels={4} soort="lijst" />
      ) : lijst.length === 0 ? (
        <div className="leeg">
          <Icon name="module-dagrapport" size={32} />
          <p style={{ margin: 0 }}>Nog geen werkbonnen. Begin er een in het veldscherm van een planningsdag, of hier voor een losse klant.</p>
        </div>
      ) : (
        <>
          <div className="dossier-chips" role="group" aria-label="Filter op status" style={{ marginBottom: '16px' }}>
            {(['alle', ...WERKBON_STATUSSEN] as Filter[]).map((f) => (
              <button key={f} type="button" className={`dossier-chip${filter === f ? ' on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'alle' ? 'Alle' : STATUS_LABEL[f]}{' '}
                <span className="dossier-chip-aantal">{f === 'alle' ? lijst.length : lijst.filter((d) => d.status === f).length}</span>
              </button>
            ))}
          </div>
          <div className="table-container">
            <div className="table-scroll">
              <table className="table table-kaarten beheer-tabel">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Klant</th>
                    <th>Plek</th>
                    <th>Soort werk</th>
                    <th>Uren</th>
                    <th>Status</th>
                    <th aria-label="PDF" />
                  </tr>
                </thead>
                <tbody>
                  {zichtbaar.map((d) => (
                    <tr key={d.id} className="rij-link" onClick={() => open(d)}>
                      <td data-label="Datum" className="kaart-kop">
                        <button type="button" className="btn-link" onClick={(e) => { e.stopPropagation(); open(d); }}>
                          {dagKort(d.datum)}, {d.nummer}
                        </button>
                      </td>
                      <td data-label="Klant">{d.klant.naam}</td>
                      <td data-label="Plek">{d.object?.name ?? '-'}</td>
                      <td data-label="Soort werk">
                        {soortWerkLabel(d.soortWerk) ?? '-'}
                        {d.referentie && <span className="dr-lijst-ref">{d.referentie}</span>}
                      </td>
                      <td data-label="Uren">{urenTekst(d.minuten, d.tijdsoort)}</td>
                      <td data-label="Status" className="kaart-status">
                        <WerkbonStatusBadge status={d.status} />
                        {d.vervolgNodig && <span className="badge badge-warning">Vervolg nodig</span>}
                      </td>
                      <td data-label="PDF" className="kaart-acties">
                        <a className="btn btn-sm" href={d.pdf} download onClick={(e) => e.stopPropagation()} aria-label={`PDF van ${d.nummer}`}>
                          <Icon name="file-pdf" size={16} />
                          PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {nieuw && <NieuwDagrapport onClose={() => setNieuw(false)} />}
    </AppShell>
  );
}
