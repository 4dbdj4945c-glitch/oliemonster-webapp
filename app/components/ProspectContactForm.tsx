'use client';

import { useState } from 'react';
import Icon from './ui/Icon';
import type { IconNaam } from './ui';
import {
  PROSPECT_KANALEN,
  PROSPECT_STATUSSEN,
  KANAAL_LABELS,
  STATUS_LABELS,
  datumVoorVeld,
  type ProspectKanaalNaam,
  type ProspectRegel,
  type ProspectStatusNaam,
} from '@/lib/prospects';

/*
  Contactmoment vastleggen bij een prospect. Bewust kort: kanaal aantikken,
  in een zin opschrijven wat je gedaan hebt en opslaan. Status en volgende actie
  gaan in dezelfde opslagactie mee, zodat het op de telefoon één handeling is.
  CSS staat in globals.css (sectie Acquisitie).
*/

const KANAAL_ICOON: Record<ProspectKanaalNaam, IconNaam> = {
  MAIL: 'mail',
  LINKEDIN: 'external-link',
  TELEFOON: 'phone',
  BEZOEK: 'map-pin',
  OFFERTE: 'euro',
  OVERIG: 'comment',
};

function vandaagISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface Props {
  prospect: ProspectRegel;
  /** Roept de pagina terug zodra er is opgeslagen. */
  onOpgeslagen: () => void;
  onAnnuleren?: () => void;
}

export default function ProspectContactForm({ prospect, onOpgeslagen, onAnnuleren }: Props) {
  const [kanaal, setKanaal] = useState<ProspectKanaalNaam>('MAIL');
  const [datum, setDatum] = useState(vandaagISO());
  const [samenvatting, setSamenvatting] = useState('');
  const [uitkomst, setUitkomst] = useState('');
  const [status, setStatus] = useState<ProspectStatusNaam>(prospect.status);
  const [volgendeActie, setVolgendeActie] = useState(prospect.volgendeActie ?? '');
  const [volgendeActieOp, setVolgendeActieOp] = useState(datumVoorVeld(prospect.volgendeActieOp));
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);

  const opslaan = async () => {
    if (!samenvatting.trim()) {
      setFout('Schrijf kort op wat je gedaan hebt.');
      return;
    }
    setBezig(true);
    setFout('');
    try {
      const res = await fetch(`/api/prospects/${prospect.id}/contactmomenten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datum,
          kanaal,
          samenvatting,
          uitkomst,
          status,
          volgendeActie,
          volgendeActieOp: volgendeActieOp || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFout(err.error || 'Opslaan mislukt.');
        return;
      }
      setSamenvatting('');
      setUitkomst('');
      onOpgeslagen();
    } finally {
      setBezig(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label className="label">Hoe had je contact</label>
        <div className="acq-kanalen">
          {PROSPECT_KANALEN.map((k) => (
            <button
              key={k}
              type="button"
              className={`acq-kanaal${kanaal === k ? ' on' : ''}`}
              onClick={() => setKanaal(k)}
              aria-pressed={kanaal === k}
            >
              <Icon name={KANAAL_ICOON[k]} size={16} />
              {KANAAL_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="acq-samenvatting">Wat heb je gedaan</label>
        <textarea
          id="acq-samenvatting"
          className="textarea"
          rows={3}
          value={samenvatting}
          onChange={(e) => setSamenvatting(e.target.value)}
          placeholder="bv. Mail gestuurd naar onderhoudsmanager over de hydraulische persen"
        />
      </div>

      <div className="acq-velden">
        <div>
          <label className="label" htmlFor="acq-datum">Datum</label>
          <input
            id="acq-datum"
            type="date"
            className="input"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="acq-status">Status na dit contact</label>
          <select
            id="acq-status"
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProspectStatusNaam)}
          >
            {PROSPECT_STATUSSEN.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className="acq-velden-breed">
          <label className="label" htmlFor="acq-uitkomst">Uitkomst <span style={{ fontWeight: 400 }}>(mag leeg blijven)</span></label>
          <input
            id="acq-uitkomst"
            className="input"
            value={uitkomst}
            onChange={(e) => setUitkomst(e.target.value)}
            placeholder="bv. Geen reactie, of: wil een afspraak in oktober"
          />
        </div>
        <div>
          <label className="label" htmlFor="acq-volgende">Volgende actie</label>
          <input
            id="acq-volgende"
            className="input"
            value={volgendeActie}
            onChange={(e) => setVolgendeActie(e.target.value)}
            placeholder="bv. Opvolgen via LinkedIn"
          />
        </div>
        <div>
          <label className="label" htmlFor="acq-volgende-op">Wanneer</label>
          <input
            id="acq-volgende-op"
            type="date"
            className="input"
            value={volgendeActieOp}
            onChange={(e) => setVolgendeActieOp(e.target.value)}
          />
        </div>
      </div>

      {fout && <div className="alert alert-danger"><Icon name="alert-danger" size={16} />{fout}</div>}

      <div className="knoppenrij">
        <button type="button" className="btn btn-primary" onClick={opslaan} disabled={bezig}>
          <Icon name="check" size={16} />
          {bezig ? 'Bezig...' : 'Contactmoment opslaan'}
        </button>
        {onAnnuleren && (
          <button type="button" className="btn" onClick={onAnnuleren} disabled={bezig}>Annuleren</button>
        )}
      </div>
    </div>
  );
}
