// Klanten en contactpersonen: controles en invoer die de API-routes delen.

import { z } from 'zod';
import { prisma } from './prisma';
import { ApiFout, optioneleTekst, tekst } from './apiRoute';

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
