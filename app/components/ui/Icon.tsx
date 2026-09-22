import type { LucideProps } from 'lucide-react';
import { ICONEN, type IconNaam } from './icons/namen';

/*
  Eén icoon uit de IDS-set (zie STIJL.md, "Iconen"). Altijd een naam uit de vaste lijst,
  lijn 2, currentColor. Het icoon is decoratief (aria-hidden): zet het label op de knop.
  Maten: 16 (badges, tabelacties), 20 (standaard), 24 (telefoon, navigatie, kaarten), 32 (lege staten).
*/

export type IconMaat = 16 | 20 | 24 | 32;

interface IconProps extends Omit<LucideProps, 'ref' | 'size'> {
  name: IconNaam;
  size?: IconMaat;
}

export default function Icon({ name, size = 20, className, ...rest }: IconProps) {
  const Component = ICONEN[name];
  return (
    <Component
      size={size}
      strokeWidth={2}
      aria-hidden="true"
      focusable="false"
      className={className ? `icon ${className}` : 'icon'}
      {...rest}
    />
  );
}
