// Objecten op de API-helper: invoer met zod, koppeling aan een klant en
// installaties die meeverhuizen of verwijderen tegenhouden.
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as objecten, POST as nieuwObject } from '@/app/api/sample-objects/route';
import { PUT as wijzigObject, DELETE as verwijderObject } from '@/app/api/sample-objects/[id]/route';
import { POST as samenvoegen } from '@/app/api/sample-objects/[id]/samenvoegen/route';
import { metParams, uitloggen, verzoek } from '../hulp/verzoek';

let ids: Awaited<ReturnType<typeof vulMetNepdata>>;

beforeEach(async () => {
  ids = await vulMetNepdata(prisma);
  uitloggen();
  expect((await login(verzoek('/api/auth/login', { body: { username: 'admin', password: 'admin123' } }))).status).toBe(200);
});

describe('objecten', () => {
  it('controleert de invoer met duidelijke meldingen', async () => {
    const zonderNaam = await nieuwObject(verzoek('/api/sample-objects', { body: { name: '  ' } }), undefined);
    expect(zonderNaam.status).toBe(400);
    expect((await zonderNaam.json()).error).toBe('Geef het object een naam');
    const type = await nieuwObject(verzoek('/api/sample-objects', { body: { name: 'X', objectType: 'raket' } }), undefined);
    expect((await type.json()).error).toBe('Onbekend objecttype');
    const klant = await nieuwObject(verzoek('/api/sample-objects', { body: { name: 'X', klantId: 99999 } }), undefined);
    expect((await klant.json()).error).toBe('Onbekende klant');
  });

  it('een object kan aan een klant gekoppeld worden; de lijst noemt de klant', async () => {
    const res = await nieuwObject(
      verzoek('/api/sample-objects', { body: { name: 'Hal 3', objectType: 'overig', klantId: ids.klanten.tweede, estimatedMinutes: '45' } }),
      undefined
    );
    expect(res.status).toBe(201);
    const nieuw = await res.json();
    expect(nieuw).toMatchObject({ klantId: ids.klanten.tweede, estimatedMinutes: 45 });

    const put = await wijzigObject(
      verzoek(`/api/sample-objects/${nieuw.id}`, { method: 'PUT', body: { klantId: ids.klanten.mourik } }),
      metParams({ id: String(nieuw.id) })
    );
    expect(put.status).toBe(200);
    const lijst = await (await objecten(verzoek('/api/sample-objects'), undefined)).json();
    expect(lijst.find((o: { id: number }) => o.id === nieuw.id).klant.naam).toBe('Mourik Infra B.V.');
    // Alleen klantId meegestuurd: de rest bleef staan.
    expect(lijst.find((o: { id: number }) => o.id === nieuw.id).estimatedMinutes).toBe(45);
  });

  it('verwijderen weigert zolang er installaties op staan', async () => {
    const id = String(ids.werkplaats);
    const res = await verwijderObject(verzoek(`/api/sample-objects/${id}`, { method: 'DELETE' }), metParams({ id }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/installaties/);
  });

  it('samenvoegen neemt de installaties en hun monsters mee', async () => {
    const van = ids.objecten[0];
    const naar = ids.objecten[1];
    const res = await samenvoegen(
      verzoek(`/api/sample-objects/${van}/samenvoegen`, { body: { doelId: naar } }),
      metParams({ id: String(van) })
    );
    expect(res.status).toBe(200);
    const inst = await prisma.installatie.findUniqueOrThrow({ where: { id: ids.installaties[0] } });
    expect(inst.objectId).toBe(naar);
    const monster = await prisma.oilSample.findFirstOrThrow({ where: { installatieId: ids.installaties[0] } });
    expect(monster.objectId).toBe(naar);
    expect(await prisma.sampleObject.findUnique({ where: { id: van } })).toBeNull();
  });
});
