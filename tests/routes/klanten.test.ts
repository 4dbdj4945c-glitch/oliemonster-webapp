// Klanten, contactpersonen, installaties en Wordt klant.
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as klanten, POST as nieuweKlant } from '@/app/api/klanten/route';
import { GET as klant, PUT as wijzigKlant, DELETE as verwijderKlant } from '@/app/api/klanten/[id]/route';
import { POST as herstelKlant } from '@/app/api/klanten/[id]/herstellen/route';
import { POST as nieuwContact } from '@/app/api/klanten/[id]/contactpersonen/route';
import { DELETE as verwijderContact } from '@/app/api/contactpersonen/[id]/route';
import { POST as herstelContact } from '@/app/api/contactpersonen/[id]/herstellen/route';
import { GET as installaties, POST as nieuweInstallatie } from '@/app/api/installaties/route';
import { GET as installatie, DELETE as verwijderInstallatie } from '@/app/api/installaties/[id]/route';
import { POST as wordtKlant } from '@/app/api/prospects/[id]/wordt-klant/route';
import { CODE_TEKENS } from '@/lib/installaties';
import { metParams, uitloggen, verzoek } from '../hulp/verzoek';

let ids: Awaited<ReturnType<typeof vulMetNepdata>>;

async function als(username: string, password: string) {
  uitloggen();
  expect((await login(verzoek('/api/auth/login', { body: { username, password } }))).status).toBe(200);
}

beforeEach(async () => {
  ids = await vulMetNepdata(prisma);
  await als('admin', 'admin123');
});

describe('toegang', () => {
  it('alleen een admin; gebruiker en kijker krijgen 403', async () => {
    for (const [u, p] of [['gebruiker', 'user123'], ['kijker', 'kijker123']]) {
      await als(u, p);
      expect((await klanten(verzoek('/api/klanten'), undefined)).status).toBe(403);
      expect((await installaties(verzoek('/api/installaties'), undefined)).status).toBe(403);
      expect((await nieuweKlant(verzoek('/api/klanten', { body: { naam: 'X' } }), undefined)).status).toBe(403);
    }
  });
});

describe('klanten', () => {
  it('lijst met tellingen; detail met contactpersonen, objecten, installaties en kijkers', async () => {
    const lijst = await (await klanten(verzoek('/api/klanten'), undefined)).json();
    const mourik = lijst.find((k: { naam: string }) => k.naam === 'Mourik Infra B.V.');
    expect(mourik).toMatchObject({ aantalContactpersonen: 2, aantalObjecten: 6, aantalInstallaties: 2 });

    const id = String(ids.klanten.mourik);
    const detail = await (await klant(verzoek(`/api/klanten/${id}`), metParams({ id }))).json();
    expect(detail.contactpersonen).toHaveLength(2);
    expect(detail.objecten.find((o: { name: string }) => o.name === 'Sluis Grave').installaties).toHaveLength(2);
    expect(detail.gebruikers.map((g: { username: string }) => g.username)).toEqual(['kijker']);
  });

  it('aanmaken, bijwerken en dubbele namen', async () => {
    const res = await nieuweKlant(verzoek('/api/klanten', { body: { naam: 'Nieuwe BV', kvkNummer: '1234 5678', plaats: 'Eindhoven' } }), undefined);
    expect(res.status).toBe(201);
    const k = await res.json();
    const dubbel = await nieuweKlant(verzoek('/api/klanten', { body: { naam: 'nieuwe bv' } }), undefined);
    expect(dubbel.status).toBe(400);
    const kvk = await nieuweKlant(verzoek('/api/klanten', { body: { naam: 'Y', kvkNummer: '12' } }), undefined);
    expect((await kvk.json()).error).toBe('Een KvK-nummer heeft 8 cijfers');
    const put = await wijzigKlant(verzoek(`/api/klanten/${k.id}`, { method: 'PUT', body: { notities: 'Belt liever dan mailt' } }), metParams({ id: String(k.id) }));
    expect((await put.json())).toMatchObject({ naam: 'Nieuwe BV', notities: 'Belt liever dan mailt', plaats: 'Eindhoven' });
  });

  it('verwijderen is zacht, vraagt de naam en weigert zolang er objecten of kijkers aan hangen', async () => {
    const mourik = String(ids.klanten.mourik);
    const bezet = await verwijderKlant(verzoek(`/api/klanten/${mourik}`, { method: 'DELETE', body: { bevestigNaam: 'Mourik Infra B.V.' } }), metParams({ id: mourik }));
    expect(bezet.status).toBe(400);
    expect((await bezet.json()).error).toMatch(/6 objecten en 1 gebruiker/);

    const k = await (await nieuweKlant(verzoek('/api/klanten', { body: { naam: 'Weg BV' } }), undefined)).json();
    const id = String(k.id);
    const zonderNaam = await verwijderKlant(verzoek(`/api/klanten/${id}`, { method: 'DELETE', body: {} }), metParams({ id }));
    expect(zonderNaam.status).toBe(400);
    const weg = await verwijderKlant(verzoek(`/api/klanten/${id}`, { method: 'DELETE', body: { bevestigNaam: 'weg bv' } }), metParams({ id }));
    expect(weg.status).toBe(200);
    expect((await prisma.klant.findUniqueOrThrow({ where: { id: k.id } })).deletedAt).not.toBeNull();
    expect((await klant(verzoek(`/api/klanten/${id}`), metParams({ id }))).status).toBe(404);
    expect((await herstelKlant(verzoek(`/api/klanten/${id}/herstellen`, { body: {} }), metParams({ id }))).status).toBe(200);
    expect((await klant(verzoek(`/api/klanten/${id}`), metParams({ id }))).status).toBe(200);
  });

  it('contactpersoon toevoegen, weghalen en terugzetten', async () => {
    const id = String(ids.klanten.tweede);
    const fout = await nieuwContact(verzoek(`/api/klanten/${id}/contactpersonen`, { body: { naam: 'A', email: 'geen-mail' } }), metParams({ id }));
    expect((await fout.json()).error).toBe('Dit e-mailadres klopt niet');
    const p = await (await nieuwContact(verzoek(`/api/klanten/${id}/contactpersonen`, { body: { naam: 'Anna', email: 'anna@example.com' } }), metParams({ id }))).json();
    const pid = String(p.id);
    expect((await verwijderContact(verzoek(`/api/contactpersonen/${pid}`, { method: 'DELETE' }), metParams({ id: pid }))).status).toBe(200);
    let detail = await (await klant(verzoek(`/api/klanten/${id}`), metParams({ id }))).json();
    expect(detail.contactpersonen.map((c: { naam: string }) => c.naam)).not.toContain('Anna');
    await herstelContact(verzoek(`/api/contactpersonen/${pid}/herstellen`, { body: {} }), metParams({ id: pid }));
    detail = await (await klant(verzoek(`/api/klanten/${id}`), metParams({ id }))).json();
    expect(detail.contactpersonen.map((c: { naam: string }) => c.naam)).toContain('Anna');
  });
});

describe('installaties', () => {
  it('krijgt een korte code en is te filteren op klant en object', async () => {
    const res = await nieuweInstallatie(
      verzoek('/api/installaties', { body: { objectId: ids.werkplaats, naam: 'Hydrauliek pers 2', soort: 'aggregaat', bouwjaar: '2018' } }),
      undefined
    );
    expect(res.status).toBe(201);
    const nieuw = await res.json();
    expect(nieuw.code).toMatch(new RegExp(`^[${CODE_TEKENS}]{6}$`));
    expect(nieuw.bouwjaar).toBe(2018);

    const vanKlant = await (await installaties(verzoek(`/api/installaties?klantId=${ids.klanten.tweede}`), undefined)).json();
    expect(vanKlant).toHaveLength(3);
    const vanObject = await (await installaties(verzoek(`/api/installaties?objectId=${ids.objecten[0]}`), undefined)).json();
    expect(vanObject.map((i: { code: string }) => i.code).sort()).toEqual(['GRV2AB', 'GRV3CD']);
  });

  it('controleert soort en bouwjaar', async () => {
    const res = await nieuweInstallatie(verzoek('/api/installaties', { body: { objectId: ids.werkplaats, naam: 'X', soort: 'raket', bouwjaar: '1800' } }), undefined);
    expect(res.status).toBe(400);
    const { velden } = await res.json();
    expect(velden.soort).toBe('Kies wat voor installatie het is');
    expect(velden.bouwjaar).toMatch(/bouwjaar/);
  });

  it('verwijderen vraagt de code; de monsters houden hun koppeling', async () => {
    const id = String(ids.installaties[0]);
    const detail = await (await installatie(verzoek(`/api/installaties/${id}`), metParams({ id }))).json();
    expect(detail.monsters.length).toBeGreaterThan(0);
    expect((await verwijderInstallatie(verzoek(`/api/installaties/${id}`, { method: 'DELETE', body: { bevestigCode: 'fout' } }), metParams({ id }))).status).toBe(400);
    expect((await verwijderInstallatie(verzoek(`/api/installaties/${id}`, { method: 'DELETE', body: { bevestigCode: 'grv2ab' } }), metParams({ id }))).status).toBe(200);
    expect(await prisma.oilSample.count({ where: { installatieId: ids.installaties[0] } })).toBeGreaterThan(0);
  });
});

describe('Wordt klant', () => {
  async function maakProspect(bedrijfsnaam: string) {
    return prisma.prospect.create({
      data: { bedrijfsnaam, plaats: 'Weert', contactpersoon: 'Sanne Smits', functie: 'Onderhoudsmanager', email: 'sanne@example.com', status: 'OFFERTE' },
    });
  }

  it('maakt een klant met contactpersoon en koppelt de prospect', async () => {
    const p = await maakProspect('Limburg Pompen BV');
    const res = await wordtKlant(verzoek(`/api/prospects/${p.id}/wordt-klant`, { body: {} }), metParams({ id: String(p.id) }));
    expect(res.status).toBe(201);
    const { klantId } = await res.json();
    const na = await prisma.prospect.findUniqueOrThrow({ where: { id: p.id } });
    expect(na).toMatchObject({ klantId, status: 'KLANT' });
    expect(na.klantSindsOp).not.toBeNull();
    const k = await prisma.klant.findUniqueOrThrow({ where: { id: klantId }, include: { contactpersonen: true } });
    expect(k).toMatchObject({ naam: 'Limburg Pompen BV', plaats: 'Weert' });
    expect(k.contactpersonen[0]).toMatchObject({ naam: 'Sanne Smits', functie: 'Onderhoudsmanager', email: 'sanne@example.com' });

    const nogmaals = await wordtKlant(verzoek(`/api/prospects/${p.id}/wordt-klant`, { body: {} }), metParams({ id: String(p.id) }));
    expect(nogmaals.status).toBe(400);
  });

  it('bij een bestaande klantnaam geen dubbele, wel koppelen', async () => {
    const p = await maakProspect('Kempen Metaalbewerking B.V.');
    const res = await wordtKlant(verzoek(`/api/prospects/${p.id}/wordt-klant`, { body: {} }), metParams({ id: String(p.id) }));
    expect(res.status).toBe(409);
    const { bestaandeKlant } = await res.json();
    expect(bestaandeKlant.id).toBe(ids.klanten.tweede);
    const koppel = await wordtKlant(verzoek(`/api/prospects/${p.id}/wordt-klant`, { body: { klantId: bestaandeKlant.id } }), metParams({ id: String(p.id) }));
    expect(koppel.status).toBe(200);
    expect(await prisma.klant.count({ where: { naam: 'Kempen Metaalbewerking B.V.' } })).toBe(1);
  });
});
