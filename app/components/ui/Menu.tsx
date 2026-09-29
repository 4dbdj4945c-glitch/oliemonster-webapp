'use client';

// Uitklapmenu's van de balk en de zijbalk (Beheer, gebruikersmenu, hamburger).
// Gedeeld door AppShell en Schil. Opmaak: .toolbar-menu in globals.css.

import { ReactNode, useEffect, useRef, useState } from 'react';

export function initiaal(naam: string): string {
  return naam.trim().charAt(0).toUpperCase() || '?';
}

/* ---------- Uitklapmenu in de balk ---------- */

export interface ToolbarMenuProps {
  label: string;
  button: ReactNode;
  /** Andere knopinhoud zolang het menu open is (bv. een kruisje). */
  buttonOpen?: ReactNode;
  buttonClass: string;
  panelClass?: string;
  children: ReactNode;
}

export function ToolbarMenu({ label, button, buttonOpen, buttonClass, panelClass = 'toolbar-menu-paneel', children }: ToolbarMenuProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Sluiten bij klik buiten het menu, bij Escape en bij een keuze (klik binnen het paneel).
  useEffect(() => {
    if (!open) return;
    const buiten = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const toets = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', buiten);
    document.addEventListener('touchstart', buiten);
    document.addEventListener('keydown', toets);
    return () => {
      document.removeEventListener('mousedown', buiten);
      document.removeEventListener('touchstart', buiten);
      document.removeEventListener('keydown', toets);
    };
  }, [open]);

  return (
    <div className="toolbar-menu" ref={wrap}>
      <button
        type="button"
        className={`${buttonClass}${open ? ' on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
      >
        {open && buttonOpen ? buttonOpen : button}
      </button>
      {open && (
        <div className={panelClass} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  icon?: ReactNode;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function MenuItem({ icon, danger = false, onClick, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`toolbar-menu-item${danger ? ' toolbar-menu-item-danger' : ''}`}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}
