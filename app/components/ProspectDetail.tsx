'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from './ui/Icon';
import ProspectContactForm from './ProspectContactForm';
import {
  PROSPECT_STATUSSEN,
  STATUS_LABELS,
  KANAAL_LABELS,
  segmentLabel,
  veiligeUrl,
  datumNL,
  datumVoorVeld,
  type ContactmomentRegel,
  type ProspectRegel,
  type ProspectStatusNaam,
} from '@/lib/prospects';

/*
  Detailscherm van een prospect: alle gegevens, de tijdlijn met contactmomenten
  en de velden die je vaak bijwerkt (status, volgende actie, waarde, notities).
  CSS staat in globals.css (sectie Acquisitie).
*/

interface ProspectMetMomenten extends ProspectRegel {
  contactmomenten: ContactmomentRegel[];
}

interface Props {
  prospectId: number;
  isAdmin: boolean;
  /** Ververst de lijst op de pagina na een wijziging. */
  onGewijzigd: () => void;
  onBewerken: (prospect: ProspectRegel) => void;
  onVerwijderd: () => void;
}

export default function ProspectDetail({ prospectId, isAdmin, onGewijzigd, onBewerken, onVerwijderd }: Props) {
  const [prospect, setProspect] = useState<ProspectMetMomenten | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const [status, setStatus] = useState<ProspectStatusNaam>('NIEUW');
  const [volgendeActie, setVolgendeActie] = useState('');
  const [volgendeActieOp, setVolgendeActieOp] = useState('');
  const [geschatteWaarde, setGeschatteWaarde] = useState('');
  const [notities, setNotities] = useState('');
  const [kanaal, setKanaal] = useState<'MAIL' | 'LINKEDIN'>('MAIL');
  const [afgemeldOp, setAfgemeldOp] = useState('');

  const laad = useCallback(async () => {
    setLaden(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFout(err.error || 'Ophalen mislukt.');
        return;
      }
      const data: ProspectMetMomenten = await res.json();
      setProspect(data);
      setStatus(data.status);
      setVolgendeActie(data.volgendeActie ?? '');
      setVolgendeActieOp(datumVoorVeld(data.volgendeActieOp));
      setGeschatteWaarde(data.geschatteWaarde ? String(data.geschatteWaarde) : '');
      setNotities(data.notities ?? '');
      setKanaal(data.kanaal === 'LINKEDIN' ? 'LINKEDIN' : 'MAIL');
      setAfgemeldOp(datumVoorVeld(data.afgemeldOp));
      setFout('');
    } catch {
      setFout('Ophalen mislukt.');
    } finally {
      setLaden(false);
    }
  }, [prospectId]);

  useEffect(() => { laad(); }, [laad]);

  const bewaar = async (extra: Record<string, unknown> = {}) => {
    setBezig(true);
    setFout('');
    try {
      const res = await fetch(`/api/prospects/${prospectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          volgendeActie,
          volgendeActieOp: volgendeActieOp || null,
          geschatteWaarde: geschatteWaarde === '' ? null : geschatteWaarde,
          notities,
          kanaal,
          afgemeldOp: afgemeldOp || null,
          ...extra,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFout(err.error || 'Opslaan mislukt.');
        return;
      }
      await laad();
      onGewijzigd();
    } finally {
      setBezig(false);
    }
  };

  const verwijder = async () => {
    if (!prospect) return;
    if (!confirm(`${prospect.bedrijfsnaam} en alle contactmomenten verwijderen?`)) return;
    const res = await fetch(`/api/prospects/${prospectId}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setFout(err.error || 'Verwijderen mislukt.');
      return;
    }
    onVerwijderd();
  };

  const verwijderContactmoment = async (moment: ContactmomentRegel) => {
    if (!confirm('Dit contactmoment verwijderen?')) return;
    const res = await fetch(`/api/prospects/${prospectId}/contactmomenten/${moment.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setFout(err.error || 'Verwijderen mislukt.');
      return;
    }
    await laad();
    onGewijzigd();
  };

  if (laden) return <p className="laden">Laden...</p>;
  if (!prospect) return <div className="alert alert-danger"><Icon name="alert-danger" size={16} />{fout || 'Prospect niet gevonden.'}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {fout && <div className="alert alert-danger"><Icon name="alert-danger" size={16} />{fout}</div>}

      {prospect.afgemeldOp && (
        <div className="alert alert-warning">
          <Icon name="alert-warning" size={16} />
          Dit bedrijf heeft zich op {datumNL(prospect.afgemeldOp)} afgemeld. Stuur ze geen mail meer.
        </div>
      )}

      {/* Snel contact leggen */}
      <div className="acq-links">
        {veiligeUrl(prospect.website) && (
          <a className="btn btn-sm" href={veiligeUrl(prospect.website)!} target="_blank" rel="noopener noreferrer">
            <Icon name="website" size={16} />Website
          </a>
        )}
        {veiligeUrl(prospect.linkedin) && (
          <a className="btn btn-sm" href={veiligeUrl(prospect.linkedin)!} target="_blank" rel="noopener noreferrer">
            <Icon name="external-link" size={16} />LinkedIn
          </a>
        )}
        {prospect.email && (
          <a className="btn btn-sm" href={`mailto:${prospect.email}`}>
            <Icon name="mail" size={16} />{prospect.email}
          </a>
        )}
        {prospect.telefoon && (
          <a className="btn btn-sm" href={`tel:${prospect.telefoon.replace(/\s/g, '')}`}>
            <Icon name="phone" size={16} />{prospect.telefoon}
          </a>
        )}
        {veiligeUrl(prospect.bron) && (
          <a className="btn btn-sm" href={veiligeUrl(prospect.bron)!} target="_blank" rel="noopener noreferrer">
            <Icon name="external-link" size={16} />Bron
          </a>
        )}
      </div>

      {/* Waarom dit bedrijf */}
      {(prospect.aanknopingspunt || prospect.activiteit || prospect.signaal) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {prospect.activiteit && (
            <div>
              <div className="acq-gegeven-label">Wat ze doen</div>
              <div className="acq-gegeven-waarde">{prospect.activiteit}</div>
            </div>
          )}
          {prospect.aanknopingspunt && (
            <div>
              <div className="acq-gegeven-label">Aanknopingspunt</div>
              <div className="acq-gegeven-waarde">{prospect.aanknopingspunt}</div>
            </div>
          )}
          {prospect.signaal && (
            <div>
              <div className="acq-gegeven-label">Signaal</div>
              <div className="acq-gegeven-waarde">{prospect.signaal}</div>
            </div>
          )}
        </div>
      )}

      {/* Vaste gegevens */}
      <div className="acq-gegevens">
        <Gegeven label="Segment" waarde={segmentLabel(prospect.segment)} />
        <Gegeven label="Plaats" waarde={[prospect.plaats, prospect.provincie].filter(Boolean).join(', ')} />
        <Gegeven label="Afstand" waarde={prospect.afstandKm ? `${prospect.afstandKm} km vanaf Heeze` : null} />
        <Gegeven label="Omvang" waarde={prospect.omvang} />
        <Gegeven label="Contactpersoon" waarde={[prospect.contactpersoon, prospect.functie].filter(Boolean).join(', ')} />
        <Gegeven label="Score" waarde={prospect.score ? `${prospect.score} van 5${prospect.scoreReden ? `, ${prospect.scoreReden}` : ''}` : null} />
        <Gegeven label="Laatste contact" waarde={datumNL(prospect.laatsteContactOp) || 'Nog geen contact'} />
        <Gegeven label="Klant sinds" waarde={datumNL(prospect.klantSindsOp)} />
      </div>

      {/* Werkvelden */}
      <div className="card card-padded">
        <div className="section-label">Bijwerken</div>
        <div className="acq-velden" style={{ marginTop: '10px' }}>
          <div>
            <label className="label" htmlFor="detail-status">Status</label>
            <select
              id="detail-status"
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProspectStatusNaam)}
              disabled={!isAdmin}
            >
              {PROSPECT_STATUSSEN.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="detail-waarde">Geschatte waarde (euro)</label>
            <input
              id="detail-waarde"
              className="input"
              inputMode="numeric"
              value={geschatteWaarde}
              onChange={(e) => setGeschatteWaarde(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="bv. 5500"
              disabled={!isAdmin}
            />
          </div>
          <div>
            <label className="label" htmlFor="detail-actie">Volgende actie</label>
            <input
              id="detail-actie"
              className="input"
              value={volgendeActie}
              onChange={(e) => setVolgendeActie(e.target.value)}
              placeholder="bv. Mail sturen naar onderhoudsmanager"
              disabled={!isAdmin}
            />
          </div>
          <div>
            <label className="label" htmlFor="detail-actie-op">Wanneer</label>
            <input
              id="detail-actie-op"
              type="date"
              className="input"
              value={volgendeActieOp}
              onChange={(e) => setVolgendeActieOp(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div>
            <label className="label" htmlFor="detail-kanaal">Benaderen via</label>
            <select
              id="detail-kanaal"
              className="select"
              value={kanaal}
              onChange={(e) => setKanaal(e.target.value as 'MAIL' | 'LINKEDIN')}
              disabled={!isAdmin}
            >
              <option value="MAIL">Mail</option>
              <option value="LINKEDIN">LinkedIn</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="detail-afgemeld">Afgemeld op</label>
            <input
              id="detail-afgemeld"
              type="date"
              className="input"
              value={afgemeldOp}
              onChange={(e) => setAfgemeldOp(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div className="acq-velden-breed">
            <label className="label" htmlFor="detail-notities">Notities</label>
            <textarea
              id="detail-notities"
              className="textarea"
              rows={3}
              value={notities}
              onChange={(e) => setNotities(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
        </div>
        {isAdmin && (
          <div className="knoppenrij" style={{ marginTop: '12px' }}>
            <button type="button" className="btn btn-primary" onClick={() => bewaar()} disabled={bezig}>
              <Icon name="check" size={16} />Opslaan
            </button>
            <button type="button" className="btn" onClick={() => onBewerken(prospect)}>
              <Icon name="pencil" size={16} />Alle gegevens bewerken
            </button>
            <button type="button" className="btn" onClick={() => bewaar({ archief: !prospect.archief })} disabled={bezig}>
              <Icon name="archive" size={16} />{prospect.archief ? 'Uit archief halen' : 'Naar archief'}
            </button>
            <button type="button" className="btn btn-danger-soft" onClick={verwijder}>
              <Icon name="trash" size={16} />Verwijderen
            </button>
          </div>
        )}
      </div>

      {/* Tijdlijn */}
      <div className="card acq-tijdlijn-kaart">
        <div className="card-kop">
          <span className="section-label">Contactmomenten</span>
          {isAdmin && !contactOpen && (
            <button type="button" className="btn btn-sm btn-blue" onClick={() => setContactOpen(true)}>
              <Icon name="plus" size={16} />Contactmoment toevoegen
            </button>
          )}
        </div>
        <div className="acq-tijdlijn-romp">
          {contactOpen && (
            <div style={{ marginBottom: '18px' }}>
              <ProspectContactForm
                prospect={prospect}
                onOpgeslagen={async () => { setContactOpen(false); await laad(); onGewijzigd(); }}
                onAnnuleren={() => setContactOpen(false)}
              />
            </div>
          )}

          {prospect.contactmomenten.length === 0 ? (
            <div className="leeg">
              <Icon name="empty" size={32} />
              Nog geen contact gehad met dit bedrijf.
            </div>
          ) : (
            <ul className="acq-tijdlijn">
              {prospect.contactmomenten.map((moment) => (
                <li key={moment.id} className="acq-tijdlijn-item">
                  <div className="acq-tijdlijn-kop">
                    <span className="badge badge-info">{KANAAL_LABELS[moment.kanaal]}</span>
                    <span>{datumNL(moment.datum)}</span>
                    {moment.aangemaaktDoor && <span>door {moment.aangemaaktDoor}</span>}
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn-link btn-link-danger"
                        onClick={() => verwijderContactmoment(moment)}
                      >
                        Verwijderen
                      </button>
                    )}
                  </div>
                  <div className="acq-tijdlijn-tekst">{moment.samenvatting}</div>
                  {moment.uitkomst && <div className="acq-tijdlijn-uitkomst">Uitkomst: {moment.uitkomst}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Gegeven({ label, waarde }: { label: string; waarde: string | null | undefined }) {
  if (!waarde) return null;
  return (
    <div>
      <div className="acq-gegeven-label">{label}</div>
      <div className="acq-gegeven-waarde">{waarde}</div>
    </div>
  );
}
