'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Tooltip from '@/app/components/Tooltip';

interface User {
  userId: number;
  username: string;
  role: string;
  isLoggedIn: boolean;
}

interface ModuleCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  href: string;
  color: string;
  stats?: { label: string; value: number }[];
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    oilSamples: 0,
    oilSamplesTaken: 0,
    products: 0,
    lowStock: 0,
    contacts: 0,
  });
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadStats();
    }
  }, [user]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();

      if (!data.isLoggedIn) {
        router.push('/login');
        return;
      }

      if (data.requiresPasswordChange) {
        router.push('/set-password');
        return;
      }

      setUser(data);
    } catch (error) {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      // Laad oliemonster stats
      const samplesRes = await fetch('/api/samples');
      if (samplesRes.ok) {
        const samples = await samplesRes.json();
        setStats(prev => ({
          ...prev,
          oilSamples: samples.length,
          oilSamplesTaken: samples.filter((s: any) => s.isTaken && !s.isDisabled).length,
        }));
      }

      // Laad product stats (silently fail als API nog niet bestaat)
      try {
        const productsRes = await fetch('/api/products');
        if (productsRes.ok) {
          const products = await productsRes.json();
          setStats(prev => ({
            ...prev,
            products: products.length,
            lowStock: products.filter((p: any) => p.currentStock <= p.minStock).length,
          }));
        }
      } catch {}

      // Laad contact stats (silently fail als API nog niet bestaat)
      try {
        const contactsRes = await fetch('/api/contacts');
        if (contactsRes.ok) {
          const contacts = await contactsRes.json();
          setStats(prev => ({
            ...prev,
            contacts: contacts.length,
          }));
        }
      } catch {}
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const modules: ModuleCard[] = [
    {
      id: 'oliemonsters',
      title: 'Oliemonsters',
      description: 'Beheer oliemonster analyses en registraties',
      icon: '🛢️',
      href: '/dashboard/oliemonsters',
      color: '#8b5cf6',
      stats: [
        { label: 'Totaal', value: stats.oilSamples },
        { label: 'Genomen', value: stats.oilSamplesTaken },
      ],
    },
    {
      id: 'voorraad',
      title: 'Voorraadbeheer',
      description: 'Beheer voorraad van filters, olie en andere producten',
      icon: '📦',
      href: '/dashboard/voorraad',
      color: '#10b981',
      stats: [
        { label: 'Producten', value: stats.products },
        { label: 'Lage voorraad', value: stats.lowStock },
      ],
    },
    {
      id: 'contacten',
      title: 'Contacten',
      description: 'Klantgegevens en aantekeningen beheren',
      icon: '👥',
      href: '/dashboard/contacten',
      color: '#3b82f6',
      stats: [
        { label: 'Contacten', value: stats.contacts },
      ],
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--foreground)' }}>Laden...</p>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        .dashboard-container {
          min-height: 100vh;
          color: var(--foreground);
        }

        .dashboard-header {
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
        }

        .module-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .module-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
          border-color: rgba(255, 255, 255, 0.3);
        }

        .module-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: var(--card-accent);
        }

        .module-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .module-title {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          color: white;
        }

        .module-description {
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 1.5rem;
        }

        .module-stats {
          display: flex;
          gap: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .stat-item {
          text-align: center;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: white;
        }

        .stat-label {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.6);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      `}</style>

      <div className="dashboard-container">
        {/* Header */}
        <div className="dashboard-header">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <img src="/header_logo.png" alt="It's Done Services" className="h-12 mb-2 object-contain" />
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Registratie & Beheer Portal
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Welkom, {user?.username} ({user?.role})
                </p>
              </div>
              {/* Menu controls */}
              <div className="flex gap-3 flex-shrink-0">
                {user?.role === 'admin' && (
                  <Tooltip text="Instellingen">
                    <button
                      onClick={() => router.push('/dashboard/admin')}
                      className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95"
                      style={{
                        backgroundColor: 'var(--accent)',
                        border: '1px solid var(--accent)',
                      }}
                      aria-label="Instellingen"
                    >
                      <img 
                        src="/icon_settings.png" 
                        alt="Instellingen" 
                        className="w-5 h-5" 
                        style={{ 
                          filter: 'brightness(0) invert(1)'
                        }}
                      />
                    </button>
                  </Tooltip>
                )}
                <Tooltip text="Log uit">
                  <button
                    onClick={handleLogout}
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95"
                    style={{
                      backgroundColor: 'var(--accent)',
                      border: '1px solid var(--accent)',
                    }}
                    aria-label="Uitloggen"
                  >
                    <span className="text-xl" style={{ color: 'var(--background)', lineHeight: 1 }}>→</span>
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold mb-6" style={{ color: 'white' }}>
            Kies een module
          </h1>

          {/* Module Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((module) => (
              <div
                key={module.id}
                className="module-card"
                style={{ '--card-accent': module.color } as React.CSSProperties}
                onClick={() => router.push(module.href)}
              >
                <div className="module-icon">{module.icon}</div>
                <h2 className="module-title">{module.title}</h2>
                <p className="module-description">{module.description}</p>
                
                {module.stats && module.stats.length > 0 && (
                  <div className="module-stats">
                    {module.stats.map((stat, index) => (
                      <div key={index} className="stat-item">
                        <div className="stat-value" style={{ color: module.color }}>
                          {stat.value}
                        </div>
                        <div className="stat-label">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
