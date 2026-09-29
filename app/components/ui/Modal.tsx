'use client';

import { ReactNode, useEffect, useId, useRef } from 'react';
import Icon from './Icon';

type ModalSize = 'sm' | 'md' | 'lg';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: ModalSize;
  children: ReactNode;
  footer?: ReactNode;
}

// De vensters die nu open staan, van onder naar boven. Escape en de focusval
// gelden alleen voor het bovenste, zodat een venster in een venster (Afname
// ongedaan maken in Monster bewerken) niet allebei tegelijk dichtgaat.
const stapel: symbol[] = [];

/**
 * Wat elk venster nodig heeft (zie STIJL.md, "Modal"): bij openen de focus naar
 * binnen, Tab blijft in het venster, Escape sluit, en bij sluiten gaat de focus
 * terug naar de knop waarmee je het opende. Geef de ref aan het vensterpaneel.
 */
export function useVenster<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const paneel = useRef<T>(null);
  const sluit = useRef(onClose);
  useEffect(() => {
    sluit.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const ik = Symbol('venster');
    stapel.push(ik);
    const vorige = document.activeElement as HTMLElement | null;
    const focusbaar = () =>
      Array.from(
        paneel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // De focus op het venster zelf, niet op het eerste veld: op de telefoon
    // zou dat meteen het toetsenbord openen. Een schermlezer leest de titel voor.
    paneel.current?.focus({ preventScroll: true });

    const toets = (e: KeyboardEvent) => {
      if (stapel[stapel.length - 1] !== ik) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        sluit.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const lijst = focusbaar();
      if (lijst.length === 0) return;
      const eerst = lijst[0];
      const laatst = lijst[lijst.length - 1];
      if (e.shiftKey && document.activeElement === eerst) {
        e.preventDefault();
        laatst.focus();
      } else if (!e.shiftKey && document.activeElement === laatst) {
        e.preventDefault();
        eerst.focus();
      }
    };
    document.addEventListener('keydown', toets);
    return () => {
      document.removeEventListener('keydown', toets);
      const plek = stapel.indexOf(ik);
      if (plek >= 0) stapel.splice(plek, 1);
      if (vorige && document.contains(vorige)) vorige.focus({ preventScroll: true });
    };
  }, [open]);

  return paneel;
}

export default function Modal({ open, onClose, title, size = 'sm', children, footer }: ModalProps) {
  const paneel = useVenster<HTMLDivElement>(open, onClose);
  const titelId = useId();

  if (!open) return null;

  const sizeClass =
    size === 'lg' ? 'modal-content modal-content-lg' :
    size === 'md' ? 'modal-content modal-content-md' :
    'modal-content';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={paneel}
        className={sizeClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titelId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="modal-header">
            <h2 className="modal-title" id={titelId}>{title}</h2>
            <button type="button" className="icon-btn modal-sluit" onClick={onClose} aria-label="Sluiten" title="Sluiten">
              <Icon name="close" />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
