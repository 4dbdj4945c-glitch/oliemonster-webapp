// Eenmalige links om een wachtwoord in te stellen, voor een nieuwe gebruiker en
// na een wachtwoordreset. De beheerder maakt de link in Instellingen, kopieert
// hem en verstuurt hem zelf. Wie de link opent, kiest een wachtwoord en is
// daarna ingelogd. Zonder link kan een account zonder wachtwoord niet meer
// inloggen: dat was het lek (iedereen die de gebruikersnaam kende, kwam binnen).
//
// In de database staat alleen de SHA-256 van het token. Een link is 72 uur
// geldig en werkt één keer; een nieuwe link maakt de oude ongeldig.
//
// De tabel Uitnodiging bestaat pas na ./db-push-fase0.sh. Tot die tijd geven
// deze functies een fout die tabelOntbreekt() herkent, en weigeren de routes
// netjes: geen link, dus ook geen manier om zonder wachtwoord binnen te komen.

import { createHash, randomBytes } from 'crypto';
import { prisma } from './prisma';

export const UITNODIGING_GELDIG_UREN = 72;

export const KOLOM_ONTBREEKT_FASE0 =
  'De tabel voor uitnodigingslinks staat nog niet in de database. Draai ./db-push-fase0.sh in de projectmap en probeer het opnieuw.';

export const LINK_ONGELDIG =
  'Deze link werkt niet meer: hij is al gebruikt, verlopen of vervangen door een nieuwere. Vraag de beheerder om een nieuwe link.';

function hashVan(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Maakt een nieuwe link voor deze gebruiker en maakt eerdere, nog niet gebruikte
 * links ongeldig. Geeft het token terug (alleen nu, daarna is het niet meer op
 * te vragen) en de vervaltijd.
 */
export async function maakUitnodiging(
  userId: number,
  gemaaktDoor: string | undefined
): Promise<{ token: string; verlooptOp: Date }> {
  const token = randomBytes(32).toString('base64url');
  const verlooptOp = new Date(Date.now() + UITNODIGING_GELDIG_UREN * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.uitnodiging.deleteMany({ where: { userId, gebruiktOp: null } }),
    prisma.uitnodiging.create({
      data: { userId, tokenHash: hashVan(token), verlooptOp, gemaaktDoor: gemaaktDoor ?? null },
    }),
  ]);
  return { token, verlooptOp };
}

/** De volledige link die de beheerder kopieert. */
export function linkVoor(origin: string, token: string): string {
  return `${origin}/set-password?token=${encodeURIComponent(token)}`;
}

/**
 * Zoekt de geldige uitnodiging bij dit token: bestaat, niet gebruikt, niet
 * verlopen. Anders null.
 */
export async function geldigeUitnodiging(token: unknown) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const uitnodiging = await prisma.uitnodiging.findUnique({
    where: { tokenHash: hashVan(token) },
    select: {
      id: true,
      verlooptOp: true,
      gebruiktOp: true,
      user: { select: { id: true, username: true, role: true } },
    },
  });
  if (!uitnodiging || uitnodiging.gebruiktOp || uitnodiging.verlooptOp.getTime() < Date.now()) {
    return null;
  }
  return uitnodiging;
}

/**
 * Markeert de uitnodiging als gebruikt, alleen als dat nog niet gebeurd was.
 * Geeft false als iemand anders hem net gebruikte (twee keer tegelijk openen).
 */
export async function gebruikUitnodiging(id: number): Promise<boolean> {
  const { count } = await prisma.uitnodiging.updateMany({
    where: { id, gebruiktOp: null, verlooptOp: { gt: new Date() } },
    data: { gebruiktOp: new Date() },
  });
  return count === 1;
}

/** De origin voor links: de host waarop de beheerder nu werkt. */
export function originVan(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  return `${proto}://${host}`;
}
