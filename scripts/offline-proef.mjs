// Proef van het veldscherm zonder bereik, in een echte (headless) Chrome met de
// echte lokale database: service worker, offline wachtrij en het versturen als
// de verbinding terug is.
//
//   node scripts/offline-proef.mjs            (eerst npm run seed voor een monsterdag vandaag)
//
// 1. Als admin het veldscherm van vandaag openen (390 breed): de service worker
//    bewaart het scherm, de gegevens en de scripts.
// 2. Offline: de browser op offline en de server uit. Het veldscherm opnieuw
//    laden (moet uit de bewaarde kopie komen), Monster nemen invullen en bewaren.
//    Screenshot: schermen/offline-veldscherm-390.png (met de wachtrij).
// 3. Server weer aan, browser weer online: de wachtrij verstuurt vanzelf.
//    Controle in de database via de API: het monster staat op genomen, precies
//    één poging erbij.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const uit = join(repo, 'schermen');
mkdirSync(uit, { recursive: true });
const POORT = Number(process.env.SCHERMEN_POORT) || 3149;
const BASIS = `http://localhost:${POORT}`;
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const verslag = [];
const meld = (t) => { verslag.push(t); console.log(t); };

let dev = null;
async function startServer() {
  dev = spawn('npx', ['next', 'dev', '-p', String(POORT)], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  let log = '';
  dev.stdout.on('data', (c) => { log += c; });
  dev.stderr.on('data', (c) => { log += c; });
  for (let i = 0; i < 160 && !/Ready|ready in/i.test(log); i++) await wacht(500);
}
function stopServer() {
  if (!dev) return;
  try { process.kill(-dev.pid, 'SIGTERM'); } catch { /* al weg */ }
  dev = null;
}

await startServer();
const login = await fetch(`${BASIS}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASIS }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
const [cNaam, cWaarde] = login.headers.get('set-cookie').split(';')[0].split('=');
const kop = { Cookie: `${cNaam}=${cWaarde}` };
const nu = new Date();
const { dagen } = await (await fetch(`${BASIS}/api/sample-plans?year=${nu.getFullYear()}`, { headers: kop })).json();
const dag = dagen.find((d) => new Date(d.date).toDateString() === nu.toDateString());
if (!dag) throw new Error('Geen monsterdag vandaag. Draai eerst npm run seed.');
const stop = dag.stops.find((s) => s.samples.some((m) => !m.isTaken && !m.isUnreachable));
const doelMonster = stop.samples.find((m) => !m.isTaken && !m.isUnreachable);
meld(`Dag ${dag.id}, eerste open monster ${doelMonster.oNumber} (id ${doelMonster.id}) op ${stop.object.name}`);

const cdpPoort = 9900 + Math.floor(Math.random() * 90);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${cdpPoort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ids-offline-'))}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let doel;
for (let i = 0; i < 50 && !doel; i++) { await wacht(200); try { doel = (await (await fetch(`http://127.0.0.1:${cdpPoort}/json`)).json()).find((t) => t.type === 'page'); } catch { /* nog niet */ } }
const ws = new WebSocket(doel.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const w = new Map();
const stuur = (method, params = {}) => new Promise((r) => { const i = ++id; w.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } });
const js = async (expression) => (await stuur('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.result.value;

try {
  await stuur('Page.enable');
  await stuur('Network.enable');
  await stuur('Network.setCookie', { name: cNaam, value: cWaarde, url: BASIS });
  await stuur('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const pad = `/dashboard/planning/dag/${dag.id}`;

  // 1. Online openen, de service worker laten bewaren.
  await stuur('Page.navigate', { url: BASIS + pad });
  await wacht(7000);
  await stuur('Page.reload');
  await wacht(6000);
  const bewaard = await js(`(async () => { const c = await caches.open('ids-veld-v1'); return (await c.keys()).map((r) => new URL(r.url).pathname); })()`);
  meld(`Bewaard door de service worker: ${bewaard.filter((p) => !p.startsWith('/_next')).join(', ')} en ${bewaard.filter((p) => p.startsWith('/_next')).length} scripts en stijlen`);
  meld(`Service worker actief: ${await js('!!navigator.serviceWorker.controller')}`);

  // 2. Offline: browser offline en de server uit.
  await stuur('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  stopServer();
  await wacht(1500);
  await stuur('Page.reload');
  await wacht(5000);
  const offline = await js(`({ online: navigator.onLine, titel: document.querySelector('.veld-kop h1')?.textContent ?? null, melding: !!document.querySelector('.geen-verbinding'), knop: !!document.querySelector('.veld-hoofdknop') })`);
  meld(`Offline herladen: navigator.onLine=${offline.online}, kop "${offline.titel}", melding Geen verbinding ${offline.melding ? 'zichtbaar' : 'NIET zichtbaar'}, knop Monster nemen ${offline.knop ? 'er' : 'NIET er'}`);
  if (!offline.titel) throw new Error('Het veldscherm opende niet zonder bereik.');

  await js(`document.querySelector('.veld-hoofdknop').click()`);
  await wacht(800);
  await js(`(() => { const t = document.querySelector('#neem-opmerking'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'Genomen zonder bereik'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const knopTekst = await js(`[...document.querySelectorAll('.modal-footer .btn-primary')].map((b) => b.textContent).join()`);
  meld(`Knop in Monster nemen zonder bereik: "${knopTekst}"`);
  await js(`document.querySelector('.modal-footer .btn-primary').click()`);
  await wacht(2000);
  const naOpslaan = await js(`({ wachtrij: document.querySelector('.wachtrij-kop strong')?.textContent ?? null, melding: document.querySelector('.alert-success')?.textContent ?? null, volgende: document.querySelector('.veld-onummer')?.textContent ?? null })`);
  meld(`Na bewaren: "${naOpslaan.wachtrij}", melding "${naOpslaan.melding}", nu aan de beurt ${naOpslaan.volgende}`);
  const inDb = await js(`new Promise((k) => { const r = indexedDB.open('ids-wachtrij'); r.onsuccess = () => { const q = r.result.transaction('invoer').objectStore('invoer').getAll(); q.onsuccess = () => k(q.result.map((i) => ({ titel: i.titel, sleutel: i.sleutel, status: i.status }))); }; })`);
  meld(`In IndexedDB: ${JSON.stringify(inDb)}`);

  // Screenshot van het offline veldscherm met de wachtrij (hele pagina).
  const h = await js('document.documentElement.scrollHeight');
  await stuur('Emulation.setDeviceMetricsOverride', { width: 390, height: Math.min(h, 4000), deviceScaleFactor: 2, mobile: true });
  await wacht(600);
  const shot = await stuur('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 390, height: Math.min(h, 4000), scale: 1 } });
  writeFileSync(join(uit, 'offline-veldscherm-390.png'), Buffer.from(shot.result.data, 'base64'));
  meld('Screenshot: schermen/offline-veldscherm-390.png');
  await stuur('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // 3. Server weer aan, browser online: vanzelf versturen.
  await startServer();
  await stuur('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  let over = inDb.length;
  for (let i = 0; i < 40 && over > 0; i++) {
    await wacht(1500);
    over = await js(`new Promise((k) => { const r = indexedDB.open('ids-wachtrij'); r.onsuccess = () => { const q = r.result.transaction('invoer').objectStore('invoer').count(); q.onsuccess = () => k(q.result); }; })`);
  }
  meld(`Weer online: ${over} over in de wachtrij`);
  const na = await (await fetch(`${BASIS}/api/samples/${doelMonster.id}/attempts`, { headers: kop })).json().catch(() => null);
  const monster = (await (await fetch(`${BASIS}/api/sample-plans/${dag.id}`, { headers: kop })).json()).stops.flatMap((s) => s.samples).find((m) => m.id === doelMonster.id);
  meld(`Op de server: ${doelMonster.oNumber} genomen=${monster?.isTaken}, opmerking "${monster?.remarks}", pogingen ${Array.isArray(na) ? na.length : JSON.stringify(na).slice(0, 80)}`);
} finally {
  writeFileSync(join(uit, 'offline-proef.txt'), verslag.join('\n') + '\n');
  ws.close();
  chrome.kill();
  stopServer();
}
