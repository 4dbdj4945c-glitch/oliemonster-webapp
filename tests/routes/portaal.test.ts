// Het klantportaal (GET /api/portaal) en het rapport (GET /api/rapport): de
// kijker ziet alleen zijn eigen klant en jaar, zonder interne details, en kan
// het rapport van zijn eigen klant downloaden, niet dat van een ander.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as portaal } from '@/app/api/portaal/route';
import { GET as rapport } from '@/app/api/rapport/route';
import { haalOpdracht } from '@/lib/klantOpdracht';
import { GET as dossier } from '@/app/api/klanten/[id]/dossier/route';
import { metParams, uitloggen, verzoek } from '../hulp/verzoek';

const blob = vi.hoisted(() => ({
  put: vi.fn(async (naam: string) => ({ url: `https://t.public.blob.vercel-storage.com/${naam}`, downloadUrl: `https://t.public.blob.vercel-storage.com/${naam}?download=1` })),
  list: vi.fn(async () => ({ blobs: [] })),
  del: vi.fn(async () => undefined),
}));
vi.mock('@vercel/blob', () => blob);

let ids: Awaited<ReturnType<typeof vulMetNepdata>>;

async function inloggenAls(username: string, password: string) {
  uitloggen();
  const res = await login(verzoek('/api/auth/login', { body: { username, password } }));
  expect(res.status).toBe(200);
}

beforeEach(async () => {
  ids = await vulMetNepdata(prisma);
});

describe('klantportaal', () => {
  it('de kijker van de tweede klant ziet zijn opdracht, met neutrale statussen', async () => {
    await inloggenAls('kempen', 'kempen123');
    const res = await portaal(verzoek('/api/portaal?jaar=2026'), undefined);
    expect(res.status).toBe(200);
    const p = await res.json();
    expect(p.klant.id).toBe(ids.klanten.tweede);
    expect(p.jaar).toBe(2026);
    expect(p.telling).toEqual({ genomen: 3, gepland: 1, 'in-te-plannen': 1, 'niet-bereikbaar': 1, geannuleerd: 1 });
    expect(p.teNemen).toBe(6);
    expect(p.jaren.map((j: { jaar: number }) => j.jaar)).toEqual([2026, 2025]);
    // Alleen eigen monsters.
    const eigen = new Set(ids.tweedeMonsters[2026]);
    expect(p.monsters.every((m: { id: number }) => eigen.has(m.id))).toBe(true);
    // Planning: de dag over een week met de werkplaats, zonder tijden of notities.
    expect(p.planning).toHaveLength(1);
    expect(Object.keys(p.planning[0]).sort()).toEqual(['aantal', 'dag', 'objecten']);
    expect(JSON.stringify(p)).not.toMatch(/sleutel bij de receptie|plannedMinutes|routeGeometry|blob\.vercel/i);
    // Foto's alleen via de fotoroute.
    expect(p.recenteFotos.length).toBe(3);
    for (const f of p.recenteFotos) expect(f.foto).toMatch(/^\/api\/fotos\/monster\//);
  });

  it('een klantId in de URL verandert niets voor een kijker', async () => {
    await inloggenAls('kempen', 'kempen123');
    const p = await (await portaal(verzoek(`/api/portaal?jaar=2025&klantId=${ids.klanten.mourik}`), undefined)).json();
    expect(p.klant.id).toBe(ids.klanten.tweede);
    expect(p.monsters.map((m: { oNumber: string }) => m.oNumber).sort()).toEqual(['K-2025-01', 'K-2025-02']);
  });

  it('een kijker met een kijkjaar krijgt een ander jaar niet', async () => {
    await prisma.user.update({ where: { username: 'kempen' }, data: { viewYear: 2026 } });
    await inloggenAls('kempen', 'kempen123');
    expect((await portaal(verzoek('/api/portaal?jaar=2025'), undefined)).status).toBe(404);
    const p = await (await portaal(verzoek('/api/portaal'), undefined)).json();
    expect(p.jaar).toBe(2026);
    expect(p.jaren.map((j: { jaar: number }) => j.jaar)).toEqual([2026]);
  });

  it('een kijker zonder klant heeft geen klantportaal', async () => {
    await prisma.user.update({ where: { username: 'kijker' }, data: { klantId: null } });
    await inloggenAls('kijker', 'kijker123');
    expect((await portaal(verzoek('/api/portaal'), undefined)).status).toBe(403);
  });

  it('admin kan het portaal van een klant bekijken zoals de klant het ziet', async () => {
    await inloggenAls('admin', 'admin123');
    const p = await (await portaal(verzoek(`/api/portaal?jaar=2025&klantId=${ids.klanten.mourik}`), undefined)).json();
    expect(p.klant.naam).toBe('Mourik Infra B.V.');
    expect(p.telling.genomen).toBe(11);
    expect(p.telling.geannuleerd).toBe(1);
  });
});

describe('rapport als PDF', () => {
  it('de kijker downloadt het rapport van zijn eigen klant', async () => {
    await inloggenAls('kempen', 'kempen123');
    const res = await rapport(verzoek('/api/rapport?jaar=2026'), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(/oliemonsters-2026-kempen-metaalbewerking-b-v\.pdf/);
    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // Voor de screenshot van de eerste pagina (scripts/pdf-naar-png).
    if (process.env.RAPPORT_UIT) {
      mkdirSync(process.env.RAPPORT_UIT, { recursive: true });
      writeFileSync(`${process.env.RAPPORT_UIT}/rapport-kempen-2026.pdf`, pdf);
    }
    const log = await prisma.auditLog.findFirst({ where: { action: 'RAPPORT_DOWNLOAD' } });
    expect(log?.username).toBe('kempen');
  });

  it('het rapport van een andere klant krijgt de kijker niet', async () => {
    await inloggenAls('kempen', 'kempen123');
    expect((await rapport(verzoek(`/api/rapport?jaar=2025&klantId=${ids.klanten.mourik}`), undefined)).status).toBe(404);
    await inloggenAls('kijker', 'kijker123');
    expect((await rapport(verzoek(`/api/rapport?jaar=2025&klantId=${ids.klanten.tweede}`), undefined)).status).toBe(404);
    // Zijn eigen klant, maar niet zijn jaar.
    expect((await rapport(verzoek('/api/rapport?jaar=2026'), undefined)).status).toBe(404);
  });

  it('admin maakt het rapport van elke klant, ook zonder foto\'s', async () => {
    await inloggenAls('admin', 'admin123');
    expect((await rapport(verzoek('/api/rapport?jaar=2025'), undefined)).status).toBe(400);
    const res = await rapport(verzoek(`/api/rapport?jaar=2025&klantId=${ids.klanten.mourik}&fotos=0`), undefined);
    expect(res.status).toBe(200);
    const pdf = Buffer.from(await res.arrayBuffer());
    if (process.env.RAPPORT_UIT) writeFileSync(`${process.env.RAPPORT_UIT}/rapport-mourik-2025.pdf`, pdf);
  });

  it('de opdracht noemt de reden bij niet bereikbaar en geannuleerd', async () => {
    const o = await haalOpdracht(ids.klanten.tweede, 2026);
    const perNummer = Object.fromEntries(o!.monsters.map((m) => [m.oNumber, m]));
    expect(perNummer['K-2026-04'].status).toBe('niet-bereikbaar');
    expect(perNummer['K-2026-04'].reden).toBe('Andere werkzaamheden: Technische ruimte afgesloten voor een verbouwing');
    expect(perNummer['K-2026-06'].reden).toBe('Compressor vervangen, nieuwe draait nog in');
    expect(perNummer['K-2026-05'].status).toBe('gepland');
    expect(perNummer['K-2026-07'].status).toBe('in-te-plannen');
  });
});

describe('groot rapport', () => {
  it('boven 4 MB gaat het via de opslag met een doorverwijzing', async () => {
    const oud = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = 'test';
    const rapportPdf = await import('@/lib/rapport/rapportPdf');
    const spy = vi.spyOn(rapportPdf, 'maakRapportPdf').mockResolvedValue(Buffer.alloc(5 * 1024 * 1024));
    try {
      await inloggenAls('kempen', 'kempen123');
      const res = await rapport(verzoek('/api/rapport?jaar=2026'), undefined);
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toMatch(/^https:\/\/t\.public\.blob\.vercel-storage\.com\/rapporten\/[0-9a-f]{32}\/oliemonsters-2026-/);
      expect(blob.list).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      process.env.BLOB_READ_WRITE_TOKEN = oud;
    }
  });
});

describe('klantdossier', () => {
  it('admin ziet per monster de momenten, met foto\'s via de fotoroute', async () => {
    await inloggenAls('admin', 'admin123');
    const id = String(ids.klanten.tweede);
    const res = await dossier(verzoek(`/api/klanten/${id}/dossier?jaar=2026`), metParams({ id }));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.jaren.map((j: { jaar: number }) => j.jaar)).toEqual([2026, 2025]);
    const soorten = d.momenten.map((m: { oNumber: string; soort: string }) => `${m.oNumber} ${m.soort}`);
    expect(soorten).toEqual(
      expect.arrayContaining(['K-2026-01 monster', 'K-2026-04 niet-bereikbaar', 'K-2026-05 open', 'K-2026-06 geannuleerd', 'K-2026-07 open'])
    );
    // Niet bereikbaar en niet opnieuw gepland: geen dubbel open-moment.
    expect(soorten).not.toContain('K-2026-04 open');
    const genomen = d.momenten.find((m: { oNumber: string }) => m.oNumber === 'K-2026-01');
    expect(genomen.fotos).toHaveLength(2);
    for (const f of genomen.fotos) expect(f.url).toMatch(/^\/api\/fotos\/poging\//);
    expect(d.momenten.find((m: { oNumber: string }) => m.oNumber === 'K-2026-05').gepland).toBe(true);
  });

  it('een kijker komt niet in het dossier, ook niet van zijn eigen klant', async () => {
    await inloggenAls('kempen', 'kempen123');
    const id = String(ids.klanten.tweede);
    expect((await dossier(verzoek(`/api/klanten/${id}/dossier`), metParams({ id }))).status).toBe(403);
  });
});
