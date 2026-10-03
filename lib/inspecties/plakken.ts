// Een lijst plakken in een inspectie: elke niet-lege regel wordt een bevinding.
// Kolommen gescheiden door | of een tab: titel | locatie | opmerking (locatie en
// opmerking mogen weg). Een rij uit een Markdown-tabel (| a | b |) mag ook; de
// koprij, de scheidingsregel daaronder (|---|---|) en een opsommingsteken vooraan vallen weg.
// Geen server-imports: het scherm toont hiermee vóór het opslaan een voorbeeld,
// de API controleert dezelfde regels nog eens (lib/inspecties/server.ts).

export const MAX_PLAK_REGELS = 200;
export const PLAK_MAX = { titel: 200, locatie: 300, notitie: 5000 } as const;

export interface PlakRegel {
  /** Regelnummer in het tekstvak, vanaf 1 */
  nr: number;
  titel: string;
  locatie: string | null;
  notitie: string | null;
}

export interface PlakFout {
  nr: number;
  tekst: string;
  melding: string;
}

export function leesPlakLijst(tekst: string): { regels: PlakRegel[]; fouten: PlakFout[] } {
  const regels: PlakRegel[] = [];
  const fouten: PlakFout[] = [];
  const alle = tekst.split(/\r?\n/);
  const isScheiding = (r: string) => /^\|?[\s:|-]+\|?$/.test(r) && r.includes('-');
  alle.forEach((ruw, index) => {
    const nr = index + 1;
    // Alleen spaties weghalen, geen tabs: een Excel-rij met een lege eerste cel begint met een tab.
    let regel = ruw.replace(/^ +| +$/g, '').replace(/\r$/, '');
    if (!regel.trim()) return;
    // Scheidingsregel van een Markdown-tabel, en de koprij erboven
    if (isScheiding(regel)) return;
    const volgende = alle.slice(index + 1).find((r) => r.trim() !== '');
    if (volgende !== undefined && isScheiding(volgende.trim())) return;
    regel = regel.replace(/^[-*•]\s+/, '');
    if (regel.startsWith('|')) regel = regel.slice(1);
    if (regel.endsWith('|')) regel = regel.slice(0, -1);
    const kolommen = regel.split(/\t|\|/).map((k) => k.trim());
    if (kolommen.length > 3) {
      fouten.push({ nr, tekst: ruw.trim(), melding: 'Te veel kolommen: gebruik titel | locatie | opmerking' });
      return;
    }
    const [titel = '', locatie = '', notitie = ''] = kolommen;
    if (!titel) {
      fouten.push({ nr, tekst: ruw.trim(), melding: 'De eerste kolom (titel) is leeg' });
      return;
    }
    if (titel.length > PLAK_MAX.titel || locatie.length > PLAK_MAX.locatie || notitie.length > PLAK_MAX.notitie) {
      fouten.push({ nr, tekst: ruw.trim(), melding: `Te lang: titel hoogstens ${PLAK_MAX.titel}, locatie ${PLAK_MAX.locatie} tekens` });
      return;
    }
    regels.push({ nr, titel, locatie: locatie || null, notitie: notitie || null });
  });
  if (regels.length > MAX_PLAK_REGELS) {
    fouten.push({ nr: regels[MAX_PLAK_REGELS].nr, tekst: '', melding: `Hoogstens ${MAX_PLAK_REGELS} regels in één keer` });
  }
  return { regels, fouten };
}
