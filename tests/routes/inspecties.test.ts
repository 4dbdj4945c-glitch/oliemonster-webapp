// Inspecties en het eigen dossier via de API: invullen, rekenen, afscherming per
// klant (de kijker met het klantportaal ziet alleen de afgeronde inspecties van
// zijn eigen klant, de klassieke kijker helemaal niets) en de rapporten.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as lijst, POST as nieuw } from '@/app/api/inspecties/route';
import { GET as een, PUT as wijzig, DELETE as weg } from '@/app/api/inspecties/[id]/route';
import { POST as herstel } from '@/app/api/inspecties/[id]/herstellen/route';
import { POST as nieuwItem } from '@/app/api/inspecties/[id]/items/route';
import { PUT as wijzigItem, DELETE as wegItem } from '@/app/api/inspectie-items/[id]/route';
import { POST as herstelItem } from '@/app/api/inspectie-items/[id]/herstellen/route';
import { POST as nieuweFoto } from '@/app/api/inspectie-items/[id]/fotos/route';
import { POST as nieuweFotoOud } from '@/app/api/inspectie-items/[id]/foto/route';
import { PUT as wijzigFoto, DELETE as wegFoto } from '@/app/api/inspectie-fotos/[id]/route';
import { POST as herstelFoto } from '@/app/api/inspectie-fotos/[id]/herstellen/route';
import { POST as plakken } from '@/app/api/inspecties/[id]/items/bulk/route';
import { GET as verzamelrapport } from '@/app/api/inspecties/rapport/route';
import { GET as rapport } from '@/app/api/inspecties/[id]/rapport/route';
import { GET as portaal } from '@/app/api/portaal/route';
import { GET as dossier } from '@/app/api/klanten/[id]/dossier/route';
import { GET as foto } from '@/app/api/fotos/[...pad]/route';
import { GET as documenten, POST as nieuwDocument } from '@/app/api/eigen-dossier/route';
import { DELETE as wegDocument } from '@/app/api/eigen-dossier/[id]/route';
import { POST as herstelDocument } from '@/app/api/eigen-dossier/[id]/herstellen/route';
import { GET as inhuurdossier } from '@/app/api/eigen-dossier/inhuurdossier/route';
import { fotoVerzoek, metParams, nepFoto, uitloggen, verzoek } from '../hulp/verzoek';

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
const admin = () => inloggenAls('admin', 'admin123');
const p = (id: number) => metParams({ id: String(id) });

function bewaar(naam: string, pdf: Buffer) {
  if (!process.env.RAPPORT_UIT) return;
  mkdirSync(process.env.RAPPORT_UIT, { recursive: true });
  writeFileSync(`${process.env.RAPPORT_UIT}/${naam}`, pdf);
}

beforeEach(async () => {
  ids = await vulMetNepdata(prisma);
});

describe('inspecties invullen (admin)', () => {
  it('nieuwe lekkeninspectie: klant komt van het object, lek toevoegen rekent de totalen', async () => {
    await admin();
    const res = await nieuw(verzoek('/api/inspecties', { body: { sjabloon: 'persluchtlekken', objectId: ids.werkplaats, datum: '2026-10-01', uitvoerder: 'Roel' } }), undefined);
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const r = await nieuwItem(verzoek(`/api/inspecties/${id}/items`, { body: { titel: '201', locatie: 'Hal 1', waarden: { db: '40', verliesLpm: '100' } } }), p(id));
    expect(r.status).toBe(201);
    const { inspectie, itemId } = await r.json();
    expect(inspectie.klant.id).toBe(ids.klanten.tweede);
    expect(inspectie.volgendeOp).toBe('2027-10-01');
    expect(inspectie.items[0]).toMatchObject({ titel: '201', oordeel: 'middel', waarden: { db: 40, verliesLpm: 100 } });
    // 100 l/min, 2000 uur, 0,25 per kWh, energie uit 7 bar
    expect(inspectie.totalen.m3PerJaar).toBe(12000);
    expect(Math.round(inspectie.totalen.kostenPerJaar)).toBe(Math.round(12000 * inspectie.totalen.instellingen.kwhPerM3 * 0.25));

    // Instellingen: één tegelijk sturen, de rest blijft.
    const w = await (await wijzig(verzoek(`/api/inspecties/${id}`, { method: 'PUT', body: { instellingen: { draaiuren: 4000 } } }), p(id))).json();
    expect(w.instellingen).toMatchObject({ draaiuren: 4000, drukBar: 7 });
    expect(w.totalen.m3PerJaar).toBe(24000);

    // Gerepareerd zonder datum: vandaag. Daarna telt het als besparing.
    const g = await (await wijzigItem(verzoek(`/api/inspectie-items/${itemId}`, { method: 'PUT', body: { gerepareerd: true } }), p(itemId))).json();
    expect(g.items[0].gerepareerd).toBe(true);
    expect(g.items[0].gerepareerdOp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(g.totalen.besparingKosten).toBeCloseTo(g.totalen.kostenPerJaar);

    // Weghalen en ongedaan maken
    expect((await (await wegItem(verzoek(`/api/inspectie-items/${itemId}`, { method: 'DELETE' }), p(itemId))).json()).items).toHaveLength(0);
    expect((await (await herstelItem(verzoek(`/api/inspectie-items/${itemId}/herstellen`, { method: 'POST' }), p(itemId))).json()).items).toHaveLength(1);
  });

  it('onzin in de invoer geeft een 400 met het veld', async () => {
    await admin();
    const id = ids.inspecties.conceptTweede;
    const r = await nieuwItem(verzoek(`/api/inspecties/${id}/items`, { body: { titel: 'x', waarden: { verliesLpm: 'veel' } } }), p(id));
    expect(r.status).toBe(400);
    expect((await r.json()).velden).toHaveProperty('verliesLpm');
    const o = await nieuwItem(verzoek(`/api/inspecties/${id}/items`, { body: { titel: 'x', oordeel: 'in-orde' } }), p(id));
    expect(o.status).toBe(400);
    // Een installatie van een andere klant mag niet.
    const i = await nieuwItem(verzoek(`/api/inspecties/${id}/items`, { body: { titel: 'x', installatieId: ids.installaties[0] } }), p(id));
    expect(i.status).toBe(400);
  });

  it('arbeidsmiddel: zonder uitslag, In orde pas met de hele checklist, afronden pas als alles een uitslag heeft', async () => {
    await admin();
    const res = await nieuw(verzoek('/api/inspecties', { body: { sjabloon: 'arbeidsmiddelen', objectId: ids.werkplaats, datum: '2026-10-01', uitvoerder: 'Roel' } }), undefined);
    const { id } = await res.json();
    const r = await nieuwItem(verzoek(`/api/inspecties/${id}/items`, { body: { titel: 'Hydraulische pers', waarden: { werkdrukBar: 200 } } }), p(id));
    expect(r.status).toBe(201);
    const { inspectie, itemId } = await r.json();
    expect(inspectie.items[0].oordeel).toBeNull();
    // Afronden kan niet zolang er een arbeidsmiddel zonder uitslag is.
    const a = await wijzig(verzoek(`/api/inspecties/${id}`, { method: 'PUT', body: { status: 'afgerond' } }), p(id));
    expect(a.status).toBe(400);
    expect((await a.json()).error).toMatch(/uitslag voor Hydraulische pers/);
    // In orde met een lege checklist mag niet, ook niet als alleen het oordeel meekomt.
    const o = await wijzigItem(verzoek(`/api/inspectie-items/${itemId}`, { method: 'PUT', body: { oordeel: 'in-orde' } }), p(itemId));
    expect(o.status).toBe(400);
    expect((await o.json()).velden).toHaveProperty('oordeel');
    const nieuwMetInOrde = await nieuwItem(verzoek(`/api/inspecties/${id}/items`, { body: { titel: 'Luchtketel', oordeel: 'in-orde', waarden: { ketelLiter: 3000 } } }), p(id));
    expect(nieuwMetInOrde.status).toBe(400);
    // Met de hele checklist wel, en dan kan hij af.
    const checklist = Object.fromEntries(['slangen', 'lekkage', 'leidingen', 'beveiliging', 'manometer', 'bediening', 'afscherming', 'olie', 'filters', 'markering'].map((k) => [k, 'goed']));
    const g = await wijzigItem(verzoek(`/api/inspectie-items/${itemId}`, { method: 'PUT', body: { oordeel: 'in-orde', waarden: { werkdrukBar: 200, checklist } } }), p(itemId));
    expect(g.status).toBe(200);
    // Een arbeidsmiddel bewust overslaan: Niet gecontroleerd, dan kan het ook af.
    const ng = await nieuwItem(verzoek(`/api/inspecties/${id}/items`, { body: { titel: 'Luchtketel hal 3', oordeel: 'niet-gecontroleerd', waarden: { ketelLiter: 3000 } } }), p(id));
    expect(ng.status).toBe(201);
    expect((await ng.json()).inspectie.uitkomst).toBe('2 arbeidsmiddelen, 1 in orde, 1 niet gecontroleerd');
    expect((await wijzig(verzoek(`/api/inspecties/${id}`, { method: 'PUT', body: { status: 'afgerond' } }), p(id))).status).toBe(200);
    const pdf = await rapport(verzoek(`/api/inspecties/${id}/rapport`), p(id));
    expect(pdf.status).toBe(200);
    bewaar('inspectie-arbeidsmiddelen-niet-gecontroleerd.pdf', Buffer.from(await pdf.arrayBuffer()));
  });

  it('meerdere foute velden komen in één keer terug', async () => {
    await admin();
    const id = ids.inspecties.conceptTweede;
    const r = await nieuwItem(verzoek(`/api/inspecties/${id}/items`, { body: { titel: 'x', waarden: { db: -5, verliesLpm: 'abc' } } }), p(id));
    expect(r.status).toBe(400);
    expect(Object.keys((await r.json()).velden).sort()).toEqual(['db', 'verliesLpm']);
  });

  it('een object zonder klant kan geen inspectie krijgen', async () => {
    await admin();
    const los = await prisma.sampleObject.create({ data: { name: 'Zonder klant' } });
    const r = await nieuw(verzoek('/api/inspecties', { body: { sjabloon: 'arbeidsmiddelen', objectId: los.id, datum: '2026-10-01', uitvoerder: 'Roel' } }), undefined);
    expect(r.status).toBe(400);
  });

  it('afronden zet wie en wanneer; verwijderen vraagt het nummer en is terug te zetten', async () => {
    await admin();
    const id = ids.inspecties.conceptTweede;
    const a = await (await wijzig(verzoek(`/api/inspecties/${id}`, { method: 'PUT', body: { status: 'afgerond' } }), p(id))).json();
    expect(a.status).toBe('afgerond');
    expect(a.afgerondDoor).toBe('admin');
    expect((await weg(verzoek(`/api/inspecties/${id}`, { method: 'DELETE', body: { bevestig: 'fout' } }), p(id))).status).toBe(400);
    expect((await weg(verzoek(`/api/inspecties/${id}`, { method: 'DELETE', body: { bevestig: `ins-${id}` } }), p(id))).status).toBe(200);
    expect((await een(verzoek(`/api/inspecties/${id}`), p(id))).status).toBe(404);
    expect((await herstel(verzoek(`/api/inspecties/${id}/herstellen`, { method: 'POST' }), p(id))).status).toBe(200);
    expect((await een(verzoek(`/api/inspecties/${id}`), p(id))).status).toBe(200);
  });

  it('een gebruiker leest mee maar wijzigt niets', async () => {
    await inloggenAls('gebruiker', 'user123');
    expect((await lijst(verzoek('/api/inspecties'), undefined)).status).toBe(200);
    const id = ids.inspecties.lekken;
    expect((await wijzig(verzoek(`/api/inspecties/${id}`, { method: 'PUT', body: { samenvatting: 'x' } }), p(id))).status).toBe(403);
    expect((await nieuwItem(verzoek(`/api/inspecties/${id}/items`, { body: { titel: 'x' } }), p(id))).status).toBe(403);
  });
});

describe('afscherming per klant', () => {
  it('de klassieke kijker (zoals Mourik) komt niet bij inspecties, ook niet bij zijn eigen', async () => {
    await inloggenAls('kijker', 'kijker123');
    expect((await rapport(verzoek(`/api/inspecties/${ids.inspecties.conceptMourik}/rapport`), p(ids.inspecties.conceptMourik))).status).toBe(403);
    expect((await rapport(verzoek(`/api/inspecties/${ids.inspecties.lekken}/rapport`), p(ids.inspecties.lekken))).status).toBe(403);
    expect((await lijst(verzoek('/api/inspecties'), undefined)).status).toBe(403);
  });

  it('de kijker met klantportaal krijgt alleen afgeronde rapporten van zijn eigen klant', async () => {
    await inloggenAls('kempen', 'kempen123');
    const r = await rapport(verzoek(`/api/inspecties/${ids.inspecties.lekken}/rapport`), p(ids.inspecties.lekken));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('content-disposition')).toMatch(/persluchtlekken-\d{4}-\d{2}-\d{2}-kempen/);
    bewaar('inspectie-persluchtlekken.pdf', Buffer.from(await r.arrayBuffer()));
    const a = await rapport(verzoek(`/api/inspecties/${ids.inspecties.arbeidsmiddelen}/rapport`), p(ids.inspecties.arbeidsmiddelen));
    expect(a.status).toBe(200);
    bewaar('inspectie-arbeidsmiddelen.pdf', Buffer.from(await a.arrayBuffer()));
    // Concept van de eigen klant, en alles van Mourik: alsof het niet bestaat.
    expect((await rapport(verzoek(`/api/inspecties/${ids.inspecties.conceptTweede}/rapport`), p(ids.inspecties.conceptTweede))).status).toBe(404);
    expect((await rapport(verzoek(`/api/inspecties/${ids.inspecties.conceptMourik}/rapport`), p(ids.inspecties.conceptMourik))).status).toBe(404);
    // De lijst en de detailroute zijn voor medewerkers.
    expect((await lijst(verzoek('/api/inspecties'), undefined)).status).toBe(403);
    expect((await een(verzoek(`/api/inspecties/${ids.inspecties.lekken}`), p(ids.inspecties.lekken))).status).toBe(403);
    const log = await prisma.auditLog.findFirst({ where: { action: 'INSPECTIE_RAPPORT_DOWNLOAD', username: 'kempen' } });
    expect(log).not.toBeNull();
  });

  it('met een kijkjaar alleen de inspecties van dat jaar', async () => {
    const jaar = new Date((await prisma.inspectie.findUniqueOrThrow({ where: { id: ids.inspecties.lekken } })).datum).getUTCFullYear();
    await prisma.user.update({ where: { username: 'kempen' }, data: { viewYear: jaar - 1 } });
    await inloggenAls('kempen', 'kempen123');
    expect((await rapport(verzoek(`/api/inspecties/${ids.inspecties.lekken}/rapport`), p(ids.inspecties.lekken))).status).toBe(404);
  });

  it('het klantportaal toont de afgeronde inspecties met de volgende datum, zonder interne gegevens', async () => {
    await inloggenAls('kempen', 'kempen123');
    const pt = await (await portaal(verzoek('/api/portaal'), undefined)).json();
    expect(pt.inspecties.map((i: { id: number }) => i.id).sort()).toEqual([ids.inspecties.lekken, ids.inspecties.arbeidsmiddelen].sort());
    const am = pt.inspecties.find((i: { id: number }) => i.id === ids.inspecties.arbeidsmiddelen);
    expect(am.volgende).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(am.rapport).toBe(`/api/inspecties/${ids.inspecties.arbeidsmiddelen}/rapport`);
    expect(JSON.stringify(pt.inspecties)).not.toMatch(/nepdata|afgerondDoor|instellingen/);
  });

  it('foto van een bevinding: wel voor admin, nooit voor een kijker; het oude adres per bevinding werkt nog', async () => {
    const f = await prisma.inspectieFoto.findFirstOrThrow({ where: { item: { inspectieId: ids.inspecties.lekken } } });
    const haal = () => foto(verzoek(`/api/fotos/inspectiefoto/${f.id}?v=1`), { params: Promise.resolve({ pad: ['inspectiefoto', String(f.id)] }) });
    const oud = () => foto(verzoek(`/api/fotos/inspectie/${f.itemId}?v=1`), { params: Promise.resolve({ pad: ['inspectie', String(f.itemId)] }) });
    await admin();
    expect((await haal()).status).toBe(200);
    expect((await oud()).status).toBe(200);
    await inloggenAls('kempen', 'kempen123');
    expect((await haal()).status).toBe(404);
    expect((await oud()).status).toBe(404);
  });

  it('het klantdossier heeft de inspecties in de tijdlijn', async () => {
    await admin();
    const d = await (await dossier(verzoek(`/api/klanten/${ids.klanten.tweede}/dossier`), p(ids.klanten.tweede))).json();
    const insp = d.momenten.filter((m: { soort: string; onderdeel?: boolean }) => m.soort === 'inspectie' && !m.onderdeel);
    expect(insp.map((m: { inspectie: { id: number } }) => m.inspectie.id).sort()).toEqual(
      [ids.inspecties.lekken, ids.inspecties.arbeidsmiddelen, ids.inspecties.conceptTweede].sort()
    );
    // Per arbeidsmiddel dat een installatie is, ook een moment bij die installatie.
    expect(d.momenten.some((m: { soort: string; installatieId: number }) => m.soort === 'inspectie' && m.installatieId === ids.installaties[2])).toBe(true);
  });
});

describe('eigen dossier', () => {
  it('alleen admin; geldigheid per document', async () => {
    await inloggenAls('gebruiker', 'user123');
    expect((await documenten(verzoek('/api/eigen-dossier'), undefined)).status).toBe(403);
    await admin();
    const lijstje = await (await documenten(verzoek('/api/eigen-dossier'), undefined)).json();
    const per = Object.fromEntries(lijstje.map((d: { soort: string; geldigheid: string }) => [d.soort, d.geldigheid]));
    expect(per).toMatchObject({ vca: 'verloopt', kalibratie: 'verlopen', verzekering: 'geldig', diploma: 'zonder-datum' });
    expect(JSON.stringify(lijstje)).not.toMatch(/nepdata\/document/);
  });

  it('nieuw, verwijderen en terugzetten', async () => {
    await admin();
    const r = await nieuwDocument(verzoek('/api/eigen-dossier', { body: { soort: 'cursus', titel: 'NEN 3140', vervaltOp: '2030-01-01' } }), undefined);
    expect(r.status).toBe(201);
    const d = await r.json();
    expect(d.vervaltOp).toBe('2030-01-01');
    expect((await wegDocument(verzoek(`/api/eigen-dossier/${d.id}`, { method: 'DELETE' }), p(d.id))).status).toBe(200);
    expect((await herstelDocument(verzoek(`/api/eigen-dossier/${d.id}/herstellen`, { method: 'POST' }), p(d.id))).status).toBe(200);
  });

  it('inhuurdossier: voorblad plus de geldige bestanden, zonder het verlopen document', async () => {
    await admin();
    const r = await inhuurdossier(verzoek('/api/eigen-dossier/inhuurdossier'), undefined);
    expect(r.status).toBe(200);
    const pdf = Buffer.from(await r.arrayBuffer());
    bewaar('inhuurdossier.pdf', pdf);
    const doc = await PDFDocument.load(pdf);
    // Voorblad (1) + vca, polis, kvk, cursus (elk 1) + diploma (foto, 1). Kalibratie is verlopen.
    expect(doc.getPageCount()).toBe(6);
  });
});

// ------------------------------------------------------------------
// Markering, meerdere foto's, lijst plakken en het verzamelrapport
// ------------------------------------------------------------------

const WERKLIJST = [
  'Bron 6: pakkingen | Technische kast in voorlichtingsruimte, dienstengebouw | Volgens rapport 13 stuks (p. 14)',
  'Bron 9: textiel (kabelmantel) | Kast in NSA-ruimte, dienstengebouw | Volgens rapport 8 m1 (p. 15)',
  'Bron 15: aandrijvingen van stuw | Kruipruimte trafo, dienstengebouw | Volgens rapport 20 stuks (p. 15)',
];

async function nieuweMarkering(objectId: number, datum = '2026-10-05') {
  const r = await nieuw(verzoek('/api/inspecties', { body: { sjabloon: 'markering', objectId, datum, uitvoerder: 'Roel Mandigers' } }), undefined);
  expect(r.status).toBe(201);
  return (await r.json()).id as number;
}

/** Elke regel uit de werklijst als { titel, locatie, notitie }. */
const regelsUit = (lijst: string[]) =>
  lijst.map((r) => {
    const [titel, locatie, notitie] = r.split('|').map((x) => x.trim());
    return { titel, locatie, notitie };
  });

describe('markering', () => {
  it('lijst plakken, uitslag kiezen, pas afronden als alles een uitslag heeft, geen volgende inspectie', async () => {
    await admin();
    const id = await nieuweMarkering(ids.werkplaats);
    const leeg = await (await een(verzoek(`/api/inspecties/${id}`), p(id))).json();
    expect(leeg.volgendeOp).toBeNull();
    expect(leeg.volgende).toBeNull();
    expect(leeg.instellingen).toEqual({ opdracht: '', markering: 'Waarschuwingssticker', tav: '' });
    expect(leeg.totalen).toMatchObject({ soort: 'markering', aantal: 0 });

    const r = await plakken(verzoek(`/api/inspecties/${id}/items/bulk`, { body: { regels: regelsUit(WERKLIJST) } }), p(id));
    expect(r.status).toBe(201);
    const { aantal, inspectie } = await r.json();
    expect(aantal).toBe(3);
    expect(inspectie.items.map((i: { titel: string }) => i.titel)).toEqual(['Bron 6: pakkingen', 'Bron 9: textiel (kabelmantel)', 'Bron 15: aandrijvingen van stuw']);
    expect(inspectie.items[0]).toMatchObject({ locatie: 'Technische kast in voorlichtingsruimte, dienstengebouw', notitie: 'Volgens rapport 13 stuks (p. 14)', oordeel: null, volgendeOp: null, fotos: [] });
    expect(inspectie.items.map((i: { volgorde: number }) => i.volgorde)).toEqual([1, 2, 3]);
    expect(await prisma.auditLog.count({ where: { action: 'CREATE_INSPECTIE_ITEMS_BULK' } })).toBe(1);

    // Afronden zonder uitslag: geweigerd, met de namen.
    const a = await wijzig(verzoek(`/api/inspecties/${id}`, { method: 'PUT', body: { status: 'afgerond' } }), p(id));
    expect(a.status).toBe(400);
    expect((await a.json()).error).toBe('Kies eerst een uitslag voor Bron 6: pakkingen, Bron 9: textiel (kabelmantel), Bron 15: aandrijvingen van stuw (of Niet bereikbaar).');

    const [b6, b9, b15] = inspectie.items.map((i: { id: number }) => i.id);
    await wijzigItem(verzoek(`/api/inspectie-items/${b6}`, { method: 'PUT', body: { oordeel: 'gemarkeerd', waarden: { stickers: '13' } } }), p(b6));
    await wijzigItem(verzoek(`/api/inspectie-items/${b9}`, { method: 'PUT', body: { oordeel: 'gemarkeerd', waarden: { stickers: 4 } } }), p(b9));
    const fout = await wijzigItem(verzoek(`/api/inspectie-items/${b15}`, { method: 'PUT', body: { oordeel: 'in-orde' } }), p(b15));
    expect(fout.status).toBe(400);
    const laatste = await (await wijzigItem(verzoek(`/api/inspectie-items/${b15}`, { method: 'PUT', body: { oordeel: 'niet-bereikbaar' } }), p(b15))).json();
    expect(laatste.uitkomst).toBe('3 locaties, 2 gemarkeerd, 1 niet bereikbaar');
    expect(laatste.totalen).toMatchObject({ soort: 'markering', aantal: 3, gemarkeerd: 2, 'niet-bereikbaar': 1, stickers: 17 });

    await wijzig(verzoek(`/api/inspecties/${id}`, { method: 'PUT', body: { instellingen: { opdracht: 'het inventarisatierapport van de klant', tav: 'J. de Vries' } } }), p(id));
    const af = await wijzig(verzoek(`/api/inspecties/${id}`, { method: 'PUT', body: { status: 'afgerond' } }), p(id));
    expect(af.status).toBe(200);

    // Het enkele rapport heeft de opbouw van het opleverrapport.
    const pdf = await rapport(verzoek(`/api/inspecties/${id}/rapport`), p(id));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-disposition')).toMatch(/Opleverrapport-markering-kempen-[a-z-]+-2026-10-05\.pdf/);
    const buf = Buffer.from(await pdf.arrayBuffer());
    bewaar('inspectie-markering.pdf', buf);
    expect((await PDFDocument.load(buf)).getPageCount()).toBeGreaterThanOrEqual(3);

    // In de lijst geen volgende inspectie, en niet als arbeidsmiddel.
    const l = await (await lijst(verzoek('/api/inspecties'), undefined)).json();
    expect(l.find((i: { id: number }) => i.id === id)).toMatchObject({ sjabloon: 'markering', volgende: null, waarschuwingen: 0, uitkomst: '3 locaties, 2 gemarkeerd, 1 niet bereikbaar' });

    // Het klantportaal toont hem met de uitkomst, zonder volgende inspectie.
    await inloggenAls('kempen', 'kempen123');
    const pt = await (await portaal(verzoek('/api/portaal'), undefined)).json();
    expect(pt.inspecties.find((i: { id: number }) => i.id === id)).toMatchObject({ naam: 'Markering', volgende: null, uitkomst: '3 locaties, 2 gemarkeerd, 1 niet bereikbaar' });
  });

  it('lijst plakken: foute regels, te veel regels, een afgeronde inspectie en een gebruiker worden geweigerd', async () => {
    await admin();
    const id = await nieuweMarkering(ids.werkplaats);
    const fout = await plakken(verzoek(`/api/inspecties/${id}/items/bulk`, { body: { regels: [{ titel: 'Bron 1' }, { titel: '  ' }] } }), p(id));
    expect(fout.status).toBe(400);
    expect((await prisma.inspectieItem.count({ where: { inspectieId: id } }))).toBe(0); // alles of niets
    const leeg = await plakken(verzoek(`/api/inspecties/${id}/items/bulk`, { body: { regels: [] } }), p(id));
    expect(leeg.status).toBe(400);
    const teVeel = await plakken(verzoek(`/api/inspecties/${id}/items/bulk`, { body: { regels: Array.from({ length: 201 }, (_, i) => ({ titel: `Bron ${i}` })) } }), p(id));
    expect(teVeel.status).toBe(400);
    // Bij lekken krijgt een geplakte regel de standaardprioriteit.
    const lek = ids.inspecties.conceptTweede;
    const l = await (await plakken(verzoek(`/api/inspecties/${lek}/items/bulk`, { body: { regels: [{ titel: '301', locatie: 'Hal 4' }] } }), p(lek))).json();
    expect(l.inspectie.items.at(-1)).toMatchObject({ titel: '301', oordeel: 'middel' });
    const af = await plakken(verzoek(`/api/inspecties/${ids.inspecties.lekken}/items/bulk`, { body: { regels: [{ titel: 'x' }] } }), p(ids.inspecties.lekken));
    expect(af.status).toBe(409);
    await inloggenAls('gebruiker', 'user123');
    expect((await plakken(verzoek(`/api/inspecties/${id}/items/bulk`, { body: { regels: [{ titel: 'x' }] } }), p(id))).status).toBe(403);
  });
});

describe("meerdere foto's per bevinding", () => {
  it("toevoegen (ook via het oude adres), bijschrift, weghalen; alleen bij een concept en alleen voor admin", async () => {
    const oud = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = 'test';
    try {
      await admin();
      const id = ids.inspecties.conceptTweede;
      const { itemId } = await (await nieuwItem(verzoek(`/api/inspecties/${id}/items`, { body: { titel: '401' } }), p(id))).json();
      const voeg = (bijschrift?: string) =>
        nieuweFoto(fotoVerzoek(`/api/inspectie-items/${itemId}/fotos`, { photo: nepFoto(), ...(bijschrift ? { bijschrift } : {}) }), p(itemId));
      expect((await voeg('Overzicht')).status).toBe(200);
      expect((await voeg()).status).toBe(200);
      const derde = await nieuweFotoOud(fotoVerzoek(`/api/inspectie-items/${itemId}/foto`, { photo: nepFoto() }), p(itemId));
      expect(derde.status).toBe(200);
      let item = (await derde.json()).items.find((i: { id: number }) => i.id === itemId);
      expect(item.fotos).toHaveLength(3);
      expect(item.fotos[0]).toMatchObject({ bijschrift: 'Overzicht' });
      expect(item.fotos.every((f: { url: string }) => /^\/api\/fotos\/inspectiefoto\/\d+\?v=/.test(f.url))).toBe(true);
      expect(JSON.stringify(item)).not.toMatch(/blob\.vercel-storage/);
      const volgorde = await prisma.inspectieFoto.findMany({ where: { itemId }, orderBy: { id: 'asc' }, select: { volgorde: true } });
      expect(volgorde.map((v) => v.volgorde)).toEqual([0, 1, 2]);

      // Bijschrift wijzigen
      const tweede = item.fotos[1].id;
      const w = await (await wijzigFoto(verzoek(`/api/inspectie-fotos/${tweede}`, { method: 'PUT', body: { bijschrift: 'Sticker op flens 3' } }), p(tweede))).json();
      expect(w.items.find((i: { id: number }) => i.id === itemId).fotos[1].bijschrift).toBe('Sticker op flens 3');

      // Weghalen is zacht: weg uit de lijst en de fotoroute, het bestand blijft; Ongedaan maken zet hem terug op zijn plek.
      blob.del.mockClear();
      const weg1 = await (await wegFoto(verzoek(`/api/inspectie-fotos/${tweede}`, { method: 'DELETE' }), p(tweede))).json();
      expect(weg1.items.find((i: { id: number }) => i.id === itemId).fotos).toHaveLength(2);
      expect(blob.del).not.toHaveBeenCalled();
      expect((await foto(verzoek(`/api/fotos/inspectiefoto/${tweede}`), { params: Promise.resolve({ pad: ['inspectiefoto', String(tweede)] }) })).status).toBe(404);
      const terug = await (await herstelFoto(verzoek(`/api/inspectie-fotos/${tweede}/herstellen`, { method: 'POST' }), p(tweede))).json();
      expect(terug.items.find((i: { id: number }) => i.id === itemId).fotos.map((f: { id: number }) => f.id)[1]).toBe(tweede);
      expect((await herstelFoto(verzoek(`/api/inspectie-fotos/${tweede}/herstellen`, { method: 'POST' }), p(tweede))).status).toBe(404);
      const weg2 = await (await wegFoto(verzoek(`/api/inspectie-fotos/${tweede}`, { method: 'DELETE' }), p(tweede))).json();
      item = weg2.items.find((i: { id: number }) => i.id === itemId);
      expect(item.fotos).toHaveLength(2);

      // Een gebruiker mag niets toevoegen of weghalen.
      await inloggenAls('gebruiker', 'user123');
      expect((await voeg()).status).toBe(403);
      expect((await wegFoto(verzoek(`/api/inspectie-fotos/${item.fotos[0].id}`, { method: 'DELETE' }), p(item.fotos[0].id))).status).toBe(403);

      // Afgerond: vast.
      await admin();
      await wijzig(verzoek(`/api/inspecties/${id}`, { method: 'PUT', body: { status: 'afgerond' } }), p(id));
      expect((await voeg()).status).toBe(409);
      expect((await wegFoto(verzoek(`/api/inspectie-fotos/${item.fotos[0].id}`, { method: 'DELETE' }), p(item.fotos[0].id))).status).toBe(409);

      // De kijker met klantportaal krijgt de foto nooit los, ook niet van een afgeronde inspectie van zijn klant.
      await inloggenAls('kempen', 'kempen123');
      const f = item.fotos[0].id;
      expect((await foto(verzoek(`/api/fotos/inspectiefoto/${f}`), { params: Promise.resolve({ pad: ['inspectiefoto', String(f)] }) })).status).toBe(404);
    } finally {
      process.env.BLOB_READ_WRITE_TOKEN = oud;
    }
  });

  it('dezelfde idempotentiesleutel voegt een foto maar één keer toe (offline wachtrij)', async () => {
    const oud = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = 'test';
    try {
      await admin();
      const id = ids.inspecties.conceptTweede;
      const { itemId } = await (await nieuwItem(verzoek(`/api/inspecties/${id}/items`, { body: { titel: '402' } }), p(id))).json();
      const metSleutel = () => {
        const r = fotoVerzoek(`/api/inspectie-items/${itemId}/fotos`, { photo: nepFoto() });
        r.headers.set('Idempotentie-Sleutel', 'foto-sleutel-0001-f0');
        return r;
      };
      expect((await nieuweFoto(metSleutel(), p(itemId))).status).toBe(200);
      expect((await nieuweFoto(metSleutel(), p(itemId))).status).toBe(200);
      expect(await prisma.inspectieFoto.count({ where: { itemId } })).toBe(1);
    } finally {
      process.env.BLOB_READ_WRITE_TOKEN = oud;
    }
  });

  it('de migratie zet een bestaande foto over naar InspectieFoto', async () => {
    const sql = readFileSync(path.join(process.cwd(), 'prisma/migrations/20261005090000_inspectie_fotos/migration.sql'), 'utf8');
    const invoegen = sql.slice(sql.indexOf('INSERT INTO "InspectieFoto"'));
    const item = await prisma.inspectieItem.create({ data: { inspectieId: ids.inspecties.conceptTweede, titel: 'oud', fotoUrl: '/nepdata/lek-2.jpg' } });
    const zonder = await prisma.inspectieItem.create({ data: { inspectieId: ids.inspecties.conceptTweede, titel: 'zonder' } });
    await prisma.inspectieFoto.deleteMany();
    await prisma.$executeRawUnsafe(invoegen);
    expect(await prisma.inspectieFoto.findMany({ where: { itemId: item.id }, select: { url: true, volgorde: true } })).toEqual([{ url: '/nepdata/lek-2.jpg', volgorde: 0 }]);
    expect(await prisma.inspectieFoto.count({ where: { itemId: zonder.id } })).toBe(0);
    // De kolom blijft staan (terugval).
    expect((await prisma.inspectieItem.findUniqueOrThrow({ where: { id: item.id } })).fotoUrl).toBe('/nepdata/lek-2.jpg');
  });
});

describe('verzamelrapport', () => {
  const vraag = (ids: number[]) => verzamelrapport(verzoek(`/api/inspecties/rapport?ids=${ids.join(',')}`), undefined);

  it('weigert gemengde klanten of soorten, en is alleen voor admin', async () => {
    await admin();
    const soort = await vraag([ids.inspecties.lekken, ids.inspecties.arbeidsmiddelen]);
    expect(soort.status).toBe(400);
    expect((await soort.json()).error).toMatch(/één soort inspectie/);
    const klant = await vraag([ids.inspecties.arbeidsmiddelen, ids.inspecties.conceptMourik]);
    expect(klant.status).toBe(400);
    expect((await klant.json()).error).toMatch(/één klant/);
    expect((await verzamelrapport(verzoek('/api/inspecties/rapport?ids=abc'), undefined)).status).toBe(400);
    expect((await verzamelrapport(verzoek('/api/inspecties/rapport?ids=99999999999999999999'), undefined)).status).toBe(400);
    expect((await vraag([999999])).status).toBe(404);
    await inloggenAls('gebruiker', 'user123');
    expect((await vraag([ids.inspecties.lekken])).status).toBe(403);
    await inloggenAls('kempen', 'kempen123');
    expect((await vraag([ids.inspecties.lekken])).status).toBe(403);
    await inloggenAls('kijker', 'kijker123');
    expect((await vraag([ids.inspecties.lekken])).status).toBe(403);
  });

  it('twee markeringen op twee objecten in één PDF, met een concept erbij', async () => {
    await admin();
    const tweedeObject = await prisma.sampleObject.create({ data: { name: 'Pompgebouw Zuid', address: 'Kanaaldijk 4, Eersel', klantId: ids.klanten.tweede } });
    const a = await nieuweMarkering(ids.werkplaats, '2026-10-05');
    const b = await nieuweMarkering(tweedeObject.id, '2026-10-07');
    await plakken(verzoek(`/api/inspecties/${a}/items/bulk`, { body: { regels: regelsUit(WERKLIJST.slice(0, 2)) } }), p(a));
    await plakken(verzoek(`/api/inspecties/${b}/items/bulk`, { body: { regels: regelsUit(WERKLIJST.slice(2)) } }), p(b));
    const items = await prisma.inspectieItem.findMany({ where: { inspectieId: { in: [a, b] } } });
    for (const i of items) {
      await prisma.inspectieItem.update({ where: { id: i.id }, data: { oordeel: 'gemarkeerd', waarden: { stickers: 3 } } });
      await prisma.inspectieFoto.createMany({ data: ['/nepdata/onderdeel-1.jpg', '/nepdata/onderdeel-2.jpg', '/nepdata/lek-1.jpg'].map((url, n) => ({ itemId: i.id, url, volgorde: n, bijschrift: n === 0 ? 'Overzicht' : null })) });
    }
    await wijzig(verzoek(`/api/inspecties/${a}`, { method: 'PUT', body: { status: 'afgerond', instellingen: { opdracht: 'werkorder 4711' } } }), p(a));

    const r = await vraag([b, a]);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('content-disposition')).toMatch(/Opleverrapport-markering-kempen-[a-z-]+-2026-10-07\.pdf/);
    const buf = Buffer.from(await r.arrayBuffer());
    bewaar('verzamelrapport-markering.pdf', buf);
    // Voorblad, overzicht, en per object een hoofdstuk.
    expect((await PDFDocument.load(buf)).getPageCount()).toBeGreaterThanOrEqual(4);
    const log = await prisma.auditLog.findFirst({ where: { action: 'INSPECTIE_VERZAMELRAPPORT_DOWNLOAD' } });
    expect(log).not.toBeNull();
  });

  it("te veel foto's samen: een 400 met uitleg, zonder foto's kan wel; controle=1 geeft alleen JSON", async () => {
    await admin();
    const item = await prisma.inspectieItem.findFirstOrThrow({ where: { inspectieId: ids.inspecties.lekken } });
    await prisma.inspectieFoto.createMany({ data: Array.from({ length: 501 }, (_, n) => ({ itemId: item.id, url: '/nepdata/lek-1.jpg', volgorde: 10 + n })) });
    const r = await vraag([ids.inspecties.lekken]);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/zonder foto's/);
    const zonder = await verzamelrapport(verzoek(`/api/inspecties/rapport?ids=${ids.inspecties.lekken}&fotos=0`), undefined);
    expect(zonder.status).toBe(200);
    expect(zonder.headers.get('content-type')).toBe('application/pdf');
    expect((await verzamelrapport(verzoek(`/api/inspecties/rapport?ids=${ids.inspecties.lekken}&controle=1`), undefined)).status).toBe(400);
    const ok = await verzamelrapport(verzoek(`/api/inspecties/rapport?ids=${ids.inspecties.arbeidsmiddelen}&controle=1`), undefined);
    expect(await ok.json()).toEqual({ ok: true, fotos: 3 });
  });

  it('werkt ook voor lekken (twee inspecties van dezelfde klant)', async () => {
    await admin();
    const r = await vraag([ids.inspecties.lekken, ids.inspecties.conceptTweede]);
    expect(r.status).toBe(200);
    bewaar('verzamelrapport-lekken.pdf', Buffer.from(await r.arrayBuffer()));
  });
});
