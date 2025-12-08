# Custom Domain Setup: mourik.itsdoneservices.nl

## Stap 1: Domain Toevoegen in Vercel

1. Ga naar [Vercel Dashboard](https://vercel.com/dashboard)
2. Selecteer je `oliemonster-webapp` project
3. Ga naar **Settings** → **Domains**
4. Klik op **Add**
5. Voer in: `mourik.itsdoneservices.nl`
6. Klik op **Add**

Vercel zal je nu DNS records tonen die je moet toevoegen.

## Stap 2: DNS Records Instellen

Je krijgt van Vercel twee opties:

### Optie A: CNAME Record (Aanbevolen)
```
Type:  CNAME
Name:  mourik
Value: cname.vercel-dns.com
```

### Optie B: A Record
```
Type:  A
Name:  mourik
Value: 76.76.21.21
```

## Stap 3: DNS Records Toevoegen

Dit hangt af van waar je DNS wordt gehost:

### Bij je Domain Provider (bijv. TransIP, Mijn.Host, etc.)
1. Log in bij je domain provider dashboard
2. Ga naar DNS Management voor `itsdoneservices.nl`
3. Voeg een nieuw record toe:
   - **Type**: CNAME
   - **Naam/Host**: mourik
   - **Waarde/Target**: cname.vercel-dns.com
   - **TTL**: 3600 (of automatisch)
4. Sla op

### Screenshots Voorbeelden:

**TransIP:**
```
Hostnaam: mourik
Type:     CNAME
Waarde:   cname.vercel-dns.com
TTL:      3600
```

**Cloudflare:**
```
Type:     CNAME
Name:     mourik
Target:   cname.vercel-dns.com
Proxy:    DNS only (grijs wolkje)
```

## Stap 4: SSL Certificaat

Vercel regelt automatisch een gratis SSL certificaat via Let's Encrypt.
Dit kan 24-48 uur duren, maar meestal binnen een paar minuten.

## Stap 5: Automatische Redirect naar /dashboard

We moeten de app configureren om automatisch naar /dashboard te gaan:

### Optie 1: Next.js Redirect (in code)
In `app/page.tsx` (root page):
```typescript
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  
  useEffect(() => {
    router.push('/dashboard');
  }, [router]);
  
  return <div>Redirecting...</div>;
}
```

### Optie 2: Vercel Redirect (in next.config.ts)
```typescript
async redirects() {
  return [
    {
      source: '/',
      destination: '/dashboard',
      permanent: false,
    },
  ];
}
```

## Stap 6: Middleware Aanpassen

Update `middleware.ts` om het nieuwe domein toe te staan:

```typescript
const allowedOrigins = [
  'https://www.itsdoneservices.nl',
  'https://itsdoneservices.nl',
  'https://mourik.itsdoneservices.nl',  // ← Nieuwe subdomain
  'http://localhost:3000',
];

// En in frame-ancestors:
response.headers.set(
  'Content-Security-Policy',
  "frame-ancestors 'self' https://www.itsdoneservices.nl https://itsdoneservices.nl https://mourik.itsdoneservices.nl http://localhost:3000"
);
```

## Verificatie

Na het toevoegen van DNS records:

1. **Check DNS Propagatie**
   ```bash
   nslookup mourik.itsdoneservices.nl
   ```
   Moet wijzen naar Vercel's IP

2. **Test de URL**
   - Ga naar: https://mourik.itsdoneservices.nl
   - Moet redirecten naar /dashboard
   - SSL moet werken (🔒 in adresbalk)

3. **Check in Vercel**
   - In Domains sectie moet het domein **Valid** status hebben
   - SSL certificaat moet **Active** zijn

## Troubleshooting

### DNS wijzigingen zijn niet zichtbaar
- Wacht 5-10 minuten (DNS cache)
- Check met: `dig mourik.itsdoneservices.nl`
- Clear je browser cache

### SSL werkt niet
- Wacht tot 24 uur (meestal sneller)
- Check Vercel dashboard voor SSL status
- Zorg dat je HTTPS gebruikt, niet HTTP

### "Domain already in use"
- Domain is misschien al gekoppeld aan een ander Vercel project
- Verwijder het eerst daar

### Redirect werkt niet
- Check of de root page redirect heeft
- Test direct: mourik.itsdoneservices.nl/dashboard

## Custom Domain + Iframe

Je kunt de webapp nu op twee manieren bereiken:

1. **Direct**: `https://mourik.itsdoneservices.nl`
   - Gaat automatisch naar /dashboard
   - Eigen URL in adresbalk

2. **Via iframe** (op www.itsdoneservices.nl):
   ```html
   <iframe 
     src="https://mourik.itsdoneservices.nl"
     width="100%"
     height="900"
     frameborder="0"
   ></iframe>
   ```

## Voordelen van Custom Domain

✅ Professionele URL
✅ Makkelijker te onthouden
✅ Betere branding
✅ SSL werkt automatisch
✅ Kan nog steeds in iframe
✅ Eigen domein zichtbaar in adresbalk

## Kosten

- **Vercel Custom Domain**: GRATIS
- **SSL Certificaat**: GRATIS (via Let's Encrypt)
- **Bandwidth**: Volgens je Vercel plan

---

**Tijd nodig**: 5-15 minuten + DNS propagatie (5 min - 24 uur)
**Moeilijkheid**: Makkelijk (alleen DNS record toevoegen)
