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
- **Database**: SQLite + Prisma ORM
- **Authenticatie**: iron-session + bcryptjs

## Installatie

### Vereisten
- Node.js 18+ en npm

### Setup

1. **Dependencies installeren**
   ```bash
   npm install
   ```

2. **Database migratie uitvoeren**
   ```bash
   npx prisma migrate dev
   ```

3. **Database seeden met demo data**
   ```bash
   npm run seed
   ```

4. **Development server starten**
   ```bash
   npm run dev
   ```

5. **Open je browser**
   Navigeer naar [http://localhost:3000](http://localhost:3000)

## Inloggegevens

Na het seeden van de database zijn de volgende accounts beschikbaar:

### Admin Account
- **Gebruikersnaam**: `admin`
- **Wachtwoord**: `admin123`
- **Rechten**: Volledige toegang - kan monsters toevoegen, bewerken en verwijderen

### Gebruiker Account
- **Gebruikersnaam**: `gebruiker`
- **Wachtwoord**: `user123`
- **Rechten**: Alleen-lezen toegang - kan monsters alleen inzien

## Gebruikshandleiding

### Voor Beheerders (Admin)

1. **Inloggen** met admin account
2. **Monsters toevoegen**: Klik op "Nieuw Monster" knop
3. **Monsters bewerken**: Klik op "Bewerken" naast een monster
4. **Monsters verwijderen**: Klik op "Verwijderen" naast een monster
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
│   └── migrations/        # Database migraties
└── package.json
```

## Database Schema

### User
- id (Int)
- username (String, unique)
- password (String, hashed)
- role (String: "admin" of "user")
- createdAt (DateTime)

### OilSample
- id (Int)
- oNumber (String, unique)
- sampleDate (DateTime)
- location (String)
- description (String)
- isTaken (Boolean)
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
- `DELETE /api/samples/[id]` - Monster verwijderen (admin only)

## Productie Deployment

Voor productie deployment:

1. **Omgevingsvariabelen instellen**
   Maak een `.env.production` bestand aan:
   ```env
   DATABASE_URL="file:./production.db"
   SESSION_SECRET="je_zeer_veilige_random_string_van_minimaal_32_karakters"
   NODE_ENV="production"
   ```

2. **Build maken**
   ```bash
   npm run build
   ```

3. **Productie server starten**
   ```bash
   npm start
   ```

## Beveiliging

- ✅ Wachtwoorden worden gehashed met bcryptjs
- ✅ Sessies zijn beveiligd met iron-session
- ✅ API routes hebben authenticatie checks
- ✅ Rolgebaseerde autorisatie voor admin functies
- ⚠️ **BELANGRIJK**: Wijzig de `SESSION_SECRET` in productie!

## Ontwikkeling

### Nieuwe gebruiker toevoegen

Run Prisma Studio om handmatig gebruikers toe te voegen:
```bash
npx prisma studio
```

### Database resetten
```bash
rm prisma/dev.db
npx prisma migrate dev
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
