// De offline wachtrij voor het veld: invoer die zonder verbinding is opgeslagen
// (Monster nemen, een nieuw lek of arbeidsmiddel in een inspectie), met de
// verkleinde foto's, lokaal in IndexedDB. Zodra er weer verbinding is, gaat hij
// vanzelf mee; handmatig opnieuw proberen kan ook.
//
// Geen dubbele verzending: elke invoer krijgt bij het opslaan een eigen sleutel
// die met elke poging meegaat (header Idempotentie-Sleutel). De server bewaart
// het antwoord onder die sleutel (lib/idempotentie.ts); komt dezelfde invoer
// nog eens binnen, dan gebeurt er niets dubbel. Daarom gaat ook een verzoek dat
// halverwege zijn verbinding verloor (de server kan het al verwerkt hebben)
// met dezelfde sleutel de wachtrij in.
//
// Dit bestand draait in de browser. De kern (verstuur, verwerk) krijgt de opslag
// en fetch mee, zodat de tests hem zonder browser kunnen draaien.

export const IDEMPOTENTIE_HEADER = 'Idempotentie-Sleutel';

export type InvoerSoort = 'monster-nemen' | 'inspectie-item';

export interface Bestand {
  veld: string;
  naam: string;
  blob: Blob;
  /** Alleen bij een foto van een bevinding: het bijschrift. */
  bijschrift?: string;
}

export interface Invoer {
  sleutel: string;
  soort: InvoerSoort;
  /** Wie de invoer deed: een andere gebruiker op dezelfde telefoon verstuurt hem niet. */
  gebruiker: string;
  /** Voor op het scherm: "O-2026-008 nemen", "Lek 204, INS-5" */
  titel: string;
  aangemaakt: number;
  /** Monster nemen */
  monsterId?: number;
  velden?: Record<string, string>;
  bestanden?: Bestand[];
  /** Nieuwe bevinding in een inspectie: eerst de gegevens, dan de foto's één voor één */
  inspectieId?: number;
  json?: unknown;
  /** Oude vorm (één foto), van voor meerdere foto's per bevinding. */
  foto?: Bestand | null;
  fotos?: Bestand[];
  /** Zoveel foto's staan al op de server. */
  fotosKlaar?: number;
  /** De bevinding staat al op de server (alleen de foto moest nog). */
  itemId?: number | null;
  status: 'wacht' | 'mislukt';
  pogingen: number;
  laatsteFout?: string | null;
  laatstePoging?: number | null;
}

export interface Opslag {
  alle(): Promise<Invoer[]>;
  zet(invoer: Invoer): Promise<void>;
  weg(sleutel: string): Promise<void>;
}

export type Uitkomst = { soort: 'klaar' } | { soort: 'later'; melding: string } | { soort: 'mislukt'; melding: string };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Na zoveel mislukte pogingen met een serverfout stopt het vanzelf opnieuw proberen. */
export const MAX_POGINGEN = 5;

export const GEEN_VERBINDING = 'Nog geen verbinding. Gaat vanzelf mee zodra er bereik is.';

export function nieuweSleutel(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Is dit een fout van het netwerk (geen verbinding, verbinding weg) en niet van de server? */
export function isNetwerkFout(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof DOMException && (e.name === 'NetworkError' || e.name === 'AbortError'));
}

async function melding(res: Response, standaard: string): Promise<string> {
  try {
    const data = await res.clone().json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    // geen JSON
  }
  return standaard;
}

/** Wat een antwoord betekent voor de wachtrij. */
async function beoordeel(res: Response, standaard: string, pogingen: number): Promise<Uitkomst | null> {
  if (res.ok) return null;
  if (res.status === 401) return { soort: 'later', melding: 'Je bent uitgelogd. Log opnieuw in, dan gaat het mee.' };
  if (res.status === 409) {
    const data = await res.clone().json().catch(() => null);
    if (data?.bezig) return { soort: 'later', melding: 'Wordt al verwerkt.' };
  }
  if (res.status === 408 || res.status === 429 || res.status >= 500) {
    const tekst = await melding(res, standaard);
    return pogingen + 1 >= MAX_POGINGEN ? { soort: 'mislukt', melding: tekst } : { soort: 'later', melding: tekst };
  }
  return { soort: 'mislukt', melding: await melding(res, standaard) };
}

function formulier(velden: Record<string, string> = {}, bestanden: Bestand[] = []): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(velden)) form.append(k, v);
  for (const b of bestanden) form.append(b.veld, new File([b.blob], b.naam, { type: b.blob.type || 'image/jpeg' }));
  return form;
}

/**
 * Verstuurt één invoer. Geeft de uitkomst terug en de invoer zoals hij nu is
 * (bij een bevinding kan de bevinding al op de server staan terwijl de foto nog moet).
 */
export async function verstuur(invoer: Invoer, doeFetch: Fetch = (u, i) => fetch(u, i)): Promise<{ uitkomst: Uitkomst; invoer: Invoer }> {
  const kop = { [IDEMPOTENTIE_HEADER]: invoer.sleutel };
  // Wat er al gelukt is (de bevinding staat op de server), ook als daarna de verbinding wegvalt.
  let nu = invoer;
  try {
    if (invoer.soort === 'monster-nemen') {
      const res = await doeFetch(`/api/samples/${invoer.monsterId}/nemen`, {
        method: 'POST',
        headers: kop,
        body: formulier(invoer.velden, invoer.bestanden),
      });
      const fout = await beoordeel(res, 'Het monster is niet opgeslagen.', invoer.pogingen);
      return { uitkomst: fout ?? { soort: 'klaar' }, invoer };
    }

    if (!nu.itemId) {
      const res = await doeFetch(`/api/inspecties/${nu.inspectieId}/items`, {
        method: 'POST',
        headers: { ...kop, 'Content-Type': 'application/json' },
        body: JSON.stringify(nu.json ?? {}),
      });
      const fout = await beoordeel(res, 'De bevinding is niet opgeslagen.', nu.pogingen);
      if (fout) return { uitkomst: fout, invoer: nu };
      const data = await res.json().catch(() => null);
      nu = { ...nu, itemId: typeof data?.itemId === 'number' ? data.itemId : null };
      if (!nu.itemId) return { uitkomst: { soort: 'mislukt', melding: 'De server gaf geen bevinding terug.' }, invoer: nu };
    }
    // Elke foto met een eigen sleutel, zodat een herhaling hem niet dubbel toevoegt.
    const fotos = nu.fotos ?? (nu.foto ? [nu.foto] : []);
    for (let n = nu.fotosKlaar ?? 0; n < fotos.length; n++) {
      const res = await doeFetch(`/api/inspectie-items/${nu.itemId}/fotos`, {
        method: 'POST',
        headers: { [IDEMPOTENTIE_HEADER]: `${invoer.sleutel}-f${n}` },
        body: formulier(fotos[n].bijschrift ? { bijschrift: fotos[n].bijschrift! } : {}, [{ ...fotos[n], veld: 'photo' }]),
      });
      const fout = await beoordeel(res, fotos.length > 1 ? `Foto ${n + 1} van ${fotos.length} is niet opgeslagen.` : 'De foto is niet opgeslagen.', nu.pogingen);
      if (fout) return { uitkomst: fout, invoer: nu };
      nu = { ...nu, fotosKlaar: n + 1 };
    }
    return { uitkomst: { soort: 'klaar' }, invoer: nu };
  } catch (e) {
    if (isNetwerkFout(e)) return { uitkomst: { soort: 'later', melding: GEEN_VERBINDING }, invoer: nu };
    return { uitkomst: { soort: 'later', melding: e instanceof Error ? e.message : String(e) }, invoer: nu };
  }
}

export interface Verwerkt {
  verstuurd: number;
  wacht: number;
  mislukt: number;
}

/**
 * Loopt de wachtrij van deze gebruiker af, oudste eerst. Met `ookMislukt`
 * (de knop Opnieuw proberen) ook wat eerder definitief mislukte. Stopt bij de
 * eerste netwerkfout: zonder verbinding heeft de rest ook geen zin.
 */
export async function verwerk(opslag: Opslag, gebruiker: string, opties: { ookMislukt?: boolean; doeFetch?: Fetch; nu?: () => number } = {}): Promise<Verwerkt> {
  const nu = opties.nu ?? Date.now;
  const lijst = (await opslag.alle()).filter((i) => i.gebruiker === gebruiker).sort((a, b) => a.aangemaakt - b.aangemaakt);
  let verstuurd = 0;
  let geenVerbinding = false;
  for (const i of lijst) {
    if (geenVerbinding) break;
    if (i.status === 'mislukt' && !opties.ookMislukt) continue;
    const { uitkomst, invoer } = await verstuur(i.status === 'mislukt' ? { ...i, status: 'wacht', pogingen: 0 } : i, opties.doeFetch);
    if (uitkomst.soort === 'klaar') {
      await opslag.weg(i.sleutel);
      verstuurd += 1;
      continue;
    }
    geenVerbinding = uitkomst.soort === 'later' && uitkomst.melding === GEEN_VERBINDING;
    await opslag.zet({
      ...invoer,
      status: uitkomst.soort === 'mislukt' ? 'mislukt' : 'wacht',
      pogingen: geenVerbinding ? invoer.pogingen : invoer.pogingen + 1,
      laatsteFout: uitkomst.melding,
      laatstePoging: nu(),
    });
  }
  const over = (await opslag.alle()).filter((i) => i.gebruiker === gebruiker);
  return { verstuurd, wacht: over.filter((i) => i.status === 'wacht').length, mislukt: over.filter((i) => i.status === 'mislukt').length };
}

// ------------------------------------------------------------------
// De opslag in de browser (IndexedDB)
// ------------------------------------------------------------------

const DB = 'ids-wachtrij';
const STORE = 'invoer';
export const WACHTRIJ_EVENT = 'ids-wachtrij';

function openDb(): Promise<IDBDatabase> {
  return new Promise((klaar, fout) => {
    const verzoek = indexedDB.open(DB, 1);
    verzoek.onupgradeneeded = () => {
      if (!verzoek.result.objectStoreNames.contains(STORE)) verzoek.result.createObjectStore(STORE, { keyPath: 'sleutel' });
    };
    verzoek.onsuccess = () => klaar(verzoek.result);
    verzoek.onerror = () => fout(verzoek.error);
  });
}

function doe<T>(modus: IDBTransactionMode, werk: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((klaar, fout) => {
        const tx = db.transaction(STORE, modus);
        const r = werk(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          klaar(r.result);
        };
        tx.onerror = () => {
          db.close();
          fout(tx.error);
        };
      })
  );
}

/** Andere tabbladen en de balk laten weten dat de wachtrij veranderde. */
function meld() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WACHTRIJ_EVENT));
  try {
    const kanaal = new BroadcastChannel(WACHTRIJ_EVENT);
    kanaal.postMessage('veranderd');
    kanaal.close();
  } catch {
    // oude browser: alleen dit tabblad
  }
}

export const browserOpslag: Opslag = {
  async alle() {
    if (typeof indexedDB === 'undefined') return [];
    return doe<Invoer[]>('readonly', (s) => s.getAll() as IDBRequest<Invoer[]>);
  },
  async zet(invoer) {
    await doe('readwrite', (s) => s.put(invoer));
    meld();
  },
  async weg(sleutel) {
    await doe('readwrite', (s) => s.delete(sleutel));
    meld();
  },
};

/** Bij uitloggen: de wachtrij van deze gebruiker (met de foto's) van de telefoon af. */
export async function wisWachtrij(gebruiker: string): Promise<void> {
  try {
    for (const i of await browserOpslag.alle()) if (i.gebruiker === gebruiker) await browserOpslag.weg(i.sleutel);
  } catch {
    // niets te wissen
  }
}

/** Zet een invoer in de wachtrij van de browser. */
export async function inWachtrij(invoer: Omit<Invoer, 'status' | 'pogingen' | 'aangemaakt'> & { aangemaakt?: number }): Promise<void> {
  await browserOpslag.zet({ ...invoer, aangemaakt: invoer.aangemaakt ?? Date.now(), status: 'wacht', pogingen: 0, laatsteFout: null, laatstePoging: null });
}

// Eén verwerking tegelijk in dit tabblad (en, waar de browser het kent, over tabbladen heen).
let loopt: Promise<Verwerkt> | null = null;

export function verwerkInBrowser(gebruiker: string, ookMislukt = false): Promise<Verwerkt> {
  if (loopt) return loopt;
  const werk = () => verwerk(browserOpslag, gebruiker, { ookMislukt });
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  const bezig: Promise<Verwerkt> = (locks ? (locks.request('ids-wachtrij', werk) as unknown as Promise<Verwerkt>) : werk()).finally(() => {
    loopt = null;
  });
  loopt = bezig;
  return bezig;
}
