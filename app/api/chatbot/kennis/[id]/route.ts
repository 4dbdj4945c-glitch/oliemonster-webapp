import { z } from 'zod';
import { chatAdmin } from '@/lib/chatAdmin';
import { kennisSchema } from '@/lib/chatbot';
import { leesJson, leesId } from '@/lib/apiRoute';
import { chatbotRoute, chatAntwoord, chatAudit } from '@/lib/chatbotRoute';
export const PUT = chatbotRoute(async (request, context, sessie) => {
  const id = await leesId(context);
  const data = await chatAdmin.kennisWijzigen(id, await leesJson(request, kennisSchema));
  await chatAudit(request, sessie, 'UPDATE_CHAT_KENNIS', { id });
  return chatAntwoord(data);
});
export const DELETE = chatbotRoute(async (request, context, sessie) => {
  const id = await leesId(context);
  await leesJson(request, z.object({ bevestiging: z.literal('verwijderen', { error: 'Typ verwijderen ter bevestiging' }) }).strict());
  const data = await chatAdmin.kennisVerwijderen(id);
  await chatAudit(request, sessie, 'DELETE_CHAT_KENNIS', { id });
  return chatAntwoord(data);
});
