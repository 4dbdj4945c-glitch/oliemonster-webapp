// Screenshots van de portal met de ECHTE lokale database (ids_portal_dev) en
// een echte inlog. Nodig sinds app/dashboard/layout.tsx de sessie op de server
// controleert: een nep-API in de browser alleen is niet meer genoeg.
//
// Gebruik (lokale PostgreSQL moet draaien, zie README.md):
//   node scripts/schermen.mjs                    standaardset
//   node scripts/schermen.mjs --seed             eerst npm run seed (wist ids_portal_dev)
//   node scripts/schermen.mjs kijker:/dashboard/oliemonsters/2025 admin:/dashboard/klanten
//   node scripts/schermen.mjs admin:/dashboard/planning/dag/{vandaag}   dagscherm van de monsterdag van vandaag
//   node scripts/schermen.mjs admin:/dashboard/klanten/{kempen}          klantdossier ({mourik} of {kempen})
//   node scripts/schermen.mjs admin:/dashboard/inspecties/{lekken}       invulscherm ({lekken} of {arbeidsmiddelen})
//   node scripts/schermen.mjs admin:/dashboard/contracten/{contract} admin:/dashboard/dagrapporten/{dagrapport}   ({dagrapportconcept})
//   node scripts/schermen.mjs "admin:/dashboard@.onderbalk button:nth-of-type(1)"   eerst klikken, dan alleen het scherm zelf
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
const POORT = Number(process.env.SCHERMEN_POORT) || 3148;
const BASIS = `http://localhost:${POORT}`;
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const WACHTWOORDEN = { admin: 'admin123', gebruiker: 'user123', kijker: 'kijker123', kempen: 'kempen123' };

const args = process.argv.slice(2);
if (args.includes('--seed')) execSync('npm run seed', { cwd: repo, stdio: 'inherit' });
const gevraagd = args.filter((a) => a.includes(':'));
const SCHERMEN = (gevraagd.length ? gevraagd : [
  'kijker:/dashboard/oliemonsters/2025',
  'admin:/dashboard',
  'admin:/dashboard/oliemonsters/2026',
  'admin:/dashboard/planning/dag/{vandaag}',
  'admin:/dashboard@.zijbalk-gebruiker',
  'admin:/dashboard@.onderbalk button:nth-of-type(1)',
  'admin:/dashboard@.onderbalk button:nth-of-type(3)',
  'admin:/dashboard/klanten',
  'gebruiker:/dashboard',
]).map((a) => {
  const [wie, rest] = a.split(/:(.*)/s);
  const [pad, klik] = rest.split('@');
  return { wie, pad, klik };
});

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

// {vandaag} in een pad: het id van de monsterdag van vandaag (nepdata zet er altijd een).
async function vulIn(pad, cookie) {
  // {mourik} of {kempen}: het id van die klant (alleen als admin).
  for (const [, naam] of pad.matchAll(/\{(mourik|kempen)\}/g)) {
    const klanten = await (await fetch(`${BASIS}/api/klanten`, { headers: { Cookie: `${cookie[0]}=${cookie[1]}` } })).json();
    const k = klanten.find((x) => x.naam.toLowerCase().includes(naam));
    if (!k) throw new Error(`Geen klant ${naam}. Draai met --seed.`);
    pad = pad.replace(`{${naam}}`, String(k.id));
  }
  // {lekken} of {arbeidsmiddelen}: de afgeronde inspectie van dat sjabloon uit de nepdata.
  for (const [, naam] of pad.matchAll(/\{(lekken|arbeidsmiddelen)\}/g)) {
    const lijst = await (await fetch(`${BASIS}/api/inspecties`, { headers: { Cookie: `${cookie[0]}=${cookie[1]}` } })).json();
    const sjabloon = naam === 'lekken' ? 'persluchtlekken' : 'arbeidsmiddelen';
    const i = lijst.find((x) => x.sjabloon === sjabloon && x.status === 'afgerond');
    if (!i) throw new Error(`Geen afgeronde inspectie ${sjabloon}. Draai met --seed.`);
    pad = pad.replace(`{${naam}}`, String(i.id));
  }
  // {contract}: het contract van de tweede klant; {dagrapport} het getekende en
  // {dagrapportconcept} het concept-dagrapport uit de nepdata (fase 5).
  if (pad.includes('{contract}')) {
    const lijst = await (await fetch(`${BASIS}/api/contracten`, { headers: { Cookie: `${cookie[0]}=${cookie[1]}` } })).json();
    const c = lijst.find((x) => x.klant.naam.startsWith('Kempen'));
    if (!c) throw new Error('Geen contract. Draai met --seed.');
    pad = pad.replace('{contract}', String(c.id));
  }
  for (const [, naam] of pad.matchAll(/\{(dagrapport|dagrapportconcept)\}/g)) {
    const lijst = await (await fetch(`${BASIS}/api/dagrapporten`, { headers: { Cookie: `${cookie[0]}=${cookie[1]}` } })).json();
    const d = lijst.find((x) => x.status === (naam === 'dagrapport' ? 'getekend' : 'concept'));
    if (!d) throw new Error(`Geen ${naam}. Draai met --seed.`);
    pad = pad.replace(`{${naam}}`, String(d.id));
  }
  if (!pad.includes('{vandaag}')) return pad;
  const nu = new Date();
  const res = await fetch(`${BASIS}/api/sample-plans?year=${nu.getFullYear()}`, { headers: { Cookie: `${cookie[0]}=${cookie[1]}` } });
  const { dagen } = await res.json();
  const sleutel = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
  const dag = dagen.find((d) => sleutel(d.date) === sleutel(nu));
  if (!dag) throw new Error('Geen monsterdag vandaag in de planning. Draai met --seed.');
  return pad.replace('{vandaag}', String(dag.id));
}

const verslag = [];
try {
  for (const { wie, pad: ruwPad, klik } of SCHERMEN) {
    const [naam, waarde] = await sessieCookie(wie);
    const pad = await vulIn(ruwPad, [naam, waarde]);
    await stuur('Network.clearBrowserCookies');
    await stuur('Network.setCookie', { name: naam, value: waarde, url: BASIS });
    for (const breedte of [1440, 390]) {
      await stuur('Emulation.setDeviceMetricsOverride', { width: breedte, height: breedte > 800 ? 900 : 844, deviceScaleFactor: breedte > 800 ? 1 : 2, mobile: breedte <= 800 });
      await stuur('Page.navigate', { url: BASIS + pad });
      await wacht(5000);
      // Klikken (menu openen): alleen als het element op deze breedte zichtbaar is.
      let geklikt = false;
      if (klik) {
        geklikt = (await stuur('Runtime.evaluate', { returnByValue: true, expression: `(() => { const el = document.querySelector(${JSON.stringify(klik)}); if (!el || el.offsetParent === null) return false; el.click(); return true; })()` })).result.result.value;
        if (!geklikt) continue;
        await wacht(600);
      }
      const m = (await stuur('Runtime.evaluate', { returnByValue: true, expression: `({ url: location.pathname, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight, fout: !!document.querySelector('[data-nextjs-dialog], [data-nextjs-toast-errors-parent]'), tabel: Math.max(0, ...[...document.querySelectorAll('.table-scroll')].map((t) => t.scrollWidth - t.clientWidth)) })` })).result.result.value;
      // Een vaste balk onderaan (onderbalk, Monster nemen) hoort onderaan de
      // opname, niet halverwege: dan eerst het venster zo hoog als de pagina.
      if (!geklikt && breedte <= 800) {
        const vast = (await stuur('Runtime.evaluate', { returnByValue: true, expression: `[...document.querySelectorAll('.onderbalk, .veld-actiebalk')].some((el) => getComputedStyle(el).position === 'fixed' && el.offsetParent !== null || getComputedStyle(el).position === 'fixed' && getComputedStyle(el).display !== 'none')` })).result.result.value;
        if (vast) {
          await stuur('Emulation.setDeviceMetricsOverride', { width: breedte, height: Math.min(m.h, 6000), deviceScaleFactor: 2, mobile: true });
          await wacht(800);
          m.h = (await stuur('Runtime.evaluate', { returnByValue: true, expression: 'document.documentElement.scrollHeight' })).result.result.value;
        }
      }
      // Na een klik alleen wat je op het scherm ziet; anders de hele pagina.
      const hoogte = geklikt ? (breedte > 800 ? 900 : 844) : Math.min(m.h, 6000);
      const shot = await stuur('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !geklikt, clip: { x: 0, y: 0, width: breedte, height: hoogte, scale: 1 } });
      const bestand = `${wie}${ruwPad.replace(/\//g, '_').replace(/[{}]/g, '')}${klik ? '-menu-' + klik.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') : ''}-${breedte}.png`;
      writeFileSync(join(uit, bestand), Buffer.from(shot.result.data, 'base64'));
      verslag.push(`${bestand}: op ${m.url}, scrollWidth ${m.sw}/${m.cw}${m.sw > m.cw ? ' OVERLOOP' : ''}${m.tabel > 0 ? ` TABEL ${m.tabel}px te breed` : ''}${m.fout ? ' (Next-foutmelding zichtbaar)' : ''}`);
    }
  }
} finally {
  console.log(verslag.join('\n'));
  ws.close(); chrome.kill(); dev.kill('SIGTERM');
}
