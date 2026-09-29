'use client';

// Eén contract: looptijd, interne notities en de terugkerende taken. Per taak
// Uitgevoerd (zet de volgende datum door, met Ongedaan maken) en Bewerken.
// Taken toevoegen en het contract bewerken of verwijderen alleen als beheerder.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { AppShell, Icon, Laden } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import OngedaanMelding, { type OngedaanInhoud } from '@/app/components/OngedaanMelding';
import ContractFormulier from '@/app/components/contracten/ContractFormulier';
import TaakFormulier, { type PlekKeuze } from '@/app/components/contracten/TaakFormulier';
import TaakRegel from '@/app/components/contracten/TaakRegel';
import UitgevoerdVenster from '@/app/components/contracten/UitgevoerdVenster';
import { bronTekst, looptijdTekst, type Contract, type Taak } from '@/app/components/contracten/types';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { dagKort } from '@/lib/contracten';
import { ROLE_ADMIN } from '@/lib/roles';

export default function ContractPagina() {
  const user = useGebruiker();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const isAdmin = user.role === ROLE_ADMIN;
  const [contract, setContract] = useState<Contract | null>(null);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [bewerken, setBewerken] = useState(false);
  const [taakVenster, setTaakVenster] = useState<{ taak: Taak | null } | null>(null);
  const [uitgevoerd, setUitgevoerd] = useState<Taak | null>(null);
  const [plekken, setPlekken] = useState<PlekKeuze>({ objecten: [], installaties: [] });
  const [ongedaan, setOngedaan] = useState<OngedaanInhoud | null>(null);
  const [verwijderd, setVerwijderd] = useState(false);

  const laad = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracten/${id}`);
      if (!res.ok) {
        setFout(await foutTekst(res, 'Het contract kon niet worden opgehaald.'));
        return;
      }
      setContract(await res.json());
      setFout('');
    } catch {
      setFout(GEEN_VERBINDING);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laad();
  }, [laad]);

  // Objecten en installaties van de klant, voor het taakformulier (alleen admin).
  const laadPlekken = useCallback(async (klantId: number) => {
    try {
      const [o, i] = await Promise.all([fetch('/api/sample-objects'), fetch(`/api/installaties?klantId=${klantId}`)]);
      const objecten: { id: number; name: string; klantId: number | null }[] = o.ok ? await o.json() : [];
      const installaties: PlekKeuze['installaties'] = i.ok ? await i.json() : [];
      setPlekken({ objecten: objecten.filter((x) => x.klantId === klantId), installaties });
    } catch {
      // Het formulier meldt dat er geen objecten zijn.
    }
  }, []);

  const openTaak = async (taak: Taak | null) => {
    if (!contract) return;
    await laadPlekken(contract.klantId);
    setTaakVenster({ taak });
  };

  const taakWeg = async (taak: Taak) => {
    try {
      const res = await fetch(`/api/contract-taken/${taak.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De taak is niet weggehaald.'));
        return;
      }
      setContract(await res.json());
      setTaakVenster(null);
      setOngedaan({
        sleutel: `taak-${taak.id}`,
        tekst: `${taak.titel} weggehaald`,
        onOngedaan: async () => {
          const terug = await fetch(`/api/contract-taken/${taak.id}/herstellen`, { method: 'POST' });
          if (!terug.ok) return false;
          setContract(await terug.json());
          return true;
        },
      });
    } catch {
      setFout(GEEN_VERBINDING);
    }
  };

  const terug = (
    <button type="button" className="btn-link terug-link" onClick={() => router.push('/dashboard/contracten')}>
      <Icon name="arrow-left" size={16} />
      Contracten
    </button>
  );

  return (
    <AppShell title="Contracten" wide user={user}>
      {terug}
      {fout && <LaadFout melding={fout} onOpnieuw={laad} />}
      {verwijderd ? (
        <div className="leeg">
          <Icon name="trash" size={32} />
          <p style={{ margin: '0 0 12px' }}>Dit contract is verwijderd.</p>
          <Link href="/dashboard/contracten" className="btn btn-sm">
            <Icon name="arrow-left" size={16} />
            Naar de contracten
          </Link>
        </div>
      ) : !contract ? (
        fout ? null : <Laden regels={3} soort="lijst" />
      ) : (
        <>
          <div className="beheer-kop">
            <div>
              <h1 className="page-title">{contract.naam}</h1>
              <p className="page-subtitle">
                <Link href={`/dashboard/klanten/${contract.klant.id}`}>{contract.klant.naam}</Link>, {looptijdTekst(contract, dagKort)}
              </p>
              {contract.notities && (
                <p className="contract-notitie">
                  <Icon name="comment" size={16} />
                  <span>{contract.notities}</span>
                </p>
              )}
            </div>
            {isAdmin && (
              <div className="knoppenrij beheer-knoppen">
                <button type="button" className="btn" onClick={() => setBewerken(true)}>
                  <Icon name="pencil" size={16} />
                  Bewerken
                </button>
                <button type="button" className="btn btn-primary" onClick={() => openTaak(null)}>
                  <Icon name="plus" size={16} />
                  Taak toevoegen
                </button>
              </div>
            )}
          </div>

          {melding && <div className="alert alert-success" role="status" style={{ marginBottom: '16px' }}>{melding}</div>}

          <section className="card contract-kaart" aria-labelledby="contract-taken-kop">
            <div className="contract-kaart-kop">
              <div>
                <h2 id="contract-taken-kop">Terugkerende taken</h2>
                <p>Rond je een inspectie van hetzelfde soort op het object af, of vink je de taak af op de planning, dan schuift de datum vanzelf door.</p>
              </div>
            </div>
            {contract.taken.length === 0 ? (
              <p className="contract-leeg">Nog geen taken. Voeg toe wat er elke zoveel maanden moet gebeuren.</p>
            ) : (
              <ul className="rijen">
                {contract.taken.map((t) => (
                  <TaakRegel
                    key={t.id}
                    taak={t}
                    kinderen={
                      <>
                        {t.notities && <span className="contract-notitie"><Icon name="comment" size={16} />{t.notities}</span>}
                        {t.uitvoeringen.length > 0 && (
                          <ul className="contract-geschiedenis" aria-label="Eerder uitgevoerd">
                            {t.uitvoeringen.map((u) => (
                              <li key={u.id}>
                                {dagKort(u.datum)}, {bronTekst(u.bron)}
                                {u.door ? `, ${u.door}` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    }
                    knoppen={
                      isAdmin && (
                        <>
                          <button type="button" className="btn btn-sm" onClick={() => setUitgevoerd(t)}>
                            <Icon name="check" size={16} />
                            Uitgevoerd
                          </button>
                          <button type="button" className="btn btn-sm" onClick={() => openTaak(t)} aria-label={`${t.titel} bewerken`}>
                            <Icon name="pencil" size={16} />
                            <span className="alleen-mobiel">Bewerken</span>
                          </button>
                        </>
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          {bewerken && (
            <ContractFormulier
              open
              key={`contract-${contract.id}`}
              contract={contract}
              klanten={[]}
              onClose={() => setBewerken(false)}
              onOpgeslagen={(c) => {
                setContract(c);
                setBewerken(false);
                setMelding('Het contract is opgeslagen.');
              }}
              onVerwijderd={(c) => {
                setBewerken(false);
                setOngedaan({
                  sleutel: `contract-${c.id}`,
                  tekst: `${c.naam} verwijderd`,
                  onOngedaan: async () => {
                    const r = await fetch(`/api/contracten/${c.id}/herstellen`, { method: 'POST' });
                    if (!r.ok) return false;
                    setContract(await r.json());
                    setVerwijderd(false);
                    return true;
                  },
                });
                setVerwijderd(true);
              }}
            />
          )}

          {taakVenster && (
            <TaakFormulier
              open
              key={`taak-${taakVenster.taak?.id ?? 'nieuw'}`}
              contract={contract}
              taak={taakVenster.taak}
              plekken={plekken}
              onClose={() => setTaakVenster(null)}
              onOpgeslagen={(c) => {
                setContract(c);
                setTaakVenster(null);
                setMelding(taakVenster.taak ? 'De taak is opgeslagen.' : 'De taak is toegevoegd.');
              }}
              onWeg={taakWeg}
            />
          )}

          <UitgevoerdVenster
            key={`uitgevoerd-${uitgevoerd?.id ?? 'geen'}`}
            taak={uitgevoerd}
            onClose={() => setUitgevoerd(null)}
            onKlaar={(c, taak, bron, volgendeOp) => {
              setContract(c);
              setUitgevoerd(null);
              setMelding('');
              setOngedaan({
                sleutel: bron,
                tekst: `${taak.titel} uitgevoerd, de volgende keer is ${dagKort(volgendeOp)}`,
                onOngedaan: async () => {
                  const r = await fetch(`/api/contract-taken/${taak.id}/uitgevoerd`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bron }),
                  });
                  if (!r.ok) return false;
                  setContract(await r.json());
                  return true;
                },
              });
            }}
          />
        </>
      )}
      <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />
    </AppShell>
  );
}
