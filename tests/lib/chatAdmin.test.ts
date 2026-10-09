import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { chatFetch, chatAdmin, ChatAdminFout } from '@/lib/chatAdmin';
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('CHAT_ADMIN_URL', 'https://chat.example.nl');
  vi.stubEnv('CHAT_ADMIN_TOKEN', 'geheim-token');
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('chatAdmin', () => {
  it('vereist configuratie voordat fetch wordt aangeroepen', async () => {
    vi.stubEnv('CHAT_ADMIN_TOKEN', '');
    await expect(chatAdmin.kennis()).rejects.toMatchObject({ status: 503, message: expect.stringContaining('CHAT_ADMIN_TOKEN') });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('stuurt Bearer alleen server-side en schakelt caching en redirects uit', async () => {
    fetchMock.mockResolvedValue(Response.json([]));
    expect(await chatAdmin.kennis()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith('https://chat.example.nl/admin/kennis', expect.objectContaining({ cache: 'no-store', redirect: 'error', headers: expect.objectContaining({ Authorization: 'Bearer geheim-token' }) }));
  });
  it('geeft geen upstream-body of token door bij fouten', async () => {
    fetchMock.mockResolvedValue(new Response('geheim-token stacktrace', { status: 500 }));
    await expect(chatAdmin.kennis()).rejects.toMatchObject({ status: 502, message: 'De chatservice kon dit verzoek niet verwerken. Probeer het opnieuw.' });
  });
  it('meldt netwerkfouten netjes', async () => {
    fetchMock.mockRejectedValue(new Error('geheim-token'));
    await expect(chatAdmin.kennis()).rejects.toMatchObject({ status: 503, message: expect.stringContaining('niet bereikbaar') });
  });
  it('breekt een vastgelopen fetch af', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('abort')))));
    const result = chatAdmin.kennis().catch(e => e);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await result).toBeInstanceOf(ChatAdminFout);
    expect((await result).status).toBe(504);
  });
  it('meldt onleesbare antwoorden', async () => {
    fetchMock.mockResolvedValue(new Response('geen json'));
    await expect(chatFetch('/kennis')).rejects.toMatchObject({ status: 502 });
  });
  it('telt ook voorbij de eerste 200 gesprekken', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(Array.from({ length: 200 }, (_, i) => ({ id: String(i) }))))
      .mockResolvedValueOnce(Response.json([{ id: '201' }]));
    expect(await chatAdmin.onbeantwoordAantal()).toBe(201);
    expect(fetchMock.mock.calls[1][0]).toContain('offset=200');
  });
});
