'use client';

import { useState, useEffect } from 'react';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { AppShell, Modal, Icon } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { ROLE_ALLEEN_LEZEN, ROLE_ADMIN, ROLE_USER, ROLE_LABELS } from '@/lib/roles';

interface User {
  id: number;
  username: string;
  role: string;
  /** Alleen bij de rol alleen lezen: het analysejaar dat deze gebruiker mag zien. */
  viewYear?: number | null;
  /** Nog geen wachtwoord ingesteld: wacht op de link. */
  requiresPasswordChange?: boolean;
  createdAt: string;
}

/** De eenmalige link die de beheerder zelf naar de gebruiker stuurt. */
interface LinkVoorGebruiker {
  username: string;
  link: string | null;
  verlooptOp?: string;
  /** Kon er geen link gemaakt worden (db push nog niet gedraaid), dan staat hier waarom. */
  fout?: string;
}

interface SessionUser {
  userId: number;
  username: string;
  role: string;
  isLoggedIn: boolean;
}

type TabType = 'users' | 'columns';

const AVAILABLE_COLUMNS = [
  { id: 'status', name: 'Status', required: true },
  { id: 'oNumber', name: 'O-nummer', required: true },
  { id: 'sampleDate', name: 'Datum', required: false },
  { id: 'location', name: 'Locatie', required: false },
  { id: 'description', name: 'Omschrijving', required: false },
  { id: 'oilType', name: 'Type olie', required: false },
  { id: 'remarks', name: 'Opmerkingen', required: false },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const sessionUser: SessionUser | null = useGebruiker();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [foutmelding, setFoutmelding] = useState('');
  // Pas true als de lijst echt geladen is. Bij een fout tonen we alleen de
  // foutmelding: geen "Nog geen gebruikers" en geen knop Nieuwe gebruiker.
  const [gebruikersGeladen, setGebruikersGeladen] = useState(false);
  const [linkVenster, setLinkVenster] = useState<LinkVoorGebruiker | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);

  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'status', 'oNumber', 'sampleDate', 'location', 'description', 'oilType'
  ]);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: ROLE_USER as string,
    // Leeg betekent alle jaren; alleen van belang bij de rol alleen lezen.
    viewYear: '',
  });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    // Beheer > Kolommen aanpassen opent direct het tabblad Kolommen (?tab=columns).
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'columns') {
      setActiveTab('columns');
    }
  }, []);

  useEffect(() => {
    if (sessionUser?.role === 'admin') {
      loadUsers();
      loadSettings();
    }
  }, [sessionUser]);

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) {
        setFoutmelding(await foutTekst(response, 'De gebruikers konden niet worden opgehaald.'));
        return;
      }
      setUsers(await response.json());
      setGebruikersGeladen(true);
      setFoutmelding('');
    } catch (error) {
      setFoutmelding(GEEN_VERBINDING);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        setFoutmelding(
          await foutTekst(response, 'De kolominstellingen konden niet worden opgehaald, je ziet de standaardkolommen.')
        );
        return;
      }
      const data = await response.json();
      if (data.columns) setSelectedColumns(data.columns);
    } catch (error) {
      setFoutmelding(GEEN_VERBINDING);
    }
  };

  // Knop "Opnieuw proberen" in de foutmelding.
  const herlaad = () => {
    setFoutmelding('');
    loadUsers();
    loadSettings();
  };

  const saveSettings = async (key: string, value: any) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (!response.ok) {
        setFoutmelding(await foutTekst(response, 'De instellingen konden niet worden opgeslagen.'));
        return;
      }
      setFoutmelding('');
      setSaveMessage('Instellingen opgeslagen.');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setFoutmelding(GEEN_VERBINDING);
    }
  };

  const toggleColumn = async (columnId: string) => {
    const column = AVAILABLE_COLUMNS.find(c => c.id === columnId);
    if (column?.required) return;

    const newColumns = selectedColumns.includes(columnId)
      ? selectedColumns.filter(id => id !== columnId)
      : [...selectedColumns, columnId];

    setSelectedColumns(newColumns);
    await saveSettings('columns', newColumns);
  };

  const resetForm = () => {
    setFormData({ username: '', password: '', role: ROLE_USER, viewYear: '' });
    setFormError('');
    setEditingUser(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowUserModal(true);
  };

  const openEditModal = (user: User) => {
    setFormData({
      username: user.username,
      password: '',
      role: user.role,
      viewYear: user.viewYear ? String(user.viewYear) : '',
    });
    setEditingUser(user);
    setShowUserModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';

      const body: Record<string, unknown> = {
        username: formData.username,
        role: formData.role,
        // Leeg = alle jaren. De route maakt het veld leeg bij een andere rol.
        viewYear: formData.role === ROLE_ALLEEN_LEZEN ? formData.viewYear : '',
      };

      if (editingUser && formData.password) {
        body.newPassword = formData.password;
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setFormError(data.error || 'Er is een fout opgetreden');
        return;
      }

      setShowUserModal(false);
      resetForm();
      loadUsers();
      // Nieuwe gebruiker: laat meteen de link zien om het wachtwoord in te stellen.
      if (!editingUser) {
        toonLink({
          username: data.username,
          link: data.uitnodiging?.link ?? null,
          verlooptOp: data.uitnodiging?.verlooptOp,
          fout: data.uitnodigingFout,
        });
      }
    } catch {
      setFormError('Er is een fout opgetreden');
    }
  };

  // Een gebruiker verwijderen is niet terug te draaien: het account en het
  // wachtwoord zijn weg. Daarom staat de knop niet meer in de rij naast Bewerken
  // en Wachtwoord resetten, maar onderaan het bewerkvenster.
  const handleDelete = async (user: User) => {
    if (!confirm(
      `Gebruiker ${user.username} (${ROLE_LABELS[user.role] ?? user.role}) verwijderen?\n\n` +
        'Het account en het wachtwoord verdwijnen; inloggen kan daarna niet meer. Het logboek blijft staan. ' +
        'Dit kan niet ongedaan worden gemaakt: opnieuw toegang geven betekent een nieuw account aanmaken.'
    )) return;

    try {
      const response = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Fout bij verwijderen van gebruiker');
        return;
      }
      setShowUserModal(false);
      resetForm();
      loadUsers();
    } catch {
      alert('Fout bij verwijderen van gebruiker');
    }
  };

  const toonLink = (gegevens: LinkVoorGebruiker) => {
    setGekopieerd(false);
    setLinkVenster(gegevens);
  };

  const kopieerLink = async () => {
    if (!linkVenster?.link) return;
    try {
      await navigator.clipboard.writeText(linkVenster.link);
      setGekopieerd(true);
    } catch {
      // Geen klembord (bijvoorbeeld in een iframe): selecteer het veld, dan kan
      // de beheerder zelf kopiëren.
      const veld = document.getElementById('uitnodiging-link') as HTMLInputElement | null;
      veld?.select();
    }
  };

  // Wachtwoord resetten, of een nieuwe link voor wie nog geen wachtwoord heeft.
  // Beide geven een eenmalige link terug die de beheerder zelf verstuurt.
  const handleResetPassword = async (user: User) => {
    const vraag = user.requiresPasswordChange
      ? `Een nieuwe link maken voor ${user.username}? Een eerdere link werkt daarna niet meer.`
      : `Het wachtwoord van ${user.username} resetten? Het huidige wachtwoord werkt daarna niet meer. Je krijgt een link die je zelf naar ${user.username} stuurt.`;
    if (!confirm(vraag)) return;

    try {
      const response = await fetch(`/api/users/${user.id}/reset-password`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Fout bij resetten wachtwoord');
        return;
      }
      toonLink({ username: user.username, link: data.uitnodiging.link, verlooptOp: data.uitnodiging.verlooptOp });
      loadUsers();
    } catch {
      alert('Fout bij resetten wachtwoord');
    }
  };

  if (loading) {
    return <div className="laadscherm">Laden...</div>;
  }

  const rolBadgeClass = (role: string) => {
    if (role === ROLE_ADMIN) return 'badge badge-info';
    if (role === ROLE_ALLEEN_LEZEN) return 'badge badge-warning';
    return 'badge badge-gray';
  };

  /** Wat een kijker mag zien: één jaar, of alle jaren als het veld leeg is. */
  const kijkjaarTekst = (user: User) =>
    user.viewYear ? `Alleen ${user.viewYear}` : 'Alle jaren';

  const sluitModal = () => { setShowUserModal(false); resetForm(); };

  return (
    <AppShell
      title="Instellingen"
      wide
      user={sessionUser}
    >
      <h1 className="page-title">Instellingen</h1>
      <p className="page-subtitle">Gebruikers en kolomweergave.</p>

      {foutmelding && <LaadFout melding={foutmelding} onOpnieuw={herlaad} />}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="tabs">
          <button type="button" onClick={() => setActiveTab('users')} className={activeTab === 'users' ? 'on' : ''}>
            Gebruikers
          </button>
          <button type="button" onClick={() => setActiveTab('columns')} className={activeTab === 'columns' ? 'on' : ''}>
            Kolommen
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {saveMessage && (
            <div className="alert alert-success" style={{ marginBottom: '16px' }}>
              {saveMessage}
            </div>
          )}

          {activeTab === 'users' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ marginBottom: '16px' }}>
                <p className="section-label" style={{ margin: 0 }}>Gebruikersbeheer</p>
                {gebruikersGeladen && (
                <button type="button" onClick={openAddModal} className="btn btn-primary w-full sm:w-auto">
                  <Icon name="user-plus" />
                  Nieuwe gebruiker
                </button>
                )}
              </div>

              {gebruikersGeladen && (
              <div className="table-container">
                <div className="table-scroll">
                  <table className="table table-kaarten">
                    <thead>
                      <tr>
                        <th>Gebruikersnaam</th>
                        <th>Rol</th>
                        <th>Aangemaakt</th>
                        <th>Acties</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-secondary" style={{ textAlign: 'center', padding: '32px 16px' }}>
                            Nog geen gebruikers.
                          </td>
                        </tr>
                      ) : users.map((user) => (
                        <tr key={user.id}>
                          <td className="kaart-kop" data-label="Gebruikersnaam" style={{ fontWeight: 500 }}>
                            {user.username}
                            {user.id === sessionUser?.userId && (
                              <span className="text-tertiary" style={{ marginLeft: '8px', fontSize: '12px' }}>(jij)</span>
                            )}
                          </td>
                          <td className="kaart-status" data-label="Rol">
                            <span className={rolBadgeClass(user.role)}>
                              {ROLE_LABELS[user.role] ?? user.role}
                            </span>
                            {user.role === ROLE_ALLEEN_LEZEN && (
                              <span className="hint" style={{ display: 'block', marginTop: '4px' }}>
                                {kijkjaarTekst(user)}
                              </span>
                            )}
                            {user.requiresPasswordChange && (
                              <span className="hint" style={{ display: 'block', marginTop: '4px' }}>
                                Moet nog een wachtwoord instellen
                              </span>
                            )}
                          </td>
                          <td className="text-secondary sm:whitespace-nowrap" data-label="Aangemaakt">
                            {new Date(user.createdAt).toLocaleDateString('nl-NL')}
                          </td>
                          <td className="kaart-acties" data-label="Acties">
                            <div className="flex flex-wrap sm:flex-nowrap gap-1.5">
                              <button type="button" onClick={() => openEditModal(user)} className="btn btn-sm">
                                <Icon name="pencil" size={16} />
                                Bewerken
                              </button>
                              {user.id !== sessionUser?.userId && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleResetPassword(user)}
                                    className="btn btn-sm"
                                  >
                                    <Icon name={user.requiresPasswordChange ? 'copy' : 'reset'} size={16} />
                                    {user.requiresPasswordChange ? 'Nieuwe link' : 'Wachtwoord resetten'}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              )}
            </div>
          )}

          {activeTab === 'columns' && (
            <div>
              <p className="section-label" style={{ marginBottom: '6px' }}>Kolomconfiguratie</p>
              <p className="text-secondary" style={{ fontSize: '14px', margin: '0 0 20px 0' }}>
                Selecteer welke kolommen zichtbaar zijn in het overzicht.
              </p>

              <div className="flex flex-col gap-2">
                {AVAILABLE_COLUMNS.map((column) => {
                  const checked = selectedColumns.includes(column.id);
                  return (
                    <label
                      key={column.id}
                      htmlFor={column.id}
                      className="flex items-center justify-between gap-3"
                      style={{
                        minHeight: '44px',
                        padding: '10px 14px',
                        background: 'var(--grijs-50)',
                        border: '1px solid var(--grijs-200)',
                        borderRadius: 'var(--radius-md)',
                        cursor: column.required ? 'default' : 'pointer',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={column.id}
                          checked={checked}
                          onChange={() => toggleColumn(column.id)}
                          disabled={column.required}
                          className="size-4 flex-none"
                          style={{ cursor: 'inherit' }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: 500, color: column.required ? 'var(--grijs-500)' : 'var(--navy)' }}>
                          {column.name}
                          {column.required && (
                            <span className="text-tertiary" style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 400 }}>
                              (verplicht)
                            </span>
                          )}
                        </span>
                      </div>
                      <span className={`badge ${checked ? 'badge-success' : 'badge-gray'}`}>
                        {checked ? 'Zichtbaar' : 'Verborgen'}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="alert alert-info" style={{ marginTop: '16px' }}>
                Sommige kolommen zijn verplicht en kunnen niet worden uitgeschakeld.
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showUserModal}
        onClose={sluitModal}
        title={editingUser ? 'Gebruiker bewerken' : 'Nieuwe gebruiker toevoegen'}
        footer={
          <>
            <button type="button" onClick={sluitModal} className="btn">
              Annuleren
            </button>
            <button type="submit" form="admin-user-form" className="btn btn-primary">
              {editingUser ? 'Bijwerken' : 'Toevoegen'}
            </button>
          </>
        }
      >
        <form id="admin-user-form" onSubmit={handleSubmit}>
          <div className="veld">
            <label className="label" htmlFor="admin-username">Gebruikersnaam</label>
            <input
              id="admin-username"
              type="text"
              className="input"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>

          {editingUser ? (
            <div className="alert alert-info" style={{ marginBottom: '12px' }}>
              Gebruik de knop &quot;Wachtwoord resetten&quot; in het overzicht. Je krijgt dan een link die je zelf naar de gebruiker stuurt.
            </div>
          ) : (
            <div className="alert alert-success" style={{ marginBottom: '12px' }}>
              Geen wachtwoord nodig. Na Toevoegen krijg je een link (72 uur geldig) die je zelf naar de gebruiker stuurt; daarmee stelt die een wachtwoord in.
            </div>
          )}

          <div className="veld">
            <label className="label" htmlFor="admin-role">Rol</label>
            <select
              id="admin-role"
              className="select"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              required
            >
              <option value={ROLE_USER}>{ROLE_LABELS[ROLE_USER]}</option>
              <option value={ROLE_ADMIN}>{ROLE_LABELS[ROLE_ADMIN]}</option>
              <option value={ROLE_ALLEEN_LEZEN}>{ROLE_LABELS[ROLE_ALLEEN_LEZEN]}</option>
            </select>
            {formData.role === ROLE_ALLEEN_LEZEN && (
              <p className="hint">
                Mag uitsluitend de oliemonsters bekijken: de lijst, de foto&apos;s, de
                geannuleerde monsters en de monsters die niet bereikbaar waren. Geen
                wijzigingen, geen PDF, geen andere module en geen beheerpagina.
              </p>
            )}
          </div>

          {formData.role === ROLE_ALLEEN_LEZEN && (
            <div className="veld">
              <label className="label" htmlFor="admin-viewyear">Analysejaar dat deze gebruiker mag zien</label>
              <input
                id="admin-viewyear"
                type="number"
                inputMode="numeric"
                className="input"
                placeholder="Leeg laten voor alle jaren"
                min={2000}
                max={2100}
                value={formData.viewYear}
                onChange={(e) => setFormData({ ...formData, viewYear: e.target.value })}
              />
              <p className="hint">
                Bijvoorbeeld 2025. Laat het leeg als deze gebruiker alle jaren mag zien.
              </p>
            </div>
          )}

          {formError && (
            <div className="alert alert-danger">
              {formError}
            </div>
          )}
        </form>

        {/* Verwijderen: apart en onderaan, niet in de rij naast Bewerken. Jezelf
            verwijderen kan niet. */}
        {editingUser && editingUser.id !== sessionUser?.userId && (
          <section className="gevarenzone">
            <p className="gevarenzone-kop">
              <Icon name="trash" size={16} />
              Gebruiker verwijderen
            </p>
            <p className="gevarenzone-tekst">
              {editingUser.username} kan daarna niet meer inloggen. Het logboek blijft staan. Dit kan niet ongedaan
              worden gemaakt.
            </p>
            <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => handleDelete(editingUser)}>
              <Icon name="trash" size={16} />
              Gebruiker verwijderen...
            </button>
          </section>
        )}
      </Modal>

      <Modal
        open={linkVenster !== null}
        onClose={() => setLinkVenster(null)}
        title="Link om het wachtwoord in te stellen"
        footer={
          <>
            <button type="button" onClick={() => setLinkVenster(null)} className="btn">
              Sluiten
            </button>
            {linkVenster?.link && (
              <button type="button" onClick={kopieerLink} className="btn btn-primary">
                <Icon name={gekopieerd ? 'check' : 'copy'} />
                {gekopieerd ? 'Gekopieerd' : 'Link kopiëren'}
              </button>
            )}
          </>
        }
      >
        {linkVenster?.link ? (
          <>
            <p style={{ margin: '0 0 12px 0' }}>
              Stuur deze link zelf naar <strong>{linkVenster.username}</strong>, bijvoorbeeld via WhatsApp of mail.
              Met de link kiest {linkVenster.username} een wachtwoord en is daarna ingelogd.
            </p>
            <div className="veld">
              <label className="label" htmlFor="uitnodiging-link">Link</label>
              <input
                id="uitnodiging-link"
                type="text"
                className="input"
                value={linkVenster.link}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              {linkVenster.verlooptOp && (
                <p className="hint">
                  Werkt één keer en is geldig tot{' '}
                  {new Date(linkVenster.verlooptOp).toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' })}.
                  Deze link zie je maar één keer; kwijt? Maak dan een nieuwe met Nieuwe link.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="alert alert-warning" role="alert">
            <Icon name="alert-warning" />
            {linkVenster?.username} is aangemaakt, maar er kon nog geen link gemaakt worden.
            {linkVenster?.fout ? ` ${linkVenster.fout}` : ''} Daarna maak je de link met Nieuwe link in het overzicht.
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
