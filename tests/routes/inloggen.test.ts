// Inloggen tegen de echte route en de testdatabase.
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as sessie } from '@/app/api/auth/session/route';
import { GET as monsters } from '@/app/api/samples/route';
import { koekjes, uitloggen, verzoek } from '../hulp/verzoek';

beforeEach(async () => {
  await vulMetNepdata(prisma);
  uitloggen();
});

const inloggen = (username: string, password?: string) =>
  login(verzoek('/api/auth/login', { body: { username, password } }));

describe('POST /api/auth/login', () => {
  it('met het goede wachtwoord: ingelogd, met sessiecookie', async () => {
    const res = await inloggen('kijker', 'kijker123');
    expect(res.status).toBe(200);
    expect(koekjes.get('oliemonster_session')?.value).toBeTruthy();
    const s = await (await sessie()).json();
    expect(s).toMatchObject({ isLoggedIn: true, username: 'kijker', role: 'alleen_lezen', viewYear: 2025 });
  });

  it('zonder wachtwoord geweigerd', async () => {
    const res = await inloggen('kijker');
    expect(res.status).toBe(401);
    expect(koekjes.get('oliemonster_session')).toBeUndefined();
  });

  it('met een fout wachtwoord geweigerd', async () => {
    expect((await inloggen('admin', 'fout')).status).toBe(401);
    expect(koekjes.get('oliemonster_session')).toBeUndefined();
  });

  it('een account zonder wachtwoord komt er niet in (alleen via de uitnodigingslink)', async () => {
    const res = await inloggen('nieuw', 'wat dan ook');
    expect(res.status).toBe(401);
    expect(koekjes.get('oliemonster_session')).toBeUndefined();
  });

  it('niet ingelogd: de API weigert', async () => {
    expect((await monsters(verzoek('/api/samples'), undefined)).status).toBe(401);
    expect(await (await sessie()).json()).toEqual({ isLoggedIn: false });
  });
});
