import { chatAdmin } from '@/lib/chatAdmin';
import { chatbotRoute, chatAntwoord, gesprekId } from '@/lib/chatbotRoute';
export const GET = chatbotRoute(async (_request, context) => chatAntwoord(await chatAdmin.gesprek(await gesprekId(context))));
