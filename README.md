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
| `kijker` | `kijker123` | alleen lezen, alleen 2025 (zoals de Mourik-kijker) |
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
- `GET /api/samples?search={query}` - Alle monsters ophalen (met optionele zoekfilter)
- `POST /api/samples` - Nieuw monster toevoegen (admin only)
- `PUT /api/samples/[id]` - Monster bijwerken (admin only)
- `DELETE /api/samples/[id]` - Monster naar de prullenbak (admin only, body `{ bevestigONummer }`; zacht verwijderen via `deletedAt`)
- `GET /api/samples/verwijderd?year=` - Prullenbak van een jaar (admin only)
- `POST /api/samples/[id]/herstellen` - Monster terugzetten uit de prullenbak (admin only)
- `POST /api/samples/[id]/afname-ongedaan` - Laatste monstername terug naar niet genomen (admin only)

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
node scripts/schermen.mjs kijker:/dashboard/oliemonsters admin:/dashboard/objecten
```

De tests in `tests/db` en `tests/routes` wissen `ids_portal_test` en vullen hem
met `prisma/nepdata.ts`. Een andere testdatabase kan via `TEST_DATABASE_URL`.
De GitHub Action (`.github/workflows/ci.yml`) draait bij elke push lint, tsc,
de migratiecontrole, de tests (met een eigen PostgreSQL) en de build.

## Toegang

- API-routes: `export const GET = withAuth({ rol, module }, async (request, context, sessie) => ...)`
  uit `lib/toegang.ts`. De gebruiker komt bij elke aanvraag uit de database, dus
  een verwijderde of teruggezette gebruiker verliest meteen zijn rechten. `rol` is
  `alleen_lezen` (ook de kijker, alleen in module `oliemonsters`), `user` of `admin`.
- Pagina's: `app/dashboard/layout.tsx` controleert op de server sessie en rol en
  stuurt door; de regel staat in `lib/paginaToegang.ts`. Pagina's lezen de
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
