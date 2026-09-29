'use client';

// Installaties (alleen admin): alle pompen, aggregaten, compressoren en persen,
// te filteren op klant. Een tik opent de installatie.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { AppShell, Icon, Laden } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import InstallatieFormulier from '@/app/components/klanten/InstallatieFormulier';
import { typeTekst, type InstallatieKort, type KlantInLijst, type ObjectKeuze } from '@/app/components/klanten/types';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { installatieSoortIcoon, installatieSoortLabel } from '@/lib/installaties';

interface InstallatieInLijst extends InstallatieKort {
  aantalMonsters: number;
  object: { id: number; name: string; klant: { id: number; naam: string } | null };
}

export default function InstallatiesPagina() {
  const user = useGebruiker();
  const router = useRouter();
  const [lijst, setLijst] = useState<InstallatieInLijst[] | null>(null);
  const [klanten, setKlanten] = useState<KlantInLijst[]>([]);
  const [objecten, setObjecten] = useState<ObjectKeuze[]>([]);
  const [klantFilter, setKlantFilter] = useState('');
  const [zoek, setZoek] = useState('');
  const [fout, setFout] = useState('');
  const [nieuw, setNieuw] = useState(false);

  const laad = useCallback(async () => {
    try {
      const [res, kl, obj] = await Promise.all([
        fetch('/api/installaties'),
        fetch('/api/klanten'),
        fetch('/api/sample-objects'),
      ]);
      if (!res.ok) {
        setFout(await foutTekst(res, 'De installaties konden niet worden opgehaald.'));
        return;
      }
      setLijst(await res.json());
      if (kl.ok) setKlanten(await kl.json());
      if (obj.ok) setObjecten(await obj.json());
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
  const zichtbaar = (lijst ?? []).filter(
    (i) =>
      (!klantFilter || String(i.object.klant?.id ?? '') === klantFilter) &&
      (!term ||
        [i.naam, i.code, i.merk, i.typenummer, i.object.name].some((w) => w?.toLowerCase().includes(term)))
  );

  const open = (i: InstallatieInLijst) => router.push(`/dashboard/installaties/${i.id}`);

  return (
    <AppShell title="Installaties" wide user={user}>
      <div className="beheer-kop">
        <div>
          <h1 className="page-title">Installaties</h1>
          <p className="page-subtitle">Pompen, hydraulische aggregaten, compressoren en persen, per object en klant.</p>
        </div>
        <div className="knoppenrij beheer-knoppen">
          <button type="button" className="btn" onClick={() => router.push('/dashboard/klanten')}>
            <Icon name="company" size={16} />
            Klanten
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setNieuw(true)}>
            <Icon name="plus" size={16} />
            Nieuwe installatie
          </button>
        </div>
      </div>

      {fout && <LaadFout melding={fout} onOpnieuw={laad} />}

      {lijst === null ? (
        fout ? null : <Laden regels={4} soort="lijst" />
      ) : (
        <>
          <div className="card beheer-filters" style={{ marginBottom: '16px' }}>
            <label className="zoekveld">
              <Icon name="search" />
              <input
                type="text"
                className="input"
                placeholder="Zoek op naam, code, merk of object..."
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                aria-label="Zoeken"
              />
            </label>
            <div className="beheer-filter">
              <label className="label" htmlFor="filter-klant">Klant</label>
              <select id="filter-klant" className="select" value={klantFilter} onChange={(e) => setKlantFilter(e.target.value)}>
                <option value="">Alle klanten</option>
                {klanten.map((k) => (
                  <option key={k.id} value={String(k.id)}>{k.naam}</option>
                ))}
              </select>
            </div>
          </div>

          {zichtbaar.length === 0 ? (
            <div className="leeg">
              <Icon name="empty" size={32} />
              <p style={{ margin: '0 0 12px' }}>{term || klantFilter ? 'Geen installaties die aan dit filter voldoen.' : 'Nog geen installaties.'}</p>
              {!term && !klantFilter && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setNieuw(true)}>
                  <Icon name="plus" size={16} />
                  Nieuwe installatie
                </button>
              )}
            </div>
          ) : (
            <div className="table-container">
              <div className="table-scroll">
                <table className="table table-kaarten beheer-tabel">
                  <thead>
                    <tr>
                      <th>Installatie</th>
                      <th>Code</th>
                      <th>Soort</th>
                      <th>Merk en type</th>
                      <th>Object</th>
                      <th>Klant</th>
                      <th>Monsters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zichtbaar.map((i) => (
                      <tr key={i.id} className="rij-link" onClick={() => open(i)}>
                        <td data-label="Installatie" className="kaart-kop">
                          <a
                            href={`/dashboard/installaties/${i.id}`}
                            className="beheer-naam"
                            onClick={(e) => {
                              e.preventDefault();
                              open(i);
                            }}
                          >
                            <Icon name={installatieSoortIcoon(i.soort)} size={16} />
                            {i.naam}
                          </a>
                        </td>
                        <td data-label="Code"><span className="badge badge-gray code-badge">{i.code}</span></td>
                        <td data-label="Soort">{installatieSoortLabel(i.soort)}</td>
                        <td data-label="Merk en type">{typeTekst(i) || '-'}</td>
                        <td data-label="Object">{i.object.name}</td>
                        <td data-label="Klant">{i.object.klant?.naam ?? '-'}</td>
                        <td data-label="Monsters">{i.aantalMonsters}</td>
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
        <InstallatieFormulier
          open
          installatie={null}
          objecten={objecten}
          onClose={() => setNieuw(false)}
          onOpgeslagen={(i) => {
            setNieuw(false);
            router.push(`/dashboard/installaties/${i.id}`);
          }}
        />
      )}
    </AppShell>
  );
}
