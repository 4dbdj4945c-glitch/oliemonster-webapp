import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { gebruikUitnodiging, geldigeUitnodiging, linkVoor, maakUitnodiging } from '@/lib/uitnodiging';
import { vulMetNepdata } from '@/prisma/nepdata';

let nieuwId: number;

beforeEach(async () => {
  const r = await vulMetNepdata(prisma);
  nieuwId = r.gebruikers.nieuw;
});

describe('uitnodigingslinks', () => {
  it('een nieuwe link is geldig en hoort bij de gebruiker', async () => {
    const { token, verlooptOp } = await maakUitnodiging(nieuwId, 'admin');
    expect(verlooptOp.getTime() - Date.now()).toBeGreaterThan(71 * 3600 * 1000);
    const u = await geldigeUitnodiging(token);
    expect(u?.user.username).toBe('nieuw');
  });

  it('in de database staat alleen de hash, niet het token', async () => {
    const { token } = await maakUitnodiging(nieuwId, 'admin');
    const rij = await prisma.uitnodiging.findFirstOrThrow({ where: { userId: nieuwId } });
    expect(rij.tokenHash).not.toBe(token);
    expect(rij.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('een nieuwe link maakt de oude ongeldig', async () => {
    const oud = await maakUitnodiging(nieuwId, 'admin');
    await maakUitnodiging(nieuwId, 'admin');
    expect(await geldigeUitnodiging(oud.token)).toBeNull();
  });

  it('werkt maar één keer', async () => {
    const { token } = await maakUitnodiging(nieuwId, 'admin');
    const u = await geldigeUitnodiging(token);
    expect(await gebruikUitnodiging(u!.id)).toBe(true);
    expect(await gebruikUitnodiging(u!.id)).toBe(false);
    expect(await geldigeUitnodiging(token)).toBeNull();
  });

  it('verlopen of onzin is ongeldig', async () => {
    const { token } = await maakUitnodiging(nieuwId, 'admin');
    await prisma.uitnodiging.updateMany({ data: { verlooptOp: new Date(Date.now() - 1000) } });
    expect(await geldigeUitnodiging(token)).toBeNull();
    expect(await geldigeUitnodiging('kort')).toBeNull();
    expect(await geldigeUitnodiging(undefined)).toBeNull();
  });

  it('de link wijst naar set-password met het token', () => {
    expect(linkVoor('https://portal.example', 'a b')).toBe('https://portal.example/set-password?token=a%20b');
  });
});
