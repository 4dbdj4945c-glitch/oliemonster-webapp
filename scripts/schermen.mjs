// Screenshots van de portal met de ECHTE lokale database (ids_portal_dev) en
// een echte inlog. Nodig sinds app/dashboard/layout.tsx de sessie op de server
// controleert: een nep-API in de browser alleen is niet meer genoeg.
//
// Gebruik (lokale PostgreSQL moet draaien, zie README.md):
//   node scripts/schermen.mjs                    standaardset
//   node scripts/schermen.mjs --seed             eerst npm run seed (wist ids_portal_dev)
//   node scripts/schermen.mjs kijker:/dashboard/oliemonsters/2025 admin:/dashboard/klanten
// Gebruikers en wachtwoorden: prisma/nepdata.ts. Uitvoer: schermen/<naam>-<breedte>.png
// (1440 en 390 breed) en per scherm of de pagina horizontaal overloopt.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const uit = join(repo, 'schermen');
mkdirSync(uit, { recursive: true });
const POORT = 3148;
const BASIS = `http://localhost:${POORT}`;
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const WACHTWOORDEN = { admin: 'admin123', gebruiker: 'user123', kijker: 'kijker123' };

const args = process.argv.slice(2);
if (args.includes('--seed')) execSync('npm run seed', { cwd: repo, stdio: 'inherit' });
const gevraagd = args.filter((a) => a.includes(':'));
const SCHERMEN = (gevraagd.length ? gevraagd : [
  'kijker:/dashboard/oliemonsters/2025',
  'admin:/dashboard',
  'admin:/dashboard/oliemonsters/2026',
  'admin:/dashboard/klanten',
  'gebruiker:/dashboard',
]).map((a) => { const [wie, pad] = a.split(/:(.*)/s); return { wie, pad }; });

const dev = spawn('npx', ['next', 'dev', '-p', String(POORT)], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
let log = '';
dev.stdout.on('data', (c) => { log += c; });
dev.stderr.on('data', (c) => { log += c; });
for (let i = 0; i < 160 && !/Ready|ready in/i.test(log); i++) await wacht(500);

async function sessieCookie(wie) {
  const res = await fetch(`${BASIS}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASIS },
    body: JSON.stringify({ username: wie, password: WACHTWOORDEN[wie] }),
  });
  if (!res.ok) throw new Error(`Inloggen als ${wie} mislukt (${res.status}). Draai eerst met --seed?`);
  return res.headers.get('set-cookie').split(';')[0].split('=');
}

const cdpPoort = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${cdpPoort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ids-'))}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let doel;
for (let i = 0; i < 50 && !doel; i++) { await wacht(200); try { doel = (await (await fetch(`http://127.0.0.1:${cdpPoort}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(doel.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const w = new Map();
const stuur = (method, params = {}) => new Promise((r) => { const i = ++id; w.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } });
await stuur('Page.enable');
await stuur('Network.enable');

const verslag = [];
try {
  for (const { wie, pad } of SCHERMEN) {
    const [naam, waarde] = await sessieCookie(wie);
    await stuur('Network.clearBrowserCookies');
    await stuur('Network.setCookie', { name: naam, value: waarde, url: BASIS });
    for (const breedte of [1440, 390]) {
      await stuur('Emulation.setDeviceMetricsOverride', { width: breedte, height: breedte > 800 ? 900 : 844, deviceScaleFactor: breedte > 800 ? 1 : 2, mobile: breedte <= 800 });
      await stuur('Page.navigate', { url: BASIS + pad });
      await wacht(5000);
      const m = (await stuur('Runtime.evaluate', { returnByValue: true, expression: `({ url: location.pathname, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight, fout: !!document.querySelector('[data-nextjs-dialog], [data-nextjs-toast-errors-parent]') })` })).result.result.value;
      const shot = await stuur('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: breedte, height: Math.min(m.h, 6000), scale: 1 } });
      const bestand = `${wie}${pad.replace(/\//g, '_')}-${breedte}.png`;
      writeFileSync(join(uit, bestand), Buffer.from(shot.result.data, 'base64'));
      verslag.push(`${bestand}: op ${m.url}, scrollWidth ${m.sw}/${m.cw}${m.sw > m.cw ? ' OVERLOOP' : ''}${m.fout ? ' (Next-foutmelding zichtbaar)' : ''}`);
    }
  }
} finally {
  console.log(verslag.join('\n'));
  ws.close(); chrome.kill(); dev.kill('SIGTERM');
}
