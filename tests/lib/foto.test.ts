import { describe, expect, it } from 'vitest';
import { FOTO_MAX_BYTES, fotoExtensie, fotoFout } from '@/lib/fotoControle';
import { verkleinFoto } from '@/lib/fotoVerkleinen';

const bestand = (type: string, grootte: number, naam = 'foto') =>
  new File([new Uint8Array(grootte)], naam, { type });

describe('fotoFout (server)', () => {
  it('een gewone foto is goed', () => {
    expect(fotoFout(bestand('image/jpeg', 400 * 1024))).toBeNull();
    expect(fotoFout(bestand('image/heic', 1000))).toBeNull();
  });
  it('geen foto', () => {
    expect(fotoFout(bestand('application/pdf', 1000))).toMatch(/geen foto/);
  });
  it('te groot, met de maat in de melding', () => {
    expect(fotoFout(bestand('image/png', FOTO_MAX_BYTES + 1))).toMatch(/te groot \(4,0 MB/);
  });
  it('de extensie volgt het type', () => {
    expect(fotoExtensie(bestand('image/webp', 1, 'x.jpg'))).toBe('webp');
    expect(fotoExtensie(bestand('image/onbekend', 1))).toBe('jpg');
  });
});

describe('verkleinFoto buiten de browser', () => {
  it('geeft het origineel terug zonder window', async () => {
    const f = bestand('image/jpeg', 5 * 1024 * 1024);
    expect(await verkleinFoto(f)).toBe(f);
  });
  it('laat een bestand dat geen foto is ongemoeid', async () => {
    const f = bestand('application/pdf', 10);
    expect(await verkleinFoto(f)).toBe(f);
  });
});
