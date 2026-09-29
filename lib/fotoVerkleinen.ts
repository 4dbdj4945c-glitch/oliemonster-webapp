// Foto's verkleinen in de browser, vóór het versturen. Een iPhone-foto is al
// snel 3 tot 8 MB, en Monster nemen stuurt er twee in één verzoek; Vercel weigert
// alles boven 4,5 MB. Verkleind naar maximaal 2000 px lange zijde als JPEG 0,8
// is een foto rond 400 KB en nog prima leesbaar (typeplaatje, potje, peil).
//
// Alle uploads gebruiken deze ene helper: Monster nemen, pogingen, de fotokolom
// in de lijst en Niet bereikbaar. Lukt verkleinen niet (oude browser, vreemd
// formaat), dan gaat het origineel mee en zegt de server of het te groot is.

export const FOTO_MAX_ZIJDE = 2000;
export const FOTO_KWALITEIT = 0.8;
/** Kleiner dan dit en al JPEG binnen de maat: niet opnieuw comprimeren. */
const AL_KLEIN_GENOEG = 500 * 1024;

async function laadBeeld(bestand: File): Promise<{ bron: CanvasImageSource; breedte: number; hoogte: number; sluit: () => void }> {
  // createImageBitmap draait de foto volgens de EXIF-oriëntatie, zodat een
  // staande foto niet op zijn kant in de portal komt.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(bestand, { imageOrientation: 'from-image' });
      return { bron: bitmap, breedte: bitmap.width, hoogte: bitmap.height, sluit: () => bitmap.close() };
    } catch {
      // val terug op een <img>
    }
  }
  const url = URL.createObjectURL(bestand);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return { bron: img, breedte: img.naturalWidth, hoogte: img.naturalHeight, sluit: () => URL.revokeObjectURL(url) };
}

function naarBlob(canvas: HTMLCanvasElement, kwaliteit: number): Promise<Blob | null> {
  return new Promise((klaar) => canvas.toBlob(klaar, 'image/jpeg', kwaliteit));
}

/** Geeft een verkleinde JPEG terug, of het origineel als verkleinen niet kan of niet nodig is. */
export async function verkleinFoto(bestand: File): Promise<File> {
  if (typeof window === 'undefined' || !bestand.type.startsWith('image/')) return bestand;

  let beeld;
  try {
    beeld = await laadBeeld(bestand);
  } catch {
    return bestand;
  }

  try {
    const lang = Math.max(beeld.breedte, beeld.hoogte);
    if (!lang) return bestand;
    if (lang <= FOTO_MAX_ZIJDE && bestand.type === 'image/jpeg' && bestand.size <= AL_KLEIN_GENOEG) {
      return bestand;
    }
    const schaal = Math.min(1, FOTO_MAX_ZIJDE / lang);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(beeld.breedte * schaal);
    canvas.height = Math.round(beeld.hoogte * schaal);
    const ctx = canvas.getContext('2d');
    if (!ctx) return bestand;
    // Witte ondergrond, anders wordt een doorzichtige PNG zwart als JPEG.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(beeld.bron, 0, 0, canvas.width, canvas.height);

    let blob = await naarBlob(canvas, FOTO_KWALITEIT);
    // Heel gedetailleerde foto nog steeds groot: één stap zachter.
    if (blob && blob.size > 900 * 1024) blob = (await naarBlob(canvas, 0.7)) ?? blob;
    if (!blob || blob.size >= bestand.size) return bestand;

    const naam = (bestand.name.replace(/\.[^.]+$/, '') || 'foto') + '.jpg';
    return new File([blob], naam, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return bestand;
  } finally {
    beeld.sluit();
  }
}
