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

interface Product {
  id: number;
  brand: string;
  type: string;
  articleNumber: string | null;
  category: string;
  location: string;
  unit: string;
  minStock: number;
  description: string | null;
  currentStock: number;
  isLowStock: boolean;
}

interface StockMovement {
  id: number;
  productId: number;
  type: 'IN' | 'OUT';
  quantity: number;
  location: string;
  reason: string | null;
  username: string | null;
  createdAt: string;
  product: { brand: string; type: string; unit: string };
}

const CATEGORIES = ['Filters', 'Olie', 'Vetten', 'Overig'];

export default function VoorraadPage() {
  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'products' | 'movements'>('products');
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [newLocationInput, setNewLocationInput] = useState('');
  const router = useRouter();

  // Product form state
  const [productForm, setProductForm] = useState({
    brand: '',
    type: '',
    articleNumber: '',
    category: 'Filters',
    location: 'Hoofdmagazijn',
    unit: 'stuks',
    minStock: 0,
    initialStock: 0,
    description: '',
  });

  // Stock movement form state
  const [stockForm, setStockForm] = useState({
    productId: 0,
    type: 'IN' as 'IN' | 'OUT',
    quantity: 1,
    reason: '',
  });

  const [formError, setFormError] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadProducts();
      loadMovements();
      // Restore previously selected location
      try {
        const saved = localStorage.getItem('voorraadLocation');
        if (saved) setSelectedLocation(saved);
      } catch {}
    }
  }, [user]);

  // Persist location selection
  useEffect(() => {
    try {
      if (selectedLocation === null) {
        localStorage.removeItem('voorraadLocation');
      } else {
        localStorage.setItem('voorraadLocation', selectedLocation);
      }
    } catch {}
  }, [selectedLocation]);

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

  const loadProducts = async () => {
    try {
      // Always load full list — search/category/location are filtered client-side
      const response = await fetch('/api/products');
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  // Discover unique locations from the loaded products
  const getLocations = (): string[] => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.location || 'Hoofdmagazijn'));
    if (set.size === 0) set.add('Hoofdmagazijn');
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'nl'));
  };

  // Stats per location for the picker view
  const getLocationStats = (loc: string) => {
    const inLoc = products.filter((p) => (p.location || 'Hoofdmagazijn') === loc);
    const lowStock = inLoc.filter((p) => p.isLowStock).length;
    return { count: inLoc.length, lowStock };
  };

  // Filter products by selected location + search + category
  const getVisibleProducts = (): Product[] => {
    return products.filter((p) => {
      if (selectedLocation && (p.location || 'Hoofdmagazijn') !== selectedLocation) return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hit =
          p.brand.toLowerCase().includes(q) ||
          p.type.toLowerCase().includes(q) ||
          (p.articleNumber || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  };

  const loadMovements = async () => {
    try {
      const response = await fetch('/api/stock?limit=20');
      if (response.ok) {
        const data = await response.json();
        setMovements(data);
      }
    } catch (error) {
      console.error('Error loading movements:', error);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const resetProductForm = () => {
    setProductForm({
      brand: '',
      type: '',
      articleNumber: '',
      category: 'Filters',
      location: selectedLocation || 'Hoofdmagazijn',
      unit: 'stuks',
      minStock: 0,
      initialStock: 0,
      description: '',
    });
    setEditingProduct(null);
    setFormError('');
  };

  const openEditProductModal = (product: Product) => {
    setProductForm({
      brand: product.brand,
      type: product.type,
      articleNumber: product.articleNumber || '',
      category: product.category,
      location: product.location,
      unit: product.unit,
      minStock: product.minStock,
      initialStock: product.currentStock,
      description: product.description || '',
    });
    setEditingProduct(product);
    setShowProductModal(true);
  };

  const openStockModal = (product: Product) => {
    setSelectedProduct(product);
    setStockForm({
      productId: product.id,
      type: 'IN',
      quantity: 1,
      reason: '',
    });
    setShowStockModal(true);
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    try {
      const url = editingProduct 
        ? `/api/products/${editingProduct.id}`
        : '/api/products';
      
      const method = editingProduct ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productForm),
      });

      const data = await response.json();

      if (!response.ok) {
        setFormError(data.error || 'Er is een fout opgetreden');
        return;
      }

      setShowProductModal(false);
      resetProductForm();
      loadProducts();
    } catch (error) {
      setFormError('Er is een fout opgetreden');
    }
  };

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    try {
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stockForm),
      });

      const data = await response.json();

      if (!response.ok) {
        setFormError(data.error || 'Er is een fout opgetreden');
        return;
      }

      setShowStockModal(false);
      setSelectedProduct(null);
      loadProducts();
      loadMovements();
    } catch (error) {
      setFormError('Er is een fout opgetreden');
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('Weet je zeker dat je dit product wilt verwijderen?')) {
      return;
    }

    try {
      const response = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadProducts();
      }
    } catch (error) {
      alert('Fout bij verwijderen van product');
    }
  };

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
          background: rgba(255, 255, 255, 0.72);
          backdrop-filter: saturate(180%) blur(28px);
          -webkit-backdrop-filter: saturate(180%) blur(28px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.4);
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
          position: sticky;
          top: 0;
          z-index: 40;
        }

        .nav-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 11px;
          background: rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 7px;
          color: #0C1B33;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }
        .nav-btn:hover {
          background: rgba(255, 255, 255, 0.8);
        }
        .nav-btn-danger {
          background: rgba(220, 38, 38, 0.08);
          border-color: rgba(220, 38, 38, 0.2);
          color: #d93025;
        }
        .nav-btn-danger:hover {
          background: rgba(220, 38, 38, 0.14);
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.65);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.55);
          border-radius: 16px;
          padding: 1rem;
          margin-bottom: 1.5rem;
          box-shadow:
            0 10px 30px rgba(15, 23, 42, 0.08),
            0 2px 6px rgba(15, 23, 42, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.7);
        }

        .glass-input {
          width: 100%;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 8px;
          color: #0C1B33;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s, background 0.15s;
        }

        .glass-input:focus {
          border-color: #1D4ED8;
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.15);
        }

        .glass-select {
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 8px;
          color: #0C1B33;
          font-size: 14px;
          outline: none;
          cursor: pointer;
        }

        .glass-select option {
          background: #ffffff;
          color: #0C1B33;
        }

        .glass-button {
          background: #1D4ED8;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px 20px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .glass-button:hover:not(:disabled) {
          background: #1740B8;
          box-shadow: 0 4px 16px rgba(29, 78, 216, 0.35);
        }

        .tab-button {
          padding: 10px 20px;
          background: transparent;
          border: none;
          color: #64748B;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s ease;
        }

        .tab-button.active {
          color: #1D4ED8;
          border-bottom-color: #1D4ED8;
        }

        .table-container {
          background: rgba(255, 255, 255, 0.65);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.55);
          border-radius: 16px;
          overflow: hidden;
          box-shadow:
            0 10px 30px rgba(15, 23, 42, 0.08),
            0 2px 6px rgba(15, 23, 42, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.7);
        }

        .table {
          width: 100%;
          border-collapse: collapse;
        }

        .table th {
          padding: 12px 16px;
          text-align: left;
          font-size: 0.75rem;
          font-weight: 600;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          background: rgba(255, 255, 255, 0.5);
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        }

        .table td {
          padding: 12px 16px;
          font-size: 0.875rem;
          color: #0C1B33;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
        }

        .table tbody tr:hover {
          background: rgba(255, 255, 255, 0.4);
        }

        .badge {
          display: inline-flex;
          padding: 0.2rem 0.65rem;
          font-size: 0.75rem;
          font-weight: 600;
          border-radius: 9999px;
        }

        .badge-warning {
          background: rgba(245, 158, 11, 0.15);
          color: #b45309;
        }

        .badge-success {
          background: rgba(16, 185, 129, 0.12);
          color: #047857;
        }

        .badge-in {
          background: rgba(16, 185, 129, 0.12);
          color: #047857;
        }

        .badge-out {
          background: rgba(239, 68, 68, 0.12);
          color: #b91c1c;
        }

        .stat-card {
          background: rgba(255, 255, 255, 0.65);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.55);
          border-radius: 16px;
          padding: 1.25rem 1.5rem;
          box-shadow:
            0 10px 30px rgba(15, 23, 42, 0.08),
            0 2px 6px rgba(15, 23, 42, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.7);
        }

        .stat-value {
          font-size: 2rem;
          font-weight: bold;
          color: #0C1B33;
        }

        .stat-label {
          font-size: 0.875rem;
          color: #64748B;
        }

        .location-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 16px;
          margin-bottom: 1.5rem;
        }

        .location-card {
          appearance: none;
          background: rgba(255, 255, 255, 0.65);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.55);
          border-radius: 16px;
          padding: 24px 20px;
          cursor: pointer;
          text-align: left;
          color: #0C1B33;
          font-family: inherit;
          transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
          box-shadow:
            0 10px 30px rgba(15, 23, 42, 0.08),
            0 2px 6px rgba(15, 23, 42, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.7);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .location-card:hover {
          transform: translateY(-3px);
          background: rgba(255, 255, 255, 0.8);
          box-shadow:
            0 16px 40px rgba(15, 23, 42, 0.12),
            0 4px 10px rgba(15, 23, 42, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.8);
        }

        .location-card-all {
          background: rgba(29, 78, 216, 0.08);
          border-color: rgba(29, 78, 216, 0.2);
        }

        .location-card-all:hover {
          background: rgba(29, 78, 216, 0.14);
        }

        .location-icon {
          font-size: 1.75rem;
          line-height: 1;
        }

        .location-name {
          font-size: 1.05rem;
          font-weight: 700;
          color: #0C1B33;
        }

        .location-stats {
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 0.85rem;
          color: #64748B;
        }

        .location-stats strong {
          color: #0C1B33;
          font-weight: 700;
        }
      `}</style>

      <div className="dashboard-container">
        {/* Header */}
        <div className="dashboard-header">
          <div className="max-w-7xl mx-auto px-6" style={{ height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img src="/header_logo.png" alt="It's Done Services" style={{ height: '22px', objectFit: 'contain' }} />
              <span style={{ width: '1px', height: '16px', background: 'rgba(0,0,0,0.12)', display: 'inline-block' }} />
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>
                Voorraadbeheer{selectedLocation ? ` · ${selectedLocation}` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {selectedLocation && (
                <button
                  onClick={() => { setSelectedLocation(null); setSearch(''); setCategoryFilter(''); }}
                  className="nav-btn"
                  aria-label="Wissel locatie"
                  title="Kies een andere locatie"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 12 13 12"/></svg>
                  Wissel locatie
                </button>
              )}
              <button onClick={() => router.push('/dashboard')} className="nav-btn" aria-label="Terug">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/></svg>
                Terug
              </button>
              <button onClick={handleLogout} className="nav-btn nav-btn-danger" aria-label="Uitloggen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Uitloggen
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          {!selectedLocation ? (
            <>
              {/* Location Picker */}
              <div className="glass-card" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0C1B33', margin: '0 0 0.5rem 0' }}>
                  Kies een locatie
                </h1>
                <p style={{ fontSize: '0.95rem', color: '#64748B', margin: 0 }}>
                  Selecteer eerst een locatie om de voorraad voor die locatie te bekijken.
                </p>
              </div>

              <div className="location-grid">
                {getLocations().map((loc) => {
                  const stats = getLocationStats(loc);
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setSelectedLocation(loc)}
                      className="location-card"
                    >
                      <div className="location-icon">📍</div>
                      <div className="location-name">{loc}</div>
                      <div className="location-stats">
                        <span><strong>{stats.count}</strong> producten</span>
                        <span style={{ color: stats.lowStock > 0 ? '#d97706' : '#047857' }}>
                          {stats.lowStock > 0 ? `⚠️ ${stats.lowStock} laag` : '✓ voorraad OK'}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {/* Alle locaties */}
                <button
                  type="button"
                  onClick={() => setSelectedLocation('__all__')}
                  className="location-card location-card-all"
                >
                  <div className="location-icon">🗂️</div>
                  <div className="location-name">Alle locaties</div>
                  <div className="location-stats">
                    <span><strong>{products.length}</strong> producten totaal</span>
                  </div>
                </button>
              </div>

              {user?.role === 'admin' && (
                <div className="glass-card" style={{ marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0C1B33' }}>
                      Nieuwe locatie aanmaken
                    </label>
                    <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>
                      Een locatie wordt vanzelf zichtbaar zodra het eerste product erop wordt geboekt. Vul hier een naam in om direct te starten met die locatie.
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <input
                        type="text"
                        value={newLocationInput}
                        onChange={(e) => setNewLocationInput(e.target.value)}
                        className="glass-input"
                        placeholder="Bijv. 'Werkplaats', 'Bus 1', 'Buitenmagazijn'"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const name = newLocationInput.trim();
                          if (!name) return;
                          setSelectedLocation(name);
                          setNewLocationInput('');
                        }}
                        className="glass-button"
                        disabled={!newLocationInput.trim()}
                      >
                        Start met locatie
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
          <>
          {/* Stats */}
          {(() => {
            const visible = getVisibleProducts();
            return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="stat-card">
              <p className="stat-label">Producten {selectedLocation !== '__all__' ? `op ${selectedLocation}` : '(alle locaties)'}</p>
              <p className="stat-value">{visible.length}</p>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <p className="stat-label">Lage voorraad</p>
              <p className="stat-value" style={{ color: '#d97706' }}>
                {visible.filter(p => p.isLowStock).length}
              </p>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
              <p className="stat-label">Recente mutaties</p>
              <p className="stat-value" style={{ color: '#047857' }}>
                {movements.length}
              </p>
            </div>
          </div>
            );
          })()}

          {/* Tabs */}
          <div className="mb-6" style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.08)' }}>
            <button
              className={`tab-button ${activeTab === 'products' ? 'active' : ''}`}
              onClick={() => setActiveTab('products')}
            >
              Producten
            </button>
            <button
              className={`tab-button ${activeTab === 'movements' ? 'active' : ''}`}
              onClick={() => setActiveTab('movements')}
            >
              Mutaties
            </button>
          </div>

          {activeTab === 'products' && (
            <>
              {/* Search & Add */}
              <div className="glass-card">
                <div className="flex flex-col sm:flex-row gap-4">
                  <input
                    type="text"
                    placeholder="Zoek op merk, type of artikelnummer..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="glass-input flex-1"
                  />
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="glass-select"
                  >
                    <option value="">Alle categorieën</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {user?.role === 'admin' && (
                    <button
                      onClick={() => { resetProductForm(); setShowProductModal(true); }}
                      className="glass-button"
                    >
                      + Nieuw Product
                    </button>
                  )}
                </div>
              </div>

              {/* Products Table */}
              <div className="table-container">
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Merk</th>
                        <th>Type</th>
                        <th>Art.nr</th>
                        <th>Categorie</th>
                        <th>Locatie</th>
                        <th>Voorraad</th>
                        <th>Status</th>
                        <th>Acties</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getVisibleProducts().length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                            Geen producten gevonden{selectedLocation && selectedLocation !== '__all__' ? ` op locatie "${selectedLocation}"` : ''}
                          </td>
                        </tr>
                      ) : (
                        getVisibleProducts().map((product) => (
                          <tr key={product.id}>
                            <td style={{ fontWeight: 500 }}>{product.brand}</td>
                            <td>
                              <div>
                                <div>{product.type}</div>
                                {product.description && (
                                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                    {product.description}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td style={{ color: '#64748B' }}>{product.articleNumber || '-'}</td>
                            <td>{product.category}</td>
                            <td style={{ color: '#64748B' }}>{product.location}</td>
                            <td>
                              <span style={{ fontWeight: 600, color: product.isLowStock ? '#d97706' : '#047857' }}>
                                {product.currentStock}
                              </span>
                              <span style={{ color: '#64748B', marginLeft: '4px' }}>
                                {product.unit}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${product.isLowStock ? 'badge-warning' : 'badge-success'}`}>
                                {product.isLowStock ? '⚠️ Laag' : '✓ OK'}
                              </span>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <button
                                onClick={() => openStockModal(product)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#1D4ED8',
                                  cursor: 'pointer',
                                  marginRight: '1rem',
                                }}
                              >
                                ± Mutatie
                              </button>
                              {user?.role === 'admin' && (
                                <>
                                  <button
                                    onClick={() => openEditProductModal(product)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#0C1B33',
                                      cursor: 'pointer',
                                      marginRight: '1rem',
                                    }}
                                  >
                                    Bewerken
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProduct(product.id)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#b91c1c',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Verwijderen
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {activeTab === 'movements' && (
            <div className="table-container">
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Product</th>
                      <th>Type</th>
                      <th>Aantal</th>
                      <th>Reden</th>
                      <th>Gebruiker</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                          Geen mutaties gevonden
                        </td>
                      </tr>
                    ) : (
                      movements.map((movement) => (
                        <tr key={movement.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {new Date(movement.createdAt).toLocaleString('nl-NL', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td>{movement.product.brand} {movement.product.type}</td>
                          <td>
                            <span className={`badge ${movement.type === 'IN' ? 'badge-in' : 'badge-out'}`}>
                              {movement.type === 'IN' ? '↓ Inkomend' : '↑ Uitgaand'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600 }}>
                              {movement.type === 'IN' ? '+' : '-'}{movement.quantity}
                            </span>
                            <span style={{ color: '#64748B', marginLeft: '4px' }}>
                              {movement.product.unit}
                            </span>
                          </td>
                          <td>{movement.reason || '-'}</td>
                          <td>{movement.username || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </>
          )}
        </div>

        {/* Product Modal */}
        {showProductModal && (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}>
            <div style={{
              background: '#ffffff',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              borderRadius: '16px',
              padding: '2rem',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: '#0C1B33' }}>
                {editingProduct ? 'Product bewerken' : 'Nieuw product'}
              </h2>
              
              <form onSubmit={handleProductSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0C1B33', marginBottom: '0.5rem' }}>
                      Merk *
                    </label>
                    <input
                      type="text"
                      value={productForm.brand}
                      onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })}
                      className="glass-input"
                      placeholder="Bijv. Shell, Mann Filter"
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0C1B33', marginBottom: '0.5rem' }}>
                      Type *
                    </label>
                    <input
                      type="text"
                      value={productForm.type}
                      onChange={(e) => setProductForm({ ...productForm, type: e.target.value })}
                      className="glass-input"
                      placeholder="Bijv. Helix Ultra 5W-40"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0C1B33', marginBottom: '0.5rem' }}>
                    Artikelnummer
                  </label>
                  <input
                    type="text"
                    value={productForm.articleNumber}
                    onChange={(e) => setProductForm({ ...productForm, articleNumber: e.target.value })}
                    className="glass-input"
                    placeholder="Optioneel"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0C1B33', marginBottom: '0.5rem' }}>
                      Categorie *
                    </label>
                    <select
                      value={productForm.category}
                      onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                      className="glass-select w-full"
                      required
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0C1B33', marginBottom: '0.5rem' }}>
                      Locatie
                    </label>
                    <input
                      type="text"
                      value={productForm.location}
                      onChange={(e) => setProductForm({ ...productForm, location: e.target.value })}
                      className="glass-input"
                      placeholder="Bijv. Schap A1, Magazijn"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0C1B33', marginBottom: '0.5rem' }}>
                      Eenheid
                    </label>
                    <select
                      value={productForm.unit}
                      onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                      className="glass-select w-full"
                    >
                      <option value="stuks">Stuks</option>
                      <option value="liters">Liters</option>
                      <option value="kg">Kilogram</option>
                      <option value="dozen">Dozen</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0C1B33', marginBottom: '0.5rem' }}>
                      Min. voorraad
                    </label>
                    <input
                      type="number"
                      value={productForm.minStock}
                      onChange={(e) => setProductForm({ ...productForm, minStock: parseInt(e.target.value) || 0 })}
                      className="glass-input"
                      min="0"
                    />
                  </div>
                </div>

                {!editingProduct && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0C1B33', marginBottom: '0.5rem' }}>
                      Beginvoorraad
                    </label>
                    <input
                      type="number"
                      value={productForm.initialStock}
                      onChange={(e) => setProductForm({ ...productForm, initialStock: parseInt(e.target.value) || 0 })}
                      className="glass-input"
                      min="0"
                      placeholder="Huidige voorraad bij aanmaken"
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0C1B33', marginBottom: '0.5rem' }}>
                    Omschrijving (optioneel)
                  </label>
                  <textarea
                    value={productForm.description}
                    onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                    className="glass-input"
                    rows={2}
                  />
                </div>

                {formError && (
                  <div style={{ color: '#b91c1c', fontSize: '0.875rem', background: 'rgba(239, 68, 68, 0.08)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                    {formError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="submit" className="glass-button" style={{ flex: 1 }}>
                    {editingProduct ? 'Bijwerken' : 'Toevoegen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowProductModal(false); resetProductForm(); }}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1.5rem',
                      background: '#f5f5f7',
                      border: '1px solid rgba(0,0,0,0.1)',
                      borderRadius: '8px',
                      color: '#0C1B33',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Annuleren
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Stock Movement Modal */}
        {showStockModal && selectedProduct && (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}>
            <div style={{
              background: '#ffffff',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: '16px',
              padding: '2rem',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: '#0C1B33' }}>
                Voorraadmutatie
              </h2>
              <p style={{ color: '#64748B', marginBottom: '1.5rem' }}>
                {selectedProduct.brand} {selectedProduct.type} (huidige voorraad: {selectedProduct.currentStock} {selectedProduct.unit})
              </p>
              
              <form onSubmit={handleStockSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0C1B33', marginBottom: '0.5rem' }}>
                    Type mutatie
                  </label>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="type"
                        checked={stockForm.type === 'IN'}
                        onChange={() => setStockForm({ ...stockForm, type: 'IN' })}
                        style={{ accentColor: '#10b981' }}
                      />
                      <span style={{ color: '#047857' }}>↓ Inkomend</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="type"
                        checked={stockForm.type === 'OUT'}
                        onChange={() => setStockForm({ ...stockForm, type: 'OUT' })}
                        style={{ accentColor: '#ef4444' }}
                      />
                      <span style={{ color: '#b91c1c' }}>↑ Uitgaand</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0C1B33', marginBottom: '0.5rem' }}>
                    Aantal ({selectedProduct.unit})
                  </label>
                  <input
                    type="number"
                    value={stockForm.quantity}
                    onChange={(e) => setStockForm({ ...stockForm, quantity: parseInt(e.target.value) || 1 })}
                    className="glass-input"
                    min="1"
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0C1B33', marginBottom: '0.5rem' }}>
                    Reden/opmerking (optioneel)
                  </label>
                  <input
                    type="text"
                    value={stockForm.reason}
                    onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })}
                    className="glass-input"
                    placeholder="Bijv. 'Levering leverancier X'"
                  />
                </div>

                {formError && (
                  <div style={{ color: '#b91c1c', fontSize: '0.875rem', background: 'rgba(239, 68, 68, 0.08)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                    {formError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="submit" className="glass-button" style={{ flex: 1 }}>
                    Boeken
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowStockModal(false); setSelectedProduct(null); setFormError(''); }}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1.5rem',
                      background: '#f5f5f7',
                      border: '1px solid rgba(0,0,0,0.1)',
                      borderRadius: '8px',
                      color: '#0C1B33',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Annuleren
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
