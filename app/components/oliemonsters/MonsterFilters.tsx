'use client';

// Filteren en sorteren boven de monsterlijst. Op de telefoon twee kolommen met
// het label boven het veld, op desktop een rij met de labels naast de velden
// (.filters in globals.css).

import { Icon } from '@/app/components/ui';
import type { SampleStatus } from '@/lib/sampleStatus';
import type { SampleObject, Sortering } from './types';

interface Props {
  statusFilter: 'all' | SampleStatus;
  onStatus: (s: 'all' | SampleStatus) => void;
  objecten: SampleObject[] | null;
  objectFilter: string;
  onObject: (o: string) => void;
  /** Alleen voor een admin met een gekozen object */
  onBulkAnnuleren?: () => void;
  sortBy: Sortering;
  onSortBy: (s: Sortering) => void;
  sortOrder: 'asc' | 'desc';
  onSortOrder: (o: 'asc' | 'desc') => void;
  /** De jaren om uit te kiezen; null = geen keuze (een kijker met een vast jaar) */
  jaren: number[] | null;
  jaar: number;
  onJaar: (jaar: number) => void;
}

export default function MonsterFilters(p: Props) {
  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      <div className="filters">
        <div className="filter-veld">
          <label className="label filter-label">Status:</label>
          <select
            value={p.statusFilter}
            onChange={(e) => p.onStatus(e.target.value as 'all' | SampleStatus)}
            className="select filter-select"
          >
            <option value="all">Alle monsters</option>
            <option value="genomen">Genomen</option>
            <option value="niet-genomen">Niet genomen</option>
            <option value="niet-bereikbaar">Niet bereikbaar</option>
            <option value="geannuleerd">Geannuleerd</option>
          </select>
        </div>

        {p.objecten && (
          <div className="filter-veld">
            <label className="label filter-label" htmlFor="filter-object">Object:</label>
            <select
              id="filter-object"
              value={p.objectFilter}
              onChange={(e) => p.onObject(e.target.value)}
              className="select filter-select"
            >
              <option value="all">Alle objecten</option>
              <option value="geen">Zonder object</option>
              {p.objecten.map((o) => (
                <option key={o.id} value={String(o.id)}>{o.name}</option>
              ))}
            </select>
          </div>
        )}

        {p.onBulkAnnuleren && (
          <div className="filter-veld filter-veld-breed">
            <button type="button" className="btn btn-sm" onClick={p.onBulkAnnuleren}>
              <Icon name="status-cancelled" size={16} />
              Alle monsters van dit object annuleren
            </button>
          </div>
        )}

        <div className="filter-veld">
          <label className="label filter-label">Sorteren op:</label>
          <select
            value={p.sortBy}
            onChange={(e) => p.onSortBy(e.target.value as Sortering)}
            className="select filter-select"
          >
            <option value="newest">Laatst toegevoegd</option>
            <option value="oNumber">O-nummer</option>
            <option value="sampleDate">Datum</option>
            <option value="location">Locatie</option>
          </select>
        </div>

        {p.sortBy !== 'newest' && (
          <div className="filter-veld">
            <label className="label filter-label filter-label-mobiel">Volgorde:</label>
            <select
              value={p.sortOrder}
              onChange={(e) => p.onSortOrder(e.target.value as 'asc' | 'desc')}
              className="select filter-select"
            >
              <option value="asc">Oplopend</option>
              <option value="desc">Aflopend</option>
            </select>
          </div>
        )}

        {p.jaren && (
          <div className="filter-veld">
            <label className="label filter-label" htmlFor="filter-jaar">Jaar:</label>
            <select
              id="filter-jaar"
              value={String(p.jaar)}
              onChange={(e) => p.onJaar(Number(e.target.value))}
              className="select filter-select"
            >
              {p.jaren.map((j) => (
                <option key={j} value={String(j)}>{j}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
