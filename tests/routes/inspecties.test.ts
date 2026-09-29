// Inspecties en het eigen dossier via de API: invullen, rekenen, afscherming per
// klant (de kijker met het klantportaal ziet alleen de afgeronde inspecties van
// zijn eigen klant, de klassieke kijker helemaal niets) en de rapporten.
import { beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
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
import { GET as rapport } from '@/app/api/inspecties/[id]/rapport/route';
import { GET as portaal } from '@/app/api/portaal/route';
import { GET as dossier } from '@/app/api/klanten/[id]/dossier/route';
import { GET as foto } from '@/app/api/fotos/[...pad]/route';
import { GET as documenten, POST as nieuwDocument } from '@/app/api/eigen-dossier/route';
import { DELETE as wegDocument } from '@/app/api/eigen-dossier/[id]/route';
import { POST as herstelDocument } from '@/app/api/eigen-dossier/[id]/herstellen/route';
import { GET as inhuurdossier } from '@/app/api/eigen-dossier/inhuurdossier/route';
import { metParams, uitloggen, verzoek } from '../hulp/verzoek';

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

  it('foto van een bevinding: wel voor admin, nooit voor een kijker', async () => {
    const item = await prisma.inspectieItem.findFirstOrThrow({ where: { inspectieId: ids.inspecties.lekken, fotoUrl: { not: null } } });
    const haal = () => foto(verzoek(`/api/fotos/inspectie/${item.id}?v=1`), { params: Promise.resolve({ pad: ['inspectie', String(item.id)] }) });
    await admin();
    expect((await haal()).status).toBe(200);
    await inloggenAls('kempen', 'kempen123');
    expect((await haal()).status).toBe(404);
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
