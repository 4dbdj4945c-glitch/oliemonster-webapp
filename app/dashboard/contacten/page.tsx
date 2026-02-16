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

interface Contact {
  id: number;
  company: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  _count?: { contactNotes: number };
  contactNotes?: ContactNote[];
}

interface ContactNote {
  id: number;
  content: string;
  username: string | null;
  createdAt: string;
}

export default function ContactenPage() {
  const [user, setUser] = useState<User | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [newNote, setNewNote] = useState('');
  const router = useRouter();

  // Contact form state
  const [contactForm, setContactForm] = useState({
    company: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
  });

  const [formError, setFormError] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadContacts();
    }
  }, [user, search]);

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

  const loadContacts = async () => {
    try {
      let url = '/api/contacts';
      if (search) url += `?search=${encodeURIComponent(search)}`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setContacts(data);
      }
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const loadContactDetails = async (contactId: number) => {
    try {
      const response = await fetch(`/api/contacts/${contactId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedContact(data);
      }
    } catch (error) {
      console.error('Error loading contact details:', error);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const resetContactForm = () => {
    setContactForm({
      company: '',
      name: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
    });
    setEditingContact(null);
    setFormError('');
  };

  const openEditContactModal = (contact: Contact) => {
    setContactForm({
      company: contact.company,
      name: contact.name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      address: contact.address || '',
      notes: contact.notes || '',
    });
    setEditingContact(contact);
    setShowContactModal(true);
  };

  const openDetailModal = async (contact: Contact) => {
    await loadContactDetails(contact.id);
    setShowDetailModal(true);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    try {
      const url = editingContact 
        ? `/api/contacts/${editingContact.id}`
        : '/api/contacts';
      
      const method = editingContact ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });

      const data = await response.json();

      if (!response.ok) {
        setFormError(data.error || 'Er is een fout opgetreden');
        return;
      }

      setShowContactModal(false);
      resetContactForm();
      loadContacts();
    } catch (error) {
      setFormError('Er is een fout opgetreden');
    }
  };

  const handleAddNote = async () => {
    if (!selectedContact || !newNote.trim()) return;

    try {
      const response = await fetch(`/api/contacts/${selectedContact.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNote }),
      });

      if (response.ok) {
        setNewNote('');
        await loadContactDetails(selectedContact.id);
      }
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!selectedContact) return;
    if (!confirm('Weet je zeker dat je deze notitie wilt verwijderen?')) return;

    try {
      const response = await fetch(`/api/contacts/${selectedContact.id}/notes?noteId=${noteId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadContactDetails(selectedContact.id);
      }
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const handleDeleteContact = async (id: number) => {
    if (!confirm('Weet je zeker dat je dit contact wilt verwijderen?')) {
      return;
    }

    try {
      const response = await fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadContacts();
      }
    } catch (error) {
      alert('Fout bij verwijderen van contact');
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

        .glass-button {
          background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
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
          box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
        }

        .contact-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 16px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .contact-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.3);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
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

        .note-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 0.75rem;
        }

        .note-meta {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 0.5rem;
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
                  👥 Contacten
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
                      backgroundColor: '#3b82f6',
                      border: '1px solid #3b82f6',
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
              <p className="stat-label">Totaal contacten</p>
              <p className="stat-value" style={{ color: '#60a5fa' }}>{contacts.length}</p>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
              <p className="stat-label">Met notities</p>
              <p className="stat-value" style={{ color: '#a78bfa' }}>
                {contacts.filter(c => (c._count?.contactNotes || 0) > 0).length}
              </p>
            </div>
          </div>

          {/* Search & Add */}
          <div className="glass-card">
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                type="text"
                placeholder="Zoek op bedrijf, naam of e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="glass-input flex-1"
              />
              {user?.role === 'admin' && (
                <button
                  onClick={() => { resetContactForm(); setShowContactModal(true); }}
                  className="glass-button"
                >
                  + Nieuw Contact
                </button>
              )}
            </div>
          </div>

          {/* Contacts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contacts.length === 0 ? (
              <div className="col-span-full text-center py-12" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                Geen contacten gevonden
              </div>
            ) : (
              contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="contact-card"
                  onClick={() => openDetailModal(contact)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'white' }}>
                      {contact.company}
                    </h3>
                    {(contact._count?.contactNotes || 0) > 0 && (
                      <span style={{
                        background: 'rgba(139, 92, 246, 0.2)',
                        color: '#a78bfa',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}>
                        {contact._count?.contactNotes} notities
                      </span>
                    )}
                  </div>
                  
                  {contact.name && (
                    <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                      👤 {contact.name}
                    </p>
                  )}
                  {contact.email && (
                    <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                      ✉️ {contact.email}
                    </p>
                  )}
                  {contact.phone && (
                    <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.875rem' }}>
                      📞 {contact.phone}
                    </p>
                  )}

                  {user?.role === 'admin' && (
                    <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openEditContactModal(contact)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#8b5cf6',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                        }}
                      >
                        Bewerken
                      </button>
                      <button
                        onClick={() => handleDeleteContact(contact.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#fca5a5',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                        }}
                      >
                        Verwijderen
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Contact Modal */}
        {showContactModal && (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '24px',
              padding: '2rem',
              maxWidth: '480px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', color: 'white' }}>
                {editingContact ? 'Contact bewerken' : 'Nieuw contact'}
              </h2>
              
              <form onSubmit={handleContactSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
                    Bedrijfsnaam *
                  </label>
                  <input
                    type="text"
                    value={contactForm.company}
                    onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                    className="glass-input"
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
                    Contactpersoon
                  </label>
                  <input
                    type="text"
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    className="glass-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      className="glass-input"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
                      Telefoon
                    </label>
                    <input
                      type="tel"
                      value={contactForm.phone}
                      onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      className="glass-input"
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
                    Adres
                  </label>
                  <textarea
                    value={contactForm.address}
                    onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                    className="glass-input"
                    rows={2}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', marginBottom: '0.5rem' }}>
                    Algemene notities
                  </label>
                  <textarea
                    value={contactForm.notes}
                    onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                    className="glass-input"
                    rows={3}
                  />
                </div>

                {formError && (
                  <div style={{ color: '#fca5a5', fontSize: '0.875rem', background: 'rgba(239, 68, 68, 0.2)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                    {formError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="submit" className="glass-button" style={{ flex: 1 }}>
                    {editingContact ? 'Bijwerken' : 'Toevoegen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowContactModal(false); resetContactForm(); }}
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

        {/* Contact Detail Modal */}
        {showDetailModal && selectedContact && (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '24px',
              padding: '2rem',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>
                    {selectedContact.company}
                  </h2>
                  {selectedContact.name && (
                    <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginTop: '0.25rem' }}>
                      {selectedContact.name}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { setShowDetailModal(false); setSelectedContact(null); }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '1.25rem',
                  }}
                >
                  ×
                </button>
              </div>

              {/* Contact Info */}
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px' }}>
                {selectedContact.email && (
                  <p style={{ color: 'rgba(255, 255, 255, 0.8)', marginBottom: '0.5rem' }}>
                    ✉️ <a href={`mailto:${selectedContact.email}`} style={{ color: '#60a5fa' }}>{selectedContact.email}</a>
                  </p>
                )}
                {selectedContact.phone && (
                  <p style={{ color: 'rgba(255, 255, 255, 0.8)', marginBottom: '0.5rem' }}>
                    📞 <a href={`tel:${selectedContact.phone}`} style={{ color: '#60a5fa' }}>{selectedContact.phone}</a>
                  </p>
                )}
                {selectedContact.address && (
                  <p style={{ color: 'rgba(255, 255, 255, 0.8)', marginBottom: '0.5rem' }}>
                    📍 {selectedContact.address}
                  </p>
                )}
                {selectedContact.notes && (
                  <p style={{ color: 'rgba(255, 255, 255, 0.6)', marginTop: '1rem', fontStyle: 'italic' }}>
                    {selectedContact.notes}
                  </p>
                )}
              </div>

              {/* Notes Section */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'white', marginBottom: '1rem' }}>
                  📝 Aantekeningen
                </h3>

                {/* Add Note */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Voeg een aantekening toe..."
                    className="glass-input"
                    style={{ flex: 1 }}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddNote()}
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim()}
                    className="glass-button"
                    style={{ padding: '12px 16px' }}
                  >
                    +
                  </button>
                </div>

                {/* Notes List */}
                <div>
                  {(!selectedContact.contactNotes || selectedContact.contactNotes.length === 0) ? (
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', padding: '1rem' }}>
                      Nog geen aantekeningen
                    </p>
                  ) : (
                    selectedContact.contactNotes.map((note) => (
                      <div key={note.id} className="note-card">
                        <p style={{ color: 'white', whiteSpace: 'pre-wrap' }}>{note.content}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="note-meta">
                            {note.username || 'Onbekend'} • {new Date(note.createdAt).toLocaleString('nl-NL', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {(user?.role === 'admin' || note.username === user?.username) && (
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#fca5a5',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                              }}
                            >
                              Verwijderen
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
