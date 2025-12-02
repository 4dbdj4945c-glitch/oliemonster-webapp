'use client';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: string;
}

export default function HelpModal({ isOpen, onClose, userRole }: HelpModalProps) {
  if (!isOpen) return null;

  const isAdmin = userRole === 'admin';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">
            Help & Uitleg
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            aria-label="Sluiten"
          >
            ×
          </button>
        </div>

        <div className="space-y-6 text-gray-700">
          {/* Algemene functies voor alle gebruikers */}
          <section>
            <h3 className="text-lg font-semibold mb-2 text-gray-900">📋 Overzicht</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Zoeken:</strong> Gebruik het zoekveld om te zoeken op o-nummer, locatie of omschrijving</li>
              <li><strong>Sorteren:</strong> Sorteer de lijst op o-nummer, datum, locatie of laatst toegevoegd</li>
              <li><strong>Status:</strong> Groene badges = genomen, rode badges = niet genomen</li>
              <li><strong>Foto's:</strong> Klik op "📷 Bekijk foto" om foto's van monsters te bekijken</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold mb-2 text-gray-900">📊 Statistieken</h3>
            <p className="ml-2">
              Bovenaan zie je drie kaarten met statistieken: totaal aantal monsters, aantal genomen monsters en aantal niet-genomen monsters.
            </p>
          </section>

          {isAdmin ? (
            /* Admin-specifieke functies */
            <>
              <section>
                <h3 className="text-lg font-semibold mb-2 text-gray-900">➕ Monsters Beheren (Admin)</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Toevoegen:</strong> Klik op "+ Nieuw Monster" om een monster toe te voegen</li>
                  <li><strong>Bewerken:</strong> Klik op "Bewerken" bij een monster om deze aan te passen</li>
                  <li><strong>Verwijderen:</strong> Klik op "Verwijderen" bij een monster om deze te verwijderen</li>
                  <li><strong>Datum:</strong> Het datumveld is alleen beschikbaar wanneer "Monster is genomen" is aangevinkt</li>
                  <li><strong>O-nummer:</strong> Elk o-nummer moet uniek zijn - je krijgt een waarschuwing bij duplicaten</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-2 text-gray-900">📷 Foto's Uploaden (Admin)</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Klik op "+ Upload foto" bij een monster zonder foto</li>
                  <li>Selecteer een afbeelding van je apparaat</li>
                  <li>De foto wordt automatisch geüpload en opgeslagen</li>
                  <li>Foto's dienen als bewijsvoering dat het monster is genomen</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-2 text-gray-900">⚙️ Beheer Functies (Admin)</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Gebruikersbeheer:</strong> Voeg nieuwe gebruikers toe, pas wachtwoorden aan of verwijder gebruikers</li>
                  <li><strong>Thema aanpassen:</strong> Kies tussen verschillende kleurthema's (blauw, groen, paars, rood, donker)</li>
                  <li><strong>Kolommen instellen:</strong> Bepaal welke kolommen zichtbaar zijn in het overzicht</li>
                  <li><strong>Audit Logs:</strong> Bekijk alle acties die in het systeem zijn uitgevoerd</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-2 text-gray-900">🔒 Beveiliging</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Maximaal 5 inlogpogingen per 15 minuten per IP-adres</li>
                  <li>Alle acties worden gelogd in de audit logs</li>
                  <li>Alleen admins kunnen gegevens toevoegen, bewerken of verwijderen</li>
                </ul>
              </section>
            </>
          ) : (
            /* Reguliere gebruiker functies */
            <section>
              <h3 className="text-lg font-semibold mb-2 text-gray-900">👤 Gebruikersrechten</h3>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Je kunt alle monsters bekijken en doorzoeken</li>
                <li>Je kunt foto's bekijken en downloaden</li>
                <li>Je kunt de lijst sorteren en filteren</li>
                <li><strong>Let op:</strong> Alleen admins kunnen monsters toevoegen, bewerken of verwijderen</li>
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-lg font-semibold mb-2 text-gray-900">🌓 Thema Wijzigen</h3>
            <p className="ml-2">
              Klik op de ◐/◑ knop rechts bovenaan om te wisselen tussen licht en donker thema. De wijziging wordt direct zichtbaar.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold mb-2 text-gray-900">❓ Vragen?</h3>
            <p className="ml-2">
              Neem contact op met de beheerder als je vragen hebt of problemen ondervindt met de applicatie.
            </p>
          </section>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}
