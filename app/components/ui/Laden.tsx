'use client';

/*
  Eén laadstaat voor alle modules (zie STIJL.md, "Leeg, laden, fout"): de
  schil en de paginatitel blijven staan, daaronder een skelet van grijze
  blokken in de vorm van wat er komt. Nooit een 0 of een lege lijst tonen
  zolang het er nog niet is: dat is niet te onderscheiden van "er is niets".
  Opmaak: .skelet in globals.css.
*/

export default function Laden({
  label = 'Laden',
  regels = 3,
  soort = 'kaarten',
}: {
  /** Voor de schermlezer, bijvoorbeeld "Monsters laden". */
  label?: string;
  regels?: number;
  /** kaarten: losse blokken onder elkaar; lijst: rijen in één kaart; tegels: een rij kleine blokken. */
  soort?: 'kaarten' | 'lijst' | 'tegels';
}) {
  return (
    <div className={`skelet skelet-${soort}`} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}...</span>
      {Array.from({ length: regels }, (_, i) => (
        <div key={i} className="skelet-blok" aria-hidden="true">
          <span className="skelet-lijn skelet-lijn-kort" />
          <span className="skelet-lijn" />
        </div>
      ))}
    </div>
  );
}
