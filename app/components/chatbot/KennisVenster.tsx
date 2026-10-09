'use client';
import { useState } from 'react';
import { Modal } from '@/app/components/ui';
import { kennisSchema, type KennisInvoer } from '@/lib/chatbot';
import { chatApi, foutMelding } from './api';

export interface KennisConcept { id?: number; gesprekId?: string; data: KennisInvoer }
export default function KennisVenster({ concept, onClose, onSaved }: { concept: KennisConcept; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState(concept.data);
  const [bevestiging, setBevestiging] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [velden, setVelden] = useState<Record<string, string>>({});
  const wijzig = <K extends keyof KennisInvoer>(veld: K, waarde: KennisInvoer[K]) => setData(d => ({ ...d, [veld]: waarde }));
  async function opslaan() {
    const parsed = kennisSchema.safeParse(data);
    if (!parsed.success) {
      setVelden(Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message])));
      return;
    }
    setBezig(true); setFout(''); setVelden({});
    try {
      const pad = concept.gesprekId ? `gesprekken/${concept.gesprekId}/naar-kennis` : concept.id ? `kennis/${concept.id}` : 'kennis';
      await chatApi(pad, concept.id ? 'PUT' : 'POST', parsed.data);
      onSaved();
    } catch (error) { setFout(foutMelding(error)); }
    finally { setBezig(false); }
  }
  async function verwijderen() {
    if (bevestiging !== 'verwijderen' || !concept.id) return;
    setBezig(true); setFout('');
    try { await chatApi(`kennis/${concept.id}`, 'DELETE', { bevestiging }); onSaved(); }
    catch (error) { setFout(foutMelding(error)); }
    finally { setBezig(false); }
  }
  return <Modal open onClose={() => { if (!bezig) onClose(); }} title={concept.id ? 'Kennisitem bewerken' : 'Toevoegen aan kennisbank'} size="md" footer={<>
    <button className="btn" disabled={bezig} onClick={onClose}>Annuleren</button>
    <button className="btn btn-primary" disabled={bezig} type="submit" form="chat-kennis-form">{bezig ? 'Bezig...' : 'Opslaan'}</button>
  </>}>
    <form id="chat-kennis-form" className="chat-form" noValidate onSubmit={e => { e.preventDefault(); void opslaan(); }}>
      {fout && <div className="alert alert-danger" role="alert">{fout}</div>}
      {concept.gesprekId && <p className="hint">Controleer de tekst en haal namen en contactgegevens eruit. Actieve kennis wordt gebruikt in volgende gesprekken.</p>}
      {(['vraag', 'antwoord', 'categorie'] as const).map(veld => <div className="veld" key={veld}>
        <label className="label" htmlFor={`chat-${veld}`}>{veld === 'vraag' ? 'Vraag' : veld === 'antwoord' ? 'Antwoord' : 'Categorie'}</label>
        {veld === 'antwoord' ? <textarea id={`chat-${veld}`} className={`textarea${velden[veld] ? ' input-fout' : ''}`} rows={7} maxLength={6000} value={data[veld]} disabled={bezig} onChange={e => wijzig(veld, e.target.value)} aria-invalid={!!velden[veld]} aria-describedby={velden[veld] ? `chat-${veld}-fout` : undefined} /> :
          <input id={`chat-${veld}`} className={`input${velden[veld] ? ' input-fout' : ''}`} value={data[veld]} maxLength={veld === 'vraag' ? 500 : 80} disabled={bezig} onChange={e => wijzig(veld, e.target.value)} aria-invalid={!!velden[veld]} aria-describedby={velden[veld] ? `chat-${veld}-fout` : undefined} />}
        {velden[veld] && <p id={`chat-${veld}-fout`} className="veld-fout" role="alert">{velden[veld]}</p>}
      </div>)}
      <label className="chat-schakelaar"><input type="checkbox" role="switch" checked={data.actief} disabled={bezig} onChange={e => wijzig('actief', e.target.checked)} /><span>Actief in de kennisbank</span></label>
    </form>
    {concept.id && <div className="gevarenzone chat-verwijderen">
      <h3>Kennisitem verwijderen</h3><p>Je verwijdert ‘{concept.data.vraag}’ definitief. Dit kan niet ongedaan worden gemaakt.</p>
      <label className="label" htmlFor="chat-bevestiging">Typ verwijderen ter bevestiging</label>
      <input id="chat-bevestiging" className="input" autoComplete="off" value={bevestiging} disabled={bezig} onChange={e => setBevestiging(e.target.value)} />
      <button type="button" className="btn btn-danger-soft" disabled={bezig || bevestiging !== 'verwijderen'} onClick={() => void verwijderen()}>Definitief verwijderen</button>
    </div>}
  </Modal>;
}
