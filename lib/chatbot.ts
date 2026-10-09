import { z } from 'zod';

export const kennisSchema = z.object({
  vraag: z.string().trim().min(1, 'Vul een vraag in').max(500, 'Maximaal 500 tekens'),
  antwoord: z.string().trim().min(1, 'Vul een antwoord in').max(6000, 'Maximaal 6000 tekens'),
  categorie: z.string().trim().min(1, 'Vul een categorie in').max(80).default('algemeen'),
  actief: z.boolean().default(true),
}).strict();
export type KennisInvoer = z.infer<typeof kennisSchema>;
export interface KennisItem extends Omit<KennisInvoer, 'actief'> { id: number; actief: number; aangemaakt: number; gewijzigd: number }
export const CHAT_MODELLEN = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'] as const;
export const instellingenSchema = z.object({
  welkomsttekst: z.string().trim().min(1, 'Vul een welkomsttekst in').max(600),
  startvragen: z.array(z.string().trim().min(1, 'Vul een startvraag in').max(100)).min(3, 'Vul drie of vier startvragen in').max(4),
  extra_instructies: z.string().max(6000),
  model: z.enum(CHAT_MODELLEN),
  effort: z.enum(['low', 'medium', 'high']),
  chat_aan: z.boolean(),
}).strict();
export type ChatInstellingen = z.infer<typeof instellingenSchema>;
export interface ChatBericht { id: number; gesprek_id: string; rol: 'bezoeker' | 'bot' | 'roel' | 'systeem'; tekst: string; tijd: number }
export interface ChatGesprek {
  id: string; aangemaakt: number; laatst_actief: number; modus: 'bot' | 'roel' | 'gesloten';
  naam: string | null; telefoon: string | null; email: string | null; onbeantwoord: number;
}
export interface GesprekDetail extends ChatGesprek { berichten: ChatBericht[] }
export interface GesprekRegel extends ChatGesprek { eerste_vraag: string }
export const GESPREKKEN_PER_PAGINA = 20;
