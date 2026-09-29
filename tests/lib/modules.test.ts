// Het moduleregister: één bron voor tegels, menu en paginatoegang.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { MODULES, SECTIES, jaarUitPad, moduleVoorPad, modulesVoor, oliemonsterPad, registerRol } from '@/lib/modules';

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
    expect(modulesVoor('admin', 'Beheer').map((m) => m.sleutel)).toEqual(['objecten', 'audit-logs', 'instellingen']);
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
});
