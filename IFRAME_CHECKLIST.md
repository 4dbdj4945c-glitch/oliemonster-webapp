# ✅ Iframe Implementatie Checklist

Volg deze stappen om de webapp succesvol als iframe op je website te implementeren.

## Vóór Deployment

### 1. Domein Configuratie
- [ ] **Vervang** `https://jouwdomein.nl` in `middleware.ts` (regel 14 en 34)
- [ ] **Vervang** `https://jouwdomein.nl` in `next.config.ts` (regel 16 en 20)
- [ ] **Voeg toe** alle subdomeinen die je wilt toestaan (bijv. `www.itsdonesservices.nl`)

**Voorbeeld voor It's Done Services:**
```typescript
// In middleware.ts
const allowedOrigins = [
  'https://itsdonesservices.nl',
  'https://www.itsdonesservices.nl',
  'http://localhost:3000',
];

// En:
"frame-ancestors 'self' https://itsdonesservices.nl https://www.itsdonesservices.nl http://localhost:3000"
```

### 2. Lokaal Testen
- [ ] Start webapp: `npm run dev`
- [ ] Open `iframe-test.html` in je browser
- [ ] Test login functionaliteit
- [ ] Test alle hoofdfuncties (dashboard, foto upload, gebruikersbeheer)
- [ ] Controleer browser console voor errors

## Deployment naar Vercel

### 3. Code Pushen
- [ ] Commit alle wijzigingen naar git:
  ```bash
  git add .
  git commit -m "Iframe embedding support toegevoegd"
  git push
  ```

### 4. Vercel Environment Variables
- [ ] Check of `SESSION_SECRET` is ingesteld op Vercel
- [ ] Check of `DATABASE_URL` correct is
- [ ] Deploy en wacht tot live

### 5. Production Testing
- [ ] Test de webapp direct (niet in iframe) op Vercel URL
- [ ] Maak test iframe op je website
- [ ] Test login in iframe
- [ ] Test alle functies in iframe
- [ ] Test op verschillende browsers (Chrome, Safari, Firefox)
- [ ] Test op mobiel (iOS Safari, Chrome)

## Website Implementatie

### 6. Iframe Code Toevoegen
Voeg deze code toe aan je website waar je de webapp wilt tonen:

```html
<iframe 
  src="https://jouw-webapp-naam.vercel.app"
  width="100%"
  height="800"
  frameborder="0"
  allow="clipboard-write; clipboard-read"
  style="border: none; min-height: 800px;"
></iframe>
```

**Vervang** `jouw-webapp-naam.vercel.app` met je werkelijke Vercel URL.

### 7. Responsive Styling (Optioneel)
Voor een beter responsive gedrag, gebruik een wrapper:

```html
<div style="width: 100%; max-width: 1400px; margin: 0 auto;">
  <iframe 
    src="https://jouw-webapp-naam.vercel.app"
    width="100%"
    height="900"
    frameborder="0"
    allow="clipboard-write; clipboard-read"
    style="border: none; display: block;"
  ></iframe>
</div>
```

## Troubleshooting

### Safari/iOS Problemen
Als cookies niet werken in Safari:
- [ ] Gebruikers instrueren om "Cross-Site Tracking voorkomen" uit te schakelen
- [ ] Of "Cookies toestaan" in te schakelen voor je website
- [ ] Test op verschillende iOS versies

### CORS Errors
- [ ] Controleer of domein correct is ingevuld
- [ ] Check browser console voor specifieke error messages
- [ ] Verifieer dat beide websites HTTPS gebruiken

### Session Verlies
- [ ] Check of `SameSite=None` correct is ingesteld
- [ ] Verifieer dat `secure: true` actief is in productie
- [ ] Test met verschillende browsers

## Verificatie Checklist

### Functionaliteit
- [ ] ✅ Login werkt in iframe
- [ ] ✅ Sessie blijft actief bij navigatie
- [ ] ✅ Dashboard laadt correct
- [ ] ✅ Foto's kunnen worden geüpload
- [ ] ✅ Admin functies werken (indien admin)
- [ ] ✅ Gebruikerslijst werkt
- [ ] ✅ Audit logs zijn toegankelijk
- [ ] ✅ Theme toggle werkt
- [ ] ✅ Help modal werkt
- [ ] ✅ Logout functie werkt

### Security
- [ ] ✅ Password hashing werkt
- [ ] ✅ Admin/User rollen werken correct
- [ ] ✅ Audit logging registreert acties
- [ ] ✅ Session cookies zijn HttpOnly
- [ ] ✅ HTTPS wordt gebruikt in productie
- [ ] ✅ Alleen geautoriseerde domeinen kunnen inladen

### Performance
- [ ] ✅ Webapp laadt snel in iframe
- [ ] ✅ Geen merkbare vertraging vs. directe toegang
- [ ] ✅ Foto's laden correct
- [ ] ✅ Geen console errors

## Support

### Belangrijke Bestanden
- `middleware.ts` - Security headers en CORS
- `next.config.ts` - Next.js configuratie met headers
- `lib/session.ts` - Session cookie instellingen
- `IFRAME_IMPLEMENTATIE.md` - Volledige documentatie

### Bij Problemen
1. Check browser console voor JavaScript errors
2. Check Vercel logs voor server errors
3. Verifieer domein configuratie in beide bestanden
4. Test eerst lokaal met `iframe-test.html`
5. Controleer of HTTPS correct werkt

## Rollback Plan

Als er problemen zijn na deployment:
1. Revert git commit: `git revert HEAD`
2. Push naar Vercel: `git push`
3. Of: gebruik Vercel dashboard om vorige deployment te activeren

---

**Laatste update:** December 2025  
**Versie:** 1.0
