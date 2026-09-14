'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isOilViewer2025 } from '@/lib/roles';
import { AppShell } from '@/app/components/ui';

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
      const [res2025, res2026, roundsRes, ultimoRes] = await Promise.allSettled([
        fetch('/api/samples?year=2025'),
        fetch('/api/samples?year=2026'),
        fetch('/api/control-rounds'),
        fetch('/api/ultimo-tasks'),
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

        /* Module-kaart: vlakke witte kaart met accentlijn bovenin */
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
          background: var(--accent-color);
        }

        .card-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 46px;
          height: 46px;
          margin-bottom: 16px;
          border-radius: var(--radius-md);
          color: var(--accent-color);
          background: color-mix(in srgb, var(--accent-color) 10%, transparent);
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

        /* Statistiek in de accentkleur van de kaart; .stat-label komt uit globals.css */
        .stat-value {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--accent-color);
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
          .card-icon svg {
            width: 22px;
            height: 22px;
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
              style={{ '--accent-color': '#0F766E' } as React.CSSProperties}
              onClick={() => router.push('/dashboard/controlerondes')}
            >
              <div className="card-accent" />
              <span className="card-icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7"/></svg></span>
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
              style={{ '--accent-color': 'var(--geel-tekst)' } as React.CSSProperties}
              onClick={() => router.push('/dashboard/print-calculator')}
            >
              <div className="card-accent" />
              <span className="card-icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg></span>
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
              style={{ '--accent-color': '#C2410C' } as React.CSSProperties}
              onClick={() => window.open('/email-editor.html', '_blank', 'noopener')}
            >
              <div className="card-accent" />
              <span className="card-icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span>
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
              style={{ '--accent-color': 'var(--blue)' } as React.CSSProperties}
              onClick={() => router.push('/dashboard/oliemonsters')}
            >
              <div className="card-accent" />
              <span className="card-icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/><path d="M6.453 15h11.094"/><path d="M8.5 2h7"/></svg></span>
              <h2 className="card-title">Oliemonsters 2025</h2>
              <p className="card-description">Overzicht en beheer van oliemonster analyses 2025</p>
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
              style={{ '--accent-color': '#1E40AF' } as React.CSSProperties}
              onClick={() => router.push('/dashboard/oliemonsters2026')}
            >
              <div className="card-accent" />
              <span className="card-icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/><path d="M6.453 15h11.094"/><path d="M8.5 2h7"/></svg></span>
              <h2 className="card-title">Oliemonsters 2026</h2>
              <p className="card-description">Overzicht en beheer van oliemonster analyses 2026</p>
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
              style={{ '--accent-color': '#4338CA' } as React.CSSProperties}
              onClick={() => router.push('/dashboard/ultimo')}
            >
              <div className="card-accent" />
              <span className="card-icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg></span>
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
