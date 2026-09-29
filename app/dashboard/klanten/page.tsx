'use client';

// Klanten (alleen admin): de lijst, zoeken en een nieuwe klant toevoegen. Een
// tik op een klant opent het klantscherm met contactpersonen, objecten en
// installaties. Het uitgebreide klantdossier met tijdlijn komt in fase 3.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { AppShell, Icon, Laden } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import KlantFormulier from '@/app/components/klanten/KlantFormulier';
import { adresTekst, type KlantInLijst } from '@/app/components/klanten/types';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';

export default function KlantenPagina() {
  const user = useGebruiker();
  const router = useRouter();
  const [klanten, setKlanten] = useState<KlantInLijst[] | null>(null);
  const [fout, setFout] = useState('');
  const [zoek, setZoek] = useState('');
  const [nieuw, setNieuw] = useState(false);

  const laad = useCallback(async () => {
    try {
      const res = await fetch('/api/klanten');
      if (!res.ok) {
        setFout(await foutTekst(res, 'De klanten konden niet worden opgehaald.'));
        return;
      }
      setKlanten(await res.json());
      setFout('');
    } catch {
      setFout(GEEN_VERBINDING);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laad();
  }, [laad]);

  const term = zoek.trim().toLowerCase();
  const zichtbaar = (klanten ?? []).filter(
    (k) => !term || [k.naam, k.plaats, k.adres].some((w) => w?.toLowerCase().includes(term))
  );

  return (
    <AppShell title="Klanten" wide user={user}>
      <div className="beheer-kop">
        <div>
          <h1 className="page-title">Klanten</h1>
          <p className="page-subtitle">Klanten met hun contactpersonen, objecten en installaties.</p>
        </div>
        <div className="knoppenrij beheer-knoppen">
          <button type="button" className="btn" onClick={() => router.push('/dashboard/installaties')}>
            <Icon name="pump" size={16} />
            Installaties
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setNieuw(true)}>
            <Icon name="plus" size={16} />
            Nieuwe klant
          </button>
        </div>
      </div>

      {fout && <LaadFout melding={fout} onOpnieuw={laad} />}

      {klanten === null ? (
        fout ? null : <Laden regels={4} soort="lijst" />
      ) : (
        <>
          <div className="card" style={{ marginBottom: '16px' }}>
            <label className="zoekveld">
              <Icon name="search" />
              <input
                type="text"
                className="input"
                placeholder="Zoek op naam, adres of plaats..."
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                aria-label="Zoeken"
              />
            </label>
          </div>

          {zichtbaar.length === 0 ? (
            <div className="leeg">
              <Icon name="empty" size={32} />
              <p style={{ margin: '0 0 12px' }}>{term ? 'Geen klanten die aan je zoekopdracht voldoen.' : 'Nog geen klanten.'}</p>
              {!term && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setNieuw(true)}>
                  <Icon name="plus" size={16} />
                  Nieuwe klant
                </button>
              )}
            </div>
          ) : (
            <div className="table-container">
              <div className="table-scroll">
                <table className="table table-kaarten beheer-tabel">
                  <thead>
                    <tr>
                      <th>Klant</th>
                      <th>Adres</th>
                      <th>Contactpersonen</th>
                      <th>Objecten</th>
                      <th>Installaties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zichtbaar.map((k) => (
                      <tr key={k.id} className="rij-link" onClick={() => router.push(`/dashboard/klanten/${k.id}`)}>
                        <td data-label="Klant" className="kaart-kop">
                          <a
                            href={`/dashboard/klanten/${k.id}`}
                            className="beheer-naam"
                            onClick={(e) => {
                              e.preventDefault();
                              router.push(`/dashboard/klanten/${k.id}`);
                            }}
                          >
                            <Icon name="company" size={16} />
                            {k.naam}
                          </a>
                        </td>
                        <td data-label="Adres">{adresTekst(k) || '-'}</td>
                        <td data-label="Contactpersonen">{k.aantalContactpersonen}</td>
                        <td data-label="Objecten">{k.aantalObjecten}</td>
                        <td data-label="Installaties">{k.aantalInstallaties}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {nieuw && (
        <KlantFormulier
          open
          klant={null}
          onClose={() => setNieuw(false)}
          onOpgeslagen={(k) => {
            setNieuw(false);
            router.push(`/dashboard/klanten/${k.id}`);
          }}
        />
      )}
    </AppShell>
  );
}
