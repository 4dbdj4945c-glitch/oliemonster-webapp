/**
 * Eén manier om een mislukte fetch in een leesbare melding om te zetten.
 * De API's geven bij een fout `{ error: "..." }` terug (en bij een ontbrekende
 * tabel een 503 met uitleg); die tekst laten we onveranderd zien. Lukt dat niet,
 * dan valt hij terug op de meegegeven standaardtekst.
 */
export async function foutTekst(res: Response, standaard: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string' && data.error.trim()) return data.error;
  } catch {
    /* geen JSON in het antwoord */
  }
  if (res.status === 401) return 'Je sessie is verlopen. Log opnieuw in.';
  if (res.status === 403) return 'Je hebt geen rechten voor deze actie.';
  return `${standaard} (foutcode ${res.status})`;
}

/** Melding bij een fetch die helemaal niet aankwam (geen netwerk, geen bereik). */
export const GEEN_VERBINDING =
  'Geen verbinding met de server. Controleer je internetverbinding en probeer het opnieuw.';
