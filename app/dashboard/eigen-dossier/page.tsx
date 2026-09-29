'use client';

// Eigen dossier (alleen admin, sectie Beheer): de documenten van It's Done
// Services zelf met hun vervaldatum. Wat binnen 30 dagen verloopt of al
// verlopen is, staat bovenaan met een melding (en ook op Vandaag). De knop
// Inhuurdossier zet alle geldige documenten in één PDF.

import { useCallback, useEffect, useState } from 'react';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import { AppShell, Icon, Laden, Modal } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import OngedaanMelding, { type OngedaanInhoud } from '@/app/components/OngedaanMelding';
import { dagKort } from '@/app/components/inspecties/types';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import {
  DOCUMENT_SOORTEN,
  GELDIGHEID_BADGE,
  GELDIGHEID_ICOON,
  GELDIGHEID_LABEL,
  documentSoort,
  vervalTekst,
  type Geldigheid,
} from '@/lib/eigenDossier';

export interface EigenDocument {
  id: number;
  soort: string;
  titel: string;
  uitgever: string | null;
  nummer: string | null;
  afgegevenOp: string | null;
  vervaltOp: string | null;
  notities: string | null;
  bestand: { naam: string | null; type: string | null; adres: string } | null;
  geldigheid: Geldigheid;
}

const GROEPEN: { titel: string; soorten: string[] }[] = [
  { titel: 'Bedrijf', soorten: ['vca', 'verzekering', 'kvk', 'overig'] },
  { titel: 'Deskundigheid', soorten: ['diploma', 'cursus', 'kalibratie'] },
];

export default function EigenDossierPagina() {
  const user = useGebruiker();
  const [lijst, setLijst] = useState<EigenDocument[] | null>(null);
  const [fout, setFout] = useState('');
  const [venster, setVenster] = useState<{ doc: EigenDocument | null } | null>(null);
  const [ongedaan, setOngedaan] = useState<OngedaanInhoud | null>(null);

  const laad = useCallback(async () => {
    try {
      const res = await fetch('/api/eigen-dossier');
      if (!res.ok) {
        setFout(await foutTekst(res, 'Het eigen dossier kon niet worden opgehaald.'));
        return;
      }
      const data: EigenDocument[] = await res.json();
      setLijst(data);
      setFout('');
    } catch {
      setFout(GEEN_VERBINDING);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laad();
  }, [laad]);

  const verwijder = async (d: EigenDocument) => {
    try {
      const res = await fetch(`/api/eigen-dossier/${d.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setFout(await foutTekst(res, 'Het document is niet verwijderd.'));
        return;
      }
      setVenster(null);
      await laad();
      setOngedaan({
        sleutel: `document-${d.id}`,
        tekst: `${d.titel} verwijderd`,
        onOngedaan: async () => {
          const terug = await fetch(`/api/eigen-dossier/${d.id}/herstellen`, { method: 'POST' });
          if (!terug.ok) return false;
          await laad();
          return true;
        },
      });
    } catch {
      setFout(GEEN_VERBINDING);
    }
  };

  const aandacht = (lijst ?? []).filter((d) => d.geldigheid === 'verlopen' || d.geldigheid === 'verloopt');
  const geldig = (lijst ?? []).filter((d) => d.geldigheid !== 'verlopen').length;

  return (
    <AppShell title="Eigen dossier" wide user={user}>
      <div className="beheer-kop">
        <div>
          <h1 className="page-title">Eigen dossier</h1>
          <p className="page-subtitle">VCA, verzekering, KvK en je deskundigheid: diploma&apos;s, cursussen en kalibratie van meetmiddelen.</p>
        </div>
        <div className="knoppenrij beheer-knoppen">
          <a className={`btn${geldig === 0 ? ' is-uit' : ''}`} href="/api/eigen-dossier/inhuurdossier" download aria-disabled={geldig === 0}>
            <Icon name="file-bundle" size={16} />
            Inhuurdossier
          </a>
          <button type="button" className="btn btn-primary" onClick={() => setVenster({ doc: null })}>
            <Icon name="plus" size={16} />
            Document toevoegen
          </button>
        </div>
      </div>

      {fout && <LaadFout melding={fout} onOpnieuw={laad} />}

      {lijst === null ? (
        fout ? null : <Laden regels={4} soort="lijst" />
      ) : (
        <>
          {aandacht.length > 0 && (
            <div className="alert alert-warning dossier-aandacht" role="note">
              <Icon name="alert-warning" size={20} />
              <div>
                <b>{aandacht.length === 1 ? 'Eén document vraagt aandacht' : `${aandacht.length} documenten vragen aandacht`}</b>
                <ul>
                  {aandacht.map((d) => (
                    <li key={d.id}>
                      {d.titel}: {vervalTekst(d.vervaltOp)}
                      {d.geldigheid === 'verlopen' ? '. Gaat niet mee in het inhuurdossier.' : '.'}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <p className="hint eigen-inhuur-uitleg">
            Het inhuurdossier bundelt de {geldig} geldige {geldig === 1 ? 'document' : 'documenten'} met een voorblad in één PDF. Verlopen documenten gaan niet mee.
          </p>

          {lijst.length === 0 ? (
            <div className="leeg">
              <Icon name="module-eigen-dossier" size={32} />
              <p style={{ margin: '0 0 12px' }}>Nog geen documenten. Begin met je VCA en je verzekering.</p>
            </div>
          ) : (
            <div className="beheer-grid">
              {GROEPEN.map((g) => {
                const docs = lijst.filter((d) => g.soorten.includes(d.soort));
                return (
                  <div key={g.titel} className="beheer-kolom">
                    <section className="card beheer-kaart">
                      <h2 className="section-label">{g.titel}</h2>
                      {docs.length === 0 ? (
                        <p className="hint">Nog niets.</p>
                      ) : (
                        <ul className="beheer-lijst">
                          {docs.map((d) => (
                            <li key={d.id} className="beheer-lijst-regel eigen-regel">
                              <span className="icoonvak" aria-hidden="true"><Icon name={documentSoort(d.soort).icoon} size={20} /></span>
                              <button type="button" className="beheer-lijst-tekst eigen-open" onClick={() => setVenster({ doc: d })}>
                                <strong>{d.titel}</strong>
                                <span className="beheer-bijzaak">
                                  {[documentSoort(d.soort).label, d.uitgever, d.vervaltOp ? `geldig tot ${dagKort(d.vervaltOp)}` : null].filter(Boolean).join(', ')}
                                </span>
                              </button>
                              <span className={`badge ${GELDIGHEID_BADGE[d.geldigheid]}`}>
                                <Icon name={GELDIGHEID_ICOON[d.geldigheid]} size={16} />
                                {GELDIGHEID_LABEL[d.geldigheid]}
                              </span>
                              {d.bestand ? (
                                <a className="icon-btn" href={d.bestand.adres} download title="Bestand downloaden" aria-label={`${d.titel} downloaden`}>
                                  <Icon name="download" size={20} />
                                </a>
                              ) : (
                                <span className="icon-btn is-uit" title="Nog geen bestand" aria-label="Nog geen bestand">
                                  <Icon name="upload" size={20} />
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {venster && (
        <DocumentVenster
          doc={venster.doc}
          onClose={() => setVenster(null)}
          onOpgeslagen={async () => {
            setVenster(null);
            await laad();
          }}
          onVerwijder={verwijder}
        />
      )}
      <OngedaanMelding melding={ongedaan} onSluit={() => setOngedaan(null)} />
    </AppShell>
  );
}

function DocumentVenster({
  doc,
  onClose,
  onOpgeslagen,
  onVerwijder,
}: {
  doc: EigenDocument | null;
  onClose: () => void;
  onOpgeslagen: () => void;
  onVerwijder: (d: EigenDocument) => void;
}) {
  const [velden, setVelden] = useState({
    soort: doc?.soort ?? 'vca',
    titel: doc?.titel ?? '',
    uitgever: doc?.uitgever ?? '',
    nummer: doc?.nummer ?? '',
    afgegevenOp: doc?.afgegevenOp ?? '',
    vervaltOp: doc?.vervaltOp ?? '',
    notities: doc?.notities ?? '',
  });
  const [bestand, setBestand] = useState<File | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const zet = (k: keyof typeof velden) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setVelden((v) => ({ ...v, [k]: e.target.value }));

  const opslaan = async (e: React.FormEvent) => {
    e.preventDefault();
    setBezig(true);
    setFout('');
    try {
      const res = await fetch(doc ? `/api/eigen-dossier/${doc.id}` : '/api/eigen-dossier', {
        method: doc ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...velden, afgegevenOp: velden.afgegevenOp || null, vervaltOp: velden.vervaltOp || null }),
      });
      if (!res.ok) {
        setFout(await foutTekst(res, 'Het document is niet opgeslagen.'));
        return;
      }
      const opgeslagen: EigenDocument = await res.json();
      if (bestand) {
        const form = new FormData();
        form.append('bestand', bestand);
        const b = await fetch(`/api/eigen-dossier/${opgeslagen.id}/bestand`, { method: 'POST', body: form });
        if (!b.ok) {
          setFout(`${await foutTekst(b, 'Het bestand is niet opgeslagen.')} De gegevens zijn wel opgeslagen.`);
          return;
        }
      }
      onOpgeslagen();
    } catch {
      setFout(GEEN_VERBINDING);
    } finally {
      setBezig(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={doc ? doc.titel : 'Document toevoegen'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Annuleren</button>
          <button type="submit" form="eigen-document" className="btn btn-primary" disabled={bezig}>
            <Icon name="check" size={16} />
            {bezig ? 'Bezig...' : 'Opslaan'}
          </button>
        </>
      }
    >
      <form id="eigen-document" className="beheer-formulier" onSubmit={opslaan}>
        <div className="veld">
          <label className="label" htmlFor="ed-soort">Soort</label>
          <select id="ed-soort" className="select" value={velden.soort} onChange={zet('soort')}>
            {DOCUMENT_SOORTEN.map((s) => (
              <option key={s.waarde} value={s.waarde}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="veld">
          <label className="label" htmlFor="ed-titel">Naam</label>
          <input id="ed-titel" className="input" value={velden.titel} onChange={zet('titel')} placeholder="Bijv. VCA Basis" required />
        </div>
        <div className="veld">
          <label className="label" htmlFor="ed-uitgever">Uitgever</label>
          <input id="ed-uitgever" className="input" value={velden.uitgever} onChange={zet('uitgever')} />
        </div>
        <div className="veld">
          <label className="label" htmlFor="ed-nummer">Nummer</label>
          <input id="ed-nummer" className="input" value={velden.nummer} onChange={zet('nummer')} />
        </div>
        <div className="veld">
          <label className="label" htmlFor="ed-afgegeven">Afgegeven op</label>
          <input id="ed-afgegeven" type="date" className="input" value={velden.afgegevenOp} onChange={zet('afgegevenOp')} />
        </div>
        <div className="veld">
          <label className="label" htmlFor="ed-verval">Geldig tot</label>
          <input id="ed-verval" type="date" className="input" value={velden.vervaltOp} onChange={zet('vervaltOp')} />
          <p className="hint">Leeg laten als het niet verloopt, zoals een diploma.</p>
        </div>
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="ed-bestand">Bestand (PDF, of een foto of scan)</label>
          <input id="ed-bestand" type="file" className="input" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setBestand(e.target.files?.[0] ?? null)} />
          {doc?.bestand && !bestand && <p className="hint">Er staat al een bestand: {doc.bestand.naam ?? 'document'}. Een nieuw bestand vervangt het.</p>}
        </div>
        <div className="veld beheer-veld-breed">
          <label className="label" htmlFor="ed-notities">Notities</label>
          <textarea id="ed-notities" className="textarea" rows={2} value={velden.notities} onChange={zet('notities')} />
        </div>
        {fout && <div className="alert alert-danger beheer-veld-breed" role="alert">{fout}</div>}
        {doc && (
          <div className="beheer-veld-breed">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => onVerwijder(doc)} disabled={bezig}>
              <Icon name="trash" size={16} />
              Document verwijderen
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
