import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('iron-session', () => ({ getIronSession: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock('@/lib/auditLog', () => ({ createAuditLog: vi.fn() }));
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/auditLog';
import { GET as kennis, POST as toevoegen } from '@/app/api/chatbot/kennis/route';
import { PUT as wijzigen, DELETE as verwijderen } from '@/app/api/chatbot/kennis/[id]/route';
import { GET as gesprekken } from '@/app/api/chatbot/gesprekken/route';
import { GET as detail } from '@/app/api/chatbot/gesprekken/[id]/route';
import { POST as naarKennis } from '@/app/api/chatbot/gesprekken/[id]/naar-kennis/route';
import { GET as instellingen, PUT as instellen } from '@/app/api/chatbot/instellingen/route';
import { GET as telling } from '@/app/api/chatbot/telling/route';
import { verzoek, metParams } from '../hulp/verzoek';
import { paginaBesluit } from '@/lib/paginaToegang';
const fetchMock = vi.fn();
const gebruiker = { id: 1, username: 'roel', role: 'admin', requiresPasswordChange: false, viewYear: null };
const routes = [kennis, toevoegen, wijzigen, verwijderen, gesprekken, detail, naarKennis, instellingen, instellen, telling];
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('CHAT_ADMIN_URL', 'https://chat.example.nl'); vi.stubEnv('CHAT_ADMIN_TOKEN', 'servergeheim');
  vi.mocked(getIronSession).mockResolvedValue({ userId: 1, isLoggedIn: true, role: 'admin' } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(gebruiker as never);
  fetchMock.mockResolvedValue(Response.json([]));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('chatbot toegang', () => {
  it('alle endpoints vereisen een sessie voordat ze ids-chat aanroepen', async () => {
    vi.mocked(getIronSession).mockResolvedValue({ isLoggedIn: false } as never);
    for (const route of routes) expect((await route(verzoek('/api/chatbot'), metParams({ id: '1' }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['user', 'alleen_lezen', 'viewer_oil2025'])('weigert rol %s, ook met oude admin-cookie', async role => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...gebruiker, role } as never);
    for (const route of routes) expect((await route(verzoek('/api/chatbot'), metParams({ id: '1' }))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('weigert een admin die zijn wachtwoord nog moet instellen', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...gebruiker, requiresPasswordChange: true } as never);
    for (const route of routes) expect((await route(verzoek('/api/chatbot'), undefined)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('schermt de pagina via het moduleregister af', () => {
    expect(paginaBesluit({ ...gebruiker, role: 'user' }, '/dashboard/chatbot')).toBe('/dashboard');
    expect(paginaBesluit(gebruiker, '/dashboard/chatbot')).toBeNull();
  });
  it('laat de admin lezen, zonder token in het antwoord', async () => {
    const r = await kennis(verzoek('/api/chatbot/kennis'), undefined);
    expect(r.status).toBe(200); expect(await r.text()).not.toContain('servergeheim');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('valideert invoer vóór doorzetten', async () => {
    expect((await toevoegen(verzoek('/api/chatbot/kennis', { body: { vraag: '' } }), undefined)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled(); expect(createAuditLog).not.toHaveBeenCalled();
  });
  it('slaat op en logt metadata zonder vraag of antwoord', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 42 }, { status: 201 }));
    const r = await toevoegen(verzoek('/api/chatbot/kennis', { body: { vraag: 'Vraag', antwoord: 'Antwoord' } }), undefined);
    expect(r.status).toBe(201);
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE_CHAT_KENNIS', details: { id: 42 } }));
    expect(JSON.stringify(vi.mocked(createAuditLog).mock.calls[0][0].details)).not.toContain('Antwoord');
  });
  it('verwijdert pas met getypte bevestiging', async () => {
    expect((await verwijderen(verzoek('/api/chatbot/kennis/1', { method: 'DELETE', body: { bevestiging: 'nee' } }), metParams({ id: '1' }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    expect((await verwijderen(verzoek('/api/chatbot/kennis/1', { method: 'DELETE', body: { bevestiging: 'verwijderen' } }), metParams({ id: '1' }))).status).toBe(200);
  });
  it('dashboardtelling faalt stil', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const r = await telling(verzoek('/api/chatbot/telling'), undefined);
    expect(r.status).toBe(200); expect(await r.json()).toEqual({ aantal: null });
  });
});
