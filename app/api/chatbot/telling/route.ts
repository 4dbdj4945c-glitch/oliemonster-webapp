import { chatAdmin } from '@/lib/chatAdmin';
import { chatbotRoute, chatAntwoord } from '@/lib/chatbotRoute';
export const GET = chatbotRoute(async () => {
  try { return chatAntwoord({ aantal: await chatAdmin.onbeantwoordAantal() }); }
  catch { return chatAntwoord({ aantal: null }); }
});
