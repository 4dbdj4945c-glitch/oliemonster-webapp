import { z } from 'zod';
import { chatAdmin } from '@/lib/chatAdmin';
import { leesQuery } from '@/lib/apiRoute';
import { chatbotRoute, chatAntwoord } from '@/lib/chatbotRoute';
export const GET = chatbotRoute(async request => {
  const { filter, offset } = leesQuery(request, z.object({ filter: z.enum(['onbeantwoord', 'alles']).default('onbeantwoord'), offset: z.coerce.number().int().min(0).max(1000000).default(0) }));
  return chatAntwoord(await chatAdmin.overzicht(filter, offset));
});
