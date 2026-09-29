'use client';

// Nieuw monster toevoegen of een monster bewerken (alleen admin). In het
// bewerkvenster ook de monsternames (pogingen), Afname ongedaan maken en,
// helemaal onderaan, Monster verwijderen.

import { useEffect, useState } from 'react';
import { Icon, useVenster } from '@/app/components/ui';
import SampleAttemptsPanel from '@/app/components/SampleAttemptsPanel';
import HerstelHulp from '@/app/components/HerstelHulp';
import MonsterVerwijderBlok, { type VerwijderDoel } from '@/app/components/MonsterVerwijderBlok';
import AfnameOngedaanModal, { type AfnameDoel } from '@/app/components/AfnameOngedaanModal';
import type { OilSample, SampleObject } from './types';

interface Props {
  /** Het monster dat je bewerkt, of null voor een nieuw monster */
  sample: OilSample | null;
  jaar: number;
  isAdmin: boolean;
  samples: OilSample[];
  objecten: SampleObject[];
  objectenBeschikbaar: boolean;
  onClose: () => void;
  /** Na opslaan */
  onOpgeslagen: () => void;
  /** Lijst verversen; geeft de nieuwe lijst terug */
  onVernieuw: () => Promise<OilSample[] | null>;
  onVerwijderd: (doel: VerwijderDoel) => void;
  onHerstel: (id: number, oNumber: string) => Promise<boolean>;
  onFoto: (url: string, label: string) => void;
  onMelding: (tekst: string) => void;
}

interface InstallatieKeuze {
  id: number;
  naam: string;
  code: string;
}

function formulierVan(sample: OilSample | null) {
  return {
    oNumber: sample?.oNumber ?? '',
    sampleDate: sample?.sampleDate ? sample.sampleDate.split('T')[0] : '',
    location: sample?.location ?? '',
    description: sample?.description ?? '',
    oilType: sample?.oilType || '',
    remarks: sample?.remarks || '',
    isTaken: sample?.isTaken ?? false,
    objectId: sample?.objectId ? String(sample.objectId) : '',
    installatieId: sample?.installatieId ? String(sample.installatieId) : '',
  };
}

export default function MonsterFormulier(p: Props) {
  const [bewerkt, setBewerkt] = useState<OilSample | null>(p.sample);
  const [formData, setFormData] = useState(() => formulierVan(p.sample));
  const [formError, setFormError] = useState('');
  const [oNumberWarning, setONumberWarning] = useState('');
  // Fouten per veld, onder het veld zelf (niet als tooltip van de browser)
  const [veldFouten, setVeldFouten] = useState<Record<string, string>>({});
  const paneel = useVenster<HTMLDivElement>(true, p.onClose);
  const [afnameDoel, setAfnameDoel] = useState<AfnameDoel | null>(null);
  const [installaties, setInstallaties] = useState<InstallatieKeuze[]>([]);

  // De installaties van het gekozen object, voor de keuzelijst Installatie.
  useEffect(() => {
    if (!p.objectenBeschikbaar || !formData.objectId) return;
    let actueel = true;
    fetch(`/api/installaties?objectId=${formData.objectId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((lijst: InstallatieKeuze[]) => {
        if (actueel) setInstallaties(Array.isArray(lijst) ? lijst : []);
      })
      .catch(() => {
        if (actueel) setInstallaties([]);
      });
    return () => {
      actueel = false;
    };
  }, [formData.objectId, p.objectenBeschikbaar]);

  const zichtbareInstallaties = formData.objectId ? installaties : [];

  const checkONumberExists = (oNumber: string) => {
    if (!oNumber || oNumber.trim() === '') {
      setONumberWarning('');
      return;
    }
    // Bij bewerken met hetzelfde nummer niets melden
    if (bewerkt && bewerkt.oNumber === oNumber) {
      setONumberWarning('');
      return;
    }
    const exists = p.samples.some(
      (s) => s.oNumber.toLowerCase() === oNumber.toLowerCase() && (!bewerkt || s.id !== bewerkt.id)
    );
    setONumberWarning(exists ? 'Dit o-nummer bestaat al.' : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const fouten: Record<string, string> = {};
    if (!formData.oNumber.trim()) fouten.oNumber = 'Vul het o-nummer in.';
    if (formData.isTaken && !formData.sampleDate) fouten.sampleDate = 'Vul de datum van de afname in.';
    if (!formData.location.trim()) fouten.location = 'Vul de locatie in.';
    if (!formData.description.trim()) fouten.description = 'Vul een omschrijving in.';
    setVeldFouten(fouten);
    const eerste = Object.keys(fouten)[0];
    if (eerste) {
      const id = { oNumber: 'veld-onummer', sampleDate: 'veld-datum', location: 'veld-locatie', description: 'veld-omschrijving' }[eerste];
      if (id) document.getElementById(id)?.focus();
      return;
    }

    try {
      const url = bewerkt ? `/api/samples/${bewerkt.id}` : '/api/samples';
      const method = bewerkt ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        // objectId alleen meesturen als de objecten bestaan, anders raakt de
        // server een kolom aan die er nog niet is.
        body: JSON.stringify({
          ...formData,
          objectId: p.objectenBeschikbaar ? (formData.objectId === '' ? null : parseInt(formData.objectId)) : undefined,
          installatieId: p.objectenBeschikbaar
            ? formData.installatieId === '' || !formData.objectId
              ? null
              : parseInt(formData.installatieId)
            : undefined,
          analysisYear: p.jaar,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setFormError(data.error || 'Er is een fout opgetreden');
        return;
      }

      p.onOpgeslagen();
    } catch {
      setFormError('Er is een fout opgetreden');
    }
  };

  // Na een wijziging in de monsternames: lijst verversen en de velden die uit de
  // laatste monstername komen (datum, genomen, opmerking) in het formulier
  // bijwerken. Anders zet Bijwerken daarna de oude waarden terug.
  const naPogingWijziging = async () => {
    const lijst = await p.onVernieuw();
    const vers = bewerkt && lijst?.find((s) => s.id === bewerkt.id);
    if (!vers) return;
    setBewerkt(vers);
    setFormData((f) => ({
      ...f,
      isTaken: vers.isTaken,
      sampleDate: vers.sampleDate ? vers.sampleDate.split('T')[0] : '',
      remarks: vers.remarks || '',
    }));
  };

  // Afname ongedaan maken vanuit het bewerkvenster of het pogingenpaneel: het
  // formulier volgt mee, anders zet Bijwerken het monster meteen weer op genomen.
  const naAfnameOngedaan = () => {
    setAfnameDoel(null);
    setFormData((f) => ({ ...f, isTaken: false, sampleDate: '' }));
    setBewerkt((s) => (s ? { ...s, isTaken: false, sampleDate: null, photoUrl: undefined, partPhotoUrl: null } : s));
    p.onMelding(`De afname van ${bewerkt?.oNumber ?? 'het monster'} is ongedaan gemaakt. Het staat weer op niet genomen.`);
    p.onVernieuw();
  };

  return (
    <div className="modal-backdrop">
      <div
        ref={paneel}
        className={`modal-content${bewerkt ? ' modal-content-lg' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="monster-venster-titel"
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 className="modal-title" id="monster-venster-titel">
            {bewerkt ? 'Monster bewerken' : 'Nieuw monster toevoegen'}
          </h2>
          <button type="button" className="icon-btn modal-sluit" onClick={p.onClose} aria-label="Sluiten" title="Sluiten">
            <Icon name="close" />
          </button>
        </div>

        <div className="modal-body">
          <form id="sample-form" onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="label" htmlFor="veld-onummer">O-nummer</label>
              <input
                id="veld-onummer"
                type="text"
                aria-describedby={oNumberWarning || veldFouten.oNumber ? 'veld-onummer-fout' : undefined}
                aria-invalid={!!(oNumberWarning || veldFouten.oNumber)}
                value={formData.oNumber}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData({ ...formData, oNumber: value });
                  checkONumberExists(value);
                }}
                onBlur={(e) => checkONumberExists(e.target.value)}
                className={`input${oNumberWarning || veldFouten.oNumber ? ' input-fout' : ''}`}
                required
              />
              {(oNumberWarning || veldFouten.oNumber) && (
                <p id="veld-onummer-fout" role="alert" className="veld-fout">
                  {oNumberWarning || veldFouten.oNumber}
                </p>
              )}
              {/* Herstelhulp: nummer van vorig jaar of uit de prullenbak */}
              {!bewerkt && (
                <HerstelHulp
                  oNumber={formData.oNumber}
                  jaar={p.jaar}
                  bestaatAl={!!oNumberWarning}
                  onOvernemen={(g) =>
                    setFormData((f) => ({
                      ...f,
                      location: g.location,
                      description: g.description,
                      oilType: g.oilType,
                      objectId: p.objectenBeschikbaar ? g.objectId : f.objectId,
                    }))
                  }
                  onHerstel={async (id, oNumber) => {
                    if (await p.onHerstel(id, oNumber)) p.onClose();
                  }}
                />
              )}
            </div>

            <div>
              <label className="label" htmlFor="veld-datum">
                Datum afname {!formData.isTaken && '(optioneel, alleen voor genomen monsters)'}
              </label>
              <input
                id="veld-datum"
                type="date"
                value={formData.sampleDate}
                onChange={(e) => setFormData({ ...formData, sampleDate: e.target.value })}
                disabled={!formData.isTaken}
                className={`input${veldFouten.sampleDate ? ' input-fout' : ''}`}
                required={formData.isTaken}
                aria-invalid={!!veldFouten.sampleDate}
                aria-describedby={veldFouten.sampleDate ? 'veld-datum-fout' : undefined}
              />
              {veldFouten.sampleDate && <p id="veld-datum-fout" className="veld-fout">{veldFouten.sampleDate}</p>}
            </div>

            {p.objectenBeschikbaar && (
              <div>
                <label className="label" htmlFor="veld-object">Object</label>
                <select
                  id="veld-object"
                  value={formData.objectId}
                  onChange={(e) => setFormData({ ...formData, objectId: e.target.value, installatieId: '' })}
                  className="select"
                >
                  <option value="">Geen object</option>
                  {p.objecten.map((o) => (
                    <option key={o.id} value={String(o.id)}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Alleen als het gekozen object installaties heeft */}
            {p.objectenBeschikbaar && zichtbareInstallaties.length > 0 && (
              <div>
                <label className="label" htmlFor="veld-installatie">Installatie (optioneel)</label>
                <select
                  id="veld-installatie"
                  value={formData.installatieId}
                  onChange={(e) => setFormData({ ...formData, installatieId: e.target.value })}
                  className="select"
                >
                  <option value="">Geen installatie</option>
                  {zichtbareInstallaties.map((i) => (
                    <option key={i.id} value={String(i.id)}>{i.naam} ({i.code})</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="label" htmlFor="veld-locatie">Locatie</label>
              <input
                id="veld-locatie"
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className={`input${veldFouten.location ? ' input-fout' : ''}`}
                required
                aria-invalid={!!veldFouten.location}
                aria-describedby={veldFouten.location ? 'veld-locatie-fout' : undefined}
              />
              {veldFouten.location && <p id="veld-locatie-fout" className="veld-fout">{veldFouten.location}</p>}
            </div>

            <div>
              <label className="label" htmlFor="veld-omschrijving">Omschrijving</label>
              <textarea
                id="veld-omschrijving"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className={`textarea${veldFouten.description ? ' input-fout' : ''}`}
                rows={3}
                required
                aria-invalid={!!veldFouten.description}
                aria-describedby={veldFouten.description ? 'veld-omschrijving-fout' : undefined}
              />
              {veldFouten.description && <p id="veld-omschrijving-fout" className="veld-fout">{veldFouten.description}</p>}
            </div>

            <div>
              <label className="label" htmlFor="veld-olietype">Type olie (optioneel)</label>
              <input
                id="veld-olietype"
                type="text"
                value={formData.oilType}
                onChange={(e) => setFormData({ ...formData, oilType: e.target.value })}
                className="input"
                placeholder="Bijv. motorolie, hydraulische olie, etc."
              />
            </div>

            <div>
              <label className="label" htmlFor="veld-opmerkingen">Opmerkingen (optioneel)</label>
              <textarea
                id="veld-opmerkingen"
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                className="textarea"
                rows={2}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                id="isTaken"
                checked={formData.isTaken}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  setFormData({
                    ...formData,
                    isTaken: isChecked,
                    sampleDate: isChecked ? formData.sampleDate : '',
                  });
                }}
                style={{ width: '18px', height: '18px', marginRight: '8px' }}
              />
              <label htmlFor="isTaken" style={{ fontSize: '14px', color: 'var(--navy)', cursor: 'pointer' }}>
                Monster is genomen
              </label>
            </div>

            {formError && (
              <div className="alert alert-danger">
                {formError}
              </div>
            )}
          </form>

          {/* Afname ongedaan maken: terug naar niet genomen, datum en foto's eraf */}
          {bewerkt && p.isAdmin && bewerkt.isTaken && !bewerkt.isDisabled && (
            <div className="afname-blok">
              <p>
                Per ongeluk of te vroeg op genomen gezet? Zet de laatste monstername terug naar niet genomen.
              </p>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  setAfnameDoel({
                    sampleId: bewerkt.id,
                    oNumber: bewerkt.oNumber,
                    sampleDate: bewerkt.sampleDate,
                    heeftFotoPotje: !!bewerkt.photoUrl,
                    heeftFotoOnderdeel: !!bewerkt.partPhotoUrl,
                    aantalPogingen: bewerkt.attemptsCount ?? 1,
                  })
                }
              >
                <Icon name="reset" size={16} />
                Afname ongedaan maken
              </button>
            </div>
          )}

          {bewerkt && (
            <div style={{ marginTop: '20px' }}>
              <SampleAttemptsPanel
                sampleId={bewerkt.id}
                oNumber={bewerkt.oNumber}
                isAdmin={p.isAdmin}
                onPhotoClick={p.onFoto}
                onChange={naPogingWijziging}
                onAfnameOngedaan={naAfnameOngedaan}
              />
            </div>
          )}

          {/* Het enige plekje waar een heel monster weg kan, apart en onderaan */}
          {bewerkt && p.isAdmin && (
            <MonsterVerwijderBlok
              key={`verwijder-${bewerkt.id}`}
              doel={{
                id: bewerkt.id,
                oNumber: bewerkt.oNumber,
                attemptsCount: bewerkt.attemptsCount,
                isTaken: bewerkt.isTaken,
                sampleDate: bewerkt.sampleDate,
                photoUrl: bewerkt.photoUrl,
                partPhotoUrl: bewerkt.partPhotoUrl,
              }}
              onVerwijderd={p.onVerwijderd}
            />
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={p.onClose}>
            Annuleren
          </button>
          <button
            type="submit"
            form="sample-form"
            disabled={!!oNumberWarning}
            className="btn btn-primary"
          >
            {bewerkt ? 'Opslaan' : 'Toevoegen'}
          </button>
        </div>
      </div>

      {/* Afname ongedaan maken: bevestiging met wat er verdwijnt */}
      <AfnameOngedaanModal
        key={`afname-${afnameDoel?.sampleId ?? 'geen'}`}
        doel={afnameDoel}
        onClose={() => setAfnameDoel(null)}
        onKlaar={naAfnameOngedaan}
      />
    </div>
  );
}
