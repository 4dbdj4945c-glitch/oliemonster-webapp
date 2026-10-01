// Het moduleregister: één bron voor tegels, menu en paginatoegang.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  MODULES,
  SECTIES,
  actieveTab,
  actiefNavItem,
  jaarUitPad,
  moduleVoorPad,
  modulesVoor,
  navigatieVoor,
  oliemonsterPad,
  registerRol,
} from '@/lib/modules';

describe('moduleregister', () => {
  it('elke module heeft een unieke sleutel, een sectie en minstens één rol', () => {
    expect(new Set(MODULES.map((m) => m.sleutel)).size).toBe(MODULES.length);
    for (const m of MODULES) {
      expect(SECTIES).toContain(m.sectie);
      expect(m.rollen.length).toBeGreaterThan(0);
    }
  });

  it('elke interne route heeft een pagina in app/', () => {
    for (const m of MODULES.filter((x) => !x.extern)) {
      const map = path.join(process.cwd(), 'app', m.route, m.perJaar ? '[jaar]' : '');
      expect(existsSync(path.join(map, 'page.tsx')), `${m.route} heeft geen page.tsx`).toBe(true);
    }
  });

  it('een kijker ziet alleen de oliemonsters, een gebruiker geen beheer van klanten', () => {
    expect(modulesVoor('alleen_lezen').map((m) => m.sleutel)).toEqual(['oliemonsters']);
    expect(modulesVoor('viewer_oil2025').map((m) => m.sleutel)).toEqual(['oliemonsters']);
    const gebruiker = modulesVoor('user').map((m) => m.sleutel);
    expect(gebruiker).toContain('acquisitie');
    expect(gebruiker).not.toContain('klanten');
    expect(gebruiker).not.toContain('instellingen');
    expect(modulesVoor('admin', 'Beheer').map((m) => m.sleutel)).toEqual(['objecten', 'eigen-dossier', 'instellingen']);
    expect(modulesVoor('admin', 'Rapportage').map((m) => m.sleutel)).toEqual(['inspecties', 'dagrapporten', 'audit-logs']);
    expect(modulesVoor('admin', 'Klanten').map((m) => m.sleutel)).toEqual(['klanten', 'installaties', 'contracten', 'acquisitie', 'mail']);
    // Contracten en dagrapporten leest een gebruiker mee; een kijker ziet ze nooit als module.
    expect(gebruiker).toContain('contracten');
    expect(gebruiker).toContain('dagrapporten');
    // Inspecties leest een gebruiker mee, het eigen dossier is alleen voor de beheerder.
    expect(gebruiker).toContain('inspecties');
    expect(gebruiker).not.toContain('eigen-dossier');
  });

  it('pad naar module en jaar', () => {
    expect(moduleVoorPad('/dashboard/objecten/koppelen')?.sleutel).toBe('objecten');
    expect(moduleVoorPad('/dashboard/klanten/12')?.sleutel).toBe('klanten');
    expect(moduleVoorPad('/dashboard')).toBeNull();
    expect(oliemonsterPad(2027)).toBe('/dashboard/oliemonsters/2027');
    expect(jaarUitPad('/dashboard/oliemonsters/2026')).toBe(2026);
    expect(jaarUitPad('/dashboard/oliemonsters')).toBeNull();
    expect(jaarUitPad('/dashboard/oliemonsters2026')).toBeNull();
    expect(jaarUitPad('/dashboard/oliemonsters/1999')).toBeNull();
    expect(registerRol('iets-anders')).toBe('user');
  });

  it('navigatie: per sectie de modules van de gebruiker, zonder lege secties', () => {
    const admin = navigatieVoor('admin', 2026);
    expect(admin.map((s) => s.sectie)).toEqual(['Werk', 'Klanten', 'Rapportage', 'Beheer']);
    expect(admin[0].items.map((i) => i.href)).toEqual([
      '/dashboard/oliemonsters/2026',
      '/dashboard/planning',
    ]);
    expect(admin[3].items.map((i) => i.sleutel)).toEqual(['objecten', 'eigen-dossier', 'kolommen', 'instellingen']);

    const gebruiker = navigatieVoor('user', 2026);
    expect(gebruiker.map((s) => s.sectie)).toEqual(['Werk', 'Klanten', 'Rapportage', 'Beheer']);
    expect(gebruiker.flatMap((s) => s.items.map((i) => i.sleutel))).not.toContain('klanten');

    expect(navigatieVoor('alleen_lezen', 2025)).toEqual([
      { sectie: 'Werk', items: [expect.objectContaining({ sleutel: 'oliemonsters', href: '/dashboard/oliemonsters/2025' })] },
    ]);
  });

  it('actieve pagina en tab', () => {
    expect(actiefNavItem('/dashboard')).toBe('vandaag');
    expect(actiefNavItem('/dashboard/')).toBe('vandaag');
    expect(actiefNavItem('/dashboard/oliemonsters/2025')).toBe('oliemonsters');
    expect(actiefNavItem('/dashboard/planning/dag/4')).toBe('planning');
    expect(actiefNavItem('/login')).toBeNull();
    expect(actieveTab('/dashboard')).toBe('vandaag');
    expect(actieveTab('/dashboard/planning')).toBe('Werk');
    expect(actieveTab('/dashboard/klanten/3')).toBe('Klanten');
    expect(actieveTab('/dashboard/audit-logs')).toBe('meer');
    expect(actieveTab('/dashboard/admin')).toBe('meer');
    expect(actiefNavItem('/dashboard/inspecties/12')).toBe('inspecties');
    expect(actieveTab('/dashboard/eigen-dossier')).toBe('meer');
  });
});
