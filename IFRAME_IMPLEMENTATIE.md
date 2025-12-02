# Iframe Implementatie Instructies

De webapp is nu geconfigureerd om te werken als iframe op je hoofdwebsite.

## Belangrijke Configuratie Stappen

### 1. Vervang Domein Placeholder

**In `middleware.ts` (regel 14, 34):**
```typescript
const allowedOrigins = [
  'https://jouwdomein.nl', // ← VERVANG DIT
  'http://localhost:3000',
];

// En:
"frame-ancestors 'self' https://jouwdomein.nl http://localhost:3000"
// ← VERVANG jouwdomein.nl
```

**In `next.config.ts` (regel 16, 20):**
```typescript
value: 'ALLOW-FROM https://jouwdomein.nl', // ← VERVANG DIT
// En:
value: "frame-ancestors 'self' https://jouwdomein.nl", // ← VERVANG DIT
```

Vervang `https://jouwdomein.nl` met het werkelijke domein van je website, bijvoorbeeld:
- `https://itsdonesservices.nl`
- `https://www.itsdonesservices.nl`

### 2. SSL/HTTPS is Verplicht in Productie

Voor iframe embedding met cross-origin cookies (sessies) **moet** je website:
- ✅ HTTPS gebruiken (geen HTTP)
- ✅ Een geldig SSL certificaat hebben

Dit is een browser security requirement voor `SameSite=None` cookies.

### 3. Iframe HTML Code

Voeg deze code toe aan je website waar je de webapp wilt tonen:

```html
<iframe 
  src="https://jouw-webapp-url.vercel.app"
  width="100%"
  height="800"
  frameborder="0"
  allow="clipboard-write; clipboard-read"
  style="border: none; min-height: 800px;"
></iframe>
```

### 4. Responsive Styling (Optioneel)

Voor een responsive iframe die zich aanpast aan schermgrootte:

```html
<div style="position: relative; padding-bottom: 100%; height: 0; overflow: hidden;">
  <iframe 
    src="https://jouw-webapp-url.vercel.app"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"
    frameborder="0"
    allow="clipboard-write; clipboard-read"
  ></iframe>
</div>
```

Of voor een vaste hoogte met scroll:

```html
<div style="width: 100%; height: 90vh; overflow: auto;">
  <iframe 
    src="https://jouw-webapp-url.vercel.app"
    width="100%"
    height="100%"
    frameborder="0"
    allow="clipboard-write; clipboard-read"
    style="border: none;"
  ></iframe>
</div>
```

## Wat is er Aangepast?

### Security Headers
- ✅ `X-Frame-Options` verwijderd (blokkeerde iframes)
- ✅ `Content-Security-Policy` met `frame-ancestors` toegevoegd
- ✅ CORS headers voor cross-origin requests

### Session Cookies
- ✅ `SameSite=None` in productie (vereist voor cross-origin iframes)
- ✅ `SameSite=Lax` in development (localhost)
- ✅ `secure=true` in productie (vereist voor SameSite=None)

### Middleware
- ✅ Nieuwe `middleware.ts` voor request/response headers
- ✅ CORS ondersteuning voor API calls vanuit iframe

## Testen

### Lokaal Testen
1. Start de webapp: `npm run dev`
2. Maak een test HTML bestand:
```html
<!DOCTYPE html>
<html>
<head>
  <title>Iframe Test</title>
</head>
<body>
  <h1>Test Iframe</h1>
  <iframe 
    src="http://localhost:3000"
    width="100%"
    height="800"
    frameborder="0"
  ></iframe>
</body>
</html>
```
3. Open dit bestand in je browser

### Production Testen
1. Deploy de wijzigingen naar Vercel
2. Voeg de iframe toe aan je website
3. Test de login functionaliteit
4. Controleer of sessies blijven werken

## Troubleshooting

### Probleem: Cookies werken niet in iframe
**Oplossing:**
- Controleer of je website HTTPS gebruikt
- Controleer of het domein correct is ingevuld in de configuratie
- Check browser console voor security errors

### Probleem: "Refused to frame" error
**Oplossing:**
- Controleer of `middleware.ts` correct is geïmporteerd
- Verifieer dat het domein in `frame-ancestors` klopt
- Clear browser cache en herlaad

### Probleem: Session verlies bij page refresh
**Oplossing:**
- Dit kan gebeuren in Safari/iOS vanwege striktere cookie policies
- Vraag gebruikers om cookies/third-party cookies toe te staan
- Overweeg Storage Access API voor betere Safari ondersteuning

## Beveiliging

De volgende security maatregelen blijven actief:
- ✅ Password hashing (bcrypt)
- ✅ Audit logging
- ✅ Session management
- ✅ Role-based access control (admin/user)
- ✅ HTTPS only in productie
- ✅ HttpOnly cookies (niet toegankelijk via JavaScript)

De iframe implementatie voegt **geen** security risico's toe als je:
- Het domein beperkt tot je eigen website (niet '*')
- HTTPS gebruikt
- Het SESSION_SECRET environment variable veilig houdt

## Environment Variables

Vergeet niet deze environment variabele in te stellen op Vercel:

```
SESSION_SECRET=een_zeer_lange_random_string_van_minstens_32_karakters
```

Genereer een veilig secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Vragen?

Bij problemen:
1. Check browser console voor errors
2. Controleer Vercel logs voor server-side errors
3. Verifieer dat alle domein placeholders zijn vervangen
4. Test eerst lokaal, dan op production
