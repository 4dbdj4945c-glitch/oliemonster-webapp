import { redirect } from 'next/navigation';
import { gebruikerVanVerzoek } from '@/lib/toegang';
import Chatbot from '@/app/components/chatbot/Chatbot';

export default async function ChatbotPagina() {
  const gebruiker = await gebruikerVanVerzoek();
  if (!gebruiker) redirect('/login');
  if (gebruiker.requiresPasswordChange) redirect('/set-password');
  if (gebruiker.role !== 'admin') redirect('/dashboard');
  return <Chatbot />;
}
