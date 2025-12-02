# Session Persistentie in Iframe Context

## Het Probleem

Wanneer de webapp wordt gebruikt in een iframe met `SameSite=None` cookies (nodig voor cross-origin iframes), kunnen sommige browsers deze cookies anders behandelen:

### Browser Gedrag:
- **Chrome/Edge**: `SameSite=None` cookies werken goed, maar kunnen worden verwijderd bij "Clear browsing data"
- **Safari/iOS**: Zeer strikt met third-party cookies, kan deze verwijderen bij:
  - Browser afsluiten
  - 7 dagen inactiviteit (Intelligent Tracking Prevention)
  - Privacy instellingen van de gebruiker
- **Firefox**: Behandelt `SameSite=None` cookies redelijk, maar kan ze blokkeren met Enhanced Tracking Protection

## Huidige Configuratie

```typescript
cookieOptions: {
  httpOnly: true,
  secure: true,              // Vereist voor SameSite=None
  maxAge: 60 * 60 * 24 * 30, // 30 dagen (maximale levensduur)
  sameSite: 'none',          // Vereist voor iframe embedding
  path: '/',
}
```

## Waarom Dit Nodig Is

Voor iframe embedding op `www.itsdoneservices.nl` zijn `SameSite=None` cookies **verplicht**. Zonder dit werkt login helemaal niet in de iframe. Dit is een fundamentele browser security requirement.

## Trade-offs

### ✅ Voordelen:
- Login werkt in iframe
- Alle functies werken in iframe context
- Cross-origin authenticatie mogelijk

### ⚠️ Nadelen:
- Session persistentie kan korter zijn
- Gebruikers moeten mogelijk vaker opnieuw inloggen
- Safari gebruikers hebben de strengste beperkingen

## Oplossingen en Verbeteringen

### 1. Langere Cookie Levensduur (✅ Geïmplementeerd)
De maxAge is verhoogd van 7 dagen naar 30 dagen. Dit helpt, maar browsers kunnen nog steeds cookies verwijderen.

### 2. Session Refresh Mechanisme
We kunnen een "remember me" functie toevoegen die de sessie automatisch verlengt:

```typescript
// Bij elke API call, ververs de cookie expiry
// Dit houdt actieve gebruikers ingelogd
```

### 3. Gebruikers Educatie
Informeer gebruikers over browser instellingen:
- Safari: "Prevent Cross-Site Tracking" uitschakelen
- Safari: "Block All Cookies" niet gebruiken
- Firefox: Enhanced Tracking Protection op "Standard" zetten

### 4. Alternative: Directe Toegang Promoten
Als persistentie cruciaal is, kun je overwegen om:
- Gebruikers rechtstreeks naar de webapp URL te leiden (niet via iframe)
- Een "Open in nieuw venster" knop in de iframe te plaatsen
- Directe toegang gebruiken voor dagelijks werk, iframe alleen voor snel checken

## Browser-Specifieke Instructies

### Safari (macOS/iOS)
Als je langer ingelogd wilt blijven:
1. Safari → Voorkeuren → Privacy
2. Schakel "Prevent cross-site tracking" UIT (voor deze website)
3. Of gebruik "Open in Safari" optie in de iframe

### Chrome/Edge
Werkt goed met standaard instellingen. Sessie blijft behouden tenzij:
- Cookies handmatig worden gewist
- Browser in "Incognito" mode
- "Clear cookies on exit" is ingeschakeld

### Firefox
1. Instellingen → Privacy & Security
2. Enhanced Tracking Protection: "Standard" (niet "Strict")
3. Of voeg www.itsdoneservices.nl toe aan uitzonderingen

## Implementatie: "Remember Me" Functie

Als dit een groot probleem blijft, kunnen we een "Remember Me" checkbox toevoegen bij login die:
1. Een tweede, aparte cookie maakt met langere levensduur
2. Gebruikt een andere storage methode (localStorage + refresh token)
3. Automatisch opnieuw inlogt bij page load

### Code Voorbeeld:
```typescript
// Bij login met "remember me"
if (rememberMe) {
  // Sla een refresh token op in localStorage
  localStorage.setItem('refresh_token', encryptedToken);
  
  // Bij page load: check localStorage en refresh sessie
  const refreshToken = localStorage.getItem('refresh_token');
  if (refreshToken) {
    await refreshSession(refreshToken);
  }
}
```

## Aanbeveling

Voor de beste gebruikerservaring:

1. **Voor iframe gebruik**: Accepteer dat sessies korter kunnen zijn
2. **Voor dagelijks werk**: Gebruik directe toegang tot de webapp (buiten iframe)
3. **Implementeer "Remember Me"**: Als frequent opnieuw inloggen een probleem is

## Moet Ik Iets Veranderen?

**Nee, niet noodzakelijk.** De huidige configuratie is de best mogelijke voor iframe embedding. De trade-off (kortere sessie persistentie) is inherent aan cross-origin iframe gebruik en browser security.

**Ja, als**: Gebruikers klagen over te vaak opnieuw moeten inloggen. Dan kunnen we:
- "Remember Me" functie toevoegen
- localStorage fallback implementeren
- Automatische session refresh bij activiteit

---

**Laatste update:** December 2025  
**Context:** Iframe embedding op www.itsdoneservices.nl
