'use client';

// Het startscherm /dashboard.
//
// Beheerder en gebruiker: Vandaag (app/components/vandaag/Vandaag.tsx), met de
// monsterdag, openstaande monsters, acties en de voortgang. De modules staan in
// de navigatie.
//
// Kijker (rol alleen lezen): het oude dashboard hieronder, ongewijzigd, met per
// analysejaar een tegel. Een kijker met een vast jaar komt hier niet (die gaat
// meteen naar zijn jaarpagina); een kijker zonder vast jaar ziet alleen de
// oliemonsters. Zijn klantportaal komt in een volgende fase.

import { useState, useEffect } from 'react';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { useRouter } from 'next/navigation';
import { isAlleenLezen } from '@/lib/roles';
import { actieStaatOpen, eindeVanVandaag } from '@/lib/prospects';
import { modulesVoor, oliemonsterPad, SECTIES, type ModuleInfo } from '@/lib/modules';
import LaadFout from '@/app/components/LaadFout';
import { GEEN_VERBINDING } from '@/lib/foutmelding';
import { AppShell, Icon } from '@/app/components/ui';
import Vandaag from '@/app/components/vandaag/Vandaag';

interface Stat {
  waarde: number;
  label: string;
}

interface Tegel {
  sleutel: string;
  module: ModuleInfo;
  titel: string;
  beschrijving: string;
  href: string;
}

// Het aantal sjablonen in Mail opstellen (public/email-editor.html).
const MAIL_SJABLONEN = 6;

async function lijst(url: string): Promise<unknown[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export default function DashboardPage() {
  const user = useGebruiker();
  return isAlleenLezen(user.role) ? <KijkerDashboard /> : <Vandaag />;
}

function KijkerDashboard() {
  const user = useGebruiker();
  const router = useRouter();
  const alleenLezen = isAlleenLezen(user.role);
  const modules = modulesVoor(user.role).filter((m) => m.tegel);

  // Per tegel de getallen; ontbreekt een tegel hier, dan staat er geen getal
  // (een 0 zou betekenen dat er niets is, terwijl we het niet weten).
  const [stats, setStats] = useState<Record<string, Stat[]>>({ mail: [{ waarde: MAIL_SJABLONEN, label: 'Sjablonen' }] });
  const [jaren, setJaren] = useState<{ jaar: number; totaal: number; genomen: number }[] | null>(null);
  const [foutmelding, setFoutmelding] = useState('');

  const heeft = (sleutel: string) => modules.some((m) => m.sleutel === sleutel);

  const loadStats = async () => {
    const mislukt: string[] = [];
    const nieuw: Record<string, Stat[]> = { mail: [{ waarde: MAIL_SJABLONEN, label: 'Sjablonen' }] };
    // Alleen ophalen wat deze gebruiker mag zien: een andere route geeft hem een 403.
    const taken: Promise<void>[] = [];
    const tel = (sleutel: string, naam: string, url: string, maak: (data: unknown[]) => Stat[]) => {
      if (!heeft(sleutel)) return;
      taken.push(
        lijst(url)
          .then((data) => {
            nieuw[sleutel] = maak(data);
          })
          .catch(() => {
            mislukt.push(naam);
          })
      );
    };

    if (heeft('oliemonsters')) {
      taken.push(
        fetch('/api/samples/jaren')
          .then(async (res) => {
            if (!res.ok) throw new Error('jaren');
            const data: { jaren: { jaar: number; totaal: number; genomen: number }[] } = await res.json();
            // Altijd ook het huidige jaar, ook als daar nog niets in staat.
            const nu = new Date().getFullYear();
            const rijen = data.jaren.some((j) => j.jaar === nu)
              ? data.jaren
              : [...data.jaren, { jaar: nu, totaal: 0, genomen: 0 }];
            setJaren(rijen.sort((a, b) => a.jaar - b.jaar));
          })
          .catch(() => {
            mislukt.push('Oliemonsters');
          })
      );
    }
    tel('controlerondes', 'Controlerondes', '/api/control-rounds', (d) => [{ waarde: d.length, label: 'Rondes' }]);
    tel('ultimo', 'Ultimo-opmerkingen', '/api/ultimo-tasks', (d) => [{ waarde: d.length, label: 'Taken' }]);
    tel('klanten', 'Klanten', '/api/klanten', (d) => [{ waarde: d.length, label: 'Klanten' }]);
    tel('installaties', 'Installaties', '/api/installaties', (d) => [{ waarde: d.length, label: 'Installaties' }]);
    tel('acquisitie', 'Acquisitie', '/api/prospects', (d) => {
      const grens = eindeVanVandaag();
      return [
        { waarde: d.length, label: 'Prospects' },
        { waarde: d.filter((p) => actieStaatOpen(p as Parameters<typeof actieStaatOpen>[0], grens)).length, label: 'Open acties' },
      ];
    });

    try {
      await Promise.all(taken);
    } catch {
      setFoutmelding(GEEN_VERBINDING);
      return;
    }
    setStats(nieuw);
    setFoutmelding(
      mislukt.length === 0
        ? ''
        : `Deze tellingen konden niet worden opgehaald: ${mislukt.join(', ')}. Bij die modules staat daarom geen getal.`
    );
  };

  useEffect(() => {
    // Tellingen ophalen bij het openen; de state verandert pas na de fetch.
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // De tegels per sectie. De oliemonsters: één tegel per jaar.
  const tegelsVan = (m: ModuleInfo): Tegel[] => {
    if (!m.perJaar) {
      return [{ sleutel: m.sleutel, module: m, titel: m.naam, beschrijving: m.beschrijving, href: m.route }];
    }
    const lijstJaren = jaren?.map((j) => j.jaar) ?? [new Date().getFullYear()];
    return lijstJaren.map((jaar) => ({
      sleutel: `${m.sleutel}-${jaar}`,
      module: m,
      titel: `${m.naam} ${jaar}`,
      beschrijving: `Overzicht en beheer van oliemonsteranalyses ${jaar}`,
      href: oliemonsterPad(jaar),
    }));
  };

  const statsVan = (t: Tegel): Stat[] | undefined => {
    if (t.module.perJaar) {
      if (!jaren) return undefined;
      const j = jaren.find((x) => `${t.module.sleutel}-${x.jaar}` === t.sleutel);
      return j ? [{ waarde: j.totaal, label: 'Totaal' }, { waarde: j.genomen, label: 'Genomen' }] : undefined;
    }
    return stats[t.sleutel];
  };

  const open = (t: Tegel) => {
    if (t.module.extern) window.open(t.href, '_blank', 'noopener');
    else router.push(t.href);
  };

  return (
    <>
      <style jsx>{`
        /* Sectiekop per sectie uit het moduleregister (Werk, Klanten, ...) */
        .sectie-kop {
          margin: 0 0 14px 0;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--grijs-200);
        }
        .sectie-kop :global(.section-label) {
          margin: 0;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        /* Module-kaart: vlakke witte kaart met navy accentlijn bovenin (geen losse modulekleuren) */
        .module-card {
          background: var(--wit);
          border: 1px solid var(--grijs-200);
          border-radius: var(--radius);
          padding: 24px;
          cursor: pointer;
          transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
          position: relative;
          overflow: hidden;
          box-shadow: var(--shadow-sm);
        }

        .module-card:hover {
          border-color: var(--grijs-300);
          box-shadow: var(--shadow-md);
          transform: translateY(-2px);
        }

        .card-accent {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--navy);
        }

        .card-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 46px;
          height: 46px;
          margin-bottom: 16px;
          border-radius: var(--radius-md);
          color: var(--navy);
          background: var(--grijs-100);
        }

        .card-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--navy);
          margin: 0 0 6px 0;
          letter-spacing: -0.01em;
        }

        .card-description {
          font-size: 13px;
          color: var(--grijs-500);
          margin: 0 0 18px 0;
          line-height: 1.5;
        }

        .card-stats {
          display: flex;
          gap: 24px;
          padding-top: 16px;
          border-top: 1px solid var(--grijs-200);
        }

        /* Statistiek in navy; modules herken je aan het icoon, niet aan een kleur. .stat-label komt uit globals.css */
        .stat-value {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--navy);
          line-height: 1.1;
        }

        /* Telefoon: compacte kaarten, icoon naast de titel, zodat er meer op een scherm past */
        @media (max-width: 640px) {
          .cards-grid {
            grid-template-columns: 1fr;
            gap: 12px;
            margin-bottom: 24px;
          }
          .module-card {
            display: grid;
            grid-template-columns: 42px 1fr;
            column-gap: 12px;
            align-items: center;
            padding: 16px;
          }
          .module-card:hover {
            transform: none;
          }
          .card-icon {
            width: 38px;
            height: 38px;
            margin: 0;
            grid-column: 1;
            grid-row: 1;
          }
          .card-title {
            grid-column: 2;
            grid-row: 1;
            margin: 0;
            font-size: 15px;
          }
          .card-description {
            grid-column: 1 / -1;
            margin: 10px 0 0;
            font-size: 13px;
          }
          .card-stats {
            grid-column: 1 / -1;
            gap: 20px;
            margin-top: 12px;
            padding-top: 12px;
          }
          .stat-value {
            font-size: 20px;
          }
        }
      `}</style>
      <AppShell user={user}>
        <div>
          <h1 className="page-title">Welkom, {user.username}</h1>
          <p className="page-subtitle">
            {alleenLezen
              ? 'Kies het jaar waarvan je de oliemonsters wilt bekijken.'
              : 'Selecteer een module om verder te gaan.'}
          </p>

          {foutmelding && <LaadFout melding={foutmelding} onOpnieuw={loadStats} />}

          {SECTIES.map((sectie) => {
            const tegels = modules.filter((m) => m.sectie === sectie).flatMap(tegelsVan);
            if (tegels.length === 0) return null;
            return (
              <section key={sectie} aria-label={sectie}>
                {/* Een kijker ziet alleen de oliemonsters: dan geen sectiekop */}
                {!alleenLezen && (
                  <div className="sectie-kop">
                    <h2 className="section-label">{sectie}</h2>
                  </div>
                )}
                <div className="cards-grid">
                  {tegels.map((t) => {
                    const getallen = statsVan(t);
                    return (
                      <div
                        key={t.sleutel}
                        className="module-card"
                        role="link"
                        tabIndex={0}
                        onClick={() => open(t)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') open(t);
                        }}
                      >
                        <div className="card-accent" />
                        <span className="card-icon"><Icon name={t.module.icoon} size={24} /></span>
                        <h2 className="card-title">{t.titel}</h2>
                        <p className="card-description">{t.beschrijving}</p>
                        {getallen && (
                          <div className="card-stats">
                            {getallen.map((g) => (
                              <div key={g.label} className="stat-item">
                                <div className="stat-value">{g.waarde}</div>
                                <div className="stat-label">{g.label}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </AppShell>
    </>
  );
}
