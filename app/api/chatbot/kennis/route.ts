import { chatAdmin } from '@/lib/chatAdmin';
import { kennisSchema } from '@/lib/chatbot';
import { leesJson } from '@/lib/apiRoute';
import { chatbotRoute, chatAntwoord, chatAudit } from '@/lib/chatbotRoute';
export const GET = chatbotRoute(async () => chatAntwoord(await chatAdmin.kennis()));
export const POST = chatbotRoute(async (request, _context, sessie) => {
  const data = await chatAdmin.kennisToevoegen(await leesJson(request, kennisSchema));
  await chatAudit(request, sessie, 'CREATE_CHAT_KENNIS', { id: data.id });
  return chatAntwoord(data, 201);
});
