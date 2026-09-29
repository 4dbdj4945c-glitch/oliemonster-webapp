// Klanten, contactpersonen en installaties: controles en invoer die de
// API-routes delen. Alleen op de server (gebruikt de database).

import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { prisma } from './prisma';
import { ApiFout, optioneelGetal, optioneleTekst, tekst } from './apiRoute';
import { INSTALLATIE_SOORT_WAARDEN, nieuweInstallatieCode } from './installaties';

/** Een klant waar iets aan gekoppeld wordt moet bestaan en niet verwijderd zijn. */
export async function controleerKlant(klantId: number | null | undefined) {
  if (klantId === undefined || klantId === null) return;
  const klant = await prisma.klant.findFirst({ where: { id: klantId, deletedAt: null }, select: { id: true } });
  if (!klant) throw new ApiFout(400, 'Onbekende klant');
}

const email = z
  .union([z.string(), z.null()])
  .optional()
  .transform((w) => (w === undefined ? undefined : w === null || w.trim() === '' ? null : w.trim()))
  .refine((w) => !w || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(w), { error: 'Dit e-mailadres klopt niet' });

const kvk = optioneleTekst(20).refine((w) => !w || /^\d{8}$/.test(w.replace(/\s/g, '')), {
  error: 'Een KvK-nummer heeft 8 cijfers',
});

const klantVelden = {
  naam: tekst('Geef de klant een naam', 200),
  adres: optioneleTekst(300),
  postcode: optioneleTekst(20),
  plaats: optioneleTekst(200),
  kvkNummer: kvk,
  notities: optioneleTekst(),
};

export const NieuweKlantSchema = z.object(klantVelden);
export const KlantWijzigingSchema = z.object({ ...klantVelden, naam: klantVelden.naam.optional() });

const contactVelden = {
  naam: tekst('Vul de naam van de contactpersoon in', 200),
  functie: optioneleTekst(200),
  email,
  telefoon: optioneleTekst(50),
};

export const NieuweContactpersoonSchema = z.object(contactVelden);
export const ContactpersoonWijzigingSchema = z.object({ ...contactVelden, naam: contactVelden.naam.optional() });

/** Twee actieve klanten met dezelfde naam zijn bijna altijd een vergissing. */
export async function controleerKlantnaam(naam: string, behalveId?: number) {
  const dubbel = await prisma.klant.findFirst({
    where: { naam: { equals: naam, mode: 'insensitive' }, deletedAt: null, ...(behalveId ? { id: { not: behalveId } } : {}) },
    select: { id: true },
  });
  if (dubbel) throw new ApiFout(400, `Er is al een klant met de naam ${naam}`, { bestaandeKlant: dubbel.id });
}

// ------------------------------------------------------------------
// Installaties
// ------------------------------------------------------------------


const installatieVelden = {
  objectId: z.coerce
    .number({ error: 'Kies het object waar de installatie staat' })
    .int({ error: 'Kies het object waar de installatie staat' })
    .positive({ error: 'Kies het object waar de installatie staat' }),
  naam: tekst('Geef de installatie een naam', 200),
  soort: z.enum(INSTALLATIE_SOORT_WAARDEN, { error: 'Kies wat voor installatie het is' }),
  merk: optioneleTekst(200),
  typenummer: optioneleTekst(200),
  bouwjaar: optioneelGetal('Vul een bouwjaar in tussen 1900 en 2100', 1900, 2100),
  serienummer: optioneleTekst(200),
  notities: optioneleTekst(),
};

export const NieuweInstallatieSchema = z.object(installatieVelden);
export const InstallatieWijzigingSchema = z.object({
  ...installatieVelden,
  objectId: installatieVelden.objectId.optional(),
  naam: installatieVelden.naam.optional(),
  soort: installatieVelden.soort.optional(),
});

/** Een nieuwe, nog niet gebruikte code voor de QR-sticker. */
export async function vrijeInstallatieCode(): Promise<string> {
  for (let poging = 0; poging < 20; poging++) {
    const code = nieuweInstallatieCode(randomInt);
    const bezet = await prisma.installatie.findUnique({ where: { code }, select: { id: true } });
    if (!bezet) return code;
  }
  throw new Error('Geen vrije installatiecode gevonden');
}
