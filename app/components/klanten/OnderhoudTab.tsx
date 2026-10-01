'use client';

// Tab Onderhoud in het klantdossier: de contracten van deze klant met hun
// terugkerende taken (status, volgende datum), en een nieuw contract maken.
// Dezelfde regels als de module Contracten (app/components/contracten).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, Laden } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import ContractFormulier from '@/app/components/contracten/ContractFormulier';
import TaakRegel from '@/app/components/contracten/TaakRegel';
import { looptijdTekst, type Contract } from '@/app/components/contracten/types';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { dagKort } from '@/lib/contracten';

export default function OnderhoudTab({ klant }: { klant: { id: number; naam: string } }) {
  const router = useRouter();
  const [contracten, setContracten] = useState<Contract[] | null>(null);
  const [fout, setFout] = useState('');
  const [nieuw, setNieuw] = useState(false);

  const laad = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracten?klantId=${klant.id}`);
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
  }, [klant.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laad();
  }, [laad]);

  return (
    <>
      {fout && <LaadFout melding={fout} onOpnieuw={laad} />}
      {contracten === null ? (
        fout ? null : <Laden regels={2} soort="lijst" />
      ) : (
        <>
          <div className="knoppenrij" style={{ marginBottom: '12px' }}>
            <button type="button" className="btn btn-sm" onClick={() => setNieuw(true)}>
              <Icon name="plus" size={16} />
              Nieuw contract
            </button>
          </div>
          {contracten.length === 0 ? (
            <div className="leeg">
              <Icon name="module-contracten" size={32} />
              <p style={{ margin: 0 }}>Nog geen contract met {klant.naam}. Leg vast wat er elke zoveel maanden moet gebeuren.</p>
            </div>
          ) : (
            contracten.map((c) => (
              <section key={c.id} className="card contract-kaart" aria-labelledby={`dossier-contract-${c.id}`}>
                <div className="contract-kaart-kop">
                  <div>
                    <h2 id={`dossier-contract-${c.id}`}>
                      <Link prefetch={false} href={`/dashboard/contracten/${c.id}`}>{c.naam}</Link>
                    </h2>
                    <p>{looptijdTekst(c, dagKort)}</p>
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
            ))
          )}
        </>
      )}
      {nieuw && (
        <ContractFormulier
          open
          contract={null}
          klanten={[klant]}
          vasteKlant={klant.id}
          onClose={() => setNieuw(false)}
          onOpgeslagen={(c) => {
            setNieuw(false);
            router.push(`/dashboard/contracten/${c.id}`);
          }}
        />
      )}
    </>
  );
}
