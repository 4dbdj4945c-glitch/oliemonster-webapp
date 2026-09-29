// Dagrapporten via de API: aanmaken bij een planningsdag, invullen, tekenen (dan
// ligt het vast), handtekening wissen, de PDF, en de afscherming per klant:
// alleen de getekende rapporten van de eigen klant voor de kijker met het
// klantportaal, niets voor de klassieke kijker.
import { beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as lijst, POST as nieuw } from '@/app/api/dagrapporten/route';
import { GET as een, PUT as wijzig, DELETE as weg } from '@/app/api/dagrapporten/[id]/route';
import { POST as teken, DELETE as wis } from '@/app/api/dagrapporten/[id]/handtekening/route';
import { GET as pdf } from '@/app/api/dagrapporten/[id]/pdf/route';
import { GET as portaal } from '@/app/api/portaal/route';
import { GET as dossier } from '@/app/api/klanten/[id]/dossier/route';
import { GET as foto } from '@/app/api/fotos/[...pad]/route';
import { metParams, uitloggen, verzoek } from '../hulp/verzoek';

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
    expect(d).toMatchObject({ nummer: `DR-${d.id}`, status: 'concept', minuten: 150, planId: ids.dagen.vandaag, object: { id: ids.werkplaats } });

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
    expect(r.headers.get('content-disposition')).toMatch(/dagrapport-\d{4}-\d{2}-\d{2}-kempen-metaalbewerking-b-v\.pdf/);
  });

  it('verwijderen vraagt het nummer', async () => {
    await admin();
    const id = ids.dagrapporten.mourik;
    expect((await weg(verzoek(`/api/dagrapporten/${id}`, { method: 'DELETE', body: { bevestig: 'DR-0' } }), p(id))).status).toBe(400);
    expect((await weg(verzoek(`/api/dagrapporten/${id}`, { method: 'DELETE', body: { bevestig: `dr-${id}` } }), p(id))).status).toBe(200);
    expect((await een(verzoek(`/api/dagrapporten/${id}`), p(id))).status).toBe(404);
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
    expect((await foto(verzoek(`/api/fotos/dagrapport/${fotoId}`), metParams({ pad: ['dagrapport', String(fotoId)] }))).status).toBe(404);
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
