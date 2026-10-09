import { chatAdmin } from '@/lib/chatAdmin';
import { instellingenSchema } from '@/lib/chatbot';
import { leesJson } from '@/lib/apiRoute';
import { chatbotRoute, chatAntwoord, chatAudit } from '@/lib/chatbotRoute';
export const GET = chatbotRoute(async () => chatAntwoord(await chatAdmin.instellingen()));
export const PUT = chatbotRoute(async (request, _context, sessie) => {
  const invoer = await leesJson(request, instellingenSchema.partial());
  const data = await chatAdmin.instellingenWijzigen(invoer);
  await chatAudit(request, sessie, 'UPDATE_CHAT_INSTELLINGEN', { velden: Object.keys(invoer) });
  return chatAntwoord(data);
});
