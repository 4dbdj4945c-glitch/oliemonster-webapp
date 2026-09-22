'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isOilViewer2025 } from '@/lib/roles';
import { actieStaatOpen, eindeVanVandaag } from '@/lib/prospects';
import { AppShell, Icon } from '@/app/components/ui';

interface User {
  userId: number;
  username: string;
  role: string;
  isLoggedIn: boolean;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    oilSamples2025: 0,
    oilSamplesTaken2025: 0,
    oilSamples2026: 0,
    oilSamplesTaken2026: 0,
    controlRounds: 0,
    ultimoTasks: 0,
    prospects: 0,
    prospectActies: 0,
  });
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) loadStats();
  }, [user]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();
      if (!data.isLoggedIn) { router.push('/login'); return; }
      if (data.requiresPasswordChange) { router.push('/set-password'); return; }
      // Beperkte kijker: alleen Oliemonsters 2025, stuur direct daarheen.
      if (isOilViewer2025(data.role)) { router.replace('/dashboard/oliemonsters'); return; }
      setUser(data);
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const [res2025, res2026, roundsRes, ultimoRes, prospectsRes] = await Promise.allSettled([
        fetch('/api/samples?year=2025'),
        fetch('/api/samples?year=2026'),
        fetch('/api/control-rounds'),
        fetch('/api/ultimo-tasks'),
        fetch('/api/prospects'),
      ]);

      if (res2025.status === 'fulfilled' && res2025.value.ok) {
        const data = await res2025.value.json();
        setStats(prev => ({
          ...prev,
          oilSamples2025: data.length,
          oilSamplesTaken2025: data.filter((s: any) => s.isTaken && !s.isDisabled).length,
        }));
      }
      if (res2026.status === 'fulfilled' && res2026.value.ok) {
        const data = await res2026.value.json();
        setStats(prev => ({
          ...prev,
          oilSamples2026: data.length,
          oilSamplesTaken2026: data.filter((s: any) => s.isTaken && !s.isDisabled).length,
        }));
      }
      if (roundsRes.status === 'fulfilled' && roundsRes.value.ok) {
        const data = await roundsRes.value.json();
        setStats(prev => ({
          ...prev,
          controlRounds: data.length,
        }));
      }
      if (ultimoRes.status === 'fulfilled' && ultimoRes.value.ok) {
        const data = await ultimoRes.value.json();
        setStats(prev => ({
          ...prev,
          ultimoTasks: data.length,
        }));
      }
      // Acquisitie: aantal prospects en hoeveel acties er open staan (vandaag of eerder)
      if (prospectsRes.status === 'fulfilled' && prospectsRes.value.ok) {
        const data = await prospectsRes.value.json();
        const grens = eindeVanVandaag();
        setStats(prev => ({
          ...prev,
          prospects: data.length,
          prospectActies: data.filter((p: any) => actieStaatOpen(p, grens)).length,
        }));
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  if (loading) {
    return (
      <div className="laadscherm">
        <p>Laden...</p>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        /* Sectiekop met het logo van de eigenaar van de modules */
        .sectie-kop {
          display: flex;
          align-items: center;
          margin: 0 0 14px 0;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--grijs-200);
        }
        /* Gedempt: grijs en iets transparant, zodat de kaarten de aandacht houden */
        .sectie-logo { display: block; width: auto; filter: grayscale(1); opacity: 0.4; }
        .sectie-logo-ids { height: 18px; }
        .sectie-logo-mourik { height: 26px; }

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
        {/* Content */}
        <div>
          <h1 className="page-title">Welkom, {user?.username}</h1>
          <p className="page-subtitle">Selecteer een module om verder te gaan.</p>

          {/* Sectie It's Done Services: eigen modules */}
          <div className="sectie-kop">
            <img src="/logo-navy.png" alt="It's Done Services" className="sectie-logo sectie-logo-ids" />
          </div>
          <div className="cards-grid">
            <div
              className="module-card"
              onClick={() => router.push('/dashboard/controlerondes')}
            >
              <div className="card-accent" />
              <span className="card-icon"><Icon name="module-rounds" size={24} /></span>
              <h2 className="card-title">Controlerondes</h2>
              <p className="card-description">Plan en rijd controlerondes langs geselecteerde straten met live route en voortgang</p>
              <div className="card-stats">
                <div className="stat-item">
                  <div className="stat-value">{stats.controlRounds}</div>
                  <div className="stat-label">Rondes</div>
                </div>
              </div>
            </div>
            <div
              className="module-card"
              onClick={() => router.push('/dashboard/acquisitie')}
            >
              <div className="card-accent" />
              <span className="card-icon"><Icon name="module-acquisitie" size={24} /></span>
              <h2 className="card-title">Acquisitie</h2>
              <p className="card-description">Prospects, pijplijn en contactmomenten voor nieuwe vaste klanten</p>
              <div className="card-stats">
                <div className="stat-item">
                  <div className="stat-value">{stats.prospects}</div>
                  <div className="stat-label">Prospects</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{stats.prospectActies}</div>
                  <div className="stat-label">Open acties</div>
                </div>
              </div>
            </div>
            <div
              className="module-card"
              onClick={() => router.push('/dashboard/print-calculator')}
            >
              <div className="card-accent" />
              <span className="card-icon"><Icon name="module-print-calc" size={24} /></span>
              <h2 className="card-title">Printkosten calculator</h2>
              <p className="card-description">Kostprijs en adviesverkoopprijs per bedrukt item (UV-printer) berekenen</p>
              <div className="card-stats">
                <div className="stat-item">
                  <div className="stat-value">€</div>
                  <div className="stat-label">Kostprijs per stuk</div>
                </div>
              </div>
            </div>
            {/* E-mail editor: losstaand HTML-bestand in public/, opent in een nieuw tabblad.
                Bron en uitleg: Documents/Claude/email-templates/ (sync-webapp.sh kopieert 'm hierheen). */}
            <div
              className="module-card"
              onClick={() => window.open('/email-editor.html', '_blank', 'noopener')}
            >
              <div className="card-accent" />
              <span className="card-icon"><Icon name="module-email" size={24} /></span>
              <h2 className="card-title">E-mail opstellen</h2>
              <p className="card-description">Opgemaakte mails in huisstijl samenstellen vanuit sjablonen en plakken in Apple Mail</p>
              <div className="card-stats">
                <div className="stat-item">
                  <div className="stat-value">6</div>
                  <div className="stat-label">Sjablonen</div>
                </div>
              </div>
            </div>
          </div>

          {/* Sectie Mourik: modules voor de opdrachtgever */}
          <div className="sectie-kop">
            <img src="/mourik_logo.png" alt="Mourik" className="sectie-logo sectie-logo-mourik" />
          </div>
          <div className="cards-grid">
            <div
              className="module-card"
              onClick={() => router.push('/dashboard/oliemonsters')}
            >
              <div className="card-accent" />
              <span className="card-icon"><Icon name="oil-sample" size={24} /></span>
              <h2 className="card-title">Oliemonsters 2025</h2>
              <p className="card-description">Overzicht en beheer van oliemonsteranalyses 2025</p>
              <div className="card-stats">
                <div className="stat-item">
                  <div className="stat-value">{stats.oilSamples2025}</div>
                  <div className="stat-label">Totaal</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{stats.oilSamplesTaken2025}</div>
                  <div className="stat-label">Genomen</div>
                </div>
              </div>
            </div>
            <div
              className="module-card"
              onClick={() => router.push('/dashboard/oliemonsters2026')}
            >
              <div className="card-accent" />
              <span className="card-icon"><Icon name="oil-sample" size={24} /></span>
              <h2 className="card-title">Oliemonsters 2026</h2>
              <p className="card-description">Overzicht en beheer van oliemonsteranalyses 2026</p>
              <div className="card-stats">
                <div className="stat-item">
                  <div className="stat-value">{stats.oilSamples2026}</div>
                  <div className="stat-label">Totaal</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{stats.oilSamplesTaken2026}</div>
                  <div className="stat-label">Genomen</div>
                </div>
              </div>
            </div>
            <div
              className="module-card"
              onClick={() => router.push('/dashboard/ultimo')}
            >
              <div className="card-accent" />
              <span className="card-icon"><Icon name="module-ultimo" size={24} /></span>
              <h2 className="card-title">Ultimo-opmerkingen</h2>
              <p className="card-description">Opmerkingen per onderhoudstaak (looprouteregel) bijhouden en exact terugvinden</p>
              <div className="card-stats">
                <div className="stat-item">
                  <div className="stat-value">{stats.ultimoTasks}</div>
                  <div className="stat-label">Taken</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </>
  );
}
