# Oplevering wensen ronde 2

Branch `wensen-2`, vanaf `main`. Niet gemerged en niets gedeployed.
`npx tsc --noEmit` en `npm run build` slagen allebei.

## Eerst dit draaien

Ik heb `prisma/schema.prisma` aangepast maar **geen** `prisma db push` gedraaid en
`.env.production` niet aangeraakt. Draai zelf, vanuit de projectmap:

```bash
./db-push-wensen2.sh
```

Dat script doet twee dingen: het zet het schema in de database (de tweede foto,
de velden van Niet bereikbaar en het kijkjaar op User), en het draait daarna
`prisma/migreer-alleen-lezen.ts`, dat iedere gebruiker met de oude rol
`viewer_oil2025` omzet naar de nieuwe rol `alleen_lezen` met kijkjaar 2025. Dat
tweede script is los te draaien met `npm run migreer-alleen-lezen` en je kunt het
zo vaak draaien als je wil.

Zolang je het script nog niet gedraaid hebt, blijft de portal werken. Je krijgt
dan op de plekken die de nieuwe kolommen nodig hebben een nette melding met
precies deze opdracht erin (hetzelfde patroon als bij de planningsmodule), en de
lijst valt terug op de velden die er wel zijn. Een gebruiker met de oude rol
blijft in die tussentijd gewoon een kijker van 2025, dus niemand ziet tijdelijk
meer dan de bedoeling is.

## 1. Twee foto's per monster

Er zijn nu twee foto's: **het onderdeel** waar het monster vandaan komt, en **het
monsterpotje**. Bestaande foto's zijn de potjesfoto, daar verandert niets aan.

- `OilSample.partPhotoUrl` en `SampleAttempt.partPhotoUrl` erbij; `photoUrl` blijft
  het potje. Wie geen soort meestuurt krijgt de potjesfoto, dus oude aanroepen
  blijven doen wat ze deden.
- De soorten staan op één plek (`lib/samplePhotos.ts`): kolom, label, knoptekst en
  icoon. De routes en de schermen gebruiken diezelfde lijst.
- In de lijst staat per monster een regel per foto, met de naam erbij, en voor een
  admin een eigen uploadknop per soort.
- Het fotovenster toont beide foto's met een tik om te wisselen. Op de telefoon
  staan die knoppen onderin, binnen het veilige gebied, 44px hoog.
- De pogingenlijst (hermonstering) heeft ook beide foto's per poging.
- De PDF heeft twee fotokolommen met de foto in de cel.

## 2. Niet bereikbaar als vierde status

Naast genomen, niet genomen en geannuleerd. Voor een locatie die door afzetting,
andere werkzaamheden of begroeiing niet te bereiken was.

- Velden op `OilSample`: `isUnreachable`, `unreachableReason` (vaste lijst in
  `lib/unreachableReasons.ts`: afzetting, andere werkzaamheden, begroeiing, anders
  met toelichting), `unreachableNote` (korte omschrijving, verplicht),
  `unreachablePhotoUrl` (eigen foto als bewijs), plus wanneer en door wie.
- **Het monster blijft openstaan.** `isDisabled` en `isTaken` blijven false, dus
  het blijft meetellen in de planning: `lib/samplePlans.ts` filtert op
  `isDisabled`, dus dat werkte zonder wijziging. Dat is dus iets anders dan
  geannuleerd, dat juist buiten de planning valt.
- Eigen badge met het bestaande icoonsysteem: `badge-warning` met het icoon
  `alert-warning`, en de reden plus de omschrijving eronder in de rij.
- Meegeteld in de regel boven de lijst, in het statusfilter, als vijfde tegel en
  in de PDF (status met reden en omschrijving, en in de telling bovenaan).
- Eigen auditacties: `SET_SAMPLE_UNREACHABLE` en `CLEAR_SAMPLE_UNREACHABLE`.
- Zet je zo'n monster later op genomen, dan gaat de registratie er automatisch af,
  zodat een monster nooit twee statussen tegelijk heeft. De reden blijft in het
  logboek staan.
- In de rij kun je de reden aanpassen of het terugdraaien ("Weer bereikbaar").

De vier statussen staan op één plek (`lib/sampleStatus.ts`) met hun label, badge
en icoon, zodat de lijst, de tellingen en de PDF hetzelfde zeggen.

## 3. Rol alleen lezen

`viewer_oil2025` is vervangen door één rol `alleen_lezen`, met per gebruiker een
instelbaar analysejaar (`User.viewYear`; leeg = alle jaren).

- **Serverside afgedwongen, niet alleen in de UI.** De monsterlijst leest het
  kijkjaar uit de database en dwingt dat jaar af, wat er ook in de query staat.
  Uit de database en niet uit de cookie, zodat een wijziging in het
  gebruikersbeheer meteen geldt en niet pas na opnieuw inloggen.
- De rol mag alleen de oliemonstermodule: de lijst, de foto's, de geannuleerde
  monsters en de monsters die niet bereikbaar waren. Geen wijzigingen, geen PDF,
  geen andere module en geen beheerpagina. De sessie- en rolcontrole staat nu in
  `lib/toegang.ts` en elke route gebruikt die; de paar routes waar de rol nog
  langs kon (de losse routes van de controlerondes en de opmerkingen bij een
  Ultimo-taak) geven hem nu 403.
- Wat de rol wél houdt: `/api/settings` (dat is de kolomkeuze van de lijst zelf)
  en het instellen van een eigen wachtwoord bij de eerste keer inloggen.
- Het dashboard: een kijker met een vast jaar gaat er meteen doorheen naar dat
  jaar; een kijker die alle jaren mag zien krijgt alleen de twee jaarkaarten te
  zien, en de tellingen van de andere modules worden voor hem niet opgehaald.
- Gebruikersbeheer: rol en analysejaar zijn in te stellen, met uitleg onder de
  keuze, en de lijst laat per kijker zien of het één jaar of alle jaren is.
- De routes voor aanmaken, wijzigen en verwijderen van gebruikers leggen dat nu
  ook in de auditlog vast. Dat gebeurde nog niet.

## 4. Knop "Monster nemen"

Bij elk monster dat nog open staat. Eén knop die meteen het hele invulscherm
opent: de datum staat al op vandaag, plus type olie, opmerking en beide foto's.
In één keer opslaan, via `POST /api/samples/[id]/nemen` (multipart, want er gaan
twee bestanden mee).

- In datzelfde venster zit de knop **Niet bereikbaar**, die naar het formulier uit
  punt 2 schakelt zonder dat je het venster uit moet.
- Staat er nog een openstaande poging (een ingeplande hermonstering), dan wordt
  die gevuld in plaats van dat er een tweede poging bijkomt. **Hermonstering
  blijft bestaan** voor een tweede poging.
- Gemaakt voor een telefoon met werkhandschoenen aan: velden en knoppen 56px op de
  telefoon (52px op de computer), en de foto's zijn twee grote tikvlakken die op
  de telefoon meteen de camera openen. Dat is in Chromium nagemeten op 390px en
  1280px breed: velden 56, knoppen 56, fotovlakken 109 hoog, foto's onder elkaar,
  geen horizontaal scrollen.

## Wat ik heb aangeraakt

**Nieuw**

- `db-push-wensen2.sh`, `prisma/migreer-alleen-lezen.ts`
- `lib/toegang.ts` (sessie- en rolcontrole die elke module deelt)
- `lib/kolommen.ts` (het 503-patroon apart gezet, uit `lib/prospectApi.ts`)
- `lib/sampleStatus.ts`, `lib/unreachableReasons.ts`, `lib/samplePhotos.ts`
- `app/api/samples/[id]/nemen/route.ts`, `app/api/samples/[id]/unreachable/route.ts`
- `app/components/MonsterNemenModal.tsx`, `OnbereikbaarModal.tsx`,
  `OnbereikbaarFormulier.tsx`, `FotoKiezer.tsx`

**Aangepast**

- `prisma/schema.prisma`, `package.json`
- `lib/roles.ts`, `lib/sampleAttempts.ts`, `lib/planningApi.ts`,
  `lib/prospectApi.ts`, `lib/auditLog.ts`, `lib/generateSamplesPdf.ts`
- API: `samples` (lijst, monster, status, foto, pogingen), `users`,
  `auth/session`, `control-rounds` (de losse routes), `ultimo-tasks/[id]/comments`
- Schermen: beide oliemonsterpagina's, het dashboard, instellingen, en de
  modulepagina's die de oude rol bij naam noemden (ultimo, print-calculator,
  controlerondes, objecten, objecten/koppelen, acquisitie)
- Componenten: `PhotoModal`, `SampleAttemptsPanel`, `HelpModal`, `ui/AppShell`
- `app/globals.css`, `STIJL.md`, `README.md`

## Wat ik niet af kreeg, en wat ik expres heb laten liggen

- **Geen test tegen een echte database.** Er was hier geen database, dus de routes
  zijn niet tegen echte data gedraaid. De PDF en de twee nieuwe vensters heb ik
  wel in Chromium getest (zie hieronder); de rest is nagelopen op typecheck, build
  en lezen.
- **Eigen icoon voor Niet bereikbaar.** STIJL.md zegt dat een nieuw icoon eerst in
  `iconen-voorstel/` getekend moet worden. Niet bereikbaar leent daarom nu
  `alert-warning` (het driehoekje). Dat staat als aantekening in STIJL.md.
- **De planning toont Niet bereikbaar nog niet als eigen status.** Zo'n monster
  telt daar mee als "Nog doen", wat klopt, maar je ziet in het dagscherm niet dat
  je er de vorige keer niet bij kon. `lib/samplePlans.ts` haalt vaste velden op en
  dat wilde ik niet aanpassen zonder dat `db-push-wensen2.sh` gedraaid is. Zeg het
  als je dat er alsnog bij wil.
- **De bewijsfoto van Niet bereikbaar staat niet in de PDF.** Wel in de portal en
  in het fotovenster. De PDF heeft twee fotokolommen (onderdeel en potje); een
  derde kolom maakt de tabel te vol. De reden en de omschrijving staan er wel in.
- **De andere modules zijn niet strenger gemaakt dan ze waren.** Bij de
  controlerondes en de Ultimo-opmerkingen mocht een gewone gebruiker al schrijven;
  dat heb ik zo gelaten en alleen de rol alleen lezen geweigerd. Alleen bij de
  oliemonsters blijft schrijven admin-only, zoals het al was.
- **De knop Monster nemen is admin-only**, net als alles wat in de monsterlijst
  wijzigt. Als er ooit iemand anders in het veld moet kunnen invullen, moet daar
  een aparte rol voor komen.

## Waar ik twijfelde

- **Niet bereikbaar op het monster of op de poging.** Ik heb het op het monster
  gezet, net als het annuleren, en niet op `SampleAttempt`. Reden: het is een
  toestand van het monster ("dit moet nog gebeuren, maar we konden er niet bij"),
  en op de poging zou het bij elke hermonstering overschreven worden. Nadeel: je
  ziet niet in de pogingenlijst terug hoe vaak je er niet bij kon. Dat staat wel in
  de auditlog. Als je die geschiedenis in beeld wil, hoort het er als eigen soort
  poging bij.
- **De foto als bewijs is niet verplicht.** De korte omschrijving wel. In het veld
  lukt een foto niet altijd, en dan is een vastgelegde reden zonder foto beter dan
  een monster waar niets van vastligt.
- **Het kijkjaar leeg = alle jaren.** Dat leek me logischer dan een verplichte
  keuze, maar het betekent wel dat je bij het aanmaken van een kijker bewust een
  jaar moet invullen als je hem wil beperken. De uitleg staat onder het veld.
  Een kijkjaar waar nog geen pagina voor is (bijvoorbeeld 2027) geeft een melding
  op het dashboard in plaats van een lege lijst.
- **Foto's in de PDF maken het bestand groter en het genereren langzamer.** Elke
  foto wordt eerst opgehaald en via een canvas verkleind naar een JPEG van
  maximaal 480 pixels. Bij een jaar met veel foto's duurt de knop "PDF genereren"
  daardoor merkbaar langer. Lukt een foto niet, dan blijft er een streepje staan in
  plaats van dat de hele PDF mislukt.
- **De directe fotoupload op een monster met pogingen.** Upload je een foto op het
  monster zelf terwijl er ook pogingen zijn, dan kan een latere synchronisatie met
  de laatste poging die foto overschrijven. Dat was al zo voor de potjesfoto en ik
  heb het niet veranderd. De knop Monster nemen schrijft netjes via de poging, dus
  die route heeft er geen last van.

## Wat ik wel heb getest

- `npx tsc --noEmit` en `npm run build`: allebei zonder fouten. De lintmeldingen
  die overblijven zaten er al voor deze ronde in; de nieuwe bestanden zijn schoon.
- **De PDF, in Chromium.** Daarbij kwam een echte fout boven: autoTable roept de
  celhooks ook aan voor een regel die over een paginagrens valt, en die heeft
  rij-index -1. Daar liep het tekenen van de foto's op stuk. Dat is opgelost en
  daarna gecontroleerd dat de foto's echt in het bestand komen (twee losse
  afbeeldingen) en dat een staande en een liggende foto hun verhoudingen houden
  binnen de cel.
- **De twee nieuwe vensters, in Chromium**, op 390px en 1280px breed. Daarbij kwam
  boven dat de velden en de knoppen op de telefoon 44 en 46px bleven in plaats van
  56: de algemene regels in globals.css staan op de losse elementen en wogen
  zwaarder. Opgelost en nagemeten. Ook gecontroleerd dat de knop Niet bereikbaar
  binnen hetzelfde venster naar dat formulier schakelt, dat de reden "Anders" om
  een toelichting vraagt, en dat het opslaan de juiste velden meestuurt.
