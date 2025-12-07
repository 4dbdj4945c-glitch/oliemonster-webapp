'use client';

import { useState, useEffect } from 'react';

interface DashboardSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: DashboardSettings) => void;
  currentSettings: DashboardSettings;
}

export interface DashboardSettings {
  title: string;
  subtitle: string;
}

export default function DashboardSettingsModal({ 
  isOpen, 
  onClose, 
  onSave,
  currentSettings 
}: DashboardSettingsModalProps) {
  const [title, setTitle] = useState(currentSettings.title);
  const [subtitle, setSubtitle] = useState(currentSettings.subtitle);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(currentSettings.title);
    setSubtitle(currentSettings.subtitle);
  }, [currentSettings]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      await onSave({ title, subtitle });
      onClose();
    } catch (error) {
      alert('Fout bij opslaan instellingen');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setTitle('Overzicht afname oliemonsters i.o.v. Mourik Infra B.V.');
    setSubtitle('Welkom, {username} ({role})');
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="p-6 rounded-lg shadow-lg max-w-2xl w-full mx-4"
        style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Dashboard Teksten Bewerken</h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
              Titel (onder logo)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ 
                backgroundColor: 'var(--background)', 
                color: 'var(--foreground)', 
                borderColor: 'var(--border)' 
              }}
              placeholder="Bijv: Overzicht afname oliemonsters i.o.v. Mourik Infra B.V."
              required
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Deze tekst verschijnt direct onder het logo
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
              Ondertitel (welkomstbericht)
            </label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ 
                backgroundColor: 'var(--background)', 
                color: 'var(--foreground)', 
                borderColor: 'var(--border)' 
              }}
              placeholder="Bijv: Welkom, {username} ({role})"
              required
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Gebruik <code className="bg-gray-700 px-1 rounded">{'{username}'}</code> en <code className="bg-gray-700 px-1 rounded">{'{role}'}</code> om de ingelogde gebruiker te tonen
            </p>
          </div>

          <div 
            className="p-4 rounded-md border"
            style={{
              backgroundColor: 'var(--background)',
              borderColor: 'var(--border)',
              opacity: 0.7
            }}
          >
            <p className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
              Preview:
            </p>
            <div className="mt-2 space-y-1">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {title}
              </p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {subtitle.replace('{username}', 'Demo Gebruiker').replace('{role}', 'admin')}
              </p>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 border rounded-md transition-colors"
              style={{ 
                borderColor: 'var(--border)', 
                color: 'var(--foreground)' 
              }}
            >
              Standaard Herstellen
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-md transition-colors"
              style={{ 
                borderColor: 'var(--border)', 
                color: 'var(--foreground)' 
              }}
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 rounded-md transition-colors disabled:opacity-50"
              style={{ 
                backgroundColor: 'var(--accent)', 
                color: 'var(--background)'
              }}
            >
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
