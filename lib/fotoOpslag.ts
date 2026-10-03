// Foto's in Vercel Blob: opslaan onder een onvindbare naam en opruimen als
// niemand er meer naar verwijst.
//
// - bewaarFoto: `put` onder fotos/<32 willekeurige hextekens>.<ext>, plus het
//   willekeurige achtervoegsel van Blob. In de naam staat niets meer over het
//   monster (vroeger sample-12-potje-...). Private opslag (`access: 'private'`)
//   kent @vercel/blob 2.0 nog niet, dus is de foto technisch openbaar, maar het
//   adres is niet te raden en komt nooit bij de browser: de schermen tonen
//   foto's via /api/fotos/... (lib/fotoAdres.ts), die eerst de toegang
//   controleert (fase 3).
// - ruimFotoOpAls: na het vervangen of verwijderen van een foto. Een adres wordt
//   alleen gewist (`del`) als geen enkel monster, geen poging, geen installatie,
//   geen bevinding of foto van een inspectie, geen foto van een dagrapport en geen document uit het eigen dossier
//   er nog naar wijst, ook niet in de prullenbak. De cachevelden op OilSample
//   bevatten dezelfde adressen als de pogingen; daarom deze controle, en niet
//   blind wissen.
//
// Bestaande adressen blijven gewoon werken: er wordt niets hernoemd; ze gaan
// ook via /api/fotos/... naar de browser.

import { randomBytes } from 'node:crypto';
import { del, put } from '@vercel/blob';
import { prisma } from './prisma';

/** De opslagnaam: alleen de extensie van `naam` blijft over, de rest is willekeurig. */
export function onvindbareNaam(naam: string): string {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(naam)?.[1]?.toLowerCase() ?? 'jpg';
  return `fotos/${randomBytes(16).toString('hex')}.${ext}`;
}

/** Slaat een foto op en geeft het opslagadres terug (dat alleen de server gebruikt). */
export async function bewaarFoto(naam: string, bestand: File): Promise<string> {
  const blob = await put(onvindbareNaam(naam), bestand, { access: 'public', addRandomSuffix: true });
  return blob.url;
}

/**
 * Slaat een document (PDF of scan) uit het eigen dossier op, net als een foto
 * onder een onvindbare naam: documenten/<32 hex>.<ext>.
 */
export async function bewaarDocument(extensie: string, bestand: File): Promise<string> {
  const naam = `documenten/${randomBytes(16).toString('hex')}.${extensie}`;
  const blob = await put(naam, bestand, { access: 'public', addRandomSuffix: true, contentType: bestand.type });
  return blob.url;
}

/** Hoort dit adres bij onze Blob-opslag? Andere adressen raken we nooit aan. */
export function isBlobAdres(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

/** Hoe vaak wordt dit adres nog gebruikt, over alle tabellen met foto's. */
export async function aantalVerwijzingen(url: string): Promise<number> {
  const [monsters, pogingen, installaties, klanten, bevindingen, inspectieFotos, documenten, dagrapportFotos] = await Promise.all([
    prisma.oilSample.count({
      where: { OR: [{ photoUrl: url }, { partPhotoUrl: url }, { unreachablePhotoUrl: url }] },
    }),
    prisma.sampleAttempt.count({ where: { OR: [{ photoUrl: url }, { partPhotoUrl: url }] } }),
    prisma.installatie.count({ where: { fotoUrl: url } }),
    prisma.klant.count({ where: { logoUrl: url } }),
    prisma.inspectieItem.count({ where: { fotoUrl: url } }),
    prisma.inspectieFoto.count({ where: { url } }),
    prisma.eigenDocument.count({ where: { bestandUrl: url } }),
    prisma.dagrapportFoto.count({ where: { url } }),
  ]);
  return monsters + pogingen + installaties + klanten + bevindingen + inspectieFotos + documenten + dagrapportFotos;
}

/**
 * Wist de foto's die nergens meer gebruikt worden. Roep dit aan NA het bijwerken
 * van de database. Mislukt het wissen, dan blijft het bestand staan en gaat het
 * verzoek gewoon door: een wees in de opslag is geen reden om te falen.
 */
export async function ruimFotoOpAls(...urls: (string | null | undefined)[]): Promise<string[]> {
  const gewist: string[] = [];
  for (const url of new Set(urls.filter((u): u is string => !!u))) {
    if (!isBlobAdres(url)) continue;
    try {
      if ((await aantalVerwijzingen(url)) > 0) continue;
      await del(url);
      gewist.push(url);
    } catch (error) {
      console.error('Foto niet opgeruimd:', url, error);
    }
  }
  return gewist;
}

/**
 * Een fotoadres dat een scherm terugstuurt, mag nooit een adres van de eigen
 * fotoroute zijn: dan zou er een verwijzing naar een verwijzing in de database
 * komen. Voor zod: .refine(geenFotoRoute).
 */
export function geenFotoRoute(url: string | null | undefined): boolean {
  return !url || !url.startsWith('/api/fotos/');
}
