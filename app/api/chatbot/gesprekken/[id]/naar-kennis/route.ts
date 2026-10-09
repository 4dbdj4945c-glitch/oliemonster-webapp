import { chatAdmin } from '@/lib/chatAdmin';
import { kennisSchema } from '@/lib/chatbot';
import { leesJson } from '@/lib/apiRoute';
import { chatbotRoute, chatAntwoord, chatAudit, gesprekId } from '@/lib/chatbotRoute';
export const POST = chatbotRoute(async (request, context, sessie) => {
  const id = await gesprekId(context);
  const data = await chatAdmin.naarKennis(id, await leesJson(request, kennisSchema));
  await chatAudit(request, sessie, 'CREATE_CHAT_KENNIS', { id: data.id, gesprekId: id });
  return chatAntwoord(data, 201);
});
