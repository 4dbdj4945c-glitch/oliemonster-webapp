'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ROLE_LABELS, isOilViewer2025 } from '@/lib/roles';
import { Icons } from './NavButton';

/*
  Navy balk bovenaan elke pagina (zie STIJL.md, "Balk bovenaan").
  Links:  logo | IDS Portal | modulenaam
  Rechts: [extra's van de pagina] Terug naar dashboard · Beheer (menu, alleen admin)
          · Help (optioneel) · gebruikersmenu (avatar + naam, met Uitloggen)
  Telefoon (tot 640px): alleen logo, modulenaam, extra's van de pagina en een hamburgerknop;
  alle andere opties zitten in het uitklappaneel eronder.
  De balk regelt zelf uitloggen en de sessie (als de pagina geen `user` meegeeft).
*/

export interface ShellUser {
  username: string;
  role: string;
}

interface AppShellProps {
  /** Naam van de module, komt gedimd achter "IDS Portal" te staan. */
  title?: string;
  /** Sessiegebruiker als de pagina die al heeft; anders haalt de balk hem zelf op. */
  user?: ShellUser | null;
  /** Beheer > Afdrukken. Zonder callback wordt window.print() gebruikt. */
  onPrint?: () => void;
  /** Toont een Help-knop naast het gebruikersmenu. */
  onHelp?: () => void;
  leftExtra?: ReactNode;
  /** Paginaspecifieke knoppen, komen vóór "Terug naar dashboard". */
  rightActions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}

export default function AppShell({
  title,
  user: userProp,
  onPrint,
  onHelp,
  leftExtra,
  rightActions,
  children,
  wide = false,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [fetchedUser, setFetchedUser] = useState<ShellUser | null>(null);
  const user = userProp === undefined ? fetchedUser : userProp;

  useEffect(() => {
    if (userProp !== undefined) return;
    let actief = true;
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) => { if (actief && d?.isLoggedIn) setFetchedUser({ username: d.username, role: d.role }); })
      .catch(() => {});
    return () => { actief = false; };
  }, [userProp]);

  const isAdmin = user?.role === 'admin';
  const opDashboard = pathname === '/dashboard';
  // De beperkte kijker heeft geen dashboard; navigatieknoppen hebben voor hem geen zin.
  const toonNavigatie = !opDashboard && !isOilViewer2025(user?.role);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
    }
  };

  const afdrukken = () => {
    if (onPrint) onPrint();
    else window.print();
  };

  return (
    <div className="app-page">
      <div className="toolbar">
        <div className="toolbar-inner">
          <div className="toolbar-left">
            <img src="/header_logo.png" alt="It's Done Services" className="toolbar-logo" />
            <span className="toolbar-divider" />
            <span className="toolbar-title">IDS Portal</span>
            {title && <span className="toolbar-module">{title}</span>}
            {leftExtra}
          </div>

          <div className="toolbar-right">
            {rightActions}

            {toonNavigatie && (
              <button type="button" className="nav-btn" onClick={() => router.push('/dashboard')} aria-label="Terug naar dashboard">
                {Icons.Home}
                <span className="lang">Terug naar dashboard</span>
                <span className="kort">Dashboard</span>
              </button>
            )}

            {isAdmin && (
              <ToolbarMenu
                label="Beheer"
                buttonClass="nav-btn"
                button={<>{Icons.Settings}Beheer{Icons.ChevronDown}</>}
              >
                <MenuItem icon={Icons.Logs} onClick={() => router.push('/dashboard/audit-logs')}>Audit logs</MenuItem>
                <MenuItem icon={Icons.Columns} onClick={() => router.push('/dashboard/admin?tab=columns')}>Kolommen aanpassen</MenuItem>
                <MenuItem icon={Icons.Settings} onClick={() => router.push('/dashboard/admin')}>Instellingen</MenuItem>
                <span className="toolbar-menu-scheiding" />
                <MenuItem icon={Icons.Print} onClick={afdrukken}>Afdrukken</MenuItem>
              </ToolbarMenu>
            )}

            {onHelp && (
              <button type="button" className="nav-btn nav-btn-icoon" onClick={onHelp} aria-label="Help" title="Help">
                {Icons.Help}
              </button>
            )}

          </div>

          {user && (
            <div className="toolbar-user-wrap">
              <ToolbarMenu
                label={`Gebruikersmenu van ${user.username}`}
                buttonClass="toolbar-user"
                button={
                  <>
                    <span className="toolbar-user-naam">{user.username}</span>
                    <span className="toolbar-avatar" aria-hidden="true">{initiaal(user.username)}</span>
                  </>
                }
              >
                <div className="toolbar-menu-kop">
                  <strong>{user.username}</strong>
                  <span>{ROLE_LABELS[user.role] ?? user.role}</span>
                </div>
                <span className="toolbar-menu-scheiding" />
                <MenuItem icon={Icons.Logout} danger onClick={handleLogout}>Uitloggen</MenuItem>
              </ToolbarMenu>
            </div>
          )}

          {/* Telefoon: hamburger met alles in een paneel */}
          <div className="toolbar-mobiel">
            {rightActions}
            <ToolbarMenu
              label="Menu"
              buttonClass="nav-btn nav-btn-icoon toolbar-hamburger"
              panelClass="toolbar-mobiel-paneel"
              button={Icons.Menu}
              buttonOpen={Icons.Close}
            >
              {user && (
                <div className="toolbar-menu-kop toolbar-mobiel-kop">
                  <span className="toolbar-avatar" aria-hidden="true">{initiaal(user.username)}</span>
                  <div>
                    <strong>{user.username}</strong>
                    <span>{ROLE_LABELS[user.role] ?? user.role}</span>
                  </div>
                </div>
              )}
              {toonNavigatie && (
                <MenuItem icon={Icons.Home} onClick={() => router.push('/dashboard')}>Terug naar dashboard</MenuItem>
              )}
              {onHelp && <MenuItem icon={Icons.Help} onClick={onHelp}>Help</MenuItem>}
              {isAdmin && (
                <>
                  <span className="toolbar-menu-label">Beheer</span>
                  <MenuItem icon={Icons.Logs} onClick={() => router.push('/dashboard/audit-logs')}>Audit logs</MenuItem>
                  <MenuItem icon={Icons.Columns} onClick={() => router.push('/dashboard/admin?tab=columns')}>Kolommen aanpassen</MenuItem>
                  <MenuItem icon={Icons.Settings} onClick={() => router.push('/dashboard/admin')}>Instellingen</MenuItem>
                  <MenuItem icon={Icons.Print} onClick={afdrukken}>Afdrukken</MenuItem>
                </>
              )}
              {user && (
                <>
                  <span className="toolbar-menu-scheiding" />
                  <MenuItem icon={Icons.Logout} danger onClick={handleLogout}>Uitloggen</MenuItem>
                </>
              )}
            </ToolbarMenu>
          </div>
        </div>
      </div>
      <div className={wide ? 'app-content-wide' : 'app-content'}>{children}</div>
    </div>
  );
}

function initiaal(naam: string): string {
  return naam.trim().charAt(0).toUpperCase() || '?';
}

/* ---------- Uitklapmenu in de balk ---------- */

interface ToolbarMenuProps {
  label: string;
  button: ReactNode;
  /** Andere knopinhoud zolang het menu open is (bv. een kruisje). */
  buttonOpen?: ReactNode;
  buttonClass: string;
  panelClass?: string;
  children: ReactNode;
}

function ToolbarMenu({ label, button, buttonOpen, buttonClass, panelClass = 'toolbar-menu-paneel', children }: ToolbarMenuProps) {
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

function MenuItem({ icon, danger = false, onClick, children }: MenuItemProps) {
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
