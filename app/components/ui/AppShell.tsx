'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ROLE_LABELS, isAlleenLezen } from '@/lib/roles';
import { modulesVoor } from '@/lib/modules';
import Icon from './Icon';
import { MenuItem, ToolbarMenu, initiaal } from './Menu';
import Schil from './Schil';
import type { IconNaam } from './icons/namen';

/** Het Beheer-menu: de modules uit sectie Beheer van het register, met Kolommen aanpassen vlak voor Instellingen. */
function beheerItems(role: string): { naam: string; icoon: IconNaam; route: string }[] {
  const items: { naam: string; icoon: IconNaam; route: string }[] = [];
  for (const m of modulesVoor(role, 'Beheer')) {
    if (m.sleutel === 'instellingen') {
      items.push({ naam: 'Kolommen aanpassen', icoon: 'columns', route: `${m.route}?tab=columns` });
    }
    items.push({ naam: m.naam, icoon: m.icoon, route: m.route });
  }
  return items;
}

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
  /** Alleen bij de rol alleen lezen: het analysejaar dat deze gebruiker mag zien. */
  viewYear?: number | null;
}

export interface AppShellProps {
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
  /**
   * Veldscherm (dagscherm): op de telefoon geen onderbalk en geen kopbalk,
   * want de pagina heeft een eigen kop en een vaste actiebalk onderaan.
   */
  veld?: boolean;
}

export default function AppShell(props: AppShellProps) {
  const { user: userProp } = props;
  const [fetchedUser, setFetchedUser] = useState<ShellUser | null>(null);
  const user = userProp === undefined ? fetchedUser : userProp;

  useEffect(() => {
    if (userProp !== undefined) return;
    let actief = true;
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) => { if (actief && d?.isLoggedIn) setFetchedUser({ username: d.username, role: d.role, viewYear: d.viewYear ?? null }); })
      .catch(() => {});
    return () => { actief = false; };
  }, [userProp]);

  // Een kijker (rol alleen lezen) houdt de oude balk bovenaan, precies zoals hij
  // hem kende: zijn eigen klantportaal komt later. Zolang de gebruiker nog niet
  // bekend is, ook de oude balk: die toont dan niets wat niet mag.
  if (!user || isAlleenLezen(user.role)) return <KlassiekeBalk {...props} user={user} />;
  return <Schil {...props} user={user} />;
}

/*
  De oude balk, alleen nog voor de rol alleen lezen. Niet aanpassen zonder de
  kijker-screenshots te vergelijken (zie README, Screenshots).
*/
function KlassiekeBalk({
  title,
  user,
  onPrint,
  onHelp,
  leftExtra,
  rightActions,
  children,
  wide = false,
}: AppShellProps & { user: ShellUser | null }) {
  const router = useRouter();
  const pathname = usePathname();

  const isAdmin = user?.role === 'admin';
  const opDashboard = pathname === '/dashboard';
  // Een kijker met een vast kijkjaar ziet maar één pagina; die heeft niets aan
  // navigatie. Mag hij alle jaren zien, dan heeft hij het dashboard wel nodig:
  // daar staan de jaren waar hij uit kan kiezen.
  const kijkerMetEenJaar =
    isAlleenLezen(user?.role) && user?.viewYear !== null && user?.viewYear !== undefined;
  const toonNavigatie = !opDashboard && !kijkerMetEenJaar;

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
                <Icon name="home" size={16} />
                <span className="lang">Terug naar dashboard</span>
                <span className="kort">Dashboard</span>
              </button>
            )}

            {isAdmin && (
              <ToolbarMenu
                label="Beheer"
                buttonClass="nav-btn"
                button={<><Icon name="admin" size={16} />Beheer<Icon name="chevron-down" size={16} /></>}
              >
                {beheerItems(user?.role ?? '').map((b) => (
                  <MenuItem key={b.route} icon={<Icon name={b.icoon} />} onClick={() => router.push(b.route)}>{b.naam}</MenuItem>
                ))}
                <span className="toolbar-menu-scheiding" />
                <MenuItem icon={<Icon name="printer" />} onClick={afdrukken}>Afdrukken</MenuItem>
              </ToolbarMenu>
            )}

            {onHelp && (
              <button type="button" className="nav-btn nav-btn-icoon" onClick={onHelp} aria-label="Help" title="Help">
                <Icon name="help" size={16} />
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
                <MenuItem icon={<Icon name="logout" />} danger onClick={handleLogout}>Uitloggen</MenuItem>
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
              button={<Icon name="menu" size={24} />}
              buttonOpen={<Icon name="close" size={24} />}
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
                <MenuItem icon={<Icon name="home" />} onClick={() => router.push('/dashboard')}>Terug naar dashboard</MenuItem>
              )}
              {onHelp && <MenuItem icon={<Icon name="help" />} onClick={onHelp}>Help</MenuItem>}
              {isAdmin && (
                <>
                  <span className="toolbar-menu-label">Beheer</span>
                  {beheerItems(user?.role ?? '').map((b) => (
                    <MenuItem key={b.route} icon={<Icon name={b.icoon} />} onClick={() => router.push(b.route)}>{b.naam}</MenuItem>
                  ))}
                  <MenuItem icon={<Icon name="printer" />} onClick={afdrukken}>Afdrukken</MenuItem>
                </>
              )}
              {user && (
                <>
                  <span className="toolbar-menu-scheiding" />
                  <MenuItem icon={<Icon name="logout" />} danger onClick={handleLogout}>Uitloggen</MenuItem>
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

