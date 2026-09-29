/*
  Service worker van de IDS Portal: alleen voor het veld zonder bereik.

  Wat hij doet, en verder niets:
  - Het veldscherm van een planningsdag (/dashboard/planning/dag/<id>), een
    inspectie (/dashboard/inspecties/<id>) en een dagrapport
    (/dashboard/dagrapporten/<id>): eerst het netwerk, en alleen als dat niet
    lukt de laatst bewaarde versie. Online verandert er dus niets.
  - De gegevens van die schermen (GET /api/sample-plans/<id>,
    /api/inspecties/<id>, /api/dagrapporten/<id>): ook eerst het netwerk.
  - De scripts en stijlen van Next.js (/_next/static/...): die veranderen nooit
    van inhoud (de naam bevat een hash), dus uit de bewaarde kopie als die er is.
  Alle andere verzoeken (inloggen, opslaan, andere pagina's, foto's, de kijker)
  gaan gewoon door, zonder dat deze worker ze aanraakt.

  Uitloggen wist de bewaarde schermen (wisVeldCache in VeldOffline.tsx). Elke
  build heeft een eigen cache; oude caches gaan bij het activeren weg.
*/

// Eén cache per build (VeldOffline registreert /sw.js?v=<build>); bij het
// activeren gaan de caches van eerdere builds weg.
const VERSIE = `ids-veld-${new URL(self.location.href).searchParams.get('v') || 'v1'}`;
const PAGINA = /^\/dashboard\/(planning\/dag|inspecties|dagrapporten)\/\d+$/;
const API = /^\/api\/(sample-plans|inspecties|dagrapporten)\/\d+$/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const naam of await caches.keys()) if (naam.startsWith('ids-veld-') && naam !== VERSIE) await caches.delete(naam);
      await self.clients.claim();
    })()
  );
});

function magBewaren(res) {
  return res && res.ok && res.type === 'basic' && !res.redirected;
}

/** Eerst het netwerk; bewaar een goed antwoord onder het pad (zonder zoekdeel). */
async function netwerkEerst(request, sleutel) {
  const cache = await caches.open(VERSIE);
  try {
    const res = await fetch(request);
    if (magBewaren(res)) await cache.put(sleutel, res.clone());
    return res;
  } catch (fout) {
    const bewaard = await cache.match(sleutel);
    if (bewaard) return bewaard;
    throw fout;
  }
}

async function bewaardEerst(request) {
  const cache = await caches.open(VERSIE);
  const bewaard = await cache.match(request);
  if (bewaard) return bewaard;
  const res = await fetch(request);
  if (magBewaren(res)) await cache.put(request, res.clone());
  return res;
}

const GEEN_BEREIK = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Geen verbinding</title>
<style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#F1F5F9;color:#0C1B33;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}main{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px;max-width:420px}h1{font-size:20px;margin:0 0 8px}p{margin:0 0 16px;color:#334155;line-height:1.5}a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:8px;background:#F97316;color:#0C1B33;font-weight:700;text-decoration:none}</style></head>
<body><main><h1>Geen verbinding</h1><p>Dit scherm is op deze telefoon nog niet eerder geopend, dus er is geen kopie om te tonen. Open het een keer met bereik, dan werkt het daarna ook zonder.</p><a href="/dashboard">Opnieuw proberen</a></main></body></html>`;

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Next.js haalt bij doorklikken de inhoud los op (RSC); daar blijven we af.
  if (request.headers.get('RSC') || url.searchParams.has('_rsc')) return;

  if (request.mode === 'navigate' && PAGINA.test(url.pathname)) {
    event.respondWith(
      netwerkEerst(request, url.pathname).catch(
        () => new Response(GEEN_BEREIK, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      )
    );
    return;
  }
  if (API.test(url.pathname)) {
    event.respondWith(netwerkEerst(request, url.pathname));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(bewaardEerst(request));
  }
});

// Het veldscherm vraagt na het laden om zichzelf, zijn gegevens en zijn
// scripts te bewaren (die kwamen binnen voordat deze worker meekeek).
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.soort !== 'bewaar') return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSIE);
      const alles = [
        ...(data.paginas || []).filter((p) => PAGINA.test(p)).map((p) => [p, p]),
        ...(data.api || []).filter((p) => API.test(p)).map((p) => [p, p]),
        ...(data.bronnen || []).filter((u) => new URL(u).pathname.startsWith('/_next/static/')).map((u) => [u, u]),
      ];
      for (const [adres, sleutel] of alles) {
        try {
          if (adres.startsWith('/_next/') || new URL(adres, self.location.origin).pathname.startsWith('/_next/')) {
            if (await cache.match(sleutel)) continue;
          }
          const res = await fetch(adres, { credentials: 'same-origin' });
          if (magBewaren(res)) await cache.put(sleutel, res);
        } catch {
          // geen bereik of weg: dan niet bewaard
        }
      }
    })()
  );
});
