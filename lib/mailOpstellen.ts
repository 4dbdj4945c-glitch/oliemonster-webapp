// Mail opstellen vanuit een klant of prospect: opent de e-mail editor
// (public/email-editor.html, bron Documents/Claude/email-templates/) met de
// ontvanger en de invulvelden al ingevuld. De editor leest dat uit de hash
// #gegevens=<JSON> (zie email-templates/KOPPELING.md), laadt de velden en wist
// de hash weer. Er gaat niets naar de server: de hash blijft in de browser.
//
// Invulvelden: naam (de voornaam, voor "Beste ..."), contactpersoon (de hele
// naam) en bedrijf (de klant- of bedrijfsnaam). Een sjabloon kies je daarna zelf.
//
// Geen server-imports: dit bestand draait in de browser.

export interface MailOntvanger {
  email?: string | null;
  naam?: string | null;
  bedrijf?: string | null;
}

/** De voornaam uit een volledige naam: "Jan de Vries" wordt "Jan". */
export function voornaam(naam: string | null | undefined): string {
  return (naam ?? '').trim().split(/\s+/)[0] ?? '';
}

export function mailOpstellenAdres(o: MailOntvanger): string {
  const invul: Record<string, string> = {};
  if (o.naam?.trim()) {
    invul.naam = voornaam(o.naam);
    invul.contactpersoon = o.naam.trim();
  }
  if (o.bedrijf?.trim()) invul.bedrijf = o.bedrijf.trim();
  const gegevens: { aan?: string; invul?: Record<string, string> } = {};
  if (o.email?.trim()) gegevens.aan = o.email.trim();
  if (Object.keys(invul).length) gegevens.invul = invul;
  return `/email-editor.html#gegevens=${encodeURIComponent(JSON.stringify(gegevens))}`;
}
