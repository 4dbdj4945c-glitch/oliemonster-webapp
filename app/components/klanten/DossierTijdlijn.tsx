'use client';

/*
  Het klantdossier: links de objecten met hun installaties, rechts van het
  gekozen object of de gekozen installatie de gegevens en een tijdlijn van
  momenten (monsters met status en foto's, niet bereikbaar, geannuleerd, open).
  Ontwerp: portaal-plan/04-ontwerp/ontwerp-klantdossier-*. Opmaak: .dossier-*
  in globals.css. Gegevens: GET /api/klanten/[id]/dossier.
*/

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconNaam } from '@/app/components/ui';
import PhotoModal, { type FotoInVenster } from '@/app/components/PhotoModal';
import { installatieSoortIcoon, installatieSoortLabel } from '@/lib/installaties';
import { objectTypeIcoon, objectTypeLabel } from '@/lib/sampleObjects';
import type { Dossier, DossierInstallatie, DossierObject, Moment, MomentSoort } from './types';

export type DossierKeuze = { soort: 'object' | 'installatie'; id: number } | { soort: 'los' };

const EERSTE = 10;

const SOORT: Record<MomentSoort, { icoon: IconNaam; badge: string; label: string }> = {
  monster: { icoon: 'oil-sample', badge: 'badge-success', label: 'Genomen' },
  poging: { icoon: 'resample', badge: 'badge-gray', label: 'Niet genomen' },
  'niet-bereikbaar': { icoon: 'alert-warning', badge: 'badge-warning', label: 'Niet bereikbaar' },
  geannuleerd: { icoon: 'status-cancelled', badge: 'badge-gray', label: 'Geannuleerd' },
  open: { icoon: 'calendar', badge: 'badge-gray', label: 'Nog in te plannen' },
};

const GEPLAND = { icoon: 'status-planned' as IconNaam, badge: 'badge-info', label: 'Gepland' };

type Filter = 'alles' | 'monster' | 'open' | 'niet-bereikbaar' | 'geannuleerd';
const FILTERS: { sleutel: Filter; naam: string }[] = [
  { sleutel: 'alles', naam: 'Alles' },
  { sleutel: 'monster', naam: 'Genomen' },
  { sleutel: 'open', naam: 'Open' },
  { sleutel: 'niet-bereikbaar', naam: 'Niet bereikbaar' },
  { sleutel: 'geannuleerd', naam: 'Geannuleerd' },
];

function past(m: Moment, f: Filter): boolean {
  if (f === 'alles') return true;
  if (f === 'monster') return m.soort === 'monster' || m.soort === 'poging';
  return m.soort === f;
}

export function momentenVan(dossier: Dossier, keuze: DossierKeuze): Moment[] {
  if (keuze.soort === 'los') return dossier.momenten.filter((m) => m.objectId === null);
  if (keuze.soort === 'installatie') return dossier.momenten.filter((m) => m.installatieId === keuze.id);
  return dossier.momenten.filter((m) => m.objectId === keuze.id);
}

const dagDatum = (dag: string) => new Date(`${dag}T12:00:00`);

export default function DossierTijdlijn({
  klantId,
  dossier,
  keuze,
  onKies,
  onNieuweInstallatie,
}: {
  klantId: number;
  dossier: Dossier;
  keuze: DossierKeuze | null;
  onKies: (k: DossierKeuze) => void;
  onNieuweInstallatie: (o: DossierObject) => void;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('alles');
  const [alles, setAlles] = useState(false);
  const [foto, setFoto] = useState<{ fotos: FotoInVenster[]; start: number; nummer: string } | null>(null);

  // Het aantal monsters (ook open en gepland), niet het aantal momenten.
  const aantalVoor = (k: DossierKeuze) => new Set(momentenVan(dossier, k).map((m) => m.monsterId)).size;
  const isGekozen = (k: DossierKeuze) =>
    !!keuze && keuze.soort === k.soort && (k.soort === 'los' || (keuze.soort !== 'los' && keuze.id === k.id));

  if (dossier.objecten.length === 0 && !dossier.heeftLosseMonsters) {
    return (
      <div className="card leeg">
        <Icon name="map-pin" size={32} />
        <p>
          Nog geen objecten bij deze klant. Maak eerst een object aan (een vestiging, kunstwerk of locatie); daarop
          zet je daarna de installaties. Een bestaand object koppel je bij Gegevens.
        </p>
        <div className="knoppenrij dossier-leeg-knoppen">
          <a
            className="btn"
            href={`/dashboard/objecten?nieuw=1&klant=${klantId}`}
            onClick={(e) => {
              e.preventDefault();
              router.push(`/dashboard/objecten?nieuw=1&klant=${klantId}`);
            }}
          >
            <Icon name="plus" size={16} />
            Object toevoegen
          </a>
          <button type="button" className="btn" disabled title="Kan zodra er een object is">
            <Icon name="pump" size={16} />
            Installatie toevoegen
          </button>
        </div>
        <p className="hint">Installatie toevoegen kan zodra er een object is.</p>
      </div>
    );
  }

  const object = keuze?.soort === 'object' ? dossier.objecten.find((o) => o.id === keuze.id) ?? null : null;
  let installatie: DossierInstallatie | null = null;
  let objectVanInstallatie: DossierObject | null = null;
  if (keuze?.soort === 'installatie') {
    for (const o of dossier.objecten) {
      const i = o.installaties.find((x) => x.id === keuze.id);
      if (i) {
        installatie = i;
        objectVanInstallatie = o;
      }
    }
  }

  const momenten = keuze ? momentenVan(dossier, keuze) : [];
  const gefilterd = momenten.filter((m) => past(m, filter));
  const zichtbaar = alles ? gefilterd : gefilterd.slice(0, EERSTE);

  const kiesItem = (k: DossierKeuze) => {
    onKies(k);
    setFilter('alles');
    setAlles(false);
  };

  return (
    <div className="dossier">
      {/* ---------- Objecten en installaties ---------- */}
      <nav className="card dossier-lijst" aria-label="Objecten en installaties">
        {dossier.objecten.map((o) => (
          <div key={o.id} className="dossier-groep">
            <button
              type="button"
              className={`dossier-item${isGekozen({ soort: 'object', id: o.id }) ? ' on' : ''}`}
              aria-current={isGekozen({ soort: 'object', id: o.id }) ? 'true' : undefined}
              onClick={() => kiesItem({ soort: 'object', id: o.id })}
            >
              <span className="icoonvak" title={objectTypeLabel(o.objectType)}><Icon name={objectTypeIcoon(o.objectType)} size={20} /></span>
              <span className="dossier-item-tekst">
                <b>{o.name}</b>
                <small>
                  {o.installaties.length} {o.installaties.length === 1 ? 'installatie' : 'installaties'}
                  {o.region ? `, ${o.region}` : ''}
                </small>
              </span>
              <span className="badge badge-gray" title="Aantal monsters, ook open en gepland">{aantalVoor({ soort: 'object', id: o.id })}</span>
            </button>
            {o.installaties.map((i) => (
              <button
                key={i.id}
                type="button"
                className={`dossier-item dossier-item-sub${isGekozen({ soort: 'installatie', id: i.id }) ? ' on' : ''}`}
                aria-current={isGekozen({ soort: 'installatie', id: i.id }) ? 'true' : undefined}
                onClick={() => kiesItem({ soort: 'installatie', id: i.id })}
              >
                <Icon name={installatieSoortIcoon(i.soort)} size={16} />
                <span className="dossier-item-tekst">
                  <b>{i.naam}</b>
                  <small>{[installatieSoortLabel(i.soort), i.bouwjaar ? `bouwjaar ${i.bouwjaar}` : null].filter(Boolean).join(', ')}</small>
                </span>
              </button>
            ))}
          </div>
        ))}
        {dossier.heeftLosseMonsters && (
          <button
            type="button"
            className={`dossier-item${isGekozen({ soort: 'los' }) ? ' on' : ''}`}
            onClick={() => kiesItem({ soort: 'los' })}
          >
            <span className="icoonvak"><Icon name="oil-sample" size={20} /></span>
            <span className="dossier-item-tekst">
              <b>Zonder object</b>
              <small>Monsters met alleen een locatie</small>
            </span>
            <span className="badge badge-gray" title="Aantal monsters, ook open en gepland">{aantalVoor({ soort: 'los' })}</span>
          </button>
        )}
      </nav>

      {/* ---------- Detail en tijdlijn ---------- */}
      <section className="card dossier-detail" aria-live="polite">
        {!keuze ? (
          <div className="leeg">
            <Icon name="empty" size={32} />
            <p>Kies links een object of installatie.</p>
          </div>
        ) : (
          <>
            <div className="dossier-detailkop">
              {installatie?.fotoUrl && (
                <button
                  type="button"
                  className="dossier-detailfoto"
                  onClick={() => setFoto({ fotos: [{ url: installatie!.fotoUrl!, label: 'Foto installatie' }], start: 0, nummer: installatie!.code })}
                  aria-label={`Foto van ${installatie.naam} groot bekijken`}
                >
                  <img src={installatie.fotoUrl} alt="" />
                </button>
              )}
              <div className="dossier-detailtekst">
                <h2>{installatie?.naam ?? object?.name ?? 'Zonder object'}</h2>
                {installatie && (
                  <dl className="dossier-specs">
                    <div><dt>Soort</dt><dd>{installatieSoortLabel(installatie.soort)}</dd></div>
                    {installatie.merk && <div><dt>Merk</dt><dd>{installatie.merk}</dd></div>}
                    {installatie.typenummer && <div><dt>Type</dt><dd>{installatie.typenummer}</dd></div>}
                    {installatie.bouwjaar && <div><dt>Bouwjaar</dt><dd>{installatie.bouwjaar}</dd></div>}
                    <div><dt>Object</dt><dd>{objectVanInstallatie?.name}</dd></div>
                  </dl>
                )}
                {object && (
                  <dl className="dossier-specs">
                    <div><dt>Soort</dt><dd>{objectTypeLabel(object.objectType)}</dd></div>
                    {object.address && <div><dt>Adres</dt><dd>{object.address}</dd></div>}
                    <div><dt>Installaties</dt><dd>{object.installaties.length}</dd></div>
                  </dl>
                )}
                <div className="dossier-links">
                  {installatie && (
                    <a
                      href={`/dashboard/installaties/${installatie.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        router.push(`/dashboard/installaties/${installatie!.id}`);
                      }}
                    >
                      <Icon name="pump" size={16} />
                      Installatie openen
                    </a>
                  )}
                  {installatie && (
                    <span className="dossier-code"><Icon name="tag" size={16} />QR-code {installatie.code}</span>
                  )}
                  {object && (
                    <button type="button" className="btn-link" onClick={() => onNieuweInstallatie(object)}>
                      <Icon name="plus" size={16} />
                      Installatie toevoegen
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="dossier-chips" role="group" aria-label="Soort moment">
              {FILTERS.map((f) => {
                const n = momenten.filter((m) => past(m, f.sleutel)).length;
                if (f.sleutel !== 'alles' && n === 0) return null;
                return (
                  <button
                    key={f.sleutel}
                    type="button"
                    className={`dossier-chip${filter === f.sleutel ? ' on' : ''}`}
                    aria-pressed={filter === f.sleutel}
                    onClick={() => { setFilter(f.sleutel); setAlles(false); }}
                  >
                    {f.naam} <span className="dossier-chip-aantal">{n}</span>
                  </button>
                );
              })}
            </div>

            {gefilterd.length === 0 ? (
              <p className="dossier-leeg">Nog niets in {dossier.jaar ? dossier.jaar : 'dit dossier'}.</p>
            ) : (
              <ol className="dossier-tijdlijn">
                {zichtbaar.map((m) => {
                  const w = m.soort === 'open' && m.gepland ? GEPLAND : SOORT[m.soort];
                  return (
                    <li key={m.sleutel} className="moment">
                      <div className="moment-datum">
                        {m.datum ? (
                          <>
                            <b>{dagDatum(m.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</b>
                            {dagDatum(m.datum).getFullYear()}
                          </>
                        ) : (
                          <b>Open</b>
                        )}
                      </div>
                      <div className="moment-lijn" aria-hidden="true">
                        <span className="moment-punt"><Icon name={w.icoon} size={16} /></span>
                      </div>
                      <div className="moment-inhoud">
                        <div className="moment-kop">
                          <b>{m.titel}</b>
                          <span className={`badge ${w.badge}`}>{w.label}</span>
                        </div>
                        {m.tekst && <p>{m.tekst}</p>}
                        {m.door && <p className="moment-door">Vastgelegd door {m.door}</p>}
                        {m.fotos.length > 0 && (
                          <div className="moment-fotos">
                            {m.fotos.map((f, i) => (
                              <button
                                key={f.url}
                                type="button"
                                onClick={() => setFoto({ fotos: m.fotos, start: i, nummer: m.oNumber })}
                                aria-label={`${f.label} van ${m.oNumber} groot bekijken`}
                              >
                                <img src={f.url} alt="" loading="lazy" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {gefilterd.length > EERSTE && (
              <div className="dossier-meer">
                <button type="button" className="btn-link" onClick={() => setAlles(!alles)}>
                  {alles ? 'Minder tonen' : `${gefilterd.length - EERSTE} oudere momenten tonen`}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {foto && <PhotoModal fotos={foto.fotos} startIndex={foto.start} sampleNumber={foto.nummer} onClose={() => setFoto(null)} />}
    </div>
  );
}
