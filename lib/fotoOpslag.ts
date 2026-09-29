// Foto's in Vercel Blob: opslaan met een willekeurig achtervoegsel en opruimen
// als niemand er meer naar verwijst.
//
// - bewaarFoto: `put` met addRandomSuffix, zodat een bestandsnaam niet te raden
//   is en twee uploads in dezelfde milliseconde elkaar nooit overschrijven.
// - ruimFotoOpAls: na het vervangen of verwijderen van een foto. Een adres wordt
//   alleen gewist (`del`) als geen enkel monster, geen poging en geen installatie
//   er nog naar wijst, ook niet in de prullenbak. De cachevelden op OilSample
//   bevatten dezelfde adressen als de pogingen; daarom deze controle, en niet
//   blind wissen.
//
// Bestaande adressen blijven gewoon werken: er wordt niets hernoemd. Private
// opslag met afscherming per klant komt in fase 3.

import { del, put } from '@vercel/blob';
import { prisma } from './prisma';

/** Slaat een foto op en geeft het publieke adres terug. */
export async function bewaarFoto(naam: string, bestand: File): Promise<string> {
  const blob = await put(naam, bestand, { access: 'public', addRandomSuffix: true });
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
  const [monsters, pogingen, installaties] = await Promise.all([
    prisma.oilSample.count({
      where: { OR: [{ photoUrl: url }, { partPhotoUrl: url }, { unreachablePhotoUrl: url }] },
    }),
    prisma.sampleAttempt.count({ where: { OR: [{ photoUrl: url }, { partPhotoUrl: url }] } }),
    prisma.installatie.count({ where: { fotoUrl: url } }),
  ]);
  return monsters + pogingen + installaties;
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
