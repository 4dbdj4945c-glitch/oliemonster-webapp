// Dagrapporten via de API: aanmaken bij een planningsdag, invullen, tekenen (dan
// ligt het vast), handtekening wissen, de PDF, en de afscherming per klant:
// alleen de getekende rapporten van de eigen klant voor de kijker met het
// klantportaal, niets voor de klassieke kijker.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as lijst, POST as nieuw } from '@/app/api/dagrapporten/route';
import { GET as een, PUT as wijzig, DELETE as weg } from '@/app/api/dagrapporten/[id]/route';
import { POST as teken, DELETE as wis } from '@/app/api/dagrapporten/[id]/handtekening/route';
import { POST as rondAf, DELETE as heropen } from '@/app/api/dagrapporten/[id]/afronden/route';
import { GET as pdf } from '@/app/api/dagrapporten/[id]/pdf/route';
import { GET as portaal } from '@/app/api/portaal/route';
import { GET as dossier } from '@/app/api/klanten/[id]/dossier/route';
import { GET as foto } from '@/app/api/fotos/[...pad]/route';
import { metParams, uitloggen, verzoek } from '../hulp/verzoek';

const blob = vi.hoisted(() => ({
  put: vi.fn(async (naam: string) => ({ url: `https://t.public.blob.vercel-storage.com/${naam}`, downloadUrl: `https://t.public.blob.vercel-storage.com/${naam}?download=1` })),
  list: vi.fn(async () => ({ blobs: [] })),
  del: vi.fn(async () => undefined),
}));
vi.mock('@vercel/blob', () => blob);

let ids: Awaited<ReturnType<typeof vulMetNepdata>>;
const HANDTEKENING = `data:image/png;base64,${readFileSync(path.join(process.cwd(), 'public', 'nepdata', 'handtekening.png')).toString('base64')}`;

async function inloggenAls(username: string, password: string) {
  uitloggen();
  const res = await login(verzoek('/api/auth/login', { body: { username, password } }));
  expect(res.status).toBe(200);
}
const admin = () => inloggenAls('admin', 'admin123');
const p = (id: number) => metParams({ id: String(id) });

function bewaar(naam: string, bestand: Buffer) {
  if (!process.env.RAPPORT_UIT) return;
  mkdirSync(process.env.RAPPORT_UIT, { recursive: true });
  writeFileSync(`${process.env.RAPPORT_UIT}/${naam}`, bestand);
}

beforeEach(async () => {
  ids = await vulMetNepdata(prisma);
});

describe('dagrapport invullen en tekenen (admin)', () => {
  it('aanmaken bij een planningsdag, uren als 2,5, tekenen legt vast, wissen maakt weer concept', async () => {
    await admin();
    const res = await nieuw(
      verzoek('/api/dagrapporten', { body: { klantId: ids.klanten.tweede, planId: ids.dagen.vandaag, objectId: ids.werkplaats, datum: '2026-09-29', uitvoerder: 'Roel', uren: '2,5' } }),
      undefined
    );
    expect(res.status).toBe(201);
    const d = await res.json();
    expect(d).toMatchObject({ nummer: `WB-${d.id}`, status: 'concept', minuten: 150, planId: ids.dagen.vandaag, object: { id: ids.werkplaats } });

    // Object van een andere klant: nee.
    expect((await wijzig(verzoek(`/api/dagrapporten/${d.id}`, { method: 'PUT', body: { objectId: ids.objecten[0] } }), p(d.id))).status).toBe(400);
    const w = await (await wijzig(verzoek(`/api/dagrapporten/${d.id}`, { method: 'PUT', body: { werkzaamheden: 'Compressor onderhouden', bevindingen: 'Filter vervangen' } }), p(d.id))).json();
    expect(w).toMatchObject({ werkzaamheden: 'Compressor onderhouden', bevindingen: 'Filter vervangen' });

    // Tekenen: zonder naam of met iets dat geen PNG is, nee.
    expect((await teken(verzoek(`/api/dagrapporten/${d.id}/handtekening`, { body: { naam: '', handtekening: HANDTEKENING } }), p(d.id))).status).toBe(400);
    expect((await teken(verzoek(`/api/dagrapporten/${d.id}/handtekening`, { body: { naam: 'Piet', handtekening: 'data:image/png;base64,AAAA' } }), p(d.id))).status).toBe(400);
    const g = await teken(verzoek(`/api/dagrapporten/${d.id}/handtekening`, { body: { naam: 'Piet Verhoeven', handtekening: HANDTEKENING } }), p(d.id));
    expect(g.status).toBe(200);
    expect(await g.json()).toMatchObject({ status: 'getekend', getekendDoor: 'Piet Verhoeven' });

    // Getekend ligt vast.
    expect((await wijzig(verzoek(`/api/dagrapporten/${d.id}`, { method: 'PUT', body: { werkzaamheden: 'Anders' } }), p(d.id))).status).toBe(409);
    expect((await teken(verzoek(`/api/dagrapporten/${d.id}/handtekening`, { body: { naam: 'Iemand', handtekening: HANDTEKENING } }), p(d.id))).status).toBe(409);

    // PDF
    const r = await pdf(verzoek(`/api/dagrapporten/${d.id}/pdf`), p(d.id));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    const bytes = Buffer.from(await r.arrayBuffer());
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);

    // Wissen: weer een concept, zonder handtekening; in het logboek staat wie getekend had.
    const c = await (await wis(verzoek(`/api/dagrapporten/${d.id}/handtekening`, { method: 'DELETE' }), p(d.id))).json();
    expect(c).toMatchObject({ status: 'concept', handtekening: null, getekendDoor: null });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'DAGRAPPORT_HANDTEKENING_GEWIST' } });
    expect(log.details).toContain('Piet Verhoeven');
  });

  it('de PDF van het getekende rapport uit de nepdata (voor de screenshots)', async () => {
    await admin();
    const r = await pdf(verzoek(`/api/dagrapporten/${ids.dagrapporten.tweede}/pdf`), p(ids.dagrapporten.tweede));
    expect(r.status).toBe(200);
    const bytes = Buffer.from(await r.arrayBuffer());
    bewaar('dagrapport.pdf', bytes);
    expect(r.headers.get('content-disposition')).toMatch(/werkbon-wb-\d+-\d{4}-\d{2}-\d{2}-kempen-metaalbewerking-b-v\.pdf/);
  });

  it('verwijderen vraagt het nummer', async () => {
    await admin();
    const id = ids.dagrapporten.mourik;
    expect((await weg(verzoek(`/api/dagrapporten/${id}`, { method: 'DELETE', body: { bevestig: 'WB-0' } }), p(id))).status).toBe(400);
    expect((await weg(verzoek(`/api/dagrapporten/${id}`, { method: 'DELETE', body: { bevestig: `wb-${id}` } }), p(id))).status).toBe(200);
    expect((await een(verzoek(`/api/dagrapporten/${id}`), p(id))).status).toBe(404);
  });
});

describe('werkbon: tijd, materialen en afronden zonder handtekening', () => {
  it('begin en eind met pauze rekent de minuten uit; n.v.t. heeft geen uren', async () => {
    await admin();
    const d = await (await nieuw(verzoek('/api/dagrapporten', { body: { klantId: ids.klanten.tweede, datum: '2026-09-29', uitvoerder: 'Roel', soortWerk: 'storing', referentie: ' PO 123 ' } }), undefined)).json();
    expect(d).toMatchObject({ soortWerk: 'storing', referentie: 'PO 123', handtekeningVragen: true, tijdsoort: 'uren' });
    const t = await (await wijzig(verzoek(`/api/dagrapporten/${d.id}`, { method: 'PUT', body: { tijdsoort: 'tijden', beginTijd: '7.30', eindTijd: '16:00', pauzeMinuten: '30' } }), p(d.id))).json();
    expect(t).toMatchObject({ tijdsoort: 'tijden', beginTijd: '07:30', eindTijd: '16:00', pauzeMinuten: 30, minuten: 480 });
    // Pauze langer dan de tijd ertussen: nee.
    expect((await wijzig(verzoek(`/api/dagrapporten/${d.id}`, { method: 'PUT', body: { pauzeMinuten: 600 } }), p(d.id))).status).toBe(400);
    expect((await wijzig(verzoek(`/api/dagrapporten/${d.id}`, { method: 'PUT', body: { beginTijd: '25:00' } }), p(d.id))).status).toBe(400);
    const n = await (await wijzig(verzoek(`/api/dagrapporten/${d.id}`, { method: 'PUT', body: { tijdsoort: 'nvt' } }), p(d.id))).json();
    expect(n).toMatchObject({ tijdsoort: 'nvt', minuten: null });
    const u = await (await wijzig(verzoek(`/api/dagrapporten/${d.id}`, { method: 'PUT', body: { tijdsoort: 'uren', uren: '1,5' } }), p(d.id))).json();
    expect(u).toMatchObject({ tijdsoort: 'uren', minuten: 90 });
  });

  it('materialen: lege lijst wordt leeg, aantal met komma, omschrijving verplicht', async () => {
    await admin();
    const id = ids.dagrapporten.mourik;
    const m = await (await wijzig(verzoek(`/api/dagrapporten/${id}`, { method: 'PUT', body: { materialen: [{ omschrijving: 'Monsterpotje 250 ml', aantal: '2,5', eenheid: 'st', artikelnummer: '' }] } }), p(id))).json();
    expect(m.materialen).toEqual([{ omschrijving: 'Monsterpotje 250 ml', aantal: 2.5, eenheid: 'st', artikelnummer: null }]);
    expect((await wijzig(verzoek(`/api/dagrapporten/${id}`, { method: 'PUT', body: { materialen: [{ omschrijving: '', aantal: 1 }] } }), p(id))).status).toBe(400);
    const leeg = await (await wijzig(verzoek(`/api/dagrapporten/${id}`, { method: 'PUT', body: { materialen: [] } }), p(id))).json();
    expect(leeg.materialen).toEqual([]);
  });

  it('klant zonder handtekening: nieuwe werkbon vraagt er geen; afronden legt vast, heropenen maakt weer concept', async () => {
    await admin();
    const d = await (await nieuw(verzoek('/api/dagrapporten', { body: { klantId: ids.klanten.mourik, datum: '2026-09-29', uitvoerder: 'Roel' } }), undefined)).json();
    expect(d.handtekeningVragen).toBe(false);
    // Zonder werkzaamheden: niet afronden.
    expect((await rondAf(verzoek(`/api/dagrapporten/${d.id}/afronden`, { body: {} }), p(d.id))).status).toBe(400);
    await wijzig(verzoek(`/api/dagrapporten/${d.id}`, { method: 'PUT', body: { werkzaamheden: 'Drie monsters genomen' } }), p(d.id));
    const a = await rondAf(verzoek(`/api/dagrapporten/${d.id}/afronden`, { body: {} }), p(d.id));
    expect(a.status).toBe(200);
    const af = await a.json();
    expect(af.status).toBe('afgerond');
    expect(af.afgerondOp).toBeTruthy();
    expect((await wijzig(verzoek(`/api/dagrapporten/${d.id}`, { method: 'PUT', body: { werkzaamheden: 'Anders' } }), p(d.id))).status).toBe(409);
    expect((await teken(verzoek(`/api/dagrapporten/${d.id}/handtekening`, { body: { naam: 'Iemand', handtekening: HANDTEKENING } }), p(d.id))).status).toBe(409);
    const r = await pdf(verzoek(`/api/dagrapporten/${d.id}/pdf`), p(d.id));
    expect(r.status).toBe(200);
    bewaar('werkbon-afgerond.pdf', Buffer.from(await r.arrayBuffer()));
    const h = await (await heropen(verzoek(`/api/dagrapporten/${d.id}/afronden`, { method: 'DELETE' }), p(d.id))).json();
    expect(h).toMatchObject({ status: 'concept', afgerondOp: null });
    expect(await prisma.auditLog.count({ where: { action: { in: ['DAGRAPPORT_AFGEROND', 'DAGRAPPORT_HEROPEND'] } } })).toBe(2);
  });

  it('kijker kempen ziet een afgeronde werkbon van de eigen klant wel, een concept niet', async () => {
    await prisma.dagrapport.update({ where: { id: ids.dagrapporten.tweede }, data: { status: 'afgerond', handtekening: null, getekendDoor: null, getekendOp: null, afgerondOp: new Date() } });
    await inloggenAls('kempen', 'kempen123');
    expect((await (await portaal(verzoek('/api/portaal'), undefined)).json()).dagrapporten.map((r: { id: number }) => r.id)).toEqual([ids.dagrapporten.tweede]);
    expect((await pdf(verzoek(`/api/dagrapporten/${ids.dagrapporten.tweede}/pdf`), p(ids.dagrapporten.tweede))).status).toBe(200);
  });

  it('een werkbon die een handtekening vraagt, rondt niet af zonder; heropenen van een concept geeft 409', async () => {
    await admin();
    const d = await (await nieuw(verzoek('/api/dagrapporten', { body: { klantId: ids.klanten.tweede, datum: '2026-09-29', uitvoerder: 'Roel', werkzaamheden: 'Gedaan' } }), undefined)).json();
    expect((await rondAf(verzoek(`/api/dagrapporten/${d.id}/afronden`, { body: {} }), p(d.id))).status).toBe(409);
    expect((await heropen(verzoek(`/api/dagrapporten/${d.id}/afronden`, { method: 'DELETE' }), p(d.id))).status).toBe(409);
    await wijzig(verzoek(`/api/dagrapporten/${d.id}`, { method: 'PUT', body: { handtekeningVragen: false } }), p(d.id));
    expect((await rondAf(verzoek(`/api/dagrapporten/${d.id}/afronden`, { body: {} }), p(d.id))).status).toBe(200);
  });

  it('gebruiker rondt niet af', async () => {
    await inloggenAls('gebruiker', 'user123');
    expect((await rondAf(verzoek(`/api/dagrapporten/${ids.dagrapporten.mourik}/afronden`, { body: {} }), p(ids.dagrapporten.mourik))).status).toBe(403);
  });
});

describe('afscherming', () => {
  it('kijker kempen: alleen de getekende rapporten van de eigen klant, in het portaal en als PDF', async () => {
    await inloggenAls('kempen', 'kempen123');
    const data = await (await portaal(verzoek('/api/portaal'), undefined)).json();
    expect(data.dagrapporten.map((r: { id: number }) => r.id)).toEqual([ids.dagrapporten.tweede]);
    expect(JSON.stringify(data.dagrapporten)).not.toContain('base64');
    expect((await pdf(verzoek(`/api/dagrapporten/${ids.dagrapporten.tweede}/pdf`), p(ids.dagrapporten.tweede))).status).toBe(200);
    // Het concept van Mourik bestaat voor hem niet.
    expect((await pdf(verzoek(`/api/dagrapporten/${ids.dagrapporten.mourik}/pdf`), p(ids.dagrapporten.mourik))).status).toBe(404);
    // Het rapport zelf (met de handtekening als data) en de lijst: geen toegang.
    expect((await een(verzoek(`/api/dagrapporten/${ids.dagrapporten.tweede}`), p(ids.dagrapporten.tweede))).status).toBe(403);
    expect((await lijst(verzoek('/api/dagrapporten'), undefined)).status).toBe(403);
    // Foto's van een dagrapport alleen in de PDF.
    const fotoId = (await prisma.dagrapportFoto.findFirstOrThrow({ where: { dagrapportId: ids.dagrapporten.tweede } })).id;
    expect((await foto(verzoek(`/api/fotos/dagrapport/${fotoId}`), { params: Promise.resolve({ pad: ['dagrapport', String(fotoId)] }) })).status).toBe(404);
  });

  it('een eigen rapport dat weer concept is, verdwijnt voor de kijker', async () => {
    await prisma.dagrapport.update({ where: { id: ids.dagrapporten.tweede }, data: { status: 'concept' } });
    await inloggenAls('kempen', 'kempen123');
    expect((await pdf(verzoek(`/api/dagrapporten/${ids.dagrapporten.tweede}/pdf`), p(ids.dagrapporten.tweede))).status).toBe(404);
    expect((await (await portaal(verzoek('/api/portaal'), undefined)).json()).dagrapporten).toEqual([]);
  });

  it('de klassieke kijker (Mourik) komt nergens bij, ook niet bij de PDF', async () => {
    await inloggenAls('kijker', 'kijker123');
    expect((await pdf(verzoek(`/api/dagrapporten/${ids.dagrapporten.mourik}/pdf`), p(ids.dagrapporten.mourik))).status).toBe(403);
    expect((await pdf(verzoek(`/api/dagrapporten/${ids.dagrapporten.tweede}/pdf`), p(ids.dagrapporten.tweede))).status).toBe(403);
    expect((await lijst(verzoek('/api/dagrapporten'), undefined)).status).toBe(403);
  });

  it('gebruiker leest maar tekent niet; het dossier toont het dagrapport als moment', async () => {
    await inloggenAls('gebruiker', 'user123');
    expect((await lijst(verzoek('/api/dagrapporten'), undefined)).status).toBe(200);
    expect((await teken(verzoek(`/api/dagrapporten/${ids.dagrapporten.mourik}/handtekening`, { body: { naam: 'x', handtekening: HANDTEKENING } }), p(ids.dagrapporten.mourik))).status).toBe(403);
    await admin();
    const d = await (await dossier(verzoek(`/api/klanten/${ids.klanten.tweede}/dossier`), p(ids.klanten.tweede))).json();
    expect(d.momenten.find((m: { soort: string }) => m.soort === 'dagrapport')).toMatchObject({ dagrapport: { id: ids.dagrapporten.tweede, status: 'getekend' } });
  });
});

describe('grote PDF via de opslag', () => {
  it('dagrapport, inspectierapport en inhuurdossier boven 4 MB: doorverwijzing naar de opslag', async () => {
    const oud = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = 'test';
    const groot = Buffer.alloc(5 * 1024 * 1024);
    const dr = await import('@/lib/rapport/dagrapportPdf');
    const ins = await import('@/lib/rapport/inspectieRapportPdf');
    const inh = await import('@/lib/rapport/inhuurdossierPdf');
    const spies = [
      vi.spyOn(dr, 'maakDagrapportPdf').mockResolvedValue(groot),
      vi.spyOn(ins, 'maakInspectieRapportPdf').mockResolvedValue(groot),
      vi.spyOn(inh, 'maakInhuurdossierPdf').mockResolvedValue(groot),
    ];
    try {
      await admin();
      const { GET: inspectierapport } = await import('@/app/api/inspecties/[id]/rapport/route');
      const { GET: inhuur } = await import('@/app/api/eigen-dossier/inhuurdossier/route');
      const a = await pdf(verzoek(`/api/dagrapporten/${ids.dagrapporten.tweede}/pdf`), p(ids.dagrapporten.tweede));
      const b = await inspectierapport(verzoek(`/api/inspecties/${ids.inspecties.lekken}/rapport`), p(ids.inspecties.lekken));
      const c = await inhuur(verzoek('/api/eigen-dossier/inhuurdossier'), undefined);
      for (const res of [a, b, c]) {
        expect(res.status).toBe(303);
        expect(res.headers.get('location')).toMatch(/^https:\/\/t\.public\.blob\.vercel-storage\.com\/rapporten\/[0-9a-f]{32}\//);
      }
      expect(blob.put).toHaveBeenCalledTimes(3);
    } finally {
      spies.forEach((s) => s.mockRestore());
      process.env.BLOB_READ_WRITE_TOKEN = oud;
    }
  });
});

describe('handtekening alleen waar hij nodig is', () => {
  it('lijsten, portaal en dossier halen hem niet op; het rapport zelf wel', async () => {
    const { DAGRAPPORT_LIJST_SELECT, DAGRAPPORT_DOSSIER_SELECT } = await import('@/lib/dagrapporten');
    expect(DAGRAPPORT_LIJST_SELECT).not.toHaveProperty('handtekening');
    expect(DAGRAPPORT_DOSSIER_SELECT).not.toHaveProperty('handtekening');
    await admin();
    const l = await (await lijst(verzoek('/api/dagrapporten'), undefined)).json();
    expect(JSON.stringify(l)).not.toContain('base64');
    expect(l.find((r: { id: number }) => r.id === ids.dagrapporten.tweede).aantalFotos).toBe(2);
    expect((await (await een(verzoek(`/api/dagrapporten/${ids.dagrapporten.tweede}`), p(ids.dagrapporten.tweede))).json()).handtekening).toMatch(/^data:image\/png;base64,/);
  });
});
