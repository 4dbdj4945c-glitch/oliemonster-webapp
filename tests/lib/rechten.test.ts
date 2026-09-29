import { describe, expect, it } from 'vitest';
import { effectiefKijkjaar, toegangsBesluit, type Gebruiker, type ToegangsOpties } from '@/lib/toegang';
import { leesViewYear, magJaarZien } from '@/lib/roles';
import { kijkersPagina, paginaBesluit, paginaVoorKijkjaar } from '@/lib/paginaToegang';

const maak = (role: string, viewYear: number | null = null, requiresPasswordChange = false): Gebruiker => ({
  userId: 1,
  username: role,
  role,
  viewYear: effectiefKijkjaar(role, viewYear),
  klantId: null,
  portaalWeergave: 'klassiek',
  requiresPasswordChange,
});

const admin = maak('admin');
const gebruiker = maak('user');
const kijker2025 = maak('alleen_lezen', 2025);
const kijkerAlles = maak('alleen_lezen', null);
const oudeKijker = maak('viewer_oil2025', null);

const lezenOlie: ToegangsOpties = { rol: 'alleen_lezen', module: 'oliemonsters' };
const gebruikerOlie: ToegangsOpties = { rol: 'user', module: 'oliemonsters' };
const adminOlie: ToegangsOpties = { rol: 'admin', module: 'oliemonsters' };
const lezenAcquisitie: ToegangsOpties = { rol: 'user', module: 'acquisitie' };

describe('toegangsBesluit (API)', () => {
  it('niet ingelogd: 401', () => {
    expect(toegangsBesluit(null, lezenOlie)?.status).toBe(401);
  });
  it('eerst wachtwoord instellen: 403 met requiresPasswordChange, ook voor een admin', () => {
    const b = toegangsBesluit(maak('admin', null, true), lezenOlie);
    expect(b?.status).toBe(403);
    expect(b?.body.requiresPasswordChange).toBe(true);
  });
  it('admin mag alles', () => {
    for (const o of [lezenOlie, gebruikerOlie, adminOlie, lezenAcquisitie]) {
      expect(toegangsBesluit(admin, o)).toBeNull();
    }
  });
  it('gebruiker mag lezen maar niet wijzigen', () => {
    expect(toegangsBesluit(gebruiker, lezenAcquisitie)).toBeNull();
    const b = toegangsBesluit(gebruiker, adminOlie);
    expect(b?.status).toBe(403);
    expect(b?.body.error).toBe('Alleen admins kunnen dit wijzigen');
  });
  it('eigen melding bij een admin-actie', () => {
    const b = toegangsBesluit(gebruiker, { rol: 'admin', module: 'ultimo', adminMelding: 'Alleen admins kunnen taken toevoegen' });
    expect(b?.body.error).toBe('Alleen admins kunnen taken toevoegen');
  });
  it('kijker mag alleen lezen in de oliemonstermodule', () => {
    expect(toegangsBesluit(kijker2025, lezenOlie)).toBeNull();
    expect(toegangsBesluit(kijker2025, gebruikerOlie)?.status).toBe(403);
    expect(toegangsBesluit(kijker2025, adminOlie)?.status).toBe(403);
    expect(toegangsBesluit(kijker2025, lezenAcquisitie)?.status).toBe(403);
    expect(toegangsBesluit(kijker2025, { rol: 'alleen_lezen', module: 'planning' })?.status).toBe(403);
  });
  it('de oude kijkersrol telt als alleen lezen', () => {
    expect(toegangsBesluit(oudeKijker, lezenOlie)).toBeNull();
    expect(toegangsBesluit(oudeKijker, adminOlie)?.status).toBe(403);
  });
});

describe('effectiefKijkjaar', () => {
  it('alleen de rol alleen lezen is beperkt', () => {
    expect(effectiefKijkjaar('admin', 2025)).toBeNull();
    expect(effectiefKijkjaar('user', 2025)).toBeNull();
    expect(effectiefKijkjaar('alleen_lezen', 2025)).toBe(2025);
    expect(effectiefKijkjaar('alleen_lezen', null)).toBeNull();
  });
  it('de oude kijkersrol hoort bij 2025, ook zonder viewYear', () => {
    expect(effectiefKijkjaar('viewer_oil2025', null)).toBe(2025);
    expect(effectiefKijkjaar('viewer_oil2025', undefined)).toBe(2025);
  });
});

describe('rollen en jaren', () => {
  it('magJaarZien', () => {
    expect(magJaarZien('alleen_lezen', 2025, 2025)).toBe(true);
    expect(magJaarZien('alleen_lezen', 2025, 2026)).toBe(false);
    expect(magJaarZien('alleen_lezen', null, 2026)).toBe(true);
    expect(magJaarZien('admin', 2025, 2026)).toBe(true);
  });
  it('kijkersPagina en paginaVoorKijkjaar: elk jaar heeft een pagina', () => {
    expect(paginaVoorKijkjaar(2025)).toBe('/dashboard/oliemonsters/2025');
    expect(paginaVoorKijkjaar(2027)).toBe('/dashboard/oliemonsters/2027');
    expect(kijkersPagina(2025)).toBe('/dashboard/oliemonsters/2025');
    expect(kijkersPagina(null)).toBe('/dashboard');
  });
  it('leesViewYear', () => {
    expect(leesViewYear('2025', 'alleen_lezen')).toEqual({ viewYear: 2025 });
    expect(leesViewYear('', 'alleen_lezen')).toEqual({ viewYear: null });
    expect(leesViewYear(2025, 'admin')).toEqual({ viewYear: null });
    expect(leesViewYear('1999', 'alleen_lezen')).toHaveProperty('fout');
    expect(leesViewYear('abc', 'alleen_lezen')).toHaveProperty('fout');
  });
});

describe('paginaBesluit (dashboard)', () => {
  it('niet ingelogd naar login, eerst wachtwoord naar set-password', () => {
    expect(paginaBesluit(null, '/dashboard')).toBe('/login');
    expect(paginaBesluit(maak('user', null, true), '/dashboard')).toBe('/set-password');
  });
  it('kijker 2025 alleen op zijn eigen jaarpagina', () => {
    expect(paginaBesluit(kijker2025, '/dashboard/oliemonsters/2025')).toBeNull();
    expect(paginaBesluit(kijker2025, '/dashboard/oliemonsters/2025/')).toBeNull();
    for (const pad of [
      '/dashboard',
      '/dashboard/oliemonsters',
      '/dashboard/oliemonsters2026',
      '/dashboard/oliemonsters/2026',
      '/dashboard/acquisitie',
      '/dashboard/admin',
      '/dashboard/klanten',
      '/dashboard/objecten/koppelen',
    ]) {
      expect(paginaBesluit(kijker2025, pad)).toBe('/dashboard/oliemonsters/2025');
    }
  });
  it('de oude kijkersrol gedraagt zich als kijker 2025', () => {
    expect(paginaBesluit(oudeKijker, '/dashboard/oliemonsters/2025')).toBeNull();
    expect(paginaBesluit(oudeKijker, '/dashboard')).toBe('/dashboard/oliemonsters/2025');
  });
  it('kijker zonder jaar: dashboard en elk jaar, verder niets', () => {
    expect(paginaBesluit(kijkerAlles, '/dashboard')).toBeNull();
    expect(paginaBesluit(kijkerAlles, '/dashboard/oliemonsters/2025')).toBeNull();
    expect(paginaBesluit(kijkerAlles, '/dashboard/oliemonsters/2026')).toBeNull();
    expect(paginaBesluit(kijkerAlles, '/dashboard/oliemonsters/2027')).toBeNull();
    expect(paginaBesluit(kijkerAlles, '/dashboard/oliemonsters/abc')).toBe('/dashboard');
    expect(paginaBesluit(kijkerAlles, '/dashboard/ultimo')).toBe('/dashboard');
  });
  it('kijker met een jaar zonder monsters krijgt gewoon de pagina van dat jaar', () => {
    const k = maak('alleen_lezen', 2027);
    expect(paginaBesluit(k, '/dashboard/oliemonsters/2027')).toBeNull();
    expect(paginaBesluit(k, '/dashboard')).toBe('/dashboard/oliemonsters/2027');
  });
  it('Instellingen en Audit logs alleen voor admin', () => {
    expect(paginaBesluit(gebruiker, '/dashboard/admin')).toBe('/dashboard');
    expect(paginaBesluit(gebruiker, '/dashboard/audit-logs')).toBe('/dashboard');
    expect(paginaBesluit(gebruiker, '/dashboard/acquisitie')).toBeNull();
    expect(paginaBesluit(admin, '/dashboard/admin')).toBeNull();
  });
  it('Klanten en Installaties alleen voor admin, oliemonsters per jaar voor iedereen', () => {
    for (const pad of ['/dashboard/klanten', '/dashboard/klanten/3', '/dashboard/installaties/7']) {
      expect(paginaBesluit(gebruiker, pad)).toBe('/dashboard');
      expect(paginaBesluit(admin, pad)).toBeNull();
    }
    expect(paginaBesluit(gebruiker, '/dashboard/oliemonsters/2026')).toBeNull();
    expect(paginaBesluit(gebruiker, '/dashboard/objecten')).toBeNull();
  });
});

describe('paginaBesluit (klantportaal)', () => {
  const portaal = { ...maak('alleen_lezen', 2026), klantId: 7, portaalWeergave: 'klantportaal' as const };
  it('een kijker met klantportaal komt alleen op /dashboard', () => {
    expect(paginaBesluit(portaal, '/dashboard')).toBeNull();
    for (const pad of ['/dashboard/oliemonsters/2026', '/dashboard/oliemonsters/2025', '/dashboard/klanten', '/dashboard/admin']) {
      expect(paginaBesluit(portaal, pad)).toBe('/dashboard');
    }
  });
  it('klantportaal zonder klant valt terug op klassiek', () => {
    const zonderKlant = { ...portaal, klantId: null };
    expect(paginaBesluit(zonderKlant, '/dashboard/oliemonsters/2026')).toBeNull();
    expect(paginaBesluit(zonderKlant, '/dashboard')).toBe('/dashboard/oliemonsters/2026');
  });
  it('de klassieke kijker met een klant blijft op zijn jaarpagina', () => {
    const klassiek = { ...kijker2025, klantId: 7 };
    expect(paginaBesluit(klassiek, '/dashboard/oliemonsters/2025')).toBeNull();
    expect(paginaBesluit(klassiek, '/dashboard')).toBe('/dashboard/oliemonsters/2025');
  });
});
