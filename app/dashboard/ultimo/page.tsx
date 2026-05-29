'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, NavButton, Modal, Icons } from '@/app/components/ui';
import UltimoCommentsPanel from '@/app/components/UltimoCommentsPanel';

interface User {
  userId: number;
  username: string;
  role: string;
  isLoggedIn: boolean;
}

interface UltimoTask {
  id: number;
  jobName: string;
  taskDescription: string;
  installation: string | null;
  lastDate: string | null;
  lastComment: string | null;
  lastJobNumber: string | null;
  commentsCount: number;
  updatedAt: string;
}

const emptyForm = { jobName: '', taskDescription: '', installation: '' };

export default function UltimoPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<UltimoTask[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<UltimoTask | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const router = useRouter();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => loadTasks(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, search]);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (!data.isLoggedIn) { router.push('/login'); return; }
      if (data.requiresPasswordChange) { router.push('/set-password'); return; }
      setUser(data);
    } catch {
      router.push('/login');
    }
  };

  const loadTasks = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`/api/ultimo-tasks?${params.toString()}`);
      if (res.ok) setTasks(await res.json());
    } catch (e) {
      console.error('Error loading tasks', e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const openAdd = () => {
    setEditingTask(null);
    setForm({ ...emptyForm });
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (task: UltimoTask) => {
    setEditingTask(task);
    setForm({
      jobName: task.jobName,
      taskDescription: task.taskDescription,
      installation: task.installation || '',
    });
    setFormError('');
    setShowModal(true);
  };

  const saveTask = async () => {
    if (!form.jobName.trim() || !form.taskDescription.trim()) {
      setFormError('Jobnaam en taakomschrijving zijn verplicht.');
      return;
    }
    setSaving(true);
    try {
      const url = editingTask ? `/api/ultimo-tasks/${editingTask.id}` : '/api/ultimo-tasks';
      const method = editingTask ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFormError(err.error || 'Opslaan mislukt.');
        return;
      }
      setShowModal(false);
      await loadTasks();
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (task: UltimoTask) => {
    if (!confirm(`Taak "${task.taskDescription}" en alle bijbehorende opmerkingen verwijderen?`)) return;
    const res = await fetch(`/api/ultimo-tasks/${task.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Verwijderen mislukt.');
      return;
    }
    if (expandedId === task.id) setExpandedId(null);
    await loadTasks();
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('nl-NL');
  };

  // Suggesties voor consistente invoer (datalists)
  const jobNames = Array.from(new Set(tasks.map((t) => t.jobName))).sort();
  const taskDescs = Array.from(new Set(tasks.map((t) => t.taskDescription))).sort();
  const installations = Array.from(new Set(tasks.map((t) => t.installation).filter(Boolean) as string[])).sort();

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: '#fff',
    border: '1px solid rgba(0,0,0,0.15)',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '0.78rem', color: '#6e6e73', fontWeight: 600, display: 'block', marginBottom: '0.3rem',
  };

  return (
    <AppShell
      title="Ultimo-opmerkingen"
      rightActions={
        <>
          {user && <span className="user-badge">{user.username}</span>}
          <NavButton icon={Icons.Back} onClick={() => router.push('/dashboard')}>Dashboard</NavButton>
          <NavButton icon={Icons.Logout} danger onClick={handleLogout}>Uitloggen</NavButton>
        </>
      }
    >
      <h1 className="page-title">Ultimo-opmerkingen</h1>
      <p className="page-subtitle">
        Houd per onderhoudstaak (looprouteregel) bij welke opmerking je wanneer in Ultimo plaatste — en kopieer 'm de volgende keer exact opnieuw.
      </p>

      {/* Zoekbalk + nieuwe taak */}
      <datalist id="dl-jobname">{jobNames.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-task">{taskDescs.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-installation">{installations.map((v) => <option key={v} value={v} />)}</datalist>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', margin: '8px 0 20px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 280px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op taak, jobnaam, installatie, jobnummer of opmerking…"
            style={{ ...inputStyle, paddingLeft: '38px' }}
          />
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            style={{ padding: '10px 16px', background: '#007AFF', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + Nieuwe taak
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#6e6e73' }}>Laden...</p>
      ) : tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6e6e73' }}>
          {search
            ? <>Geen taken gevonden voor “{search}”.</>
            : <>Nog geen taken. {isAdmin && 'Klik op “+ Nieuwe taak” om te beginnen.'}</>}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {tasks.map((task) => {
            const expanded = expandedId === task.id;
            return (
              <li
                key={task.id}
                style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '14px', boxShadow: '0 1px 3px rgba(15,23,42,0.06)', overflow: 'hidden' }}
              >
                <div
                  onClick={() => setExpandedId(expanded ? null : task.id)}
                  style={{ padding: '16px 18px', cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'flex-start' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#007AFF', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{task.jobName}</div>
                    <div style={{ fontSize: '1.02rem', fontWeight: 600, color: '#1d1d1f', marginTop: '2px' }}>{task.taskDescription}</div>
                    {task.installation && <div style={{ fontSize: '0.82rem', color: '#6e6e73', marginTop: '3px' }}>📍 {task.installation}</div>}
                    {task.lastComment && (
                      <div style={{ fontSize: '0.84rem', color: '#3c3c43', marginTop: '8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        <span style={{ color: '#8e8e93' }}>Laatst{task.lastDate ? ` (${formatDate(task.lastDate)})` : ''}: </span>
                        {task.lastComment}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#6e6e73', background: '#f2f2f7', borderRadius: '9999px', padding: '3px 9px', fontWeight: 600 }}>
                      {task.commentsCount}×
                    </span>
                    <span style={{ fontSize: '0.78rem', color: '#007AFF' }}>{expanded ? '▲ sluit' : '▼ historie'}</span>
                  </div>
                </div>

                {expanded && (
                  <div style={{ padding: '0 18px 18px' }}>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '14px', marginBottom: '10px' }}>
                        <button type="button" onClick={() => openEdit(task)} style={{ background: 'none', border: 'none', color: '#007AFF', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', padding: 0 }}>Taak bewerken</button>
                        <button type="button" onClick={() => deleteTask(task)} style={{ background: 'none', border: 'none', color: '#FF3B30', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', padding: 0 }}>Taak verwijderen</button>
                      </div>
                    )}
                    <UltimoCommentsPanel taskId={task.id} isAdmin={!!isAdmin} onChange={loadTasks} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Taak toevoegen/bewerken */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingTask ? 'Taak bewerken' : 'Nieuwe taak'}
        footer={
          <>
            <button type="button" onClick={() => setShowModal(false)} style={{ padding: '8px 16px', background: '#f5f5f7', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer' }}>Annuleren</button>
            <button type="button" onClick={saveTask} disabled={saving} style={{ padding: '8px 16px', background: '#007AFF', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>Opslaan</button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Jobnaam</label>
            <input list="dl-jobname" value={form.jobName} onChange={(e) => setForm({ ...form, jobName: e.target.value })} placeholder="bv. Onderhoud pompen hal 2" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Taakomschrijving (looprouteregel)</label>
            <input list="dl-task" value={form.taskDescription} onChange={(e) => setForm({ ...form, taskDescription: e.target.value })} placeholder="bv. Controleer lagering pomp 3" style={inputStyle} />
            <div style={{ fontSize: '0.74rem', color: '#9ca3af', marginTop: '4px' }}>Typ 'm steeds hetzelfde — kies uit de suggesties zodat je historie netjes bij elkaar blijft.</div>
          </div>
          <div>
            <label style={labelStyle}>Installatie / object <span style={{ fontWeight: 400 }}>(optioneel)</span></label>
            <input list="dl-installation" value={form.installation} onChange={(e) => setForm({ ...form, installation: e.target.value })} placeholder="bv. Pomp P-301 / Ketelhuis" style={inputStyle} />
          </div>
          {formError && <div style={{ color: '#FF3B30', fontSize: '0.85rem' }}>{formError}</div>}
        </div>
      </Modal>
    </AppShell>
  );
}
