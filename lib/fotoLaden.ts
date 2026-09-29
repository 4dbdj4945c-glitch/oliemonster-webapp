// Een foto (of een document uit het eigen dossier) ophalen op de server, voor
// de fotoroute (/api/fotos/...), de rapporten en het inhuurdossier. Alleen op de server.
//
// - Een pad in /public (/mourik_logo.png, /nepdata/potje-1.jpg, oude /uploads/...):
//   van de schijf gelezen, nooit buiten public/. Op Vercel staat public/ niet
//   altijd naast de functie (het wordt los geserveerd); dan via de eigen origin.
// - Een adres in onze Vercel Blob-opslag: opgehaald met fetch.
// - Elk ander adres: niet opgehaald (geen verzoeken naar willekeurige sites
//   vanaf de server). De fotoroute stuurt de browser daar dan zelf heen.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isBlobAdres } from './fotoOpslag';

export interface GeladenBestand {
  bytes: Buffer;
  type: string;
}

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

/** Is dit een pad binnen de eigen portal (public/)? */
export function isLokaalPad(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//');
}

async function leesLokaal(url: string): Promise<GeladenBestand | null> {
  const publiek = path.join(process.cwd(), 'public');
  let pad: string;
  try {
    pad = path.normalize(path.join(publiek, decodeURIComponent(url.split('?')[0])));
  } catch {
    return null; // kapot pad (%-teken zonder code)
  }
  if (!pad.startsWith(publiek + path.sep)) return null;
  try {
    const bytes = await readFile(pad);
    return { bytes, type: TYPES[path.extname(pad).toLowerCase()] ?? 'application/octet-stream' };
  } catch {
    return null;
  }
}

/**
 * Haalt de foto op, of null als dat niet kan of mag. `origin` is de origin van
 * de portal zelf (uit het verzoek), voor een pad in public/ dat niet op de
 * schijf staat.
 */
export async function haalFoto(url: string | null | undefined, origin?: string): Promise<GeladenBestand | null> {
  if (!url) return null;
  if (isLokaalPad(url)) {
    const lokaal = await leesLokaal(url);
    if (lokaal || !origin) return lokaal;
    return haalOp(new URL(url, origin).toString());
  }
  if (!isBlobAdres(url)) return null;
  return haalOp(url);
}

async function haalOp(url: string): Promise<GeladenBestand | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return { bytes, type: res.headers.get('content-type') ?? 'image/jpeg' };
  } catch {
    return null;
  }
}
