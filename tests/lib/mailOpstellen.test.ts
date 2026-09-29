import { describe, expect, it } from 'vitest';
import { mailOpstellenAdres, voornaam } from '@/lib/mailOpstellen';

const lees = (adres: string) => JSON.parse(decodeURIComponent(adres.split('#gegevens=')[1]));

describe('mailOpstellenAdres', () => {
  it('vult ontvanger, voornaam, hele naam en bedrijf in', () => {
    const adres = mailOpstellenAdres({ email: 'jan@example.com', naam: 'Jan de Vries', bedrijf: 'Mourik Infra B.V.' });
    expect(adres.startsWith('/email-editor.html#gegevens=')).toBe(true);
    expect(lees(adres)).toEqual({
      aan: 'jan@example.com',
      invul: { naam: 'Jan', contactpersoon: 'Jan de Vries', bedrijf: 'Mourik Infra B.V.' },
    });
  });
  it('laat weg wat er niet is', () => {
    expect(lees(mailOpstellenAdres({ bedrijf: 'Loonbedrijf Heezerveld' }))).toEqual({ invul: { bedrijf: 'Loonbedrijf Heezerveld' } });
    expect(voornaam('  Els  Janssen ')).toBe('Els');
  });
  it('een & of # in een naam breekt het adres niet', () => {
    expect(lees(mailOpstellenAdres({ bedrijf: 'Smit & Zn #2' })).invul.bedrijf).toBe('Smit & Zn #2');
  });
});
