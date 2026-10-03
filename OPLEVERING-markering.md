# Oplevering: Markering, meerdere foto's, lijst plakken en verzamelrapport

Branch `markering` (niet gepusht, niet gemerged, main ongewijzigd). Gebouwd op 3 oktober 2026.

## Commits

1. `c477ae6` Meerdere foto's per bevinding: tabel InspectieFoto met migratie, foto's toevoegen, bijschrift en weghalen, fotoroute en offline wachtrij
2. `55e6d0c` Sjabloon Markering (locaties, uitslag, stickers, geen volgende inspectie) en lijst plakken in één keer
3. `e1ad6f8` Opleverrapport en verzamelrapport: meerdere inspecties van één klant en soort in één PDF, alle foto's per bevinding
4. `4a1784b` Schermen: foto's per bevinding met bijschrift en voortgang, Lijst plakken, Markering in het invulscherm, verzamelrapport kiezen in het overzicht
5. `fdccb4e` Tests voor markering, lijst plakken, meerdere foto's, afscherming en het verzamelrapport
6. `897dc29` dit bestand
7. Reviewronde: foto's naar de wachtrij bij wegvallend bereik, vragen bij sluiten, foto weghalen zacht met Ongedaan maken, grens van 500 foto's per verzamelrapport, koprij Markdown-tabel, kleine fixes

## Wat Roel nog moet doen

- `./db-bijwerken.sh` draaien (nieuwe migratie `20261005090000_inspectie_fotos`). Die maakt de tabel InspectieFoto en zet elke bestaande foto (`InspectieItem.fotoUrl`) over met volgorde 0. De kolom `fotoUrl` blijft staan. Zonder deze migratie werkt de inspectiemodule niet (de code leest de foto's uit de nieuwe tabel).
- Daarna mergen en deployen zoals altijd.

## Wat er gebouwd is

**Sjabloon Markering** (`lib/inspecties/sjablonen.ts`): locatie/locaties, "Bron of omschrijving", uitslag Gemarkeerd / Niet bereikbaar / Niet aangetroffen (zelf kiezen), meetwaarde Aantal stickers geplakt (0 tot 1000), instellingen Opdracht of referentie, Soort markering (standaard Waarschuwingssticker) en Ter attentie van. Icoon `tag` (bestond al). Geen volgende inspectie: niet op de schermen, niet in de lijst, niet in het klantportaal, niet in het rapport. Telling overal: "11 locaties, 10 gemarkeerd, 1 niet bereikbaar".

**Meerdere foto's per bevinding** (alle sjablonen): tabel `InspectieFoto`, API `POST /api/inspectie-items/[id]/fotos` (oud adres `.../foto` voegt nu ook toe), `PUT/DELETE /api/inspectie-fotos/[id]`. Foto's via `/api/fotos/inspectiefoto/{fotoId}`; het oude `/api/fotos/inspectie/{itemId}` geeft de eerste foto. In het venster: raster met miniaturen (lui geladen, nummer in de hoek, eerste is de overzichtsfoto), per foto een bijschrift, Foto's toevoegen (camera of fotobibliotheek, meerdere tegelijk), bij Opslaan één voor één verkleind en verstuurd met voortgang ("Foto 7 van 20 versturen..."). Mislukt er een, dan blijft die in het venster staan, de rest is opgeslagen, en Opslaan probeert het opnieuw zonder dubbele foto's (eigen sleutel per foto).

**Lijst plakken** in het invulscherm van een concept: tekstvak, voorbeeld ("3 regels, worden 3 locaties"), foute regels met regelnummer, opslaan in één verzoek (`POST /api/inspecties/[id]/items/bulk`, hoogstens 200, in een transactie, alles of niets, audit-log).

**Verzamelrapport**: in het overzicht inspecties aanvinken (ook op de telefoon, 44px), balk met "x gekozen", Alle zichtbare, Niets kiezen en Verzamelrapport. `GET /api/inspecties/rapport?ids=...` (admin, hoogstens 50). PDF: voorblad (navy band met wit logo, titel, opdrachtgever met t.a.v., opdracht, periode, uitvoerder, aantallen, telling per uitslag plus stickers, verklaring, gegevens It's Done Services), overzichtstabel per object met telling, per object een hoofdstuk met alle bevindingen en alle foto's in een raster van 3, kopregel met CONCEPT op elke pagina als er een concept bij zit, "Pagina x van y". Het enkele rapport van een markering gebruikt dezelfde opbouw met één object. Bestandsnaam `Opleverrapport-markering-<klant>-<laatste datum>.pdf`.

## Beslissingen

1. **Kijker en losse foto's**: de brief noemde "kijker ziet alleen afgeronde inspecties van eigen klant". Nu (en dus "dezelfde afscherming als nu") krijgt een kijker een inspectiefoto nooit los via de fotoroute, alleen in de PDF. Dat heb ik zo gehouden, voor het nieuwe en het oude adres. Getest (404 voor kijker kempen, ook bij een afgeronde inspectie van zijn eigen klant).
2. **Geen maximum van 10 foto's** (wijziging van Roel tijdens het bouwen): veiligheidsgrens 200 per bevinding, nergens in de UI genoemd; pas bij de 201e foto volgt een melding.
3. **fotoUrl blijft**, maar wordt niet meer gelezen. Haal je een foto weg die ook nog in `fotoUrl` stond, dan wordt `fotoUrl` op die bevinding leeggemaakt, zodat de foto niet via een oud adres terugkomt.
4. **Weghalen van een foto is zacht** (Roels regel veilig verwijderen): knop Weghalen (grijs, geen rode prullenbak) onder elke miniatuur, geen vraag vooraf, daarna onderin 10 seconden Ongedaan maken (`POST /api/inspectie-fotos/[id]/herstellen`, de foto komt op zijn plek terug). InspectieFoto heeft daarvoor `deletedAt`/`deletedBy` (in dezelfde, nog niet uitgerolde migratie). Het bestand blijft in de opslag zolang de rij bestaat. Een nieuw gekozen foto die nog niet verstuurd is, heet Niet toevoegen. Sluiten of Annuleren met nieuwe, nog niet verstuurde foto's vraagt eerst.
5. **Foto's gaan mee bij Opslaan**, ook bij een bestaande bevinding, net als de andere velden. Bijschriften van bestaande foto's ook.
6. **Groot bekijken**: een tik op een miniatuur opent de foto in een nieuw tabblad. PhotoModal is gemaakt voor twee monsterfoto's met tabs; met 25 foto's werkt dat niet.
7. **Offline wachtrij**: een nieuwe bevinding zonder bereik gaat met al zijn verkleinde foto's (en bijschriften) in de wachtrij. Valt het bereik weg nadat de bevinding al is opgeslagen (halverwege de foto's, bijvoorbeeld in een kelder), dan gaan de overige foto's alsnog naar de wachtrij, met de sleutel die het scherm al gebruikte, zodat er nooit iets dubbel komt. Ze gaan één voor één mee, elk met een eigen idempotentiesleutel (`<sleutel>-f<n>`); na een onderbreking alleen de rest. Oude wachtrij-items met één foto werken nog.
8. **CSRF-lijst**: `lib/herkomst.ts` laat multipart nu ook toe op `/api/inspectie-items/[id]/fotos` (gevonden met de klikproef in Chrome; zonder dit faalde elke upload met "Verstuur dit verzoek als JSON").
9. **Afronden**: nieuwe sjabloonvlag `oordeelVerplicht` (arbeidsmiddelen en markering). Melding: "Kies eerst een uitslag voor Bron 9 (of Niet bereikbaar)." Persluchtlekken blijft zonder die eis.
10. **Volgende inspectie**: nieuwe vlag `heeftVolgende`. Bij markering wordt `volgendeOp` bij aanmaken leeg gelaten en geeft `volgendeInspectie()` altijd null.
11. **Lijst plakken**: een regel die met `|` begint geldt als rij van een Markdown-tabel (de rand valt weg), de scheidingsregel `|---|` wordt overgeslagen, een opsommingsteken vooraan ook. Meer dan 3 kolommen of een lege titel is een foute regel; opslaan kan pas als alles klopt. Labelnummers tellen bij een nieuwe bevinding alleen nog door bij lekken (bij markering begint het titelveld leeg).
12. **Verzamelrapport voor alle sjablonen**: werkt ook voor lekken en arbeidsmiddelen (één klant, één soort). Bij arbeidsmiddelen komt de verklaring art. 7.4a met de lijst waarvoor hij geldt, net als in het enkele rapport. Het enkele rapport van lekken en arbeidsmiddelen is ongewijzigd, behalve dat de fotobijlage nu alle foto's per bevinding heeft (met "(2/3)" en het bijschrift).
13. **Bedrijfsgegevens** in `CONTACT` (`lib/rapport/rapportPdf.ts`) aangevuld met werkplaats Hoolstraat 21, 6006 SL Weert, postadres Warande 11, 5591 LN Heeze en de website. De postcode van Weert komt uit Roels eigen bedrijfsgegevens; in `app/privacy/tekst.ts` staat Weert nog zonder postcode.
14. **Rapporttijd**: hoogstens 500 foto's samen in een verzamelrapport met foto's (daarboven een melding: maak hem zonder foto's of in delen); in de selectiebalk staat ook "Zonder foto's". De knop Verzamelrapport controleert eerst (`&controle=1`), zodat zo'n melding op het scherm komt en niet als kapotte download. `maxDuration` blijft 60 seconden (zoals alle PDF-routes; een hogere waarde kan bij een Hobby-abonnement zonder Fluid compute de deploy laten mislukken). Foto's laden 8 tegelijk, verkleind tot 400 px JPEG (laadFotoKlein). Voorbeeld met 33 foto's: 0,2 seconde lokaal. Grote PDF's (boven 4 MB) gaan zoals altijd via de opslag.
15. **Algemeen gehouden**: geen klantnamen of "asbest" in code, koppen of navigatie. Teksten in Schil (Nieuw-menu), modulebeschrijving en de overzichtspagina noemen nu lekken, arbeidsmiddelen en markering.

## Gecontroleerd

- `npm test`: 30 bestanden, **312 tests groen** (was 292). Nieuw: sjabloon markering, verklaring met en zonder opdracht, telling/uitkomst, afronden zonder uitslag geweigerd, lijst plakken (parser met foute regels, Markdown, maximum; route met 400 bij foute regel en te veel regels, 409 bij afgerond, 403 voor gebruiker), meerdere foto's toevoegen/bijschrift/weghalen (ook via het oude adres, 409 bij afgerond, 403 voor gebruiker), idempotente foto-upload, afscherming kijker (404), oud foto-adres, migratie-SQL zet fotoUrl over, verzamelrapport weigert gemengde klant of soort (400), niet voor gebruiker of kijker (403), levert een PDF voor markering en lekken, wachtrij met meerdere foto's, herkomst.
- `npm run lint`: 0 fouten (30 waarschuwingen, allemaal al bestaand).
- `npm run build`: geslaagd (met lokale DATABASE_URL).
- `npm run db:controle`: "No difference detected" (eigen shadow-database).
- Schermen bekeken op 1440 en 390 (scripts/schermen.mjs met een eigen dev-database): overzicht met selectie, invulscherm markering, venster met 14 foto's, Lijst plakken, Nieuwe inspectie met drie sjablonen. Geen horizontale overloop.
- Klikproef foto weghalen: melding "Foto 1 weggehaald" met Ongedaan maken, teller van 14 naar 13 en na Ongedaan maken terug naar 14.
- Klikproef in headless Chrome op 390: lijst plakken met een foute regel en daarna goed (3 locaties toegevoegd), 20 foto's tegelijk kiezen (miniaturen verschijnen), Opslaan: lokaal zonder Blob-opslag mislukt de upload, het venster houdt alle 20 foto's vast met één duidelijke melding.
- Voorbeeld-PDF met nepdata (2 objecten, 4 bevindingen, één bevinding met 25 foto's): `/private/tmp/claude-501/-Users-roel-Documents-Claude/f7f4ede3-e5d5-4363-81fc-a087d39cac4c/scratchpad/voorbeeld-verzamelrapport.pdf` (6 pagina's).

## Reviewpunten die bewust open blijven

- Per foto-upload bewaart de idempotentie het hele inspectie-antwoord 30 dagen in Verzending. Bij heel veel foto's wordt die tabel groter; niet aangepast (werkt, en blijft eenvoudig).
- Verzamelrapport voor arbeidsmiddelen neemt de norm uit de eerste inspectie. Voor lekken mist het verzamelrapport kosten, CO2 en gerepareerd; gebruik voor lekken voorlopig het enkele rapport.
- De oude DELETE op `/api/inspectie-items/[id]/foto` bestaat niet meer (alleen een telefoon met heel oude code zou hem gebruiken).

## Open punten

- De uploadflow met echte opslag (Vercel Blob) is alleen via de routetests getest (met een nep-opslag); lokaal is er geen Blob-token. Na de deploy even 20 foto's uploaden op de telefoon als proef.
- De Mourik-kijker is niet opnieuw pixel voor pixel vergeleken; er is niets aan de kijker of de klassieke balk veranderd (alleen `.insp-*`-CSS en nieuwe klassen).
- Foto's verplaatsen (volgorde wijzigen) kan niet; de volgorde is die van toevoegen, zoals gevraagd.
- Lokaal staan drie hulpdatabases (`ids_portal_test_mark`, `ids_portal_shadow_mark`, `ids_portal_dev_mark`); weg te halen met `dropdb`.
- `scripts-grave-tmp.cjs` stond al ongevolgd in de map en is niet van mij; niet aangeraakt.
