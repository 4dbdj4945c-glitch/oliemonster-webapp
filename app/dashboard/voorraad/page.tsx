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
    }
  }, [user, search, categoryFilter]);

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
      let url = '/api/products';
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (categoryFilter) params.append('category', categoryFilter);
      if (params.toString()) url += '?' + params.toString();

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error('Error loading products:', error);
    }
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
      location: 'Hoofdmagazijn',
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
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 16px;
          padding: 1rem;
          margin-bottom: 1.5rem;
        }

        .glass-input {
          width: 100%;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          color: white;
          font-size: 14px;
          outline: none;
        }

        .glass-input:focus {
          border-color: rgba(255, 255, 255, 0.4);
        }

        .glass-select {
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          color: white;
          font-size: 14px;
          outline: none;
          cursor: pointer;
        }

        .glass-select option {
          background: #2d1b4e;
          color: white;
        }

        .glass-button {
          background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          color: white;
          border: none;
          border-radius: 12px;
          padding: 12px 24px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .glass-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
        }

        .tab-button {
          padding: 12px 24px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 600;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.3s ease;
        }

        .tab-button.active {
          color: white;
          border-bottom-color: #10b981;
        }

        .table-container {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 16px;
          overflow: hidden;
        }

        .table {
          width: 100%;
          border-collapse: collapse;
        }

        .table th {
          padding: 1rem;
          text-align: left;
          font-size: 0.75rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          text-transform: uppercase;
          background: rgba(255, 255, 255, 0.05);
        }

        .table td {
          padding: 1rem;
          font-size: 0.875rem;
          color: white;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .table tbody tr:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .badge {
          display: inline-flex;
          padding: 0.25rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 600;
          border-radius: 9999px;
        }

        .badge-warning {
          background: rgba(245, 158, 11, 0.2);
          color: #fcd34d;
        }

        .badge-success {
          background: rgba(16, 185, 129, 0.2);
          color: #6ee7b7;
        }

        .badge-in {
          background: rgba(16, 185, 129, 0.2);
          color: #6ee7b7;
        }

        .badge-out {
          background: rgba(239, 68, 68, 0.2);
          color: #fca5a5;
        }

        .stat-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 16px;
          padding: 1.5rem;
        }

        .stat-value {
          font-size: 2rem;
          font-weight: bold;
          color: white;
        }

        .stat-label {
          font-size: 0.875rem;
          color: rgba(255, 255, 255, 0.7);
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
                  📦 Voorraadbeheer
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Welkom, {user?.username} ({user?.role})
                </p>
              </div>
              <div className="flex gap-3 flex-shrink-0">
                <Tooltip text="Terug naar overzicht">
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    <span className="text-xl" style={{ color: 'var(--foreground)', lineHeight: 1 }}>←</span>
                  </button>
                </Tooltip>
                <Tooltip text="Log uit">
                  <button
                    onClick={handleLogout}
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95"
                    style={{
                      backgroundColor: '#10b981',
                      border: '1px solid #10b981',
                    }}
                  >
                    <span className="text-xl" style={{ color: 'white', lineHeight: 1 }}>→</span>
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="stat-card">
              <p className="stat-label">Totaal producten</p>
              <p className="stat-value">{products.length}</p>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <p className="stat-label">Lage voorraad</p>
              <p className="stat-value" style={{ color: '#fcd34d' }}>
                {products.filter(p => p.isLowStock).length}
              </p>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
              <p className="stat-label">Recente mutaties</p>
              <p className="stat-value" style={{ color: '#6ee7b7' }}>
                {movements.length}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
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
                      {products.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                            Geen producten gevonden
                          </td>
                        </tr>
                      ) : (
                        products.map((product) => (
                          <tr key={product.id}>
                            <td style={{ fontWeight: 500 }}>{product.brand}</td>
                            <td>
                              <div>
                                <div>{product.type}</div>
                                {product.description && (
                                  <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                                    {product.description}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{product.articleNumber || '-'}</td>
                            <td>{product.category}</td>
                            <td style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{product.location}</td>
                            <td>
                              <span style={{ fontWeight: 600, color: product.isLowStock ? '#fcd34d' : '#6ee7b7' }}>
                                {product.currentStock}
                              </span>
                              <span style={{ color: 'rgba(255, 255, 255, 0.6)', marginLeft: '4px' }}>
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
                                  color: '#10b981',
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
                                      color: '#8b5cf6',
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
                                      color: '#fca5a5',
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
                        <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255, 255, 255, 0.6)' }}>
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
                            <span style={{ color: 'rgba(255, 255, 255, 0.6)', marginLeft: '4px' }}>
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
        </div>

        {/* Product Modal */}
        {showProductModal && (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '24px',
              padding: '2rem',
              maxWidth: '480px',
              width: '100%',
            }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', color: 'white' }}>
                {editingProduct ? 'Product bewerken' : 'Nieuw product'}
              </h2>
              
              <form onSubmit={handleProductSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
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
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
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
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
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
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
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
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
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
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
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
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
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
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
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
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
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
                  <div style={{ color: '#fca5a5', fontSize: '0.875rem', background: 'rgba(239, 68, 68, 0.2)', padding: '0.75rem', borderRadius: '0.5rem' }}>
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
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '12px',
                      color: 'white',
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
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '24px',
              padding: '2rem',
              maxWidth: '400px',
              width: '100%',
            }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'white' }}>
                Voorraadmutatie
              </h2>
              <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '1.5rem' }}>
                {selectedProduct.brand} {selectedProduct.type} (huidige voorraad: {selectedProduct.currentStock} {selectedProduct.unit})
              </p>
              
              <form onSubmit={handleStockSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
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
                      <span style={{ color: '#6ee7b7' }}>↓ Inkomend</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="type"
                        checked={stockForm.type === 'OUT'}
                        onChange={() => setStockForm({ ...stockForm, type: 'OUT' })}
                        style={{ accentColor: '#ef4444' }}
                      />
                      <span style={{ color: '#fca5a5' }}>↑ Uitgaand</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
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
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
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
                  <div style={{ color: '#fca5a5', fontSize: '0.875rem', background: 'rgba(239, 68, 68, 0.2)', padding: '0.75rem', borderRadius: '0.5rem' }}>
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
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '12px',
                      color: 'white',
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
