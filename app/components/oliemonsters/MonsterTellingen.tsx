'use client';

// Statistieken boven de lijst: totaal plus de vier statussen. Een tik erop filtert.

import { Icon } from '@/app/components/ui';
import type { SampleStatus } from '@/lib/sampleStatus';

interface Props {
  totaal: number;
  totalen: Record<SampleStatus, number>;
  statusFilter: 'all' | SampleStatus;
  onFilter: (status: 'all' | SampleStatus) => void;
}

export default function MonsterTellingen({ totaal, totalen, statusFilter, onFilter }: Props) {
  return (
    <div className="stats-grid stats-grid-vijf mb-6">
      <div
        className="stat-card stat-card-icoon"
        onClick={() => onFilter('all')}
        style={{
          cursor: 'pointer',
          borderColor: statusFilter === 'all' ? 'var(--blue)' : undefined,
          boxShadow: statusFilter === 'all' ? '0 0 0 3px var(--blue-light)' : undefined,
        }}
      >
        <Icon name="total" />
        <p className="stat-value">{totaal}</p>
        <p className="stat-label">Totaal monsters</p>
      </div>
      <div
        className="stat-card stat-card-icoon is-genomen"
        onClick={() => onFilter('genomen')}
        style={{
          cursor: 'pointer',
          borderLeft: '4px solid var(--groen)',
          borderColor: statusFilter === 'genomen' ? 'var(--groen)' : undefined,
          boxShadow: statusFilter === 'genomen' ? '0 0 0 3px var(--groen-light)' : undefined,
        }}
      >
        <Icon name="status-taken" />
        <p className="stat-value" style={{ color: 'var(--groen-tekst)' }}>{totalen.genomen}</p>
        <p className="stat-label">Genomen</p>
      </div>
      <div
        className="stat-card stat-card-icoon is-niet-genomen"
        onClick={() => onFilter('niet-genomen')}
        style={{
          cursor: 'pointer',
          borderLeft: '4px solid var(--rood)',
          borderColor: statusFilter === 'niet-genomen' ? 'var(--rood)' : undefined,
          boxShadow: statusFilter === 'niet-genomen' ? '0 0 0 3px var(--rood-light)' : undefined,
        }}
      >
        <Icon name="status-not-taken" />
        <p className="stat-value" style={{ color: 'var(--rood-tekst)' }}>{totalen['niet-genomen']}</p>
        <p className="stat-label">Niet genomen</p>
      </div>
      <div
        className="stat-card stat-card-icoon"
        onClick={() => onFilter('niet-bereikbaar')}
        style={{
          cursor: 'pointer',
          borderLeft: '4px solid var(--oranje)',
          borderColor: statusFilter === 'niet-bereikbaar' ? 'var(--oranje)' : undefined,
          boxShadow: statusFilter === 'niet-bereikbaar' ? '0 0 0 3px var(--oranje-light)' : undefined,
        }}
      >
        <Icon name="alert-warning" />
        <p className="stat-value" style={{ color: 'var(--geel-tekst)' }}>{totalen['niet-bereikbaar']}</p>
        <p className="stat-label">Niet bereikbaar</p>
      </div>
      <div
        className="stat-card stat-card-icoon"
        onClick={() => onFilter('geannuleerd')}
        style={{
          cursor: 'pointer',
          borderLeft: '4px solid var(--grijs-400)',
          borderColor: statusFilter === 'geannuleerd' ? 'var(--grijs-400)' : undefined,
          boxShadow: statusFilter === 'geannuleerd' ? '0 0 0 3px var(--grijs-200)' : undefined,
        }}
      >
        <Icon name="status-cancelled" />
        <p className="stat-value" style={{ color: 'var(--grijs-500)' }}>{totalen.geannuleerd}</p>
        <p className="stat-label">Geannuleerd</p>
      </div>
    </div>
  );
}

/**
 * Dezelfde tellingen als filterchips op één regel, voor de compacte lijst op de
 * telefoon (niet voor de kijker). Eén tik filtert, nog een tik op de actieve
 * chip zet het filter terug op Alle.
 */
export function StatusChips({ totaal, totalen, statusFilter, onFilter }: Props) {
  const chips: { waarde: 'all' | SampleStatus; label: string; aantal: number }[] = [
    { waarde: 'all', label: 'Alle', aantal: totaal },
    { waarde: 'niet-genomen', label: 'Niet genomen', aantal: totalen['niet-genomen'] },
    { waarde: 'genomen', label: 'Genomen', aantal: totalen.genomen },
    { waarde: 'niet-bereikbaar', label: 'Niet bereikbaar', aantal: totalen['niet-bereikbaar'] },
    { waarde: 'geannuleerd', label: 'Geannuleerd', aantal: totalen.geannuleerd },
  ];
  return (
    <div className="filterchips" role="group" aria-label="Filter op status">
      {chips
        .filter((c) => c.waarde === 'all' || c.aantal > 0 || statusFilter === c.waarde)
        .map((c) => (
          <button
            key={c.waarde}
            type="button"
            className={`filterchip${statusFilter === c.waarde ? ' on' : ''}`}
            aria-pressed={statusFilter === c.waarde}
            onClick={() => onFilter(statusFilter === c.waarde ? 'all' : c.waarde)}
          >
            {c.label}
            <span className="filterchip-aantal">{c.aantal}</span>
          </button>
        ))}
    </div>
  );
}
