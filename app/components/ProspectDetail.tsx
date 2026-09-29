'use client';

import { mailOpstellenAdres } from '@/lib/mailOpstellen';
import Laden from './ui/Laden';
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
  // Na een tik op het telefoonnummer staat het formulier klaar met kanaal Telefoon.
  const [contactKanaal, setContactKanaal] = useState<'MAIL' | 'TELEFOON'>('MAIL');

  const [status, setStatus] = useState<ProspectStatusNaam>('NIEUW');
  const [volgendeActie, setVolgendeActie] = useState('');
  const [volgendeActieOp, setVolgendeActieOp] = useState('');
  const [geschatteWaarde, setGeschatteWaarde] = useState('');
  const [notities, setNotities] = useState('');
  const [kanaal, setKanaal] = useState<'MAIL' | 'LINKEDIN'>('MAIL');
  const [afgemeldOp, setAfgemeldOp] = useState('');
  // Wordt klant: bestaat de naam al als klant, dan bieden we koppelen aan.
  const [bestaandeKlant, setBestaandeKlant] = useState<{ id: number; naam: string } | null>(null);

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

  // Wordt klant: maakt een klant (plus contactpersoon) en koppelt de prospect.
  const wordtKlant = async (klantId?: number) => {
    setBezig(true);
    setFout('');
    try {
      const res = await fetch(`/api/prospects/${prospectId}/wordt-klant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(klantId ? { klantId } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.bestaandeKlant) {
        setBestaandeKlant(data.bestaandeKlant);
        return;
      }
      if (!res.ok) {
        setFout(data.error || 'Omzetten naar klant mislukt.');
        return;
      }
      setBestaandeKlant(null);
      await laad();
      onGewijzigd();
    } catch {
      setFout('Omzetten naar klant mislukt: geen verbinding.');
    } finally {
      setBezig(false);
    }
  };

  const verwijder = async () => {
    if (!prospect) return;
    const n = prospect.contactmomenten.length;
    if (!confirm(
      `${prospect.bedrijfsnaam} verwijderen?\n\n` +
        (n > 0 ? `Daarmee verdwijnen ook ${n === 1 ? 'het contactmoment' : `alle ${n} contactmomenten`} uit de tijdlijn. ` : '') +
        'Dit kan niet ongedaan worden gemaakt. Wil je het alleen uit beeld, kies dan Naar archief.'
    )) return;
    const res = await fetch(`/api/prospects/${prospectId}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setFout(err.error || 'Verwijderen mislukt.');
      return;
    }
    onVerwijderd();
  };

  const verwijderContactmoment = async (moment: ContactmomentRegel) => {
    if (!confirm(
      `Contactmoment van ${datumNL(moment.datum)} (${KANAAL_LABELS[moment.kanaal]}) verwijderen?\n\n"${moment.samenvatting}"\n\nDit kan niet ongedaan worden gemaakt.`
    )) return;
    const res = await fetch(`/api/prospects/${prospectId}/contactmomenten/${moment.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setFout(err.error || 'Verwijderen mislukt.');
      return;
    }
    await laad();
    onGewijzigd();
  };

  if (laden) return <Laden label="Prospect laden" regels={2} />;
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
        {/* Mail opstellen in de e-mail editor, met naam, e-mail en bedrijf al ingevuld */}
        <a
          className="btn btn-sm"
          href={mailOpstellenAdres({ email: prospect.email, naam: prospect.contactpersoon, bedrijf: prospect.bedrijfsnaam })}
          target="_blank"
          rel="noopener"
        >
          <Icon name="module-email" size={16} />Mail opstellen
        </a>
        {prospect.telefoon && (
          <a
            className="btn btn-sm"
            href={`tel:${prospect.telefoon.replace(/\s/g, '')}`}
            onClick={() => {
              if (!isAdmin) return;
              setContactKanaal('TELEFOON');
              setContactOpen(true);
            }}
          >
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

      {/* Klant in de portal: na Wordt klant staat hier de link naar de klant */}
      {(prospect.klantId || isAdmin) && (
        <div className="card card-padded acq-klant">
          <div className="section-label">Klant</div>
          {prospect.klantId ? (
            <p className="acq-klant-tekst">
              {prospect.bedrijfsnaam} is klant in de portal.{' '}
              <a className="btn btn-sm" href={`/dashboard/klanten/${prospect.klantId}`}>
                <Icon name="company" size={16} />Naar klant
              </a>
            </p>
          ) : bestaandeKlant ? (
            <div role="alert">
              <p className="acq-klant-tekst">
                Er is al een klant {bestaandeKlant.naam}. Koppel {prospect.bedrijfsnaam} daaraan, dan komt er geen dubbele klant.
              </p>
              <div className="knoppenrij">
                <button type="button" className="btn btn-primary" onClick={() => wordtKlant(bestaandeKlant.id)} disabled={bezig}>
                  <Icon name="handshake" size={16} />Koppel aan {bestaandeKlant.naam}
                </button>
                <button type="button" className="btn" onClick={() => setBestaandeKlant(null)}>Terug</button>
              </div>
            </div>
          ) : (
            <>
              <p className="acq-klant-tekst">
                Binnen? Maak er een klant van. De bedrijfsnaam en plaats gaan mee{prospect.contactpersoon ? `, en ${prospect.contactpersoon} wordt contactpersoon` : ''}. De status wordt Klant.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => wordtKlant()} disabled={bezig}>
                <Icon name="handshake" size={16} />Wordt klant
              </button>
            </>
          )}
        </div>
      )}

      {/* Werkvelden */}
      <div className="card card-padded">
        <div className="section-label">Status en opvolging</div>
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
          </div>
        )}
        {/* Verwijderen: apart, niet naast Opslaan en Naar archief */}
        {isAdmin && (
          <section className="gevarenzone">
            <p className="gevarenzone-kop">
              <Icon name="trash" size={16} />
              Prospect verwijderen
            </p>
            <p className="gevarenzone-tekst">
              Haalt {prospect.bedrijfsnaam} weg met de hele tijdlijn. Dit kan niet ongedaan worden gemaakt. Alleen uit
              beeld? Gebruik Naar archief.
            </p>
            <button type="button" className="btn btn-sm btn-danger-soft" onClick={verwijder}>
              <Icon name="trash" size={16} />
              Prospect verwijderen...
            </button>
          </section>
        )}
      </div>

      {/* Tijdlijn */}
      <div className="card acq-tijdlijn-kaart">
        <div className="card-kop">
          <span className="section-label">Contactmomenten</span>
          {isAdmin && !contactOpen && (
            <button type="button" className="btn btn-sm" onClick={() => { setContactKanaal('MAIL'); setContactOpen(true); }}>
              <Icon name="plus" size={16} />Contactmoment toevoegen
            </button>
          )}
        </div>
        <div className="acq-tijdlijn-romp">
          {contactOpen && (
            <div style={{ marginBottom: '18px' }}>
              <ProspectContactForm
                key={contactKanaal}
                kanaal={contactKanaal}
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
