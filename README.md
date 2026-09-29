# Oliemonster Analyse Webapp

Een webapp voor het bijhouden en inzichtelijk maken van oliemonsteranalyses.

## Features

✅ **Authenticatie**
- Beveiligde login met gebruikersnaam en wachtwoord
- Rolgebaseerde toegang (Admin / Gebruiker)
- Sessie management

✅ **Oliemonsters Beheer**
- Toevoegen, bewerken en verwijderen van monsters (alleen admin)
- Inzien van alle monsters (alle gebruikers)
- Visuele status indicatie (groen = genomen, rood = niet genomen)

✅ **Zoekfunctionaliteit**
- Realtime zoeken op o-nummer, locatie en omschrijving

✅ **Gegevens per Monster**
- O-nummer
- Datum afname
- Locatie
- Omschrijving
- Status (genomen/niet genomen)

## Technologie Stack

- **Frontend**: Next.js 16, React 19, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (Supabase in productie, Homebrew PostgreSQL lokaal) + Prisma ORM met migraties
- **Authenticatie**: iron-session + bcryptjs, toegang per route via `withAuth` (lib/toegang.ts)
- **Invoer**: zod, via `apiRoute` in lib/apiRoute.ts
- **Tests**: Vitest (tests/), GitHub Action in .github/workflows/ci.yml

## Installatie

### Vereisten
- Node.js 20.9+ en npm
- PostgreSQL 17 lokaal (Homebrew)

### Lokale database

Voor ontwikkelen en tests draait er een PostgreSQL op je eigen Mac. Productie
(Supabase) raak je lokaal nooit aan.

```bash
brew install postgresql@17
brew services start postgresql@17          # start nu en na elke herstart
/opt/homebrew/opt/postgresql@17/bin/createdb ids_portal_dev
/opt/homebrew/opt/postgresql@17/bin/createdb ids_portal_test
/opt/homebrew/opt/postgresql@17/bin/createdb ids_portal_shadow   # alleen voor npm run db:controle
```

Zet in `.env` (Prisma CLI) en `.env.development.local` (next dev) de lokale
database. Beide staan niet in git:

```env
# .env
DATABASE_URL="postgresql://JOUW_MAC_GEBRUIKER@localhost:5432/ids_portal_dev"

# .env.development.local
DATABASE_URL="postgresql://JOUW_MAC_GEBRUIKER@localhost:5432/ids_portal_dev"
SESSION_SECRET="een-willekeurige-lokale-sleutel-van-32-tekens-of-meer"
```

### Setup

```bash
npm install
npx prisma migrate deploy      # schema in ids_portal_dev zetten
npm run seed                   # nepdata: twee jaren oliemonsters, objecten, planning, gebruikers
npm run dev                    # http://localhost:3000
```

`npm run seed` wist eerst alles en weigert te draaien als `DATABASE_URL` niet
naar een database op deze computer wijst.

## Inloggegevens (lokaal, na npm run seed)

| Gebruiker | Wachtwoord | Rol |
|---|---|---|
| `admin` | `admin123` | admin |
| `gebruiker` | `user123` | gebruiker (leest alles, wijzigt niets) |
| `kijker` | `kijker123` | alleen lezen, alleen 2025, klant Mourik, weergave klassiek (zoals de Mourik-kijker) |
| `kempen` | `kempen123` | alleen lezen, alle jaren, tweede klant (Kempen Metaalbewerking), weergave klantportaal |
| `nieuw` | geen | moet eerst een wachtwoord instellen via een uitnodigingslink |

## Gebruikshandleiding

### Voor Beheerders (Admin)

1. **Inloggen** met admin account
2. **Monsters toevoegen**: Klik op "Nieuw Monster" knop
3. **Monsters bewerken**: Klik op "Bewerken" naast een monster
4. **Monsters verwijderen**: Open Bewerken, onderaan staat het blok Monster verwijderen. Typ het O-nummer over ter bevestiging. Het monster gaat naar de prullenbak (tab Prullenbak, per jaar) en is daar terug te zetten
5. **Zoeken**: Typ in het zoekveld om te filteren

### Voor Gebruikers

1. **Inloggen** met gebruiker account
2. **Monsters bekijken**: Zie de lijst met alle monsters
3. **Zoeken**: Gebruik de zoekbalk om monsters te vinden
4. **Status controleren**: 
   - 🟢 Groene badge = Monster is genomen
   - 🔴 Rode badge = Monster nog niet genomen

## Project Structuur

```
oliemonster-webapp/
├── app/
│   ├── api/
│   │   ├── auth/          # Authenticatie endpoints
│   │   └── samples/       # Oliemonster CRUD endpoints
│   ├── dashboard/         # Hoofdpagina (beveiligd)
│   ├── login/             # Login pagina
│   └── page.tsx           # Root redirect
├── lib/
│   ├── prisma.ts          # Prisma client configuratie
│   └── session.ts         # Sessie configuratie
├── prisma/
│   ├── schema.prisma      # Database schema
│   ├── seed.ts            # Seed script
│   ├── migrations/        # Database migraties (0_basis en verder)
│   ├── basis-schema.prisma # Het schema van 0_basis, voor db-bijwerken.sh
│   └── nepdata.ts         # Nepdata voor seed en tests
└── package.json
```

## Database Schema

### User
- id (Int)
- username (String, unique)
- password (String, hashed)
- role (String: "admin", "user" of "alleen_lezen", zie lib/roles.ts)
- viewYear (Int, optioneel: bij alleen lezen het enige analysejaar dat deze gebruiker mag zien; leeg = alle jaren)
- createdAt (DateTime)

### Klanten (sinds fase 1b)
- `Klant` (naam, adres, postcode, plaats, KvK, notities, zacht verwijderen)
- `Contactpersoon` per klant (naam, functie, e-mail, telefoon)
- `SampleObject.klantId`: een object (kunstwerk, vestiging, locatie) hoort bij een klant
- `Installatie` op een object (pomp, aggregaat, compressor, pers; merk, type,
  bouwjaar, serienummer, foto, korte `code` voor een latere QR-sticker)
- `OilSample.installatieId` (optioneel), `Prospect.klantId` (na Wordt klant),
  `User.klantId` (kijkers: ziet alleen die klant, zie Toegang)
- Sinds fase 3: `User.portaalWeergave` (`klassiek` of `klantportaal`), `Klant.logoUrl`,
  `OilSample.klantId` (alleen voor een monster zonder object: bij welke klant het hoort)

### OilSample
- id (Int)
- oNumber (String, uniek per analysisYear)
- sampleDate (DateTime)
- location (String)
- description (String)
- isTaken (Boolean)
- isDisabled (Boolean: geannuleerd, valt buiten de planning)
- isUnreachable (Boolean: de locatie was niet te bereiken; blijft openstaan en telt mee in de planning)
- photoUrl (String: foto van het monsterpotje)
- partPhotoUrl (String: foto van het onderdeel waar het monster vandaan komt)
- createdAt (DateTime)
- updatedAt (DateTime)

## API Endpoints

### Authenticatie
- `POST /api/auth/login` - Inloggen
- `POST /api/auth/logout` - Uitloggen
- `GET /api/auth/session` - Sessie info ophalen

### Oliemonsters

De pagina is `/dashboard/oliemonsters/[jaar]`, één voor elk jaar. De oude
adressen `/dashboard/oliemonsters` (2025) en `/dashboard/oliemonsters2026`
sturen door (next.config.ts).

Datum, genomen, opmerking en de twee foto's op OilSample zijn een spiegel van
de laatste poging. Ze worden alleen via `wijzigLaatstePoging`
(lib/sampleAttempts.ts) geschreven, nooit rechtstreeks op het monster.

- `GET /api/samples?search={query}` - Alle monsters ophalen (met optionele zoekfilter)
- `GET /api/samples/jaren` - Jaren met monsters, met aantal en genomen
- `POST /api/samples` - Nieuw monster toevoegen (admin only)
- `PUT /api/samples/[id]` - Monster bijwerken (admin only)
- `DELETE /api/samples/[id]` - Monster naar de prullenbak (admin only, body `{ bevestigONummer }`; zacht verwijderen via `deletedAt`)
- `GET /api/samples/verwijderd?year=` - Prullenbak van een jaar (admin only)
- `POST /api/samples/[id]/herstellen` - Monster terugzetten uit de prullenbak (admin only)
- `POST /api/samples/[id]/afname-ongedaan` - Laatste monstername terug naar niet genomen (admin only)

### Planning
- `GET /api/sample-plans?year=` - Alle dagen van een jaar met stops, monsters en tijden, plus de objecten (met klant)
- `GET /api/sample-plans/[id]` - Eén dag, voor het dagscherm (zelfde getallen, uit `haalPlanning`)

### Klanten en installaties (alleen admin)
- `GET/POST /api/klanten`, `GET/PUT/DELETE /api/klanten/[id]` (DELETE zacht, body `{ bevestigNaam }`), `POST /api/klanten/[id]/herstellen`
- `POST /api/klanten/[id]/contactpersonen`, `PUT/DELETE /api/contactpersonen/[id]`, `POST /api/contactpersonen/[id]/herstellen`
- `GET/POST /api/installaties` (`?klantId=`, `?objectId=`), `GET/PUT/DELETE /api/installaties/[id]` (DELETE zacht, body `{ bevestigCode }`), `POST .../herstellen`, `POST/DELETE .../foto`
- `POST /api/prospects/[id]/wordt-klant` - Klant (plus contactpersoon) uit een prospect; 409 met `bestaandeKlant` als de naam al bestaat, dan opnieuw met `{ klantId }`

### Klantportaal, rapport en dossier (fase 3)
- `GET /api/portaal?jaar=` - het klantportaal van een kijker (altijd zijn eigen klant; admin en gebruiker met `?klantId=`)
- `GET /api/rapport?jaar=&klantId=&fotos=0` - rapport als PDF, op de server gemaakt (lib/rapport/rapportPdf.ts: jsPDF, Inter uit lib/rapport/fonts, foto's verkleind met sharp). Een kijker alleen van zijn eigen klant en jaar; elke download staat in het logboek (`RAPPORT_DOWNLOAD`)
- `GET /api/klanten/[id]/dossier?jaar=` - klantdossier met momenten per object en installatie (admin)
- `POST/DELETE /api/klanten/[id]/logo` - logo van een klant (admin, multipart, in UPLOAD_ROUTES)
- `GET /api/fotos/monster|poging|installatie|klantlogo/...` - elke foto (zie hieronder)
- `/privacy` - de privacyverklaring, openbaar, gemarkeerd als concept (tekst in app/privacy/tekst.ts)

### Foto's
Uploaden via `bewaarFoto` (lib/fotoOpslag.ts): Vercel Blob onder een
onvindbare naam (`fotos/<32 hex>.jpg` plus het achtervoegsel van Blob; in de
naam staat niets meer over het monster).

**Besluit fase 3, privé foto's.** @vercel/blob 2.0 (de versie in dit project)
kent alleen `access: 'public'`; private opslag vraagt een nieuwere versie en een
aparte private store in Vercel. Daarom: technisch openbaar maar onvindbaar, en
het adres komt nooit meer bij de browser. Alle schermen tonen foto's via
`/api/fotos/...` (adres uit lib/fotoAdres.ts, met `?v=` voor de cache). Die
route controleert eerst of de gebruiker het monster, de installatie of de klant
mag zien (lib/afscherming.ts, anders 404), haalt de foto dan zelf op en stuurt
hem door (`Cache-Control: private`). Bestaande publieke adressen blijven staan en
gaan ook via die route; een adres buiten onze opslag krijgt na de controle een
doorverwijzing. Stapt het project later over op private Blob, dan hoeft alleen
`bewaarFoto` en `haalFoto` (lib/fotoLaden.ts) mee te veranderen.

 Wordt een foto vervangen of verwijderd, dan ruimt
`ruimFotoOpAls` het oude bestand op (`del()`), maar alleen als geen monster,
poging of installatie het adres nog gebruikt. Bij Afname ongedaan, Weer
bereikbaar en een poging verwijderen blijven de foto's staan, met het adres in
het logboek. Bestaande adressen blijven werken.

## Database: schema wijzigen en bijwerken

Het schema gaat met migraties (`prisma/migrations/`), niet meer met `db push`.
De oude `db-push-*.sh`-scripts zijn vervangen en niet meer nodig.

**Schema wijzigen (lokaal):**

1. Pas `prisma/schema.prisma` aan.
2. `npx prisma migrate dev --name korte-naam` maakt de migratie en zet hem in
   `ids_portal_dev`. Commit de nieuwe map in `prisma/migrations/` mee.
3. `npm test` draait de tests tegen `ids_portal_test` met alle migraties.

`0_basis` is de beginstand: precies het schema van main op 29 september 2026.
`prisma/basis-schema.prisma` is dat schema als bestand, voor de controle
hieronder. Pas die twee nooit aan; wijzigingen komen altijd in een nieuwe migratie.

**Migraties sinds 0_basis (fase 1b):**

- `20260929180000_klanten_en_installaties`: nieuwe tabellen Klant,
  Contactpersoon en Installatie, nieuwe lege kolommen (klantId op
  SampleObject, User en Prospect, installatieId op OilSample). Daarna één
  klant Mourik Infra B.V. (Trambaan 15, 6101 AJ Echt) met daaraan alle
  bestaande objecten en alle gebruikers met de rol alleen lezen (ook de oude
  kijkersrol). Idempotent: geen tweede Mourik, geen bestaande koppeling
  overschreven. Er verdwijnt niets.
- `20260929180100_gebruiker_koppelingen`: echte foreign keys van AuditLog en
  UltimoComment naar User (ON DELETE SET NULL). Verwijzingen naar gebruikers
  die al niet meer bestaan worden eerst leeg gemaakt; de gebruikersnaam staat
  als tekst in dezelfde regel en blijft.
- `20260929180200_contact_opheffen`: Contact en ContactNote gaan alleen weg als
  ze allebei leeg zijn. Staat er iets in, dan blijven ze onaangeroerd staan.

**Migratie fase 3 (klantportaal):**

- `20260930090000_klantportaal`: nieuwe lege kolommen `Klant.logoUrl` en
  `OilSample.klantId` (met foreign key, ON DELETE SET NULL) en
  `User.portaalWeergave` met standaard `klassiek`, dus elke bestaande gebruiker,
  ook de Mourik-kijker, houdt precies wat hij had. Daarna: alle monsters zonder
  object krijgen klant Mourik (alleen waar nog niets staat), zodat de
  Mourik-kijker ze blijft zien nu de afscherming per klant geldt, en Mourik
  krijgt het logo `/mourik_logo.png`. Er verdwijnt niets; vaker draaien doet
  niets extra.

- `20260930090100_cache_naar_poging`: alleen data. Op main schreef Bijwerken opmerking,
  datum en status, en de fotoknop de foto's, rechtstreeks op het monster. Sinds fase 1b
  spiegelt elke klik de laatste poging naar het monster; zonder deze migratie zou zo'n
  monster bij de eerste klik terugspringen. Drie stappen: (0) een monster met gegevens maar
  zonder poging krijgt een poging met die gegevens; (1) lege opmerking en foto's van de
  laatste poging worden gevuld vanuit het monster; (2) datum en status van het monster gaan
  naar de laatste poging, behalve als een andere poging daardoor de laatste zou worden (die
  blijven staan en moeten met de hand bekeken worden); (3) is de nieuwste poging een geplande
  hermonstering, dan blijft die gepland en krijgt de vorige poging genomen en de datum.
  `./db-bijwerken.sh` toont zelf vooraf hoeveel monsters het raakt en na afloop welke nog
  afwijken (scripts/cache-telling.mjs, alleen lezen), en zegt dat de deploy meteen moet volgen.

**Productie bijwerken (Roel, op zijn Mac):**

```bash
./db-bijwerken.sh
```

De eerste keer controleert het script of de Supabase-database precies gelijk is
aan `0_basis`. Is er een verschil, dan stopt het met het verschil als SQL en is
er niets gewijzigd. Is er geen verschil, dan registreert het `0_basis` als
toegepast (zonder iets uit te voeren) en voert het daarna alle nieuwere
migraties uit (`prisma migrate deploy`). Daarna doet elke keer alleen dat
laatste. Vaker draaien kan geen kwaad.

## Tests

```bash
npm test                 # alle tests (Vitest), de lokale PostgreSQL moet draaien
npm run lint             # 0 fouten; waarschuwingen mogen
npx tsc --noEmit
npm run db:controle      # passen de migraties bij schema.prisma?
```

Screenshots met de echte lokale database en een echte inlog (1440 en 390 breed,
uitvoer in `schermen/`):

```bash
node scripts/schermen.mjs --seed                                   # standaardset
node scripts/schermen.mjs kijker:/dashboard/oliemonsters/2025 admin:/dashboard/klanten
node scripts/schermen.mjs admin:/dashboard/planning/dag/{vandaag}            # dagscherm van vandaag
node scripts/schermen.mjs kempen:/dashboard admin:/dashboard/klanten/{kempen}   # klantportaal en klantdossier
node scripts/schermen.mjs "admin:/dashboard@.onderbalk button:nth-of-type(1)"  # eerst klikken (menu open)
```

De nepdata zet de planning ten opzichte van vandaag (een monsterdag vandaag en
overmorgen) en drie prospects met acties, zodat Vandaag altijd iets laat zien.

De tests in `tests/db` en `tests/routes` wissen `ids_portal_test` en vullen hem
met `prisma/nepdata.ts`. Een andere testdatabase kan via `TEST_DATABASE_URL`.
De GitHub Action (`.github/workflows/ci.yml`) draait bij elke push lint, tsc,
de migratiecontrole, de tests (met een eigen PostgreSQL) en de build.

## Toegang

- Moduleregister: `lib/modules.ts` (naam, icoon, route, sectie Werk, Klanten,
  Rapportage of Beheer, rollen). Bron voor de navigatie (zijbalk en onderbalk,
  `navigatieVoor()`), de dashboardtegels van de kijker en de paginatoegang. Een
  nieuwe module: daar toevoegen, dan staat hij vanzelf in het menu.
- Startscherm `/dashboard`: voor beheerder en gebruiker Vandaag (monsterdag,
  acties, deze week, openstaande monsters, voortgang; `lib/vandaag.ts`), voor de
  kijker het oude dashboard met tegels per jaar.
- Planning: `/dashboard/planning?jaar=2026` (ook als tab op de oliemonsterpagina),
  het dagscherm (veldscherm) van een dag op `/dashboard/planning/dag/[id]`.
- De kijker (rol alleen lezen) heeft een weergave per gebruiker (`User.portaalWeergave`,
  in te stellen bij Instellingen, Gebruikers):
  - `klassiek`: de oude navy balk, geen navigatie, geen Vandaag en geen compacte lijst,
    pixel voor pixel zoals voor fase 3. Standaard voor alle bestaande gebruikers.
  - `klantportaal`: alleen `/dashboard`, met het klantportaal (app/components/portaal/KlantPortaal.tsx).
    Kan alleen met een klant; standaard voor een nieuwe kijker met een klant.
- Wie inlogt, wordt met klant en weergave uit de database gelezen, zonder terugval: ontbreekt
  een kolom (database niet bij), dan een 500 in plaats van te veel laten zien.
- Een monster dat zijn object verliest (object leeg, locatie losgekoppeld, object weg) houdt
  de klant van dat object in `OilSample.klantId` (`bewaarKlantBijLoskoppelen`); overnemen naar
  een nieuw jaar neemt de klant mee.
- Een rapport boven 4 MB (Vercel-limiet 4,5 MB) gaat eerst naar Blob (`rapporten/`, onvindbare
  naam, een uur bewaard) en de browser krijgt een doorverwijzing. Opruimen gebeurt bij de volgende grote
  download; komt die niet, dan blijft het (openbare maar onvindbare) bestand staan.
- Een kijker krijgt uit `/api/samples` geen `cancelledBy` en `unreachableBy`, en geen reden
  van annuleren die niet in de PDF mag. `/api/portaal` en `/api/rapport` alleen voor de
  weergave klantportaal (en medewerkers); de klassieke kijker maakt, zoals op main, geen PDF.
- Een nieuw monster zonder object krijgt alleen een klant als `klantId` meekomt in de API;
  het monsterformulier heeft daar nog geen keuze voor. Zo'n monster ziet geen enkele kijker
  tot het een object (met klant) krijgt.
- Afscherming per klant (lib/afscherming.ts): een kijker met `klantId` ziet alleen de
  monsters, objecten, planning, foto's en rapporten van die klant, en daarbinnen alleen
  zijn `viewYear`. Bij welke klant een monster hoort: de klant van zijn object, of bij
  een monster zonder object `OilSample.klantId`. Een kijker zonder klant houdt het oude
  gedrag (alleen zijn jaar). Een id van een andere klant in de URL geeft een 404.
  Elke route die de rol alleen lezen toelaat, gebruikt `monsterFilter()` of `magMonsterZien()`.
- API-routes: `export const GET = apiRoute({ rol, module, fout }, async (request, context, sessie) => ...)`
  uit `lib/apiRoute.ts`. Dat is `withAuth` (lib/toegang.ts) plus invoer met zod
  (`leesJson`, `leesQuery`, `leesId`) en één foutvorm: `{ error, velden? }`,
  400 bij ongeldige invoer, `throw new ApiFout(status, melding)` voor een eigen
  melding, 503 als de database nog niet bij is, anders 500. De gebruiker komt bij elke aanvraag uit de database, dus
  een verwijderde of teruggezette gebruiker verliest meteen zijn rechten. `rol` is
  `alleen_lezen` (ook de kijker, alleen in module `oliemonsters`), `user` of `admin`.
- Na inloggen, wachtwoord instellen en de uitnodigingslink gaat het scherm met een
  volledige paginalading (`window.location.assign`) naar de startpagina; de login-API geeft
  die mee (`startpagina`, lib/paginaToegang.ts). Een client-navigatie (router.push) naar een
  pagina waar de layout doorstuurt, liet de kijker op een leeg scherm staan. De layout stuurt
  daarom bij een client-navigatie (Sec-Fetch-Dest niet `document`) door met `Doorsturen`
  (volledige paginalading) en alleen bij een gewone paginalading met `redirect()`.
- Pagina's: `app/dashboard/layout.tsx` controleert op de server sessie en rol en
  stuurt door; de regel staat in `lib/paginaToegang.ts` en leest het register.
  Een kijker komt alleen op `/dashboard/oliemonsters/<zijn jaar>`. Pagina's lezen de
  gebruiker met `useGebruiker()` en doen zelf geen sessiecheck.
- CSRF en "eerst wachtwoord instellen" staan daarnaast in `proxy.ts`.

## Productie Deployment

De portal draait op Vercel met de Supabase-database. Omgevingsvariabelen staan in
Vercel (`DATABASE_URL`, `SESSION_SECRET` van minimaal 32 tekens, `TOEGESTANE_ORIGINS`
optioneel). Na een schemawijziging: eerst `./db-bijwerken.sh`, dan deployen.

## Beveiliging

- ✅ Wachtwoorden worden gehashed met bcryptjs
- ✅ Sessies zijn beveiligd met iron-session
- ✅ API routes hebben authenticatie checks
- ✅ Rolgebaseerde autorisatie voor admin functies
- ⚠️ **BELANGRIJK**: Wijzig de `SESSION_SECRET` in productie!

## Ontwikkeling

### Nieuwe gebruiker toevoegen

Lokaal via Instellingen in de portal, of met Prisma Studio:
```bash
npx prisma studio
```

### Lokale database opnieuw vullen
```bash
npm run seed
```

### Type generation
```bash
npx prisma generate
```

## Support

Voor vragen of problemen, neem contact op met de ontwikkelaar.

## Licentie

Proprietary - Alleen voor gebruik door geautoriseerde klanten.
