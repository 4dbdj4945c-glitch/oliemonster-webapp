# Stijlgids IDS Portal

De portal volgt dezelfde stijl als de e-mail editor (`public/email-editor.html`) en de
website itsdoneservices.nl: vlak, zakelijk, navy en oranje, lettertype Inter. Geen glas,
geen blur, geen doorschijnende vlakken, geen emoji als icoon (zie Iconen).

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

- **Balk bovenaan**: `AppShell` (navy) regelt de hele balk zelf: links logo, "IDS Portal" en de
  modulenaam (`title`), rechts Terug naar dashboard, het Beheer-menu (alleen admin: Audit logs,
  Kolommen aanpassen, Instellingen, Afdrukken), een Help-knop (als de pagina `onHelp` meegeeft) en het
  gebruikersmenu (avatar met initiaal, naam, rol en Uitloggen). Een pagina geeft `user` mee (anders haalt
  de balk de sessie zelf op), optioneel `onPrint` (Beheer > Afdrukken, standaard `window.print()`) en
  `rightActions` voor echt paginaspecifieke knoppen. Losse knoppen daarin: `NavButton` / `.nav-btn`
  (doorschijnend wit, `.nav-btn-icoon` voor alleen een icoon), `.nav-btn-primary` (oranje, één per balk).
  Uitklapmenu's: `.toolbar-menu > .toolbar-menu-paneel > .toolbar-menu-item` (`-danger`, `-scheiding`, `-kop`).
  Op de telefoon (tot 640px) toont de balk alleen logo, modulenaam, `rightActions` en een hamburger
  (`.toolbar-mobiel`); alle andere opties staan in het uitklappaneel `.toolbar-mobiel-paneel`
  (kop met avatar en rol, Terug naar dashboard, Help, sectie Beheer, Uitloggen). Knoppen in de balk
  kunnen een lange en korte tekst hebben (`<span class="lang">` / `<span class="kort">`). Het witte logo `header_logo.png` staat er zonder filter in.
- **Fotovenster**: `PhotoModal` (`.foto-paneel`, `.foto-beeld`, `.foto-knop`), klein venster op desktop,
  beeldvullend op de telefoon. CSS staat in globals.css.
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

## Iconen

Eén set voor de hele portal, via `<Icon name="..." />` uit `app/components/ui` (bron en voorstel:
`iconen-voorstel/` naast de repo, `iconen.json` is de lijst). Lucide (ISC) als basis, eigen tekeningen
(monsterfles, hermonstering, beheer, controlerondes, ...) in hetzelfde gewicht.

- **Spec**: 24-grid met 1px veilige rand, lijn 2, ronde uiteinden en hoeken, geen vulling, alleen `currentColor`.
- **Maten**: 16 (badges, tabelacties, knoppen in de balk), 20 (standaard: knoppen, menu's, modulekaart op de telefoon), 24 (hamburger, modulekaarten op desktop), 32 (lege staten).
- **Kleur**: via de container. Grijs-700 of grijs-500 op wit, wit op navy. Nooit oranje in een icoon (2,8:1 op wit), nooit twee kleuren.
  Status- en verwijdericonen nemen de functionele kleur van hun badge, tegel of knop over (groen-tekst, rood-tekst, blauw);
  rood alleen voor Niet genomen en verwijderen. Stattegels: `.stat-card-icoon.is-genomen` / `.is-niet-genomen`, geen inline kleur.
- **Actief**: niet met een gevuld icoon, maar via de container: navy vlak met wit icoon, of een oranje streep links (`border-left: 3px solid var(--oranje)`). Die klasse bestaat nog niet; maak hem pas als een menu een actieve staat krijgt.
- **Status**: altijd icoon plus woord. Genomen `status-taken` (groen), Niet genomen `status-not-taken` (rood),
  Gepland `status-planned` (blauw, `badge-info`), Geannuleerd `status-cancelled` (grijs). Rondes: `status-round-open/-busy/-done`.
- **Tabelacties**: op desktop Hermonstering als knop met tekst, Bewerken en Verwijderen als `.icon-btn` met `title` en
  `aria-label` (Verwijderen met `.icon-btn-verwijder`: rood in rust; elders blijft `.icon-btn-danger` grijs met rood bij hover); de tekst staat in `<span class="alleen-mobiel">`, zodat de telefoon altijd icoon plus tekst toont.
- **Hulpklassen**: `.zoekveld` (loep in een veld), `.stat-card-icoon` (icoon rechtsboven in een stattegel), `.leeg > .icon`.
- **Niet**: geen getypte "+" of "x" als icoon, geen emoji, geen losse inline `<svg>` in pagina's. Nieuw icoon nodig?
  Eerst in `iconen-voorstel/` tekenen volgens de spec en opnemen in `iconen.json`, dan opnieuw genereren.
- **Later**: de objecticonen (cilinder, pomp, afsluiter, sluis, stuw, kunstwerk, aftappunt) en de lab-statussen
  liggen klaar in het voorstel, maar komen pas in de app als er een objecttype-veld of lab-stap in het datamodel komt.

## Niet doen

- Geen `backdrop-filter`, geen `rgba(255,255,255,x)`-achtergronden, geen inset-schaduwen.
- Geen eigen `<style jsx>` voor dingen die globals.css al heeft. Alleen voor echte
  lay-out van die pagina (grids, kaartposities).
- Geen `<style jsx>` in losse componenten onder `app/components/`: daar krijgen de elementen de
  scope-klasse niet mee en werkt de CSS stilletjes niet (zo ging het mis met PhotoModal). Zet die CSS in globals.css.
- Geen inline kleuren: gebruik tokens (`var(--grijs-500)`) of klassen.
- Geen em-dashes in teksten. Geen uitroeptekens.
- Geen `filter: invert()` op het logo: het logo is wit en hoort op navy.

## Mobiel

De portal wordt op de telefoon gebruikt (PWA). Onder 640px regelt `globals.css` automatisch:
velden 16px hoog 44px (geen inzoomen op iOS), knoppen minimaal 44px, modals als onderpaneel
met vaste kop en voet, de balk bovenaan met een horizontaal scrollende knoppenrij.

Per pagina hoort:
- **Tabellen** krijgen `class="table table-kaarten"` en elke `<td>` een `data-label="Kolomnaam"`.
  De belangrijkste cel krijgt `class="kaart-kop"` (wordt de titel), een statusbadge `kaart-status`,
  de knoppen `kaart-acties`, een cel die op mobiel weg mag `kaart-leeg`. Op de telefoon wordt elke rij
  dan een kaart; op desktop blijft het een gewone tabel.
- **Statistiektegels** in `.stats-grid` (2 kolommen op telefoon, 4 op desktop).
- **Knoppenrijen** in `.knoppenrij` (volle breedte op telefoon).
- **Filters** onder elkaar, selects op volle breedte.
- Numerieke velden krijgen `inputMode="decimal"` of `"numeric"`, zodat het juiste toetsenbord opent.
- Niets mag horizontaal scrollen behalve een tabel op desktop in `.table-scroll`.
