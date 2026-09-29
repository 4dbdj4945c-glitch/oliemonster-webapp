import { describe, expect, it } from 'vitest';
import { herkomstFout, isUploadRoute, toegestaneOrigins } from '@/lib/herkomst';

const EIGEN = 'https://oliemonster-webapp.vercel.app';
const verzoek = (method: string, pad: string, headers: Record<string, string>) => ({
  method,
  pad,
  eigenOrigin: EIGEN,
  headers: { get: (naam: string) => headers[naam.toLowerCase()] ?? null },
});

describe('herkomstFout (CSRF)', () => {
  it('GET en pagina-verzoeken gaan altijd door', () => {
    expect(herkomstFout(verzoek('GET', '/api/samples', { origin: 'https://kwaad.example' }))).toBeNull();
    expect(herkomstFout(verzoek('POST', '/dashboard', { origin: 'https://kwaad.example' }))).toBeNull();
  });
  it('eigen origin met JSON mag', () => {
    expect(herkomstFout(verzoek('POST', '/api/samples', { origin: EIGEN, 'content-type': 'application/json' }))).toBeNull();
  });
  it('de Mourik-host mag (iframe op mourik.itsdoneservices.nl)', () => {
    expect(toegestaneOrigins()).toContain('https://mourik.itsdoneservices.nl');
    expect(herkomstFout(verzoek('POST', '/api/auth/login', { origin: 'https://mourik.itsdoneservices.nl', 'content-type': 'application/json' }))).toBeNull();
  });
  it('vreemde origin: 403', () => {
    expect(herkomstFout(verzoek('POST', '/api/users', { origin: 'https://kwaad.example', 'content-type': 'application/json' }))?.status).toBe(403);
  });
  it('zonder Origin telt Sec-Fetch-Site', () => {
    expect(herkomstFout(verzoek('DELETE', '/api/samples/1', { 'sec-fetch-site': 'cross-site' }))?.status).toBe(403);
    expect(herkomstFout(verzoek('DELETE', '/api/samples/1', { 'sec-fetch-site': 'same-origin' }))).toBeNull();
    expect(herkomstFout(verzoek('DELETE', '/api/samples/1', {}))).toBeNull();
  });
  it('formulier als text/plain: 415', () => {
    expect(herkomstFout(verzoek('POST', '/api/users', { origin: EIGEN, 'content-type': 'text/plain' }))?.status).toBe(415);
  });
  it('multipart alleen op de uploadroutes', () => {
    const mp = { origin: EIGEN, 'content-type': 'multipart/form-data; boundary=x' };
    expect(herkomstFout(verzoek('POST', '/api/samples/12/nemen', mp))).toBeNull();
    expect(herkomstFout(verzoek('POST', '/api/samples/12/attempts/3/photo', mp))).toBeNull();
    expect(herkomstFout(verzoek('POST', '/api/users', mp))?.status).toBe(415);
  });
  it('isUploadRoute', () => {
    expect(isUploadRoute('/api/samples/1/photo')).toBe(true);
    expect(isUploadRoute('/api/samples/1')).toBe(false);
  });
});
