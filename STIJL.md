# Stijlgids IDS Portal

De portal volgt dezelfde stijl als de e-mail editor (`public/email-editor.html`) en de
website itsdoneservices.nl: vlak, zakelijk, navy en oranje, lettertype Inter. Geen glas,
geen blur, geen doorschijnende vlakken, geen emoji als icoon.

Alle gedeelde klassen staan in `app/globals.css`. Gebruik die klassen en de tokens,
en zet geen eigen kleuren, schaduwen of afrondingen in pagina's.

## Kleuren (tokens in `:root`)

| Token | Waarde | Gebruik |
|---|---|---|
| `--navy` | #0C1B33 | balk bovenaan, koppen, lopende tekst |
| `--navy-mid` | #1A2D50 | donkere vlakken binnen navy |
| `--blue` | #1D4ED8 | sectiekoppen, links, focusrand, informatieve badges |
| `--blue-light` | #EFF4FF | focusring, lichte blauwe vlakken |
| `--oranje` | #F97316 | primaire knop, actieve tab, vinkjes en schuifjes |
| `--oranje-hover` | #EA6B0E | hover van oranje |
| `--grijs-50` | #F8FAFC | kop van kaarten, tabelkop, hover van rijen |
| `--grijs-100` | #F1F5F9 | achtergrond van de pagina |
| `--grijs-200` | #E2E8F0 | randen en scheidingslijnen |
| `--grijs-400` | #94A3B8 | placeholders, bijzaken |
| `--grijs-500` | #64748B | labels, secundaire tekst |
| `--grijs-700` | #334155 | lopende tekst in lange stukken |
| `--groen` / `--rood` | #16A34A / #DC2626 | status, gevaar |

Oude tokennamen (`--accent`, `--text-secondary`, `--danger`, ...) bestaan nog en wijzen
naar deze kleuren. `--accent` is blauw, `--primary` is oranje.

## Vorm

- Afronding: kaarten en modals 12px (`--radius`), knoppen en velden 8px (`--radius-md`).
- Randen: altijd 1px `--grijs-200`. Schaduw op kaarten `--shadow-sm`, meer niet.
- Lettertype Inter. Basis 14px. Paginatitel 26px, gewicht 800, letter-spacing -0.03em.
- Sectiekop: `.section-label`, blauw, 11px, kapitalen, letter-spacing 0.14em.
- Labels boven velden: `.label`, 12px, grijs-500, gewicht 500.

## Bouwstenen

- **Balk bovenaan**: `AppShell` (navy). Knoppen daarin: `NavButton` / `.nav-btn`
  (doorschijnend wit), `.nav-btn-danger` (uitloggen), `.nav-btn-primary` (oranje, één per balk).
  Het witte logo `header_logo.png` staat er zonder filter in.
- **Kaart**: `.card` (of het oude `.glass-card`), wit met grijze rand. Kop erboven: `.card-kop`.
- **Knoppen**: `.btn` (wit met rand), `.btn-primary` (oranje, de hoofdactie op een pagina),
  `.btn-blue` (blauw, secundaire actie), `.btn-secondary`, `.btn-danger`, `.btn-danger-soft`,
  `.btn-ghost`, `.btn-link`, `.btn-sm`, `.btn-lg`, `.btn-block`. Icoonknopje: `.icon-btn`.
- **Velden**: `.input`, `.select`, `.textarea` (of de oude `.glass-*`), `.label`, `.hint`, `.veld`.
- **Tabs**: `.tabs > button.on`.
- **Tabellen**: `.table-container > .table-scroll > table.table`.
- **Lijst met uitklapbare rijen**: `.rij-item > .rij-item-kop + .rij-item-romp`.
- **Statistieken**: `.stat-card > .stat-value + .stat-label`.
- **Badges**: `.badge-success|warning|danger|info|gray|navy`.
- **Meldingen**: `.alert-success|info|warning|danger`.
- **Modal**: component `Modal` (grijze kopbalk, witte romp, voettekst met knoppen).
- **Leeg / laden**: `.leeg`, `.laden`, `.laadscherm`.
- **Inloggen**: `.auth-page > .auth-card > .auth-band + .auth-body (+ .auth-foot)`.

## Niet doen

- Geen `backdrop-filter`, geen `rgba(255,255,255,x)`-achtergronden, geen inset-schaduwen.
- Geen eigen `<style jsx>` voor dingen die globals.css al heeft. Alleen voor echte
  lay-out van die pagina (grids, kaartposities).
- Geen inline kleuren: gebruik tokens (`var(--grijs-500)`) of klassen.
- Geen em-dashes in teksten. Geen uitroeptekens.
- Geen `filter: invert()` op het logo: het logo is wit en hoort op navy.
