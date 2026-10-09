'use client';
import { useState } from 'react';
import { Icon, Laden } from '@/app/components/ui';
import LaadFout from '@/app/components/LaadFout';
import type { KennisItem } from '@/lib/chatbot';
import { useChatData } from './api';
import KennisVenster, { type KennisConcept } from './KennisVenster';

export default function Kennisbank() {
  const { data, laden, fout, opnieuw } = useChatData<KennisItem[]>('kennis');
  const [zoek, setZoek] = useState('');
  const [concept, setConcept] = useState<KennisConcept | null>(null);
  const [melding, setMelding] = useState('');
  const items = data?.filter(k => `${k.vraag} ${k.categorie} ${k.antwoord}`.toLocaleLowerCase('nl-NL').includes(zoek.toLocaleLowerCase('nl-NL')));
  return <>
    <div className="chat-gereedschap">
      <div className="veld"><label className="label" htmlFor="chat-zoeken">Zoeken in de kennisbank</label><input id="chat-zoeken" type="search" className="input" value={zoek} onChange={e => setZoek(e.target.value)} placeholder="Vraag, antwoord of categorie" /></div>
      {data && !fout && <button className="btn btn-primary" onClick={() => setConcept({ data: { vraag: '', antwoord: '', categorie: 'algemeen', actief: true } })}><Icon name="plus" />Kennis toevoegen</button>}
    </div>
    {melding && <p className="alert alert-success" role="status">{melding}</p>}
    {laden && <Laden soort="lijst" />}
    {fout && <LaadFout melding={fout} onOpnieuw={opnieuw} />}
    {items && (items.length === 0 ? <div className="leeg"><Icon name="comment" size={32} /><p>{zoek ? 'Geen kennisitems gevonden. Pas je zoekopdracht aan.' : 'Er staat nog geen kennis in de kennisbank. Voeg een vraag en antwoord toe.'}</p></div> :
      <div className="card table-container"><div className="table-scroll"><table className="table table-kaarten"><thead><tr><th>Vraag</th><th>Categorie</th><th>Status</th><th>Actie</th></tr></thead><tbody>{items.map(k => <tr key={k.id}>
        <td data-label="Vraag" className="kaart-kop">{k.vraag}</td><td data-label="Categorie">{k.categorie}</td>
        <td data-label="Status" className="kaart-status"><span className={`badge ${k.actief ? 'badge-success' : 'badge-gray'}`}><Icon name={k.actief ? 'check' : 'close'} size={16} />{k.actief ? 'Actief' : 'Inactief'}</span></td>
        <td data-label="Actie" className="kaart-acties"><button className="btn" onClick={() => setConcept({ id: k.id, data: { vraag: k.vraag, antwoord: k.antwoord, categorie: k.categorie, actief: !!k.actief } })}><Icon name="pencil" />Bewerken</button></td>
      </tr>)}</tbody></table></div></div>)}
    {concept && <KennisVenster concept={concept} onClose={() => setConcept(null)} onSaved={() => { setConcept(null); setMelding('De kennisbank is bijgewerkt.'); opnieuw(); }} />}
  </>;
}
