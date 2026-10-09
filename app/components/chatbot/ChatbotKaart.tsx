'use client';
import Link from 'next/link';
import { Icon } from '@/app/components/ui';
import { useChatData } from './api';
export default function ChatbotKaart() {
  const { data, laden } = useChatData<{ aantal: number | null }>('telling');
  return <section className="chat-dashboard" aria-labelledby="chat-dashboard-kop">
    <div className="sectiekop"><h2 id="chat-dashboard-kop">It's Done Services</h2></div>
    <Link href="/dashboard/chatbot" className="card chat-dashboard-kaart"><span className="icoonvak"><Icon name="comment" size={24} /></span><span><strong>Chatbot</strong><span>Gesprekken, kennisbank en instellingen</span></span><span className="chat-dashboard-aantal">{laden ? 'Telling laden...' : data?.aantal == null ? 'niet bereikbaar' : `${data.aantal.toLocaleString('nl-NL')} onbeantwoord`}</span></Link>
  </section>;
}
