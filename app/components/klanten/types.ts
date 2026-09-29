// Types van de beheerschermen Klanten en Installaties.

export interface Klant {
  id: number;
  naam: string;
  adres: string | null;
  postcode: string | null;
  plaats: string | null;
  kvkNummer: string | null;
  notities: string | null;
}

export interface KlantInLijst extends Klant {
  aantalContactpersonen: number;
  aantalObjecten: number;
  aantalInstallaties: number;
}

export interface Contactpersoon {
  id: number;
  klantId: number;
  naam: string;
  functie: string | null;
  email: string | null;
  telefoon: string | null;
}

export interface InstallatieKort {
  id: number;
  code: string;
  naam: string;
  soort: string;
  merk: string | null;
  typenummer: string | null;
  bouwjaar: number | null;
}

export interface Installatie extends InstallatieKort {
  objectId: number;
  serienummer: string | null;
  fotoUrl: string | null;
  notities: string | null;
}

export interface KlantObject {
  id: number;
  name: string;
  objectType: string | null;
  region: string | null;
  address: string | null;
  aantalMonsters: number;
  installaties: InstallatieKort[];
}

export interface KlantDetail extends Klant {
  contactpersonen: Contactpersoon[];
  objecten: KlantObject[];
  gebruikers: { id: number; username: string; role: string; viewYear: number | null }[];
  prospect: { id: number; bedrijfsnaam: string; klantSindsOp: string | null } | null;
}

/** Een object zoals /api/sample-objects het geeft, voor keuzelijsten. */
export interface ObjectKeuze {
  id: number;
  name: string;
  klantId: number | null;
  klant: { id: number; naam: string } | null;
}

/** Tekst voor "type": merk, typenummer en bouwjaar achter elkaar. */
export function typeTekst(i: Pick<InstallatieKort, 'merk' | 'typenummer' | 'bouwjaar'>): string {
  return [i.merk, i.typenummer, i.bouwjaar ? `bouwjaar ${i.bouwjaar}` : null].filter(Boolean).join(', ');
}

/** Een adres op één regel: straat, postcode en plaats. */
export function adresTekst(k: Pick<Klant, 'adres' | 'postcode' | 'plaats'>): string {
  const plaats = [k.postcode, k.plaats].filter(Boolean).join(' ');
  return [k.adres, plaats].filter(Boolean).join(', ');
}
