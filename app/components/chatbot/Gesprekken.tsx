'use client';
import { useState } from 'react';
import { Icon, Laden, Modal } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import { GESPREKKEN_PER_PAGINA, type ChatGesprek, type GesprekRegel, type GesprekDetail } from '@/lib/chatbot';
import { useChatData } from './api';
import KennisVenster, { type KennisConcept } from './KennisVenster';
const datum = (tijd: number) => new Date(tijd).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
function Contact({ gesprek }: { gesprek: ChatGesprek }) {
  return <span className="chat-contact">{gesprek.naam && <span>{gesprek.naam}</span>}{gesprek.telefoon && <a href={`tel:${gesprek.telefoon.replace(/[^\d+]/g, '')}`}>{gesprek.telefoon}</a>}{gesprek.email && <a href={`mailto:${gesprek.email}`}>{gesprek.email}</a>}{!gesprek.naam && !gesprek.telefoon && !gesprek.email && <span>Niet opgegeven</span>}</span>;
}
export default function Gesprekken() {
  const [filter, setFilter] = useState<'onbeantwoord' | 'alles'>('onbeantwoord');
  const [offset, setOffset] = useState(0);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const { data, laden, fout, opnieuw } = useChatData<GesprekRegel[]>(`gesprekken?filter=${filter}&offset=${offset}`);
  return <>
    <div className="chat-gereedschap"><div className="filterchips" aria-label="Gesprekkenfilter">{(['onbeantwoord', 'alles'] as const).map(f => <button key={f} className={`filterchip${filter === f ? ' on' : ''}`} aria-pressed={filter === f} onClick={() => { setFilter(f); setOffset(0); }}>{f === 'onbeantwoord' ? 'Onbeantwoord' : 'Alles'}</button>)}</div><button className="btn" onClick={opnieuw} disabled={laden}><Icon name="reset" />Verversen</button></div>
    {laden && <Laden soort="lijst" />}
    {fout && <LaadFout melding={fout} onOpnieuw={opnieuw} />}
    {data && <>
      {data.length === 0 ? <div className="leeg"><Icon name="comment" size={32} /><p>{filter === 'onbeantwoord' ? 'Er zijn geen onbeantwoorde gesprekken op deze pagina.' : 'Er zijn nog geen gesprekken op deze pagina.'}</p></div> : <div className="card table-container"><div className="table-scroll"><table className="table table-kaarten"><thead><tr><th>Eerste vraag</th><th>Datum</th><th>Modus</th><th>Contact</th><th>Status</th><th>Actie</th></tr></thead><tbody>{data.map(g => <tr key={g.id}>
        <td data-label="Eerste vraag" className="kaart-kop chat-vraag">{g.eerste_vraag}</td><td data-label="Datum">{datum(g.aangemaakt)}</td><td data-label="Modus">{g.modus === 'roel' ? 'Roel' : g.modus === 'bot' ? 'Bot' : 'Gesloten'}</td><td data-label="Contact"><Contact gesprek={g} /></td>
        <td data-label="Status" className="kaart-status">{!!g.onbeantwoord && <span className="badge badge-warning"><Icon name="clock" size={16} />Onbeantwoord</span>}</td>
        <td data-label="Actie" className="kaart-acties"><button className="btn" onClick={() => setGekozen(g.id)}>Gesprek bekijken</button></td>
      </tr>)}</tbody></table></div></div>}
      <div className="chat-paginering"><button className="btn" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - GESPREKKEN_PER_PAGINA))}>Vorige</button><span>Pagina {(offset / GESPREKKEN_PER_PAGINA + 1).toLocaleString('nl-NL')}</span><button className="btn" disabled={data.length < GESPREKKEN_PER_PAGINA} onClick={() => setOffset(o => o + GESPREKKEN_PER_PAGINA)}>Volgende</button></div>
    </>}
    {gekozen && <GesprekVenster key={gekozen} id={gekozen} onClose={() => setGekozen(null)} />}
  </>;
}
function GesprekVenster({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, laden, fout, opnieuw } = useChatData<GesprekDetail>(`gesprekken/${id}`);
  const [concept, setConcept] = useState<KennisConcept | null>(null);
  const [melding, setMelding] = useState('');
  const [vraagId, setVraagId] = useState<number | null>(null);
  const vragen = data?.berichten.filter(b => b.rol === 'bezoeker') ?? [];
  const vraag = vragen.find(v => v.id === vraagId) ?? vragen[0];
  function overnemen() {
    if (!data || !vraag) return;
    const index = data.berichten.findIndex(b => b.id === vraag.id);
    const vervolg = data.berichten.slice(index + 1);
    const volgendeVraag = vervolg.findIndex(b => b.rol === 'bezoeker');
    const antwoord = (volgendeVraag < 0 ? vervolg : vervolg.slice(0, volgendeVraag)).filter(b => b.rol === 'roel').map(b => b.tekst).join('\n\n');
    setConcept({ gesprekId: id, data: { vraag: vraag.tekst, antwoord, categorie: 'algemeen', actief: true } });
  }
  return <>
    <Modal open onClose={onClose} title="Gesprek" size="lg" footer={<><button className="btn" onClick={onClose}>Sluiten</button>{data && vraag && <button className="btn btn-primary" onClick={overnemen}>Toevoegen aan kennisbank</button>}</>}>
      <div className="chatbot">
        {laden && <Laden soort="lijst" />}{fout && <LaadFout melding={fout} onOpnieuw={opnieuw} />}
        {data && <>
          <div className="chat-gesprekkop"><span>{datum(data.aangemaakt)} · {data.modus === 'roel' ? 'Roel' : data.modus === 'bot' ? 'Bot' : 'Gesloten'}</span><Contact gesprek={data} />{!!data.onbeantwoord && <span className="badge badge-warning"><Icon name="clock" size={16} />Onbeantwoord</span>}</div>
          {melding && <p className="alert alert-success" role="status">{melding}</p>}
          <ol className="chat-berichten" aria-label="Berichten in dit gesprek">{data.berichten.map(b => <li key={b.id} className={`chat-bericht chat-bericht-${b.rol}`}><div className="chat-bericht-kop"><strong>{b.rol === 'bot' ? 'AI' : b.rol === 'roel' ? 'Roel' : b.rol === 'bezoeker' ? 'Bezoeker' : 'Systeem'}</strong><time dateTime={new Date(b.tijd).toISOString()}>{datum(b.tijd)}</time></div><p>{b.tekst}</p></li>)}</ol>
          {vragen.length > 1 && <div className="veld"><label className="label" htmlFor="chat-kennis-vraag">Vraag om over te nemen</label><select id="chat-kennis-vraag" className="select" value={vraag?.id ?? ''} onChange={e => setVraagId(Number(e.target.value))}>{vragen.map(v => <option key={v.id} value={v.id}>{v.tekst.slice(0, 100)}</option>)}</select></div>}
        </>}
      </div>
    </Modal>
    {concept && <KennisVenster concept={concept} onClose={() => setConcept(null)} onSaved={() => { setConcept(null); setMelding('Het antwoord is toegevoegd aan de kennisbank.'); }} />}
  </>;
}
