// Controle op geüploade foto's, voor alle uploadroutes dezelfde. De browser
// verkleint foto's al (lib/fotoVerkleinen.ts), dus een foto hoort hier rond
// 400 KB binnen te komen. Wat groter is dan de grens of geen foto is, weigeren
// we met een melding die zegt wat er mis is.

/** Bovengrens per foto. Vercel weigert een verzoek boven 4,5 MB sowieso. */
export const FOTO_MAX_BYTES = 4 * 1024 * 1024;

const TOEGESTANE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/** null als de foto goed is, anders de melding voor de gebruiker. */
export function fotoFout(bestand: File): string | null {
  if (!TOEGESTANE_TYPES[bestand.type]) {
    return 'Dit bestand is geen foto. Kies een JPEG-, PNG-, WebP- of HEIC-foto.';
  }
  if (bestand.size > FOTO_MAX_BYTES) {
    const mb = (bestand.size / 1024 / 1024).toFixed(1).replace('.', ',');
    return `De foto is te groot (${mb} MB, maximaal 4 MB). Maak de foto opnieuw of kies een kleinere.`;
  }
  return null;
}

/** De extensie volgt het type, niet de bestandsnaam die de browser meestuurt. */
export function fotoExtensie(bestand: File): string {
  return TOEGESTANE_TYPES[bestand.type] ?? 'jpg';
}
