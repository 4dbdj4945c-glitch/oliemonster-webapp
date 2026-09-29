// De agendafeed via de API: link maken, de feed met planningsdagen en taken,
// intrekken en opnieuw maken, en wie er een heeft (geen kijker).
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as status, POST as maak, DELETE as intrekken } from '@/app/api/agenda/route';
import { GET as feed } from '@/app/api/agenda/feed/[token]/route';
import { metParams, uitloggen, verzoek } from '../hulp/verzoek';

let ids: Awaited<ReturnType<typeof vulMetNepdata>>;

async function inloggenAls(username: string, password: string) {
  uitloggen();
  const res = await login(verzoek('/api/auth/login', { body: { username, password } }));
  expect(res.status).toBe(200);
}
const tokenUit = (link: string) => link.split('/').pop()!;
const haalFeed = (token: string) => feed(verzoek(`/api/agenda/feed/${token}`) as never, metParams({ token }));

beforeEach(async () => {
  ids = await vulMetNepdata(prisma);
});

describe('agendafeed', () => {
  it('link maken, feed ophalen zonder sessie, intrekken en opnieuw', async () => {
    await inloggenAls('admin', 'admin123');
    expect(await (await status(verzoek('/api/agenda'), undefined)).json()).toEqual({ actief: false });
    const gemaakt = await (await maak(verzoek('/api/agenda', { method: 'POST' }), undefined)).json();
    expect(gemaakt.https).toMatch(/\/api\/agenda\/feed\/[0-9a-f]{64}\.ics$/);
    expect(gemaakt.webcal).toMatch(/^webcal:\/\//);
    // Opnieuw tonen kan: dezelfde link.
    expect((await (await status(verzoek('/api/agenda'), undefined)).json()).https).toBe(gemaakt.https);

    uitloggen();
    const res = await haalFeed(tokenUit(gemaakt.https));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    const ics = (await res.text()).replace(/\r\n /g, '');
    expect(ics).toContain(`UID:plandag-${ids.dagen.vandaag}@`);
    expect(ics).toMatch(/SUMMARY:Monsterdag: Sluis Sambeek\\, Sluis Belfeld en Halfjaarlijks onderhoud schroefcompressor/);
    expect(ics).toContain('TRIGGER;RELATED=START:-P1D');
    // De taak die al op de planning staat, niet nog eens los; de verlopen oliemonstertaak wel.
    expect(ics).not.toContain(`UID:taak-${ids.taken.compressor}@`);
    expect(ics).toContain(`UID:taak-${ids.taken.olie}@`);
    expect(ics).toContain('TRIGGER;RELATED=START:-PT9H');
    expect((await prisma.agendaFeed.findFirstOrThrow()).laatstGebruiktOp).not.toBeNull();

    // Nieuwe link: de oude werkt niet meer.
    await inloggenAls('admin', 'admin123');
    const nieuw = await (await maak(verzoek('/api/agenda', { method: 'POST' }), undefined)).json();
    expect(nieuw.https).not.toBe(gemaakt.https);
    expect((await haalFeed(tokenUit(gemaakt.https))).status).toBe(404);
    expect((await haalFeed(tokenUit(nieuw.https))).status).toBe(200);

    // Intrekken: ook de nieuwe niet meer.
    await intrekken(verzoek('/api/agenda', { method: 'DELETE' }), undefined);
    expect((await haalFeed(tokenUit(nieuw.https))).status).toBe(404);
  });

  it('een verzonnen of veranderd token geeft 404', async () => {
    expect((await haalFeed('0'.repeat(64) + '.ics')).status).toBe(404);
    expect((await haalFeed('onzin')).status).toBe(404);
  });

  it('een kijker heeft geen agendafeed; een kijker met een oude link ook niet', async () => {
    await inloggenAls('kijker', 'kijker123');
    expect((await maak(verzoek('/api/agenda', { method: 'POST' }), undefined)).status).toBe(403);
    await inloggenAls('kempen', 'kempen123');
    expect((await status(verzoek('/api/agenda'), undefined)).status).toBe(403);

    // Een medewerker met een link die daarna alleen lezen wordt: de link werkt niet meer.
    await inloggenAls('gebruiker', 'user123');
    const link = await (await maak(verzoek('/api/agenda', { method: 'POST' }), undefined)).json();
    expect((await haalFeed(tokenUit(link.https))).status).toBe(200);
    await prisma.user.update({ where: { id: ids.gebruikers.gebruiker }, data: { role: 'alleen_lezen' } });
    expect((await haalFeed(tokenUit(link.https))).status).toBe(404);
  });
});
