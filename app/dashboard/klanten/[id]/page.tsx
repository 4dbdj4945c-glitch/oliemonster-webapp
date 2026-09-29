'use client';

// Klantscherm (alleen admin): gegevens, contactpersonen, objecten met hun
// installaties en wie er voor deze klant meekijkt. Functioneel en eenvoudig; het
// klantdossier met tijdlijn komt in fase 3.

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { AppShell, Icon } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import OngedaanMelding, { type OngedaanInhoud } from '@/app/components/OngedaanMelding';
import VeiligVerwijderBlok from '@/app/components/VeiligVerwijderBlok';
import KlantFormulier from '@/app/components/klanten/KlantFormulier';
import ContactpersoonFormulier from '@/app/components/klanten/ContactpersoonFormulier';
import InstallatieFormulier from '@/app/components/klanten/InstallatieFormulier';
import {
  adresTekst,
  typeTekst,
  type Contactpersoon,
  type KlantDetail,
  type KlantObject,
  type ObjectKeuze,
} from '@/app/components/klanten/types';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { installatieSoortIcoon, installatieSoortLabel } from '@/lib/installaties';
import { objectTypeIcoon, objectTypeLabel } from '@/lib/sampleObjects';
import { ROLE_LABELS } from '@/lib/roles';

export default function KlantPagina() {
  const user = useGebruiker();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [klant, setKlant] = useState<KlantDetail | null>(null);
  const [alleObjecten, setAlleObjecten] = useState<ObjectKeuze[]>([]);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [bewerken, setBewerken] = useState(false);
  const [contact, setContact] = useState<{ persoon: Contactpersoon | null } | null>(null);
  const [nieuweInstallatie, setNieuweInstallatie] = useState<KlantObject | null>(null);
  const [koppelObject, setKoppelObject] = useState('');
  const [bezig, setBezig] = useState(false);
  const [ongedaan, setOngedaan] = useState<OngedaanInhoud | null>(null);
  const [verwijderd, setVerwijderd] = useState(false);

  const laad = useCallback(async () => {
    try {
      const [res, obj] = await Promise.all([fetch(`/api/klanten/${id}`), fetch('/api/sample-objects')]);
      if (!res.ok) {
        setFout(await foutTekst(res, 'De klant kon niet worden opgehaald.'));
        return;
      }
      setKlant(await res.json());
      if (obj.ok) setAlleObjecten(await obj.json());
      setFout('');
    } catch {
      setFout(GEEN_VERBINDING);
    }
  }, [id]);

  useEffect(() => {
     
    laad();
  }, [laad]);

  // Object aan deze klant koppelen of ervan loskoppelen (PUT op het object).
  const zetKlantVanObject = async (objectId: number, klantId: number | null, tekst: string) => {
    setBezig(true);
    try {
      const res = await fetch(`/api/sample-objects/${objectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ klantId }),
      });
      if (!res.ok) {
        setFout(await foutTekst(res, 'Het object is niet bijgewerkt.'));
        return;
      }
      setMelding(tekst);
      setKoppelObject('');
      await laad();
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  const herstelContact = async (persoon: Contactpersoon) => {
    const res = await fetch(`/api/contactpersonen/${persoon.id}/herstellen`, { method: 'POST' });
    if (!res.ok) return false;
    await laad();
    return true;
  };

  const verwijderKlant = async (getypt: string): Promise<string | null> => {
    if (!klant) return null;
    try {
      const res = await fetch(`/api/klanten/${klant.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bevestigNaam: getypt }),
      });
      if (!res.ok) return foutTekst(res, 'De klant is niet verwijderd.');
      setVerwijderd(true);
      setOngedaan({
        sleutel: `klant-${klant.id}`,
        tekst: `${klant.naam} verwijderd`,
        onOngedaan: async () => {
          const terug = await fetch(`/api/klanten/${klant.id}/herstellen`, { method: 'POST' });
          if (!terug.ok) return false;
          setVerwijderd(false);
          await laad();
          return true;
        },
      });
      return null;
    } catch {
      return GEEN_VERBINDING;
    }
  };

  const terug = (
    <button type="button" className="btn-link terug-link" onClick={() => router.push('/dashboard/klanten')}>
      <Icon name="arrow-left" size={16} />
      Klanten
    </button>
  );

  if (verwijderd && klant) {
    return (
      <AppShell title="Klanten" wide user={user}>
        {terug}
        <div className="leeg">
          <Icon name="empty" size={32} />
          <p style={{ margin: '0 0 12px' }}>{klant.naam} is verwijderd.</p>
          <button type="button" className="btn btn-sm" onClick={() => router.push('/dashboard/klanten')}>
            <Icon name="arrow-left" size={16} />
            Naar de klanten
          </button>
        </div>
        <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />
      </AppShell>
    );
  }

  const kanKoppelen = alleObjecten.filter((o) => o.klantId !== klant?.id);

  return (
    <AppShell title="Klanten" wide user={user}>
      {terug}
      {fout && <LaadFout melding={fout} onOpnieuw={laad} />}
      {!klant ? (
        fout ? null : <div className="laden">Laden...</div>
      ) : (
        <>
          <div className="beheer-kop">
            <div>
              <h1 className="page-title">{klant.naam}</h1>
              <p className="page-subtitle">{adresTekst(klant) || 'Nog geen adres.'}</p>
            </div>
            <div className="knoppenrij beheer-knoppen">
              <button type="button" className="btn" onClick={() => setBewerken(true)}>
                <Icon name="pencil" size={16} />
                Gegevens bewerken
              </button>
            </div>
          </div>

          {melding && (
            <div className="alert alert-success" role="status" style={{ marginBottom: '16px' }}>{melding}</div>
          )}

          <div className="beheer-grid">
            <div className="beheer-kolom">
              {/* Gegevens */}
              <section className="card beheer-kaart">
                <h2 className="section-label">Gegevens</h2>
                <dl className="gegevens-lijst">
                  <dt>Adres</dt>
                  <dd>{adresTekst(klant) || '-'}</dd>
                  <dt>KvK-nummer</dt>
                  <dd>{klant.kvkNummer || '-'}</dd>
                  {klant.notities && (
                    <>
                      <dt>Notities</dt>
                      <dd className="gegevens-notitie">{klant.notities}</dd>
                    </>
                  )}
                  {klant.prospect && (
                    <>
                      <dt>Acquisitie</dt>
                      <dd>
                        <a className="btn-link" href="/dashboard/acquisitie">
                          <Icon name="module-acquisitie" size={16} />
                          Klant geworden via de acquisitie
                          {klant.prospect.klantSindsOp ? `, ${new Date(klant.prospect.klantSindsOp).toLocaleDateString('nl-NL')}` : ''}
                        </a>
                      </dd>
                    </>
                  )}
                  <dt>Kijkt mee</dt>
                  <dd>
                    {klant.gebruikers.length === 0
                      ? 'Niemand'
                      : klant.gebruikers
                          .map((g) => `${g.username} (${ROLE_LABELS[g.role] ?? g.role}${g.viewYear ? `, ${g.viewYear}` : ''})`)
                          .join(', ')}
                  </dd>
                </dl>
              </section>

              {/* Contactpersonen */}
              <section className="card beheer-kaart">
                <div className="beheer-kaart-kop">
                  <h2 className="section-label">Contactpersonen</h2>
                  <button type="button" className="btn btn-sm" onClick={() => setContact({ persoon: null })}>
                    <Icon name="user-plus" size={16} />
                    Toevoegen
                  </button>
                </div>
                {klant.contactpersonen.length === 0 ? (
                  <p className="hint">Nog geen contactpersonen.</p>
                ) : (
                  <ul className="beheer-lijst">
                    {klant.contactpersonen.map((p) => (
                      <li key={p.id} className="beheer-lijst-regel">
                        <div className="beheer-lijst-tekst">
                          <strong>{p.naam}</strong>
                          {p.functie && <span className="beheer-bijzaak">{p.functie}</span>}
                          <span className="beheer-contact">
                            {p.email && (
                              <a href={`mailto:${p.email}`} className="btn-link">
                                <Icon name="mail" size={16} />
                                {p.email}
                              </a>
                            )}
                            {p.telefoon && (
                              <a href={`tel:${p.telefoon.replace(/\s/g, '')}`} className="btn-link">
                                <Icon name="phone" size={16} />
                                {p.telefoon}
                              </a>
                            )}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setContact({ persoon: p })}
                          title="Bewerken"
                          aria-label={`${p.naam} bewerken`}
                        >
                          <Icon name="pencil" size={16} />
                          <span className="alleen-mobiel">Bewerken</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="beheer-kolom">
              {/* Objecten met installaties */}
              <section className="card beheer-kaart">
                <h2 className="section-label">Objecten en installaties</h2>
                {klant.objecten.length === 0 && <p className="hint">Nog geen objecten bij deze klant.</p>}
                {klant.objecten.map((o) => (
                  <div key={o.id} className="object-blok">
                    <div className="object-blok-kop">
                      <span className="beheer-naam" title={objectTypeLabel(o.objectType)}>
                        <Icon name={objectTypeIcoon(o.objectType)} size={16} />
                        {o.name}
                      </span>
                      <span className="beheer-bijzaak">
                        {o.aantalMonsters} {o.aantalMonsters === 1 ? 'monster' : 'monsters'}
                      </span>
                    </div>
                    {o.installaties.length > 0 && (
                      <ul className="beheer-lijst">
                        {o.installaties.map((i) => (
                          <li key={i.id} className="beheer-lijst-regel">
                            <a
                              href={`/dashboard/installaties/${i.id}`}
                              className="beheer-lijst-tekst beheer-lijst-link"
                              onClick={(e) => {
                                e.preventDefault();
                                router.push(`/dashboard/installaties/${i.id}`);
                              }}
                            >
                              <strong className="beheer-naam">
                                <Icon name={installatieSoortIcoon(i.soort)} size={16} />
                                {i.naam}
                              </strong>
                              <span className="beheer-bijzaak">
                                {installatieSoortLabel(i.soort)}
                                {typeTekst(i) ? `, ${typeTekst(i)}` : ''}
                              </span>
                            </a>
                            <span className="badge badge-gray code-badge">{i.code}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="knoppenrij object-blok-knoppen">
                      <button type="button" className="btn btn-sm" onClick={() => setNieuweInstallatie(o)}>
                        <Icon name="plus" size={16} />
                        Installatie toevoegen
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={bezig}
                        onClick={() => {
                          if (confirm(`${o.name} loskoppelen van ${klant.naam}?\n\nHet object, de monsters en de installaties blijven bestaan; het object hoort daarna bij geen klant.`)) {
                            zetKlantVanObject(o.id, null, `${o.name} hoort niet meer bij ${klant.naam}.`);
                          }
                        }}
                      >
                        Loskoppelen
                      </button>
                    </div>
                  </div>
                ))}

                {kanKoppelen.length > 0 && (
                  <div className="object-koppelen">
                    <label className="label" htmlFor="koppel-object">Bestaand object koppelen</label>
                    <div className="object-koppelen-rij">
                      <select id="koppel-object" className="select" value={koppelObject} onChange={(e) => setKoppelObject(e.target.value)}>
                        <option value="">Kies een object</option>
                        {kanKoppelen.map((o) => (
                          <option key={o.id} value={String(o.id)}>
                            {o.name}{o.klant ? ` (nu bij ${o.klant.naam})` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn"
                        disabled={!koppelObject || bezig}
                        onClick={() => {
                          const o = kanKoppelen.find((x) => String(x.id) === koppelObject);
                          if (o) zetKlantVanObject(o.id, klant.id, `${o.name} hoort nu bij ${klant.naam}.`);
                        }}
                      >
                        <Icon name="plus" size={16} />
                        Koppelen
                      </button>
                    </div>
                    <p className="hint">Een nieuw object maak je aan bij Beheer, Objecten.</p>
                  </div>
                )}
              </section>
            </div>
          </div>

          <VeiligVerwijderBlok
            id={`klant-${klant.id}`}
            kop="Klant verwijderen"
            uitleg={
              <p style={{ margin: 0 }}>
                {klant.naam} verdwijnt uit de lijst, met {klant.contactpersonen.length === 1 ? 'de contactpersoon' : `de ${klant.contactpersonen.length} contactpersonen`}.
                Dat kan alleen als er geen objecten en geen meekijkers meer aan hangen. De gegevens blijven bewaard en
                direct daarna kun je het ongedaan maken.
              </p>
            }
            bevestig={klant.naam}
            knop={`${klant.naam} verwijderen`}
            onVerwijder={verwijderKlant}
          />

          {bewerken && (
            <KlantFormulier
              open
              klant={klant}
              onClose={() => setBewerken(false)}
              onOpgeslagen={() => {
                setBewerken(false);
                setMelding('De gegevens zijn opgeslagen.');
                laad();
              }}
            />
          )}

          {contact && (
            <ContactpersoonFormulier
              key={contact.persoon?.id ?? 'nieuw'}
              open
              klantId={klant.id}
              persoon={contact.persoon}
              onClose={() => setContact(null)}
              onOpgeslagen={() => {
                setContact(null);
                laad();
              }}
              onWeggehaald={(p) => {
                setContact(null);
                laad();
                setOngedaan({ sleutel: `contact-${p.id}`, tekst: `${p.naam} weggehaald`, onOngedaan: () => herstelContact(p) });
              }}
            />
          )}

          {nieuweInstallatie && (
            <InstallatieFormulier
              open
              installatie={null}
              vastObject={{ id: nieuweInstallatie.id, name: nieuweInstallatie.name }}
              onClose={() => setNieuweInstallatie(null)}
              onOpgeslagen={(i) => {
                setNieuweInstallatie(null);
                setMelding(`${i.naam} is toegevoegd, met code ${i.code}.`);
                laad();
              }}
            />
          )}

          <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />
        </>
      )}
    </AppShell>
  );
}
