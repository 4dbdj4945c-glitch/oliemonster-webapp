'use client';

// Eén installatie (alleen admin): typeplaatje, foto en de monsters die eraan
// hangen. De tijdlijn met keuringen en werkzaamheden komt in fase 3.

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { AppShell, Icon } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import OngedaanMelding, { type OngedaanInhoud } from '@/app/components/OngedaanMelding';
import VeiligVerwijderBlok from '@/app/components/VeiligVerwijderBlok';
import InstallatieFormulier from '@/app/components/klanten/InstallatieFormulier';
import type { Installatie, ObjectKeuze } from '@/app/components/klanten/types';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import { installatieSoortIcoon, installatieSoortLabel } from '@/lib/installaties';
import { oliemonsterPad } from '@/lib/modules';
import { sampleStatus, STATUS_BADGE, STATUS_ICOON, STATUS_LABELS } from '@/lib/sampleStatus';
import { verkleinFoto } from '@/lib/fotoVerkleinen';

interface Monster {
  id: number;
  oNumber: string;
  analysisYear: number;
  sampleDate: string | null;
  isTaken: boolean;
  isDisabled: boolean;
  isUnreachable: boolean;
  description: string;
}

interface InstallatieDetail extends Installatie {
  object: { id: number; name: string; objectType: string | null; klant: { id: number; naam: string } | null };
  monsters: Monster[];
}

export default function InstallatiePagina() {
  const user = useGebruiker();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [inst, setInst] = useState<InstallatieDetail | null>(null);
  const [objecten, setObjecten] = useState<ObjectKeuze[]>([]);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [bewerken, setBewerken] = useState(false);
  const [fotoBezig, setFotoBezig] = useState(false);
  const [ongedaan, setOngedaan] = useState<OngedaanInhoud | null>(null);
  const [verwijderd, setVerwijderd] = useState(false);

  const laad = useCallback(async () => {
    try {
      const [res, obj] = await Promise.all([fetch(`/api/installaties/${id}`), fetch('/api/sample-objects')]);
      if (!res.ok) {
        setFout(await foutTekst(res, 'De installatie kon niet worden opgehaald.'));
        return;
      }
      setInst(await res.json());
      if (obj.ok) setObjecten(await obj.json());
      setFout('');
    } catch {
      setFout(GEEN_VERBINDING);
    }
  }, [id]);

  useEffect(() => {
     
    laad();
  }, [laad]);

  const uploadFoto = async (bestand: File) => {
    setFotoBezig(true);
    try {
      const form = new FormData();
      form.append('photo', await verkleinFoto(bestand));
      const res = await fetch(`/api/installaties/${id}/foto`, { method: 'POST', body: form });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De foto is niet opgeslagen.'));
        return;
      }
      setMelding('De foto is opgeslagen.');
      await laad();
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setFotoBezig(false);
    }
  };

  const verwijderFoto = async () => {
    if (!confirm('De foto van deze installatie verwijderen? Hij gaat ook uit de opslag.')) return;
    setFotoBezig(true);
    try {
      const res = await fetch(`/api/installaties/${id}/foto`, { method: 'DELETE' });
      if (!res.ok) {
        setFout(await foutTekst(res, 'De foto is niet verwijderd.'));
        return;
      }
      setMelding('De foto is verwijderd.');
      await laad();
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setFotoBezig(false);
    }
  };

  const verwijder = async (getypt: string): Promise<string | null> => {
    if (!inst) return null;
    try {
      const res = await fetch(`/api/installaties/${inst.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bevestigCode: getypt }),
      });
      if (!res.ok) return foutTekst(res, 'De installatie is niet verwijderd.');
      setVerwijderd(true);
      setOngedaan({
        sleutel: `installatie-${inst.id}`,
        tekst: `${inst.naam} verwijderd`,
        onOngedaan: async () => {
          const terug = await fetch(`/api/installaties/${inst.id}/herstellen`, { method: 'POST' });
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
    <button type="button" className="btn-link terug-link" onClick={() => router.push('/dashboard/installaties')}>
      <Icon name="arrow-left" size={16} />
      Installaties
    </button>
  );

  if (verwijderd && inst) {
    return (
      <AppShell title="Installaties" wide user={user}>
        {terug}
        <div className="leeg">
          <Icon name="empty" size={32} />
          <p style={{ margin: '0 0 12px' }}>{inst.naam} is verwijderd.</p>
          <button type="button" className="btn btn-sm" onClick={() => router.push('/dashboard/installaties')}>
            <Icon name="arrow-left" size={16} />
            Naar de installaties
          </button>
        </div>
        <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />
      </AppShell>
    );
  }

  return (
    <AppShell title="Installaties" wide user={user}>
      {terug}
      {fout && <LaadFout melding={fout} onOpnieuw={laad} />}
      {!inst ? (
        fout ? null : <div className="laden">Laden...</div>
      ) : (
        <>
          <div className="beheer-kop">
            <div>
              <h1 className="page-title beheer-titel">
                <Icon name={installatieSoortIcoon(inst.soort)} size={24} />
                {inst.naam}
              </h1>
              <p className="page-subtitle">
                {installatieSoortLabel(inst.soort)} op {inst.object.name}
                {inst.object.klant ? `, ${inst.object.klant.naam}` : ''}
              </p>
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
              <section className="card beheer-kaart">
                <h2 className="section-label">Typeplaatje</h2>
                <dl className="gegevens-lijst">
                  <dt>Code</dt>
                  <dd><span className="badge badge-gray code-badge">{inst.code}</span></dd>
                  <dt>Soort</dt>
                  <dd>{installatieSoortLabel(inst.soort)}</dd>
                  <dt>Merk</dt>
                  <dd>{inst.merk || '-'}</dd>
                  <dt>Typenummer</dt>
                  <dd>{inst.typenummer || '-'}</dd>
                  <dt>Bouwjaar</dt>
                  <dd>{inst.bouwjaar ?? '-'}</dd>
                  <dt>Serienummer</dt>
                  <dd>{inst.serienummer || '-'}</dd>
                  <dt>Object</dt>
                  <dd>{inst.object.name}</dd>
                  <dt>Klant</dt>
                  <dd>
                    {inst.object.klant ? (
                      <a
                        className="btn-link"
                        href={`/dashboard/klanten/${inst.object.klant.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          router.push(`/dashboard/klanten/${inst.object.klant!.id}`);
                        }}
                      >
                        <Icon name="company" size={16} />
                        {inst.object.klant.naam}
                      </a>
                    ) : (
                      '-'
                    )}
                  </dd>
                  {inst.notities && (
                    <>
                      <dt>Notities</dt>
                      <dd className="gegevens-notitie">{inst.notities}</dd>
                    </>
                  )}
                </dl>
              </section>

              <section className="card beheer-kaart">
                <h2 className="section-label">Foto</h2>
                {inst.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={inst.fotoUrl} alt={`Foto van ${inst.naam}`} className="installatie-foto" />
                ) : (
                  <p className="hint">Nog geen foto. Een foto van het typeplaatje is handig.</p>
                )}
                <div className="knoppenrij" style={{ marginTop: '10px' }}>
                  <label className={`btn btn-sm${fotoBezig ? ' is-bezig' : ''}`}>
                    <Icon name={inst.fotoUrl ? 'camera' : 'image-upload'} size={16} />
                    {fotoBezig ? 'Bezig...' : inst.fotoUrl ? 'Andere foto' : 'Foto toevoegen'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      disabled={fotoBezig}
                      onChange={(e) => {
                        const bestand = e.target.files?.[0];
                        if (bestand) uploadFoto(bestand);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {inst.fotoUrl && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={verwijderFoto} disabled={fotoBezig}>
                      <Icon name="image-remove" size={16} />
                      Foto verwijderen
                    </button>
                  )}
                </div>
              </section>
            </div>

            <div className="beheer-kolom">
              <section className="card beheer-kaart">
                <h2 className="section-label">Oliemonsters</h2>
                {inst.monsters.length === 0 ? (
                  <p className="hint">Nog geen monsters aan deze installatie gekoppeld. Dat doe je in het bewerkvenster van een monster.</p>
                ) : (
                  <ul className="beheer-lijst">
                    {inst.monsters.map((m) => {
                      const status = sampleStatus(m);
                      return (
                        <li key={m.id} className="beheer-lijst-regel">
                          <a
                            href={oliemonsterPad(m.analysisYear)}
                            className="beheer-lijst-tekst beheer-lijst-link"
                            onClick={(e) => {
                              e.preventDefault();
                              router.push(oliemonsterPad(m.analysisYear));
                            }}
                          >
                            <strong>{m.oNumber}</strong>
                            <span className="beheer-bijzaak">
                              {m.analysisYear}
                              {m.isTaken && m.sampleDate ? `, genomen ${new Date(m.sampleDate).toLocaleDateString('nl-NL')}` : ''}
                              {m.description ? `, ${m.description}` : ''}
                            </span>
                          </a>
                          <span className={`badge ${STATUS_BADGE[status]}`}>
                            <Icon name={STATUS_ICOON[status]} size={16} />
                            {STATUS_LABELS[status]}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>

          <VeiligVerwijderBlok
            id={`installatie-${inst.id}`}
            kop="Installatie verwijderen"
            uitleg={
              <p style={{ margin: 0 }}>
                {inst.naam} verdwijnt uit de lijsten.
                {inst.monsters.length === 1
                  ? ' Het monster blijft gewoon staan, met de koppeling.'
                  : inst.monsters.length > 1
                  ? ` De ${inst.monsters.length} monsters blijven gewoon staan, met hun koppeling.`
                  : ''}{' '}
                De gegevens blijven bewaard en direct daarna kun je het ongedaan maken.
              </p>
            }
            bevestig={inst.code}
            knop={`${inst.code} verwijderen`}
            onVerwijder={verwijder}
          />

          {bewerken && (
            <InstallatieFormulier
              open
              installatie={inst}
              objecten={objecten}
              onClose={() => setBewerken(false)}
              onOpgeslagen={() => {
                setBewerken(false);
                setMelding('De gegevens zijn opgeslagen.');
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
