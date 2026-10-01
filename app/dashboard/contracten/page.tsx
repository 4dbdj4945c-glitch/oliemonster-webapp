'use client';

// Contracten (sectie Klanten): per klant de contracten met hun terugkerende
// taken, gefilterd op wat aandacht vraagt. Een contract opent de detailpagina
// (/dashboard/contracten/[id]); nieuw contract alleen voor de beheerder.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { AppShell, Icon, Laden } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import ContractFormulier from '@/app/components/contracten/ContractFormulier';
import TaakRegel from '@/app/components/contracten/TaakRegel';
import { looptijdTekst, type Contract, type Taak } from '@/app/components/contracten/types';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { dagKort, vraagtAandacht, type TaakStatus } from '@/lib/contracten';
import { ROLE_ADMIN } from '@/lib/roles';

type Filter = 'alles' | 'aandacht' | TaakStatus;
const FILTERS: { sleutel: Filter; naam: string }[] = [
  { sleutel: 'alles', naam: 'Alles' },
  { sleutel: 'aandacht', naam: 'Vraagt aandacht' },
  { sleutel: 'gepland', naam: 'Gepland' },
  { sleutel: 'later', naam: 'Op schema' },
];

function past(t: Taak, f: Filter): boolean {
  if (f === 'alles') return true;
  if (f === 'aandacht') return vraagtAandacht(t.status);
  return t.status === f;
}

export default function ContractenPagina() {
  const user = useGebruiker();
  const router = useRouter();
  const isAdmin = user.role === ROLE_ADMIN;
  const [contracten, setContracten] = useState<Contract[] | null>(null);
  const [fout, setFout] = useState('');
  const [filter, setFilter] = useState<Filter>('alles');
  const [nieuw, setNieuw] = useState(false);
  const [klanten, setKlanten] = useState<{ id: number; naam: string }[]>([]);

  const laad = useCallback(async () => {
    try {
      const res = await fetch('/api/contracten');
      if (!res.ok) {
        setFout(await foutTekst(res, 'De contracten konden niet worden opgehaald.'));
        return;
      }
      const data: Contract[] = await res.json();
      setContracten(data);
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
      const res = await fetch('/api/klanten');
      if (res.ok) setKlanten(await res.json());
    } catch {
      // Het formulier toont dan een lege keuze.
    }
  };

  const alleTaken = (contracten ?? []).flatMap((c) => c.taken);
  const aantal = (f: Filter) => alleTaken.filter((t) => past(t, f)).length;
  const zichtbaar = (contracten ?? [])
    .map((c) => ({ ...c, taken: c.taken.filter((t) => past(t, filter)) }))
    .filter((c) => filter === 'alles' || c.taken.length > 0);

  return (
    <AppShell title="Contracten" wide user={user}>
      <div className="beheer-kop">
        <div>
          <h1 className="page-title">Contracten</h1>
          <p className="page-subtitle">Terugkerende taken per klant. Wat verlopen is of binnen 30 dagen moet, staat ook op Vandaag.</p>
        </div>
        {isAdmin && (
          <div className="knoppenrij beheer-knoppen">
            <button type="button" className="btn btn-primary" onClick={openNieuw}>
              <Icon name="plus" size={16} />
              Nieuw contract
            </button>
          </div>
        )}
      </div>

      {fout && <LaadFout melding={fout} onOpnieuw={laad} />}

      {contracten === null ? (
        fout ? null : <Laden regels={3} soort="lijst" />
      ) : contracten.length === 0 ? (
        <div className="leeg">
          <Icon name="module-contracten" size={32} />
          <p style={{ margin: '0 0 12px' }}>Nog geen contracten. Leg per klant vast wat er elke zoveel maanden moet gebeuren.</p>
          {isAdmin && (
            <button type="button" className="btn btn-sm" onClick={openNieuw}>
              <Icon name="plus" size={16} />
              Nieuw contract
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="dossier-chips contract-filters" role="group" aria-label="Filter op status" style={{ marginBottom: '16px' }}>
            {FILTERS.map((f) => (
              <button key={f.sleutel} type="button" className={`dossier-chip${filter === f.sleutel ? ' on' : ''}`} aria-pressed={filter === f.sleutel} onClick={() => setFilter(f.sleutel)}>
                {f.naam} <span className="dossier-chip-aantal">{aantal(f.sleutel)}</span>
              </button>
            ))}
          </div>

          {zichtbaar.length === 0 && <div className="card contract-leeg">Geen taken die aan dit filter voldoen.</div>}

          {zichtbaar.map((c) => (
            <section key={c.id} className="card contract-kaart" aria-labelledby={`contract-${c.id}`}>
              <div className="contract-kaart-kop">
                <div>
                  <h2 id={`contract-${c.id}`}>
                    <Link prefetch={false} href={`/dashboard/contracten/${c.id}`}>{c.naam}</Link>
                  </h2>
                  <p>{c.klant.naam}, {looptijdTekst(c, dagKort)}</p>
                </div>
                <button type="button" className="btn btn-sm" onClick={() => router.push(`/dashboard/contracten/${c.id}`)}>
                  <Icon name="pencil" size={16} />
                  Openen
                </button>
              </div>
              {c.taken.length === 0 ? (
                <p className="contract-leeg">Nog geen taken in dit contract.</p>
              ) : (
                <ul className="rijen">
                  {c.taken.map((t) => (
                    <TaakRegel key={t.id} taak={t} />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}

      {nieuw && (
        <ContractFormulier
          open
          contract={null}
          klanten={klanten}
          onClose={() => setNieuw(false)}
          onOpgeslagen={(c) => {
            setNieuw(false);
            router.push(`/dashboard/contracten/${c.id}`);
          }}
        />
      )}
    </AppShell>
  );
}
