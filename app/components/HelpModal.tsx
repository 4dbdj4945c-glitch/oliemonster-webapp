'use client';

import { Modal } from '@/app/components/ui';
import { isAlleenLezen } from '@/lib/roles';

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
            <li>
              <strong>Status:</strong> er zijn vier statussen. Groen is genomen, rood is niet
              genomen, oranje is niet bereikbaar (de locatie was niet te bereiken, het monster
              blijft openstaan) en grijs is geannuleerd (hoeft niet meer).
            </li>
            <li>
              <strong>Foto&apos;s:</strong> elk monster heeft twee foto&apos;s, van het onderdeel en
              van het monsterpotje. Klik op een van de twee om ze te bekijken; in het fotovenster
              wissel je met één tik.
            </li>
          </ul>
        </section>

        <section className="help-sectie">
          <h3 className="section-label">Statistieken</h3>
          <p>
            Bovenaan zie je vijf kaarten: het totaal en de vier statussen (genomen, niet genomen,
            niet bereikbaar, geannuleerd). Een tik op een kaart filtert de lijst.
          </p>
        </section>

        {isAdmin ? (
          /* Admin-specifieke functies */
          <>
            <section className="help-sectie">
              <h3 className="section-label">Monsters beheren (admin)</h3>
              <ul>
                <li><strong>Toevoegen:</strong> klik op &quot;Nieuw monster&quot; om een monster toe te voegen.</li>
                <li><strong>Bewerken:</strong> klik op het potloodje bij een monster om het aan te passen (op de telefoon staat er &quot;Bewerken&quot; bij).</li>
                <li><strong>Verwijderen:</strong> klik op het prullenbakje bij een monster om het te verwijderen (op de telefoon staat er &quot;Verwijderen&quot; bij).</li>
                <li><strong>Datum:</strong> het datumveld is alleen beschikbaar wanneer &quot;Monster is genomen&quot; is aangevinkt.</li>
                <li><strong>O-nummer:</strong> elk o-nummer moet uniek zijn, je krijgt een waarschuwing bij duplicaten.</li>
              </ul>
            </section>

            <section className="help-sectie">
              <h3 className="section-label">Monster nemen (admin)</h3>
              <ul>
                <li>
                  Bij elk monster dat nog open staat zit de knop &quot;Monster nemen&quot;. Die opent
                  meteen het hele invulscherm: de datum staat al op vandaag, en je vult het type olie,
                  een opmerking en beide foto&apos;s in. In één keer opslaan.
                </li>
                <li>
                  Kon je er niet bij, dan schakel je in datzelfde scherm met &quot;Niet bereikbaar&quot;
                  over naar het formulier daarvoor: een reden (afzetting, andere werkzaamheden,
                  begroeiing of anders), een korte omschrijving en een foto als bewijs. Het monster
                  blijft openstaan en blijft meetellen in de planning.
                </li>
                <li>
                  Hermonstering blijft bestaan voor een tweede poging bij hetzelfde monster.
                </li>
              </ul>
            </section>

            <section className="help-sectie">
              <h3 className="section-label">Foto&apos;s uploaden (admin)</h3>
              <ul>
                <li>Elk monster heeft twee foto&apos;s: het onderdeel waar het monster vandaan komt, en het monsterpotje.</li>
                <li>Klik in de lijst op de uploadknop van de foto die nog ontbreekt.</li>
                <li>Op de telefoon opent de camera meteen; op de computer kies je een bestand.</li>
                <li>De foto&apos;s zijn het bewijs, en ze komen ook in de PDF voor de klant.</li>
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
              <li>Je kunt de monsters bekijken en doorzoeken.</li>
              <li>Je kunt beide foto&apos;s per monster bekijken en downloaden.</li>
              <li>Je kunt de lijst sorteren en filteren, ook op geannuleerd en op niet bereikbaar.</li>
              <li><strong>Let op:</strong> alleen admins kunnen monsters toevoegen, bewerken of verwijderen.</li>
              {isAlleenLezen(userRole) && (
                <li>
                  Met de rol alleen lezen zie je uitsluitend de oliemonsters. Heeft de beheerder een
                  analysejaar voor je ingesteld, dan zie je alleen de monsters van dat jaar.
                </li>
              )}
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
