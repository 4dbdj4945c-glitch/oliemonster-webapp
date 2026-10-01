// Meet per veelgebruikte actie hoeveel databaseverzoeken (roundtrips) en
// hoeveel HTTP-verzoeken de portal nodig heeft, en hoe lang je wacht. Lokaal,
// met een eigen meetdatabase (ids_portal_meet, wordt gewist en gevuld met de
// nepdata) en een echte Chrome. Productie raakt dit nooit.
//
// Gebruik (lokale PostgreSQL moet draaien, eerst `npx next build` in de app-map):
//   node scripts/meten.mjs                        meet deze map
//   node scripts/meten.mjs --app ../kopie         meet een andere kopie (bijvoorbeeld main)
//   node scripts/meten.mjs --uit meting.json      bewaar de getallen
//   MEET_VERTRAGING=20 node scripts/meten.mjs     vertraging per databaseverzoek in ms (standaard 20)
//
// Hoe het meet:
// - Tussen de portal en PostgreSQL zit een kleine proxy die elk pakket van de
//   portal naar de database MEET_VERTRAGING ms laat wachten, zoals een netwerkhop
//   naar Supabase. Hij telt de query's (elk Execute-bericht en elke losse
//   Query) en de roundtrips (elk Sync-bericht en elke losse Query: zo vaak
//   wacht de portal op de database). Prisma krijgt pgbouncer=true, zoals bij
//   de pooler van Supabase.
// - OSRM (route) en Vercel Blob (foto's) worden lokaal nagebootst: OSRM met
//   150 ms per aanroep (en geteld), Blob met een nepserver.
// - Chrome telt de verzoeken naar de portal zelf (pagina, fetch, RSC), zonder
//   scripts, stijlen en afbeeldingen. De wachttijd loopt van de klik tot het
//   laatste antwoord binnen is.
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import { tmpdir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const optie = (naam) => { const i = args.indexOf(naam); return i >= 0 ? args[i + 1] : undefined; };
const app = resolve(optie('--app') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const uitBestand = optie('--uit');
const VERTRAGING = Number(process.env.MEET_VERTRAGING ?? 20);
const PG_BIN = '/opt/homebrew/opt/postgresql@17/bin';
const DB = 'ids_portal_meet';
const PROXY_POORT = 5499;
const BLOB_POORT = 5498;
const POORT = 3199;
const BASIS = `http://localhost:${POORT}`;
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const werkmap = mkdtempSync(join(tmpdir(), 'ids-meten-'));

if (!existsSync(join(app, '.next', 'BUILD_ID'))) {
  console.error(`Geen build in ${app}. Draai daar eerst: npx next build`);
  process.exit(1);
}

// ---------- Database: leeg maken, migraties, nepdata ----------
const dbUrl = `postgresql://${userInfo().username}@localhost:5432/${DB}`;
execSync(`${PG_BIN}/dropdb --if-exists ${DB} && ${PG_BIN}/createdb ${DB}`, { stdio: 'inherit' });
const dbEnv = { ...process.env, DATABASE_URL: dbUrl };
execSync('npx prisma migrate deploy', { cwd: app, env: dbEnv, stdio: 'pipe' });
execSync('npx tsx prisma/seed.ts', { cwd: app, env: dbEnv, stdio: 'pipe' });

// ---------- Proxy met vertraging en teller ----------
let roundtrips = 0;
let queries = 0;
// De SQL van elk verzoek (de eerste 120 tekens), per actie in het uitvoerbestand.
let sql = [];
const proxy = net.createServer((client) => {
  const server = net.connect(5432, 'localhost');
  let opstart = true; // de eerste berichten hebben geen typebyte
  let buffer = Buffer.alloc(0);
  const tel = (stuk) => {
    buffer = Buffer.concat([buffer, stuk]);
    for (;;) {
      if (opstart) {
        if (buffer.length < 8) return;
        const lengte = buffer.readInt32BE(0);
        const code = buffer.readInt32BE(4);
        if (buffer.length < lengte) return;
        buffer = buffer.subarray(lengte);
        if (code !== 80877103 && code !== 80877104) opstart = false; // SSL- of GSS-verzoek: nog een opstartbericht
        continue;
      }
      if (buffer.length < 5) return;
      const type = String.fromCharCode(buffer[0]);
      const lengte = buffer.readInt32BE(1);
      if (buffer.length < lengte + 1) return;
      if (type === 'S' || type === 'Q') roundtrips += 1;
      if (type === 'E' || type === 'Q') queries += 1;
      if (type === 'Q') sql.push(buffer.subarray(5, lengte).toString('utf8').replace(/\0.*$/s, '').slice(0, 120));
      if (type === 'P') {
        // Parse: naam\0 query\0 ...
        const deel = buffer.subarray(5, lengte + 1).toString('utf8');
        sql.push(deel.slice(deel.indexOf('\0') + 1).replace(/\0.*$/s, '').replace(/\s+/g, ' ').slice(0, 120));
      }
      buffer = buffer.subarray(lengte + 1);
    }
  };
  client.on('data', (stuk) => {
    tel(stuk);
    // Zelfde vertraging voor elk pakket: de volgorde blijft gelijk.
    setTimeout(() => server.write(stuk), VERTRAGING);
  });
  server.on('data', (stuk) => client.write(stuk));
  const sluit = () => { client.destroy(); server.destroy(); };
  client.on('error', sluit); server.on('error', sluit);
  client.on('close', sluit); server.on('close', sluit);
});
await new Promise((r) => proxy.listen(PROXY_POORT, r));

// ---------- Nep-Blob ----------
const blob = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const naam = `fotos/meet-${Math.random().toString(16).slice(2)}.jpg`;
    const url = `https://meet.public.blob.vercel-storage.com/${naam}`;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ url, downloadUrl: url, pathname: naam, contentType: 'image/jpeg', contentDisposition: 'inline' }));
  });
});
await new Promise((r) => blob.listen(BLOB_POORT, r));

// ---------- OSRM nabootsen en tellen (voorlader in de server) ----------
const osrmTeller = join(werkmap, 'osrm.txt');
writeFileSync(osrmTeller, '');
const voorlader = join(werkmap, 'osrm-nep.cjs');
writeFileSync(voorlader, `
const fs = require('fs');
const echt = globalThis.fetch;
globalThis.fetch = async function (invoer, init) {
  const url = typeof invoer === 'string' ? invoer : invoer && invoer.url ? invoer.url : String(invoer);
  if (url.includes('router.project-osrm.org')) {
    fs.appendFileSync(${JSON.stringify(osrmTeller)}, '1');
    await new Promise((r) => setTimeout(r, 150));
    const punten = decodeURIComponent(url.split('/driving/')[1].split('?')[0]).split(';').map((p) => p.split(',').map(Number));
    const n = Math.max(1, punten.length - 1);
    return new Response(JSON.stringify({ code: 'Ok', routes: [{ geometry: { coordinates: punten }, distance: 12000 * n, duration: 720 * n }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return echt(invoer, init);
};
`);
const osrmAantal = () => readFileSync(osrmTeller, 'utf8').length;

// ---------- Portal starten (productiebuild) ----------
const server = spawn('npx', ['next', 'start', '-p', String(POORT)], {
  cwd: app,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    // pgbouncer=true zoals de pooler van Supabase: geen bewaarde prepared
    // statements, dus elke query telt zoals in productie.
    DATABASE_URL: `postgresql://${userInfo().username}@localhost:${PROXY_POORT}/${DB}?pgbouncer=true`,
    SESSION_SECRET: 'meetsleutel-alleen-lokaal-0123456789abcdef',
    BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_meet0000_alleenlokaal',
    VERCEL_BLOB_API_URL: `http://localhost:${BLOB_POORT}`,
    NODE_OPTIONS: `--require ${voorlader}`,
  },
});
let log = '';
server.stdout.on('data', (c) => { log += c; });
server.stderr.on('data', (c) => { log += c; });
for (let i = 0; i < 120 && !/Ready|ready in|started server/i.test(log); i++) await wacht(500);

// Een echte JPEG voor Monster nemen (de browser verkleint hem eerst).
const sharp = createRequire(join(app, 'package.json'))('sharp');
const foto = join(werkmap, 'foto.jpg');
await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 90, g: 120, b: 160 } } }).jpeg().toFile(foto);

// ---------- Chrome ----------
const cdpPoort = 9500 + Math.floor(Math.random() * 200);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${cdpPoort}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ids-meet-chrome-'))}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let doel;
for (let i = 0; i < 50 && !doel; i++) { await wacht(200); try { doel = (await (await fetch(`http://127.0.0.1:${cdpPoort}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(doel.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let volgnummer = 0;
const wachtend = new Map();
const stuur = (method, params = {}) => new Promise((r) => { const i = ++volgnummer; wachtend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

// Verzoeken naar de portal bijhouden.
const TELT = new Set(['Document', 'Fetch', 'XHR']);
const lopend = new Map();
let verzoeken = [];
let laatsteActiviteit = Date.now();
let laatsteAntwoord = 0;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wachtend.has(m.id)) { wachtend.get(m.id)(m); wachtend.delete(m.id); return; }
  const p = m.params;
  if (m.method === 'Network.requestWillBeSent') {
    if (!p.request.url.startsWith(BASIS) || !TELT.has(p.type) || p.request.url.includes('/_next/static')) return;
    lopend.set(p.requestId, p.request.url);
    verzoeken.push(`${p.request.method} ${p.request.url.slice(BASIS.length)}`);
    laatsteActiviteit = Date.now();
  } else if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') {
    if (lopend.delete(p.requestId)) { laatsteActiviteit = Date.now(); laatsteAntwoord = Date.now(); }
  }
});
await stuur('Page.enable');
await stuur('Network.enable');
await stuur('Runtime.enable');
await stuur('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
// Geen bevestigingsvensters (confirm) die de meting laten hangen.
await stuur('Page.addScriptToEvaluateOnNewDocument', { source: 'window.confirm = () => true; window.alert = () => {};' });

const js = async (expressie) => {
  const r = await stuur('Runtime.evaluate', { expression: expressie, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(`${expressie}: ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`);
  return r.result?.result?.value;
};

/** Wacht tot er 700 ms lang niets meer loopt (en minstens één verzoek klaar is als dat verwacht wordt). */
async function rustig(max = 30000) {
  const start = Date.now();
  await wacht(250);
  while (Date.now() - start < max) {
    if (lopend.size === 0 && Date.now() - laatsteActiviteit > 700) return;
    await wacht(50);
  }
  throw new Error(`Na ${max} ms nog verzoeken bezig: ${[...lopend.values()].join(', ')}`);
}

/** Wacht tot een element er is. */
async function wachtOp(selector, max = 15000) {
  const start = Date.now();
  while (Date.now() - start < max) {
    if (await js(`!!document.querySelector(${JSON.stringify(selector)})`)) return;
    await wacht(100);
  }
  throw new Error(`Element ${selector} niet gevonden op ${await js('location.pathname')}`);
}

const ga = async (pad) => { await stuur('Page.navigate', { url: BASIS + pad }); await rustig(); };
const klik = (expressie) => js(`(() => { const el = ${expressie}; if (!el) throw new Error('niet gevonden: ' + ${JSON.stringify(expressie)}); el.click(); return true; })()`);
const knopMetTekst = (tekst, binnen = 'document') => `[...${binnen}.querySelectorAll('button')].find((b) => b.textContent.trim().includes(${JSON.stringify(tekst)}) && !b.disabled)`;
// Een React-veld vullen: via de echte setter, anders ziet React de wijziging niet.
const vul = (selector, waarde) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(waarde)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

const uitkomsten = [];
async function meet(naam, voorbereiden, actie) {
  if (voorbereiden) await voorbereiden();
  await rustig();
  roundtrips = 0;
  queries = 0;
  sql = [];
  verzoeken = [];
  const osrmVoor = osrmAantal();
  const t0 = Date.now();
  laatsteAntwoord = t0;
  await actie();
  await rustig();
  // http: alles naar de portal; api: alleen /api (wat de pagina zelf ophaalt
  // of opslaat); de rest zijn de pagina zelf en RSC-verzoeken (ook het
  // vooraf ophalen van links in de navigatie).
  const api = verzoeken.filter((v) => v.split(' ')[1].startsWith('/api/')).length;
  const rij = { actie: naam, db: queries, roundtrips, http: verzoeken.length, api, osrm: osrmAantal() - osrmVoor, ms: Math.max(0, laatsteAntwoord - t0), verzoeken, sql };
  uitkomsten.push(rij);
  console.log(`${naam.padEnd(34)} query's ${String(rij.db).padStart(4)}  roundtrips ${String(roundtrips).padStart(4)}  http ${String(rij.http).padStart(3)} (api ${String(api).padStart(2)})  osrm ${rij.osrm}  ${String(rij.ms).padStart(6)} ms`);
}

const jaar = new Date().getFullYear();
const inloggen = async () => {
  await vul('input[autocomplete="username"], input[name="username"], #username', 'admin');
  await vul('input[type="password"]', 'admin123');
  await klik(`document.querySelector('form button[type="submit"]')`);
};

try {
  // Opwarmen: elke pagina een keer openen, zodat de eerste meting niet het
  // opstarten van de server en de databaseverbindingen meetelt.
  await ga('/login');
  await inloggen();
  await rustig();
  for (const pad of ['/dashboard', `/dashboard/oliemonsters/${jaar}`, `/dashboard/planning?jaar=${jaar}`, '/dashboard/klanten']) await ga(pad);
  await stuur('Network.clearBrowserCookies');

  const cookie = async () => {
    const { result } = await stuur('Network.getCookies', { urls: [BASIS] });
    return result.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  };
  const api = async (pad) => (await fetch(BASIS + pad, { headers: { Cookie: await cookie() } })).json();

  await meet('Inloggen (tot Vandaag staat)', () => ga('/login'), inloggen);
  await meet('Vandaag openen', null, () => stuur('Page.navigate', { url: `${BASIS}/dashboard` }));
  await meet('Oliemonsterlijst openen', null, () => stuur('Page.navigate', { url: `${BASIS}/dashboard/oliemonsters/${jaar}` }));

  // Bewerkvenster: eerst openen, dan opslaan met een andere opmerking.
  await wachtOp('.knop-bewerk');
  await meet('Bewerkvenster openen', null, () => klik(`document.querySelector('.knop-bewerk')`));
  await meet('Monster opslaan (bewerkvenster)', () => vul('#veld-opmerkingen', `Gemeten ${Date.now()}`), () => klik(`document.querySelector('button[form="sample-form"]')`));

  await meet('Status aantikken', null, () => klik(`document.querySelector('.status-knop:not([disabled])')`));

  // Monster nemen met twee foto's.
  await meet(
    "Monster nemen met 2 foto's",
    async () => {
      await klik(`document.querySelector('.knop-nemen')`);
      await wachtOp('[role="dialog"] input[type="file"]');
      const { result } = await stuur('DOM.getDocument', { depth: -1 });
      const { result: velden } = await stuur('DOM.querySelectorAll', { nodeId: result.root.nodeId, selector: '[role="dialog"] input[type="file"]' });
      for (const nodeId of velden.nodeIds) await stuur('DOM.setFileInputFiles', { nodeId, files: [foto] });
      await wacht(300);
    },
    () => klik(knopMetTekst('Opslaan als genomen'))
  );

  // Planning.
  await ga(`/dashboard/planning?jaar=${jaar}`);
  await wachtOp('#plan-datum');
  await meet(
    'Planning: dag toevoegen',
    async () => {
      // Een werkdag ver weg die er zeker nog niet staat.
      const dag = new Date(jaar, 11, 15);
      while (dag.getDay() === 0 || dag.getDay() === 6) dag.setDate(dag.getDate() + 1);
      const iso = `${dag.getFullYear()}-${String(dag.getMonth() + 1).padStart(2, '0')}-${String(dag.getDate()).padStart(2, '0')}`;
      await vul('#plan-datum', iso);
    },
    () => klik(knopMetTekst('Toevoegen', `document.querySelector('.plan-nieuwe-dag')`))
  );
  await meet(
    'Planning: object inplannen',
    async () => {
      await klik(knopMetTekst('Inplannen', `document.querySelector('.plan-objecten')`));
      await wachtOp('#plan-kies-titel');
    },
    () => klik(knopMetTekst('Op de dag zetten'))
  );
  await meet('Planning: volgorde wijzigen', null, () => klik(`[...document.querySelectorAll('button[aria-label$="naar beneden"]')].find((b) => !b.disabled)`));
  await meet('Planning: object van dag halen', null, () => klik(`document.querySelector('button[aria-label$="van deze dag halen"]')`));
  await meet('Planning: route berekenen', null, () => klik(knopMetTekst('Route berekenen')));

  // Dagscherm van vandaag.
  const { dagen } = await api(`/api/sample-plans?year=${jaar}`);
  const sleutel = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
  const vandaag = dagen.find((d) => sleutel(d.date) === sleutel(new Date()));
  await meet('Dagscherm openen', null, () => stuur('Page.navigate', { url: `${BASIS}/dashboard/planning/dag/${vandaag.id}` }));

  // Klantdossier van Mourik.
  const klanten = await api('/api/klanten');
  const mourik = klanten.find((k) => k.naam.toLowerCase().includes('mourik'));
  await meet('Klantdossier openen', null, () => stuur('Page.navigate', { url: `${BASIS}/dashboard/klanten/${mourik.id}` }));

  // Navigeren binnen de portal (zonder volledige paginalading): via het menu van Vandaag naar de planning.
  await ga('/dashboard');
  await meet('Menu: van Vandaag naar Planning', null, () => klik(`document.querySelector('.zijbalk a[href="/dashboard/planning"]')`));

} catch (e) {
  console.error(e);
  console.error(log.split('\n').slice(-30).join('\n'));
  process.exitCode = 1;
} finally {
  if (uitBestand) writeFileSync(uitBestand, JSON.stringify({ app, vertraging: VERTRAGING, datum: new Date().toISOString(), uitkomsten }, null, 2));
  ws.close();
  chrome.kill();
  server.kill('SIGTERM');
  proxy.close();
  blob.close();
  setTimeout(() => process.exit(), 500);
}
