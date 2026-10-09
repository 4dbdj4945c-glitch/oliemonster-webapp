'use client';
import { useState } from 'react';
import { AppShell } from '@/app/components/ui';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import Gesprekken from './Gesprekken';
import Kennisbank from './Kennisbank';
import Instellingen from './Instellingen';
const tabs = ['Gesprekken', 'Kennisbank', 'Instellingen'] as const;
export default function Chatbot() {
  const user = useGebruiker();
  const [tab, setTab] = useState<typeof tabs[number]>('Gesprekken');
  return <AppShell user={user} title="Chatbot"><div className="chatbot">
    <div className="paginakop"><div><h1 className="page-title">Chatbot</h1><p className="page-subtitle">Beheer de gesprekken en antwoorden van de websitechat.</p></div></div>
    <div className="tabs" role="tablist" aria-label="Chatbot onderdelen">{tabs.map(t => <button key={t} role="tab" id={`tab-${t}`} aria-controls={`paneel-${t}`} aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="chat-tabinhoud" role="tabpanel" id={`paneel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {tab === 'Gesprekken' ? <Gesprekken /> : tab === 'Kennisbank' ? <Kennisbank /> : <Instellingen />}
    </div>
  </div></AppShell>;
}
