'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
    products: 0,
    lowStock: 0,
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
      setUser(data);
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const [res2025, res2026, productsRes, ultimoRes] = await Promise.allSettled([
        fetch('/api/samples?year=2025'),
        fetch('/api/samples?year=2026'),
        fetch('/api/products'),
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
      if (productsRes.status === 'fulfilled' && productsRes.value.ok) {
        const data = await productsRes.value.json();
        setStats(prev => ({
          ...prev,
          products: data.length,
          lowStock: data.filter((p: any) => p.currentStock <= p.minStock).length,
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

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f7' }}>
        <p style={{ color: '#64748B', fontSize: '15px' }}>Laden...</p>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        .page {
          min-height: 100vh;
        }

        .content {
          max-width: 1100px;
          margin: 0 auto;
          padding: 40px 24px;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        .module-card {
          background: rgba(255, 255, 255, 0.65);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.55);
          border-radius: 18px;
          padding: 24px;
          cursor: pointer;
          transition: box-shadow 0.2s, transform 0.2s, background 0.2s;
          position: relative;
          overflow: hidden;
          box-shadow:
            0 10px 30px rgba(15, 23, 42, 0.08),
            0 2px 6px rgba(15, 23, 42, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.7);
        }

        .module-card:hover {
          background: rgba(255, 255, 255, 0.8);
          box-shadow:
            0 16px 40px rgba(15, 23, 42, 0.12),
            0 4px 10px rgba(15, 23, 42, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.8);
          transform: translateY(-3px);
        }

        .card-accent {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--accent-color);
          border-radius: 18px 18px 0 0;
        }

        .card-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 46px;
          height: 46px;
          margin-bottom: 16px;
          border-radius: 12px;
          color: var(--accent-color);
          background: color-mix(in srgb, var(--accent-color) 10%, transparent);
        }

        .card-title {
          font-size: 17px;
          font-weight: 600;
          color: #0C1B33;
          margin: 0 0 6px 0;
        }

        .card-description {
          font-size: 13px;
          color: #64748B;
          margin: 0 0 18px 0;
          line-height: 1.5;
        }

        .card-stats {
          display: flex;
          gap: 20px;
          padding-top: 16px;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
        }

        .stat-value {
          font-size: 22px;
          font-weight: 700;
          color: var(--accent-color);
          line-height: 1;
          margin-bottom: 3px;
        }

        .stat-label {
          font-size: 11px;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 500;
        }
      `}</style>

      <div className="page">
        {/* Toolbar */}
        <div className="toolbar">
          <div className="toolbar-inner">
            <div className="toolbar-left">
              <img src="/header_logo.png" alt="It's Done Services" style={{ height: '22px', objectFit: 'contain' }} />
              <div className="toolbar-divider" />
              <span className="toolbar-title">Registratie & Beheer Portal</span>
            </div>
            <div className="toolbar-right">
              {user && (
                <span className="user-badge">{user.username}</span>
              )}
              {user?.role === 'admin' && (
                <button onClick={() => router.push('/dashboard/admin')} className="nav-btn">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  Beheer
                </button>
              )}
              <button onClick={handleLogout} className="nav-btn nav-btn-danger">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Uitloggen
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="content">
          <h1 className="page-title">Welkom, {user?.username}</h1>
          <p className="page-subtitle">Selecteer een module om verder te gaan.</p>

          {/* Oliemonsters */}
          <div className="section-label">Oliemonsters</div>
          <div className="cards-grid">
            <div
              className="module-card"
              style={{ '--accent-color': '#1D4ED8' } as React.CSSProperties}
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
          </div>

          {/* Overig */}
          <div className="section-label">Overig</div>
          <div className="cards-grid">
            <div
              className="module-card"
              style={{ '--accent-color': '#0F766E' } as React.CSSProperties}
              onClick={() => router.push('/dashboard/voorraad')}
            >
              <div className="card-accent" />
              <span className="card-icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/><path d="m7.5 4.27 9 5.15"/></svg></span>
              <h2 className="card-title">Voorraadbeheer</h2>
              <p className="card-description">Beheer voorraad van filters, olie en andere producten</p>
              <div className="card-stats">
                <div className="stat-item">
                  <div className="stat-value">{stats.products}</div>
                  <div className="stat-label">Producten</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value" style={{ color: stats.lowStock > 0 ? '#DC2626' : '#16A34A' }}>
                    {stats.lowStock}
                  </div>
                  <div className="stat-label">Lage voorraad</div>
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
      </div>
    </>
  );
}
