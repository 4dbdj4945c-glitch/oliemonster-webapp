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
| `--tekst-op-oranje` | navy | tekst en iconen op een gevuld oranje vlak (6,14:1; wit haalt maar 2,80:1) |
| `--grijs-50` | #F8FAFC | kop van kaarten, tabelkop, hover van rijen |
| `--grijs-100` | #F1F5F9 | achtergrond van de pagina |
| `--grijs-200` | #E2E8F0 | randen en scheidingslijnen |
| `--grijs-400` | #94A3B8 | placeholders, bijzaken |
| `--grijs-500` | #64748B | labels, secundaire tekst |
| `--grijs-700` | #334155 | lopende tekst in lange stukken |
| `--groen` / `--rood` | #16A34A / #DC2626 | status, gevaar |
| `--groen-diep` | #15803D | gevulde groene knop (wit erop haalt 5,02:1, op `--groen` maar 3,30:1) |

Oude tokennamen (`--accent`, `--text-secondary`, `--danger`, ...) bestaan nog en wijzen
naar deze kleuren. `--accent` is blauw, `--primary` is oranje.

## Contrast

De regel: lopende tekst, labels, badges en getallen minimaal 4,5:1, iconen en grote
koppen minimaal 3:1. Oranje blijft het accent, maar draagt geen tekst: zet er navy op,
of gebruik oranje als streep of vlak naast navy tekst (`.stat-accent`).

Doorgerekend op 28 september 2026, alle combinaties uit `globals.css`:

| Combinatie | Ratio |
|---|---|
| navy op wit, op `--grijs-50`, op `--grijs-100` | 17,21 / 16,45 / 15,71:1 |
| navy op `--oranje` (`.btn-primary`, avatar) | 6,14:1 |
| navy op `--oranje-hover` | 5,42:1 |
| wit op `--blue` / `--rood` / `--groen-diep` / navy | 6,70 / 4,83 / 5,02 / 17,21:1 |
| `--grijs-500` op wit en op `--grijs-50` (labels, hints, placeholders, iconen) | 4,76 / 4,55:1 |
| `--grijs-700` op `--grijs-100` (`.page-subtitle`, `.badge-gray`) | 9,45:1 |
| `--blue` op wit / `--blue-light` | 6,70 / 6,08:1 |
| `--groen-tekst` op `--groen-light`, `--rood-tekst` op `--rood-light` | 4,76 / 5,91:1 |
| `--geel-tekst` op `--oranje-light`, paars op paars-light | 4,64 / 6,33:1 |

Wat niet haalt en bewust zo blijft: de randen `--grijs-200` (1,23:1) en `--grijs-300`
(1,48:1). Die halen de 3:1 van WCAG 1.4.11 niet. Ze donkerder maken raakt elke kaart,
tabelregel en veld in de portal, dus dat is een eigen besluit en geen los foutje.
`--grijs-400` is daarom alleen nog een randkleur, niet voor tekst of iconen.

## Vorm

- Afronding: kaarten en modals 12px (`--radius`), knoppen en velden 8px (`--radius-md`).
- Randen: altijd 1px `--grijs-200`. Schaduw op kaarten `--shadow-sm`, meer niet.
- Lettertype Inter. Basis 14px. Paginatitel 26px, gewicht 800, letter-spacing -0.03em.
- Sectiekop: `.section-label`, blauw, 11px, kapitalen, letter-spacing 0.14em.
- Labels boven velden: `.label`, 12px, grijs-500, gewicht 500.

## Bouwstenen

- **Schil** (`AppShell`, voor beheerder en gebruiker `ui/Schil.tsx`): één navigatie uit het
  moduleregister (`navigatieVoor()` in `lib/modules.ts`). Desktop vanaf 900px: vaste navy zijbalk
  (`.zijbalk`, 244px) met Vandaag en de secties Werk, Klanten, Rapportage en Beheer, onderaan het
  gebruikersmenu (rol, Afdrukken, Uitloggen). Actief: `.zijbalk-item.on`, navy-mid vlak met oranje
  streep links. Help en paginaknoppen (`rightActions`, `onHelp`) staan rechtsboven de inhoud
  (`.schil-acties`, `.nav-btn` wordt daar wit met rand, `.nav-btn-primary` oranje).
  Telefoon en tablet: navy kopbalk (`.schil-kop`: logo, modulenaam, paginaknoppen, Help, avatar) en
  een vaste onderbalk (`.onderbalk`, 64px plus veilige zone) met Vandaag, Werk, Klanten en Meer.
  Werk, Klanten en Meer openen een paneel boven de balk (`.onderbalk-paneel`, items `.paneel-item`
  van 48px); Meer bevat Rapportage, Beheer, Help, Afdrukken en Uitloggen. Actieve tab: navy met een
  lichtgrijze pil en een oranje stip, geen oranje vlak. Er is geen "Terug naar dashboard" meer; een
  terugknop alleen binnen een module, links boven de inhoud (`.terug-link`).
  `veld` op AppShell: veldscherm, op de telefoon zonder kop- en onderbalk (de pagina heeft een eigen
  kop en actiebalk). De **kijker** (rol alleen lezen) krijgt de schil niet: die houdt de oude navy
  balk (`KlassiekeBalk` in AppShell, `.toolbar`), pixel voor pixel gelijk. Niet aanpassen zonder de
  kijker-screenshots te vergelijken.
- **Uitklapmenu's**: `ToolbarMenu` en `MenuItem` uit `ui/Menu.tsx`,
  `.toolbar-menu > .toolbar-menu-paneel > .toolbar-menu-item` (`-danger`, `-scheiding`, `-kop`).
- **Fotovenster**: `PhotoModal` (`.foto-paneel`, `.foto-beeld`, `.foto-knop`), klein venster op desktop,
  beeldvullend op de telefoon. Krijgt een lijst foto's mee: een monster heeft er twee (het onderdeel en
  het monsterpotje), en dan komt er een keuzerij bij (`.foto-keuze`), op de telefoon onderin met
  tikdoelen van 44px. CSS staat in globals.css.
- **Kaart**: `.card` (of het oude `.glass-card`), wit met grijze rand. Kop erboven: `.card-kop`.
- **Knoppen**: `.btn` (wit met rand), `.btn-primary` (oranje met navy tekst, de hoofdactie op een pagina),
  `.btn-blue` (blauw, secundaire actie), `.btn-secondary`, `.btn-danger`, `.btn-danger-soft`,
  `.btn-ghost`, `.btn-link`, `.btn-sm`, `.btn-lg`, `.btn-block`. Icoonknopje: `.icon-btn`.
- **Velden**: `.input`, `.select`, `.textarea` (of de oude `.glass-*`), `.label`, `.hint`, `.veld`.
- **Tabs**: `.tabs > button.on`.
- **Tabellen**: `.table-container > .table-scroll > table.table`.
- **Lijst met uitklapbare rijen**: `.rij-item > .rij-item-kop + .rij-item-romp`.
- **Statistieken**: `.stat-card > .stat-value + .stat-label`.
- **Badges**: `.badge-success|warning|danger|info|gray|navy`.
- **Meldingen**: `.alert-success|info|warning|danger`. Mislukte fetch: `.alert-danger.laadfout`
  (met `role="alert"`, `.laadfout-tekst` links en een knop Opnieuw proberen rechts) boven de lijst.
- **Tikbare status**: `.status-knop` om een statusbadge in een tabelrij, voor de hoofdhandeling van
  een lijst (op de telefoon een volle knop van 44px bovenaan de kaart).
- **Modal**: component `Modal` (grijze kopbalk met kruisje, witte romp, voettekst met knoppen). Een
  eigen venster gebruikt `useVenster(open, onClose)` uit `app/components/ui`: `role="dialog"`,
  focus naar binnen en erin houden, Escape sluit alleen het bovenste venster, focus terug bij sluiten.
  Fouten bij een veld onder het veld (`.veld-fout`, veld `.input-fout`), niet als browsertooltip.
  Hoofdknop altijd rechts in de voet, Annuleren links ervan.
- **Leeg, laden, fout** (in alle modules gelijk):
  - Laden: component `Laden` uit `app/components/ui` (`.skelet`, soort `kaarten`, `lijst` of `tegels`)
    binnen de schil, onder de paginatitel. Nooit een 0 of een lege lijst zolang het er nog niet is.
    `.laadscherm` (volledig scherm) alleen nog voor de kijker en het wachtwoordscherm.
  - Leeg: `.leeg` met een icoon van 32 en een zin wat je kunt doen.
  - Fout: `LaadFout` boven de lijst, en dan geen lege staat, geen tellingen en geen knoppen die iets
    aanmaken of importeren.
  - Geen verbinding: `GeenVerbinding` (`.geen-verbinding`, amber) op het veldscherm en in Monster nemen.
- **Paginakop**: `.paginakop` (titel en subtitel links, knoppen of keuze rechts in `.paginakop-knoppen`).
- **Sectiekop**: `.sectiekop` met een `h2` van 15/700 navy in gewone schrijfwijze, rechts een link of
  `small`. `.section-label` (blauwe kapitalen) blijft voor kleine groepen en tabelkoppen.
- **Rijen in een kaart**: `ul.card.rijen > li.rij` met `.icoonvak`, `.rij-tekst` en `.rij-knoppen`.
- **Kengetallen**: `.kengetallen > .kengetal` (getal 28/800, woord eronder), zonder tegels.
- **Voortgang**: `.voortgang-balk > i.voortgang-genomen + i.voortgang-gepland` (groen, blauw).
- **Filterchips**: `.filterchips > button.filterchip(.on)` met `.filterchip-aantal`.
- **Vandaag** (`app/components/vandaag/Vandaag.tsx`, getallen in `lib/vandaag.ts`): monsterdag als één
  grote kaart (`.monsterdag`, oranje streep links, Start dag de enige oranje knop), Acties, Deze week
  (`.week`), Openstaande monsters en Voortgang. Blokken zonder module (keuringen, contracten,
  rapporten) staan er pas als die module er is.
- **Veldscherm** (`app/components/planning/Dagscherm.tsx`, `/dashboard/planning/dag/[id]`): eigen kop
  (`.veld-kop`, op de telefoon navy), voortgang, één grote kaart (`.veld-kaart`, 2px navy rand,
  o-nummer 32/800, gegevens 17px), knoppen van 60px twee naast elkaar (`.veld-knoppen > .veld-knop`,
  rand `--grijs-400`), lijsten met regels van 64px (`.veld-lijst-regel`) en onderaan in duimbereik
  de enige oranje knop Monster nemen (`.veld-actiebalk`, 64px, op de telefoon vast binnen de veilige zone).
- **Monsterlijst op de telefoon** (niet voor de kijker): `MonsterTabel compact` en
  `.monsterlijst-compact` om de lijst. Per monster drie regels (o-nummer en status, plek en
  omschrijving, object en datum) en rechts Nemen en Meer; een tik op de kaart opent het monster.
  Zoekveld plakt bovenaan, filters achter de knop Filter, tellingen als filterchips, PDF via Meer.
- **Filters boven een lijst**: `.filters > .filter-veld` (label `.filter-label`, veld `.filter-select`,
  brede knop `.filter-veld-breed`), op de telefoon twee kolommen (component `MonsterFilters`).
- **Beheerschermen** (Klanten, Installaties): kop `.beheer-kop` met `.beheer-knoppen`, terug `.terug-link`,
  twee kolommen `.beheer-grid > .beheer-kolom > .card.beheer-kaart`, gegevens als `dl.gegevens-lijst`,
  regels `.beheer-lijst > .beheer-lijst-regel`, code van een installatie `.badge.code-badge`,
  formulier in een venster `.beheer-formulier` (lange velden `.beheer-veld-breed`).
- **Klantdossier** (`/dashboard/klanten/[id]`, `DossierTijdlijn`): kop `.dossier-kop` met naam, adres,
  contactpersoon en Klant sinds, knoppen Mail opstellen, Rapport maken en Klantportaal bekijken (alle drie wit),
  kerncijfers `.dossier-kerncijfers`, tabs met een oranje streep onder de actieve (`.dossier-tabs`), jaarkeuze rechts.
  Links de objecten met hun installaties (`.dossier-item`, actief grijs vlak met oranje streep links), rechts de
  tijdlijn (`.dossier-tijdlijn > .moment`: datum, punt met icoon, titel met statusbadge, tekst, foto's van 72px).
  Filteren met `.dossier-chip` (navy als actief).
- **Klantportaal** (`KlantPortaal`, `.portaal-*`): geen schil en geen navy balk, maar een witte kop met het logo
  van de klant links en "uitgevoerd door" It's Done Services rechts, een navy band met de titel, dan kaarten die
  over de band vallen. Rapport downloaden is de enige oranje knop. Werkt tot 390px breed; tabellen verliezen op de
  telefoon de kolommen Volgende bezoek en Laatste foto.
- **Inspecties** (`/dashboard/inspecties`, `.insp-*`): overzicht als beheertabel met filterchips (`.dossier-chip`)
  per soort. Invulscherm (`Invulscherm`, `/dashboard/inspecties/[id]`) volgt het veldscherm: eigen kop, kengetallen
  (`.insp-kengetallen`, groene regel met de besparing), bevindingen als `.veld-lijst-regel` (lek: labelnummer in een
  vak `.insp-label`, groen als gerepareerd), en de enige oranje knop Lek toevoegen of Arbeidsmiddel toevoegen in
  `.veld-actiebalk`. Het venster Bevinding is `.veldwerk`: grote keuzeknoppen naast elkaar (`.keuzeknoppen > .keuzeknop`,
  gekozen met een rand van 2px en de kleur van de uitslag, nooit oranje), checklist met Goed/Niet goed/N.v.t., foto via
  `FotoKiezer`. Luchtketel boven de grens: `alert-warning`. Woorden: Inspectie, Inspectierapport technische staat,
  In orde / Actie nodig / Buiten gebruik. Nooit "gecertificeerd" of "keuringscertificaat" (alleen in de vaste verklaring).
- **Eigen dossier** (`/dashboard/eigen-dossier`, alleen admin): twee kaarten (Bedrijf, Deskundigheid), per document een
  badge Geldig, Verloopt binnenkort (amber), Verlopen (rood) of Verloopt niet; bovenaan een `alert-warning` bij iets dat
  binnen 30 dagen verloopt. Hetzelfde staat op Vandaag, blok Eigen dossier.
- **Contracten** (`/dashboard/contracten`, `.contract-*`): per contract een kaart met kop (naam, klant, looptijd) en de taken als
  `TaakRegel` (icoon van de soort, titel, plek, interval, rechts datum, termijn en status). Status: Verlopen (rood, te laat),
  Binnenkort (amber, binnen 30 dagen), Gepland (blauw, staat op een komende dag), Op schema (grijs). Hetzelfde blok staat als
  Onderhoud op Vandaag (alleen verlopen en binnenkort), als tab Onderhoud in het klantdossier (met een `alert-warning` erboven) en,
  neutraal (Ingepland, Verwacht rond, Wordt binnenkort ingepland; nooit Verlopen), in het klantportaal. Notities zijn intern.
- **Planning met taken**: een taak- of inspectiestop staat tussen de objecten met het icoon van de soort en een navy badge
  Contracttaak of Inspectie. In het veldscherm een eigen grote kaart (klant, plek, installatie, interval, tijd) en onderaan de
  oranje knop Taak klaar (of Inspectie openen). Nog in te plannen heeft een tweede kop Taken en inspecties.
- **Dagrapport** (`/dashboard/dagrapporten/[id]`, `.dr-*`): veldscherm, links het bezoek en de foto's, rechts Akkoord van de klant
  met het tekenvlak (`HandtekeningVeld`, `.handtekening-vlak`: 2px gestippelde rand `--grijs-400`, 200 tot 220 px hoog,
  `touch-action: none`), onderaan de oranje knop Tekenen en afronden, na tekenen PDF downloaden. Beheer (handtekening wissen,
  verwijderen) ingeklapt onderaan.
- **Wachtrij** (`WachtrijOverzicht`, `.wachtrij`): blauw vlak (amber als iets definitief mislukte) met "x wacht op verzending",
  de invoer als regels en de knop Nu versturen. In de balk een blauwe pil `.wachtrij-balk` (niet oranje). Een monster dat in de
  wachtrij staat, heeft in het veldscherm de badge Wacht op verzending (blauw) en is niet meer aan de beurt.
- **Agenda-abonnement** (gebruikersmenu, `AgendaVenster`, `.agenda-*`): de link met Kopiëren, de oranje knop Openen in Agenda
  (webcal), uitleg voor iPhone en Mac naast elkaar (op de telefoon onder elkaar), onderaan Nieuwe link maken en Link intrekken.
- **Acquisitie, bellen**: een telefoonnummer is altijd een `tel:`-link. Na een tik op Bellen staat onderaan `.acq-gebeld`
  ("Gebeld met X?" en de oranje knop Vastleggen), die het contactmoment opent met kanaal Telefoon en "Gebeld met ..." al ingevuld.
- **Privacyverklaring** (`/privacy`, `.privacy-*`): smalle leeskolom, `.privacy-open` markeert wat nog ingevuld of
  nagekeken moet, bovenaan een `alert-warning` zolang het een concept is.
- **Inloggen**: `.auth-page > .auth-card > .auth-band + .auth-body (+ .auth-foot)`.
- **Veldformulier**: `.veldwerk` om een formulier dat in het veld gebruikt wordt (Monster nemen,
  Niet bereikbaar). Velden en knoppen worden er 52px, op de telefoon 56px. Foto's gaan via
  `FotoKiezer` (`.foto-kiezer`, twee naast elkaar in `.veldwerk-fotos`, op de telefoon onder elkaar):
  één groot tikvlak dat op de telefoon meteen de camera opent. Bedoeld voor werken met handschoenen aan.

## Kleur per scherm

- **Oranje** is één ding per scherm: de hoofdknop (Start dag, Monster nemen in het veldscherm, Nieuw
  monster), of de streep van wat nu aan de beurt is. Nooit acht keer in een lijst: in de monsterlijst
  is Monster nemen wit met rand.
- **Blauw** alleen voor links, focus en informatieve badges. Geen blauwe knopvullingen (`.btn-blue`
  bestaat nog, maar wordt niet meer gebruikt). Tweede acties wit met rand (`.btn`).
- **Rood** alleen voor te laat, fout, Niet genomen en verwijderen (`.tekst-te-laat`).
- Focus: `:focus-visible` geeft knoppen een blauwe rand van 2px.

## Woorden

- Status van een monster: Genomen, Niet genomen, Niet bereikbaar, Geannuleerd (`lib/sampleStatus.ts`),
  overal hetzelfde, ook in het dagscherm.
- Voor de klant (klantportaal en rapport, `lib/klantStatus.ts`) zijn de statussen neutraal: Genomen (groen),
  Gepland (blauw, staat op een komende monsterdag), Nog in te plannen (grijs), Niet bereikbaar (amber, met de
  reden) en Geannuleerd (grijs). Geen rood Niet genomen: werk dat nog komt is voor de klant geen fout.
- "x van y genomen": y telt de geannuleerde monsters niet mee, net als op Vandaag.
- Opslaan heet Opslaan (niet Bijwerken), tenzij de handeling een eigen werkwoord heeft (Toevoegen,
  Opslaan als genomen, Vastleggen).
- Rollen: Beheerder, Gebruiker, Alleen lezen. Audit logs heet Logboek.
- Getallen en afstanden via `toLocaleString('nl-NL')`: 12,4 km, niet 12.4 km.

## Iconen

Eén set voor de hele portal, via `<Icon name="..." />` uit `app/components/ui` (bron en voorstel:
`iconen-voorstel/` naast de repo, `iconen.json` is de lijst). Lucide (ISC) als basis, eigen tekeningen
(monsterfles, hermonstering, beheer, controlerondes, ...) in hetzelfde gewicht.

- **Spec**: 24-grid met 1px veilige rand, lijn 2, ronde uiteinden en hoeken, geen vulling, alleen `currentColor`.
- **Maten**: 16 (badges, tabelacties, knoppen in de balk), 20 (standaard: knoppen, menu's, modulekaart op de telefoon), 24 (hamburger, modulekaarten op desktop), 32 (lege staten).
- **Kleur**: via de container. Grijs-700 of grijs-500 op wit, wit op navy. Nooit oranje in een icoon (2,8:1 op wit), nooit twee kleuren.
  Status- en verwijdericonen nemen de functionele kleur van hun badge, tegel of knop over (groen-tekst, rood-tekst, blauw);
  rood alleen voor Niet genomen en verwijderen. Stattegels: `.stat-card-icoon.is-genomen` / `.is-niet-genomen`, geen inline kleur.
- **Actief**: niet met een gevuld icoon, maar via de container: navy vlak met wit icoon en een oranje streep links (`.zijbalk-item.on`, `.paneel-item.on`), of in de onderbalk een grijze pil met een oranje stip (`.onderbalk-tab.on`).
- **Status**: altijd icoon plus woord. Genomen `status-taken` (groen), Niet genomen `status-not-taken` (rood),
  Niet bereikbaar `alert-warning` (`badge-warning`, `--geel-tekst`), Gepland `status-planned` (blauw, `badge-info`),
  Geannuleerd `status-cancelled` (grijs). Rondes: `status-round-open/-busy/-done`.
  De vier statussen van een monster staan met hun label, badge en icoon in `lib/sampleStatus.ts`,
  zodat de lijst, de tellingen en de PDF hetzelfde zeggen.
- **Tabelacties**: op desktop Hermonstering als knop met tekst, Bewerken als `.icon-btn` met `title` en
  `aria-label`; de tekst staat in `<span class="alleen-mobiel">`, zodat de telefoon altijd icoon plus tekst toont.
- **Verwijderen**: iets dat veel meeneemt of niet terug kan, staat nooit als losse knop in een rij naast een
  veelgebruikte actie. Het staat onderaan het bewerkvenster in `.gevarenzone` (component `MonsterVerwijderBlok`
  voor monsters: uitleg wat er weggaat, dan het O-nummer overtypen). Monsters gaan naar de prullenbak (zacht
  verwijderen, `lib/verwijderdeMonsters.ts`). Na verwijderen van iets kleins of iets uit de prullenbak:
  `OngedaanMelding` (`.ongedaan-melding`, 10 seconden, knop Ongedaan maken). Een bevestiging noemt altijd wat er weggaat.
  `.icon-btn-verwijder` (rood in rust) alleen nog waar een rij geen bewerkvenster heeft.
  Voor een klant of installatie: `VeiligVerwijderBlok` (zelfde gevarenzone, naam of code overtypen).
  Een contactpersoon weghalen staat onderaan zijn bewerkvenster, zonder overtypen, met `OngedaanMelding`.
- **Hulpklassen**: `.zoekveld` (loep in een veld), `.stat-card-icoon` (icoon rechtsboven in een stattegel), `.leeg > .icon`.
- **Niet**: geen getypte "+" of "x" als icoon, geen emoji, geen losse inline `<svg>` in pagina's. Nieuw icoon nodig?
  Eerst in `iconen-voorstel/` tekenen volgens de spec en opnemen in `iconen.json`, dan opnieuw genereren.
- **Later**: de objecticonen (cilinder, pomp, afsluiter, sluis, stuw, kunstwerk, aftappunt) en de lab-statussen
  liggen klaar in het voorstel, maar komen pas in de app als er een objecttype-veld of lab-stap in het datamodel komt.
  Ook `status-unreachable` hoort daar nog bij getekend te worden: Niet bereikbaar leent nu `alert-warning`.

## Niet doen

- Geen `backdrop-filter`, geen `rgba(255,255,255,x)`-achtergronden, geen inset-schaduwen.
- Geen eigen `<style jsx>` voor dingen die globals.css al heeft. Alleen voor echte
  lay-out van die pagina (grids, kaartposities).
- Geen `<style jsx>` in losse componenten onder `app/components/`: daar krijgen de elementen de
  scope-klasse niet mee en werkt de CSS stilletjes niet (zo ging het mis met PhotoModal). Zet die CSS in globals.css.
- Geen inline kleuren: gebruik tokens (`var(--grijs-500)`) of klassen.
- Geen witte tekst op een gevuld oranje vlak (2,80:1). Gebruik `--tekst-op-oranje`.
- Geen em-dashes in teksten. Geen uitroeptekens.
- Geen `filter: invert()` op het logo: het logo is wit en hoort op navy.

## Mobiel

De portal wordt op de telefoon gebruikt (PWA). Onder 640px regelt `globals.css` automatisch:
velden 16px hoog 44px (geen inzoomen op iOS), knoppen minimaal 44px, modals als onderpaneel
met vaste kop en voet. Onder 900px staat de navigatie onderaan (`.onderbalk`); iets dat vast
onderaan staat (Ongedaan maken) schuift erboven.

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
