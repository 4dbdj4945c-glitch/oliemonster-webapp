// haalGebruiker: de rechten komen uit de database, niet uit de cookie.
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { haalGebruiker } from '@/lib/toegang';
import { vulMetNepdata } from '@/prisma/nepdata';

let ids: Awaited<ReturnType<typeof vulMetNepdata>>;

beforeEach(async () => {
  ids = await vulMetNepdata(prisma);
});

describe('haalGebruiker', () => {
  it('niet ingelogd: null', async () => {
    expect(await haalGebruiker({ isLoggedIn: false })).toBeNull();
  });

  it('de kijker krijgt zijn jaar uit de database', async () => {
    const g = await haalGebruiker({ isLoggedIn: true, userId: ids.gebruikers.kijker, role: 'admin' });
    expect(g).toMatchObject({ username: 'kijker', role: 'alleen_lezen', viewYear: 2025, requiresPasswordChange: false });
  });

  it('de rol in de cookie telt niet: de database wint', async () => {
    await prisma.user.update({ where: { id: ids.gebruikers.admin }, data: { role: 'user' } });
    const g = await haalGebruiker({ isLoggedIn: true, userId: ids.gebruikers.admin, role: 'admin' });
    expect(g?.role).toBe('user');
  });

  it('een verwijderde gebruiker is niemand meer', async () => {
    await prisma.user.delete({ where: { id: ids.gebruikers.gebruiker } });
    expect(await haalGebruiker({ isLoggedIn: true, userId: ids.gebruikers.gebruiker, role: 'user' })).toBeNull();
  });

  it('een oude sessie zonder userId valt terug op de gebruikersnaam', async () => {
    const g = await haalGebruiker({ isLoggedIn: true, username: 'kijker' });
    expect(g?.userId).toBe(ids.gebruikers.kijker);
  });

  it('de oude kijkersrol zonder jaar houdt 2025', async () => {
    await prisma.user.update({ where: { id: ids.gebruikers.kijker }, data: { role: 'viewer_oil2025', viewYear: null } });
    const g = await haalGebruiker({ isLoggedIn: true, userId: ids.gebruikers.kijker });
    expect(g?.viewYear).toBe(2025);
  });

  it('een wachtwoordreset in de database geldt meteen', async () => {
    await prisma.user.update({ where: { id: ids.gebruikers.kijker }, data: { requiresPasswordChange: true } });
    const g = await haalGebruiker({ isLoggedIn: true, userId: ids.gebruikers.kijker, requiresPasswordChange: false });
    expect(g?.requiresPasswordChange).toBe(true);
  });
});
