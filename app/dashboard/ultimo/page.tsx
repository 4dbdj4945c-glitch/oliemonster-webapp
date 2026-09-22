'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, Modal, Icon } from '@/app/components/ui';
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
      if (data.role === 'viewer_oil2025') { router.replace('/dashboard/oliemonsters'); return; }
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

  return (
    <AppShell
      title="Ultimo-opmerkingen"
      user={user}
    >
      <style jsx>{`
        .zoekrij {
          display: flex;
          gap: 10px;
          align-items: center;
          margin: 8px 0 20px;
          flex-wrap: wrap;
        }
        .zoekveld {
          position: relative;
          flex: 1 1 280px;
        }
        .taak-rechts {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
        }
        .taak-toggle {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 12px;
          font-weight: 500;
          color: var(--blue);
        }
        /* Telefoon: zoekveld en knop onder elkaar op volle breedte, tikdoelen 40px */
        @media (max-width: 640px) {
          .zoekrij {
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
          }
          .zoekveld {
            flex: none;
          }
          .zoekrij :global(.btn) {
            width: 100%;
          }
          .taak-rechts {
            gap: 8px;
          }
          .taak-rechts :global(.badge) {
            min-height: 32px;
            padding: 0 12px;
            font-size: 12px;
          }
          .taak-toggle {
            min-height: 40px;
            padding: 0 10px;
            margin-right: -10px;
            border-radius: var(--radius-md);
            font-size: 13px;
          }
        }
      `}</style>

      <h1 className="page-title">Ultimo-opmerkingen</h1>
      <p className="page-subtitle">
        Houd per onderhoudstaak (looprouteregel) bij welke opmerking je wanneer in Ultimo plaatste, en kopieer &apos;m de volgende keer exact opnieuw.
      </p>

      {/* Zoekbalk + nieuwe taak */}
      <datalist id="dl-jobname">{jobNames.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-task">{taskDescs.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-installation">{installations.map((v) => <option key={v} value={v} />)}</datalist>

      <div className="zoekrij">
        <div className="zoekveld">
          <Icon name="search" />
          <input
            type="search"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op taak, jobnaam, installatie, jobnummer of opmerking"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={openAdd}>
            <Icon name="plus" />
            Nieuwe taak
          </button>
        )}
      </div>

      {loading ? (
        <p className="laden">Laden...</p>
      ) : tasks.length === 0 ? (
        <div className="leeg">
          <Icon name="empty" size={32} />
          {search
            ? <>Geen taken gevonden voor &ldquo;{search}&rdquo;.</>
            : <>Nog geen taken. {isAdmin && 'Klik op "Nieuwe taak" om te beginnen.'}</>}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {tasks.map((task) => {
            const expanded = expandedId === task.id;
            return (
              <li key={task.id} className="rij-item">
                <div className="rij-item-kop" onClick={() => setExpandedId(expanded ? null : task.id)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="eyebrow">{task.jobName}</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--navy)', marginTop: '2px' }}>{task.taskDescription}</div>
                    {task.installation && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: 'var(--grijs-500)', marginTop: '4px' }}>
                        <Icon name="map-pin" size={16} />
                        <span>{task.installation}</span>
                      </div>
                    )}
                    {task.lastComment && (
                      <div style={{ fontSize: '13px', color: 'var(--grijs-700)', marginTop: '8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        <span style={{ color: 'var(--grijs-500)' }}>Laatst{task.lastDate ? ` (${formatDate(task.lastDate)})` : ''}: </span>
                        {task.lastComment}
                      </div>
                    )}
                  </div>
                  <div className="taak-rechts">
                    <span className="badge badge-gray" title={`${task.commentsCount} opmerkingen`}><Icon name="comment" size={16} />{task.commentsCount}</span>
                    <span className="taak-toggle">
                      <span style={{ display: 'flex', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><Icon name="chevron-down" size={16} /></span>
                      {expanded ? 'Sluit' : 'Historie'}
                    </span>
                  </div>
                </div>

                {expanded && (
                  <div className="rij-item-romp">
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '14px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <button type="button" className="btn-link" onClick={() => openEdit(task)}>Taak bewerken</button>
                        <button type="button" className="btn-link btn-link-danger" onClick={() => deleteTask(task)}>Taak verwijderen</button>
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
            <button type="button" className="btn" onClick={() => setShowModal(false)}>Annuleren</button>
            <button type="button" className="btn btn-primary" onClick={saveTask} disabled={saving}>Opslaan</button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="label">Jobnaam</label>
            <input className="input" list="dl-jobname" autoComplete="off" value={form.jobName} onChange={(e) => setForm({ ...form, jobName: e.target.value })} placeholder="bv. Onderhoud pompen hal 2" />
          </div>
          <div>
            <label className="label">Taakomschrijving (looprouteregel)</label>
            <input className="input" list="dl-task" autoComplete="off" value={form.taskDescription} onChange={(e) => setForm({ ...form, taskDescription: e.target.value })} placeholder="bv. Controleer lagering pomp 3" />
            <p className="hint">Typ &apos;m steeds hetzelfde en kies uit de suggesties, zodat je historie netjes bij elkaar blijft.</p>
          </div>
          <div>
            <label className="label">Installatie / object <span style={{ fontWeight: 400 }}>(optioneel)</span></label>
            <input className="input" list="dl-installation" autoComplete="off" value={form.installation} onChange={(e) => setForm({ ...form, installation: e.target.value })} placeholder="bv. Pomp P-301 / Ketelhuis" />
          </div>
          {formError && <div className="alert alert-danger">{formError}</div>}
        </div>
      </Modal>
    </AppShell>
  );
}
