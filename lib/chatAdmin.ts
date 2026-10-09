import 'server-only';
import type { ChatGesprek, GesprekDetail, GesprekRegel, KennisItem, KennisInvoer, ChatInstellingen } from './chatbot';
import { GESPREKKEN_PER_PAGINA } from './chatbot';

export class ChatAdminFout extends Error {
  constructor(public status: number, melding: string) { super(melding); }
}

/** Alleen server-side. Geen retries van mutaties: de service kan al hebben opgeslagen. */
export async function chatFetch<T>(pad: string, method = 'GET', body?: unknown): Promise<T> {
  const basis = process.env.CHAT_ADMIN_URL?.trim();
  const token = process.env.CHAT_ADMIN_TOKEN?.trim();
  if (!basis || !token) throw new ChatAdminFout(503, 'De chatbot is nog niet ingesteld. Vul CHAT_ADMIN_URL en CHAT_ADMIN_TOKEN in op de server.');
  let url: URL;
  try {
    url = new URL(basis);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
  } catch { throw new ChatAdminFout(503, 'CHAT_ADMIN_URL is ongeldig. Gebruik een http- of https-adres.'); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${url.toString().replace(/\/$/, '')}/admin${pad}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store', redirect: 'error', signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 404) throw new ChatAdminFout(404, 'Dit item bestaat niet meer in de chatservice.');
      if (res.status === 400 || res.status === 422) throw new ChatAdminFout(400, 'Controleer de ingevulde gegevens. De chatservice heeft ze niet geaccepteerd.');
      if (res.status === 401 || res.status === 403) throw new ChatAdminFout(503, 'De chatservice weigert de toegang. Controleer CHAT_ADMIN_TOKEN op de server.');
      throw new ChatAdminFout(502, 'De chatservice kon dit verzoek niet verwerken. Probeer het opnieuw.');
    }
    try { return await res.json() as T; }
    catch { if (controller.signal.aborted) throw new Error('timeout'); throw new ChatAdminFout(502, 'De chatservice gaf een onleesbaar antwoord.'); }
  } catch (error) {
    if (error instanceof ChatAdminFout) throw error;
    if (controller.signal.aborted) throw new ChatAdminFout(504, 'De chatservice reageert te langzaam. Controleer vóór opnieuw opslaan of de wijziging al is verwerkt.');
    throw new ChatAdminFout(503, 'De chatservice is niet bereikbaar. Probeer het later opnieuw.');
  } finally { clearTimeout(timer); }
}
const gesprek = (id: string) => chatFetch<GesprekDetail>(`/gesprekken/${encodeURIComponent(id)}`);
const gesprekken = (filter: 'alles' | 'onbeantwoord', limit = 20, offset = 0) =>
  chatFetch<ChatGesprek[]>(`/gesprekken?filter=${filter}&limit=${limit}&offset=${offset}`);
export const chatAdmin = {
  kennis: () => chatFetch<KennisItem[]>('/kennis'),
  kennisToevoegen: (data: KennisInvoer) => chatFetch<{ id: number }>('/kennis', 'POST', data),
  kennisWijzigen: (id: number, data: KennisInvoer) => chatFetch<{ ok: boolean }>(`/kennis/${id}`, 'PUT', data),
  kennisVerwijderen: (id: number) => chatFetch<{ ok: boolean }>(`/kennis/${id}`, 'DELETE'),
  gesprek, gesprekken,
  naarKennis: (id: string, data: KennisInvoer) => chatFetch<{ id: number }>(`/gesprekken/${encodeURIComponent(id)}/naar-kennis`, 'POST', data),
  instellingen: () => chatFetch<ChatInstellingen>('/instellingen'),
  instellingenWijzigen: (data: Partial<ChatInstellingen>) => chatFetch<ChatInstellingen>('/instellingen', 'PUT', data),
  async overzicht(filter: 'alles' | 'onbeantwoord', offset: number) {
    const rows = await gesprekken(filter, GESPREKKEN_PER_PAGINA, offset);
    const regels: GesprekRegel[] = [];
    // Beperk parallelle detailverzoeken. Geen contactgegevens of berichten in logs.
    for (let i = 0; i < rows.length; i += 5) {
      const batch = await Promise.all(rows.slice(i, i + 5).map(async row => {
        const detail = await gesprek(row.id);
        return { ...row, eerste_vraag: detail.berichten.find(b => b.rol === 'bezoeker')?.tekst ?? 'Nog geen bezoekersvraag' };
      }));
      regels.push(...batch);
    }
    return regels;
  },
  async onbeantwoordAantal() {
    let aantal = 0;
    for (;;) {
      const rows = await gesprekken('onbeantwoord', 200, aantal);
      aantal += rows.length;
      if (rows.length < 200) return aantal;
    }
  },
};
