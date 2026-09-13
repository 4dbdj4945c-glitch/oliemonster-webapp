'use client';

import { Modal } from '@/app/components/ui';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: string;
}

export default function HelpModal({ isOpen, onClose, userRole }: HelpModalProps) {
  if (!isOpen) return null;

  const isAdmin = userRole === 'admin';

  return (
    <>
      <style jsx>{`
        .help-sectie {
          margin-bottom: 22px;
        }

        .help-sectie:last-child {
          margin-bottom: 0;
        }

        .help-sectie ul {
          margin: 0;
          padding-left: 20px;
          list-style: disc;
        }

        .help-sectie li {
          font-size: 14px;
          line-height: 1.6;
          color: var(--grijs-700);
          margin-bottom: 6px;
        }

        .help-sectie li:last-child {
          margin-bottom: 0;
        }

        .help-sectie p {
          margin: 0;
          font-size: 14px;
          line-height: 1.6;
          color: var(--grijs-700);
        }

        .help-sectie strong {
          color: var(--navy);
          font-weight: 600;
        }
      `}</style>

      {/* Modal levert .modal-backdrop > .modal-content > .modal-header + .modal-body + .modal-footer;
          op de telefoon wordt dat via globals.css een onderpaneel met scrollende body */}
      <Modal
        open={isOpen}
        onClose={onClose}
        title="Help en uitleg"
        size="md"
        footer={
          <button type="button" onClick={onClose} className="btn btn-primary">
            Sluiten
          </button>
        }
      >
        {/* Algemene functies voor alle gebruikers */}
        <section className="help-sectie">
          <h3 className="section-label">Overzicht</h3>
          <ul>
            <li><strong>Zoeken:</strong> gebruik het zoekveld om te zoeken op o-nummer, locatie of omschrijving.</li>
            <li><strong>Sorteren:</strong> sorteer de lijst op o-nummer, datum, locatie of laatst toegevoegd.</li>
            <li><strong>Status:</strong> groene badges zijn genomen monsters, rode badges niet genomen.</li>
            <li><strong>Foto&apos;s:</strong> klik op &quot;Bekijk foto&quot; om foto&apos;s van monsters te bekijken.</li>
          </ul>
        </section>

        <section className="help-sectie">
          <h3 className="section-label">Statistieken</h3>
          <p>
            Bovenaan zie je drie kaarten met statistieken: totaal aantal monsters, aantal genomen monsters en aantal niet-genomen monsters.
          </p>
        </section>

        {isAdmin ? (
          /* Admin-specifieke functies */
          <>
            <section className="help-sectie">
              <h3 className="section-label">Monsters beheren (admin)</h3>
              <ul>
                <li><strong>Toevoegen:</strong> klik op &quot;Nieuw monster&quot; om een monster toe te voegen.</li>
                <li><strong>Bewerken:</strong> klik op &quot;Bewerken&quot; bij een monster om deze aan te passen.</li>
                <li><strong>Verwijderen:</strong> klik op &quot;Verwijderen&quot; bij een monster om deze te verwijderen.</li>
                <li><strong>Datum:</strong> het datumveld is alleen beschikbaar wanneer &quot;Monster is genomen&quot; is aangevinkt.</li>
                <li><strong>O-nummer:</strong> elk o-nummer moet uniek zijn, je krijgt een waarschuwing bij duplicaten.</li>
              </ul>
            </section>

            <section className="help-sectie">
              <h3 className="section-label">Foto&apos;s uploaden (admin)</h3>
              <ul>
                <li>Klik op &quot;Upload foto&quot; bij een monster zonder foto.</li>
                <li>Selecteer een afbeelding van je apparaat.</li>
                <li>De foto wordt automatisch geüpload en opgeslagen.</li>
                <li>Foto&apos;s dienen als bewijs dat het monster is genomen.</li>
              </ul>
            </section>

            <section className="help-sectie">
              <h3 className="section-label">Beheerfuncties (admin)</h3>
              <ul>
                <li><strong>Gebruikersbeheer:</strong> voeg nieuwe gebruikers toe, pas wachtwoorden aan of verwijder gebruikers.</li>
                <li><strong>Kolommen instellen:</strong> bepaal welke kolommen zichtbaar zijn in het overzicht.</li>
                <li><strong>Auditlog:</strong> bekijk alle acties die in het systeem zijn uitgevoerd.</li>
              </ul>
            </section>

            <section className="help-sectie">
              <h3 className="section-label">Beveiliging</h3>
              <ul>
                <li>Maximaal 5 inlogpogingen per 15 minuten per IP-adres.</li>
                <li>Alle acties worden vastgelegd in het auditlog.</li>
                <li>Alleen admins kunnen gegevens toevoegen, bewerken of verwijderen.</li>
              </ul>
            </section>
          </>
        ) : (
          /* Reguliere gebruiker functies */
          <section className="help-sectie">
            <h3 className="section-label">Gebruikersrechten</h3>
            <ul>
              <li>Je kunt alle monsters bekijken en doorzoeken.</li>
              <li>Je kunt foto&apos;s bekijken en downloaden.</li>
              <li>Je kunt de lijst sorteren en filteren.</li>
              <li><strong>Let op:</strong> alleen admins kunnen monsters toevoegen, bewerken of verwijderen.</li>
            </ul>
          </section>
        )}

        <section className="help-sectie">
          <h3 className="section-label">Vragen</h3>
          <p>
            Neem contact op met de beheerder als je vragen hebt of problemen ondervindt met de applicatie.
          </p>
        </section>
      </Modal>
    </>
  );
}
