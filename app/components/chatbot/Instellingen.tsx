'use client';
import { useState } from 'react';
import { Laden } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import { instellingenSchema, CHAT_MODELLEN, type ChatInstellingen } from '@/lib/chatbot';
import { chatApi, useChatData, foutMelding } from './api';
export default function Instellingen() {
  const { data, laden, fout, opnieuw } = useChatData<ChatInstellingen>('instellingen');
  if (laden) return <Laden soort="lijst" />;
  if (fout) return <LaadFout melding={fout} onOpnieuw={opnieuw} />;
  return data ? <InstellingenFormulier initieel={data} /> : null;
}
function InstellingenFormulier({ initieel }: { initieel: ChatInstellingen }) {
  const [data, setData] = useState(initieel);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [velden, setVelden] = useState<Record<string, string>>({});
  function wijzig<K extends keyof ChatInstellingen>(veld: K, waarde: ChatInstellingen[K]) { setData(d => ({ ...d, [veld]: waarde })); setMelding(''); }
  async function opslaan() {
    const parsed = instellingenSchema.safeParse(data);
    if (!parsed.success) { setVelden(Object.fromEntries(parsed.error.issues.map(i => [i.path.join('.'), i.message]))); return; }
    setBezig(true); setFout(''); setMelding(''); setVelden({});
    try { setData(await chatApi<ChatInstellingen>('instellingen', 'PUT', parsed.data)); setMelding('De instellingen zijn opgeslagen.'); }
    catch (error) { setFout(foutMelding(error)); }
    finally { setBezig(false); }
  }
  const foutBij = (veld: string) => velden[veld] ? <p className="veld-fout" id={`inst-${veld}-fout`} role="alert">{velden[veld]}</p> : null;
  return <form className="card chat-form chat-instellingen" noValidate onSubmit={e => { e.preventDefault(); void opslaan(); }}>
    {fout && <div className="alert alert-danger" role="alert">{fout}</div>}{melding && <div className="alert alert-success" role="status">{melding}</div>}
    <fieldset disabled={bezig} className="chat-form">
      <legend className="section-label">Websitechat</legend>
      <label className="chat-schakelaar"><input type="checkbox" role="switch" checked={data.chat_aan} onChange={e => wijzig('chat_aan', e.target.checked)} /><span>Chat aan</span></label>
      <div className="veld"><label className="label" htmlFor="chat-welkom">Welkomsttekst</label><textarea id="chat-welkom" className="textarea" rows={4} maxLength={600} value={data.welkomsttekst} onChange={e => wijzig('welkomsttekst', e.target.value)} aria-invalid={!!velden.welkomsttekst} aria-describedby={velden.welkomsttekst ? 'inst-welkomsttekst-fout' : undefined} />{foutBij('welkomsttekst')}</div>
      <fieldset className="chat-form"><legend className="label">Startvragen (drie of vier)</legend>{data.startvragen.map((vraag, i) => <div className="veld" key={i}><label className="label" htmlFor={`chat-start-${i}`}>Startvraag {i + 1}</label><input id={`chat-start-${i}`} className="input" maxLength={100} value={vraag} onChange={e => wijzig('startvragen', data.startvragen.map((v, n) => n === i ? e.target.value : v))} aria-invalid={!!velden[`startvragen.${i}`]} aria-describedby={velden[`startvragen.${i}`] ? `inst-startvragen.${i}-fout` : undefined} />{foutBij(`startvragen.${i}`)}</div>)}{foutBij('startvragen')}
        <button className="btn" type="button" onClick={() => wijzig('startvragen', data.startvragen.length === 3 ? [...data.startvragen, ''] : data.startvragen.slice(0, 3))}>{data.startvragen.length === 3 ? 'Vierde startvraag toevoegen' : 'Vierde startvraag weghalen'}</button>
      </fieldset>
      <div className="veld"><label className="label" htmlFor="chat-instructies">Extra instructies voor de bot</label><textarea id="chat-instructies" className="textarea" rows={6} maxLength={6000} value={data.extra_instructies} onChange={e => wijzig('extra_instructies', e.target.value)} />{foutBij('extra_instructies')}</div>
      <div className="chat-formrij">
        <div className="veld"><label className="label" htmlFor="chat-model">Model</label><select id="chat-model" className="select" value={data.model} onChange={e => wijzig('model', e.target.value as ChatInstellingen['model'])}>{!CHAT_MODELLEN.includes(data.model) && <option value={data.model}>{data.model} (huidig)</option>}{CHAT_MODELLEN.map(m => <option key={m}>{m}</option>)}</select>{foutBij('model')}</div>
        <div className="veld"><label className="label" htmlFor="chat-effort">Denkstand</label><select id="chat-effort" className="select" value={data.effort} onChange={e => wijzig('effort', e.target.value as ChatInstellingen['effort'])}>{!['low', 'medium', 'high'].includes(data.effort) && <option value={data.effort}>{data.effort} (huidig)</option>}{['low', 'medium', 'high'].map(e => <option key={e}>{e}</option>)}</select>{foutBij('effort')}</div>
      </div>
    </fieldset>
    <div className="chat-formvoet"><button className="btn btn-primary" disabled={bezig} type="submit">{bezig ? 'Opslaan...' : 'Opslaan'}</button></div>
  </form>;
}
