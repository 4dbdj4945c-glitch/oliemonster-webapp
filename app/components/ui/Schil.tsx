'use client';

/*
  De schil van de portal voor beheerder en gebruiker (zie STIJL.md, "Schil").

  Desktop (vanaf 900px): vaste navy zijbalk links met Vandaag en de secties
  Werk, Klanten, Rapportage en Beheer uit het moduleregister (lib/modules.ts),
  onderaan het gebruikersmenu. Help en paginaknoppen staan rechtsboven de inhoud.

  Telefoon en tablet: navy kopbalk met logo, modulenaam, paginaknoppen, Help en
  de avatar (gebruikersmenu). Onderaan een vaste balk met Vandaag, Werk, Klanten
  en Meer, binnen de veilige zone. Werk, Klanten en Meer openen een paneel met de
  modules van die sectie; Meer bevat Rapportage, Beheer, Help en Uitloggen.

  De kijker (rol alleen lezen) krijgt deze schil niet: die houdt de oude balk
  (AppShell, KlassiekeBalk).
*/

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ROLE_LABELS } from '@/lib/roles';
import { actiefNavItem, actieveTab, navigatieVoor, tabVanSectie, type NavItem, type NavTab } from '@/lib/modules';
import Icon from './Icon';
import type { IconNaam } from './icons/namen';
import { MenuItem, ToolbarMenu, initiaal } from './Menu';
import type { AppShellProps, ShellUser } from './AppShell';
import AgendaVenster from '../AgendaVenster';

const TAB_INFO: Record<Exclude<NavTab, 'vandaag'>, { naam: string; icoon: IconNaam }> = {
  Werk: { naam: 'Werk', icoon: 'calendar' },
  Klanten: { naam: 'Klanten', icoon: 'company' },
  meer: { naam: 'Meer', icoon: 'menu' },
};

export default function Schil({
  title,
  user,
  onPrint,
  onHelp,
  rightActions,
  children,
  wide = false,
  veld = false,
}: AppShellProps & { user: ShellUser }) {
  const router = useRouter();
  const pad = usePathname();
  const navigatie = navigatieVoor(user.role);
  const actief = actiefNavItem(pad);
  const tab = actieveTab(pad);
  const isAdmin = user.role === 'admin';
  // Het open paneel hoort bij de pagina waarop het openging: ga je naar een
  // andere pagina, dan is het vanzelf dicht.
  const [paneelOp, setPaneelOp] = useState<{ tab: Exclude<NavTab, 'vandaag'>; pad: string } | null>(null);
  const paneel = paneelOp && paneelOp.pad === pad ? paneelOp.tab : null;
  const setPaneel = (t: Exclude<NavTab, 'vandaag'> | null) => setPaneelOp(t ? { tab: t, pad } : null);
  const [agendaOpen, setAgendaOpen] = useState(false);

  // Dicht bij Escape.
  useEffect(() => {
    if (!paneel) return;
    const toets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPaneelOp(null);
    };
    document.addEventListener('keydown', toets);
    return () => document.removeEventListener('keydown', toets);
  }, [paneel]);

  const uitloggen = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
    }
  };
  const afdrukken = () => (onPrint ? onPrint() : window.print());

  const tabs = (['Werk', 'Klanten', 'meer'] as const).filter(
    (t) => t === 'meer' || navigatie.some((s) => s.sectie === t)
  );
  const sectiesVanTab = (t: Exclude<NavTab, 'vandaag'>) => navigatie.filter((s) => tabVanSectie(s.sectie) === t);

  const gebruikerKop = (
    <div className="toolbar-menu-kop">
      <strong>{user.username}</strong>
      <span>{ROLE_LABELS[user.role] ?? user.role}</span>
    </div>
  );

  return (
    <div className={`schil${veld ? ' schil-veld' : ''}`}>
      <a href="#inhoud" className="schil-overslaan">Naar de inhoud</a>

      {/* ---------- Zijbalk (desktop) ---------- */}
      <nav className="zijbalk" aria-label="Hoofdmenu">
        <Link href="/dashboard" className="zijbalk-merk" aria-label="Vandaag, It's Done Services portaal">
          <img src="/header_logo.png" alt="It's Done Services" />
          <span>Portaal</span>
        </Link>
        <div className="zijbalk-lijst">
          <NavLink item={{ sleutel: 'vandaag', naam: 'Vandaag', icoon: 'home', href: '/dashboard' }} actief={actief === 'vandaag'} />
          {navigatie.map((s) => (
            <div key={s.sectie} className="zijbalk-groep">
              <p className="zijbalk-groep-kop">{s.sectie}</p>
              {s.items.map((item) => (
                <NavLink key={item.sleutel} item={item} actief={actief === item.sleutel} />
              ))}
            </div>
          ))}
        </div>
        <div className="zijbalk-voet">
          <ToolbarMenu
            label={`Gebruikersmenu van ${user.username}`}
            buttonClass="zijbalk-gebruiker"
            panelClass="toolbar-menu-paneel zijbalk-menu-paneel"
            button={
              <>
                <span className="toolbar-avatar" aria-hidden="true">{initiaal(user.username)}</span>
                <span className="zijbalk-gebruiker-tekst">
                  <strong>{user.username}</strong>
                  <small>{ROLE_LABELS[user.role] ?? user.role}</small>
                </span>
                <Icon name="chevron-down" size={16} />
              </>
            }
          >
            {gebruikerKop}
            <span className="toolbar-menu-scheiding" />
            <MenuItem icon={<Icon name="agenda-feed" />} onClick={() => setAgendaOpen(true)}>Agenda-abonnement</MenuItem>
            {isAdmin && <MenuItem icon={<Icon name="printer" />} onClick={afdrukken}>Afdrukken</MenuItem>}
            <MenuItem icon={<Icon name="logout" />} danger onClick={uitloggen}>Uitloggen</MenuItem>
          </ToolbarMenu>
        </div>
      </nav>

      {/* ---------- Kopbalk (telefoon en tablet) ---------- */}
      <header className="schil-kop">
        <Link href="/dashboard" className="schil-kop-merk" aria-label="Vandaag">
          <img src="/header_logo.png" alt="It's Done Services" />
        </Link>
        {title && <span className="schil-kop-titel">{title}</span>}
        <div className="schil-kop-rechts">
          {rightActions}
          {onHelp && (
            <button type="button" className="nav-btn nav-btn-icoon" onClick={onHelp} aria-label="Help" title="Help">
              <Icon name="help" size={20} />
            </button>
          )}
          <ToolbarMenu
            label={`Gebruikersmenu van ${user.username}`}
            buttonClass="schil-kop-avatar"
            button={<span className="toolbar-avatar" aria-hidden="true">{initiaal(user.username)}</span>}
          >
            {gebruikerKop}
            <span className="toolbar-menu-scheiding" />
            <MenuItem icon={<Icon name="agenda-feed" />} onClick={() => setAgendaOpen(true)}>Agenda-abonnement</MenuItem>
            <MenuItem icon={<Icon name="logout" />} danger onClick={uitloggen}>Uitloggen</MenuItem>
          </ToolbarMenu>
        </div>
      </header>

      {/* ---------- Inhoud ---------- */}
      <main id="inhoud" className="schil-hoofd" tabIndex={-1}>
        {(rightActions || onHelp) && (
          <div className="schil-acties">
            {rightActions}
            {onHelp && (
              <button type="button" className="nav-btn" onClick={onHelp}>
                <Icon name="help" size={16} />
                Help
              </button>
            )}
          </div>
        )}
        <div className={wide ? 'app-content-wide' : 'app-content'}>{children}</div>
      </main>

      {/* ---------- Onderbalk (telefoon en tablet) ---------- */}
      <nav className="onderbalk" aria-label="Hoofdmenu">
        <Link href="/dashboard" className={`onderbalk-tab${tab === 'vandaag' ? ' on' : ''}`} aria-current={tab === 'vandaag' ? 'page' : undefined}>
          <Icon name="home" size={24} />
          <span>Vandaag</span>
        </Link>
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            className={`onderbalk-tab${tab === t ? ' on' : ''}${paneel === t ? ' open' : ''}`}
            aria-expanded={paneel === t}
            aria-haspopup="dialog"
            onClick={() => setPaneel(paneel === t ? null : t)}
          >
            <Icon name={TAB_INFO[t].icoon} size={24} />
            <span>{TAB_INFO[t].naam}</span>
          </button>
        ))}
      </nav>

      {paneel && (
        <div className="onderbalk-achter" onClick={() => setPaneel(null)}>
          <div
            className="onderbalk-paneel"
            role="dialog"
            aria-modal="true"
            aria-label={TAB_INFO[paneel].naam}
            onClick={(e) => e.stopPropagation()}
          >
            {paneel === 'meer' && (
              <div className="onderbalk-paneel-gebruiker">
                <span className="toolbar-avatar" aria-hidden="true">{initiaal(user.username)}</span>
                <div>
                  <strong>{user.username}</strong>
                  <span>{ROLE_LABELS[user.role] ?? user.role}</span>
                </div>
              </div>
            )}
            {sectiesVanTab(paneel).map((s) => (
              <div key={s.sectie} className="onderbalk-paneel-groep">
                <p className="onderbalk-paneel-kop">{s.sectie}</p>
                {s.items.map((item) => (
                  <NavLink key={item.sleutel} item={item} actief={actief === item.sleutel} variant="paneel" />
                ))}
              </div>
            ))}
            {paneel === 'meer' && (
              <div className="onderbalk-paneel-groep">
                {onHelp && (
                  <button type="button" className="paneel-item" onClick={() => { setPaneel(null); onHelp(); }}>
                    <Icon name="help" />
                    Help bij deze pagina
                  </button>
                )}
                <button type="button" className="paneel-item" onClick={() => { setPaneel(null); setAgendaOpen(true); }}>
                  <Icon name="agenda-feed" />
                  Agenda-abonnement
                </button>
                {isAdmin && (
                  <button type="button" className="paneel-item" onClick={() => { setPaneel(null); afdrukken(); }}>
                    <Icon name="printer" />
                    Afdrukken
                  </button>
                )}
                <button type="button" className="paneel-item paneel-item-danger" onClick={uitloggen}>
                  <Icon name="logout" />
                  Uitloggen
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {agendaOpen && <AgendaVenster open onClose={() => setAgendaOpen(false)} />}
    </div>
  );
}

function NavLink({ item, actief, variant = 'zijbalk' }: { item: NavItem; actief: boolean; variant?: 'zijbalk' | 'paneel' }) {
  const klasse = `${variant === 'zijbalk' ? 'zijbalk-item' : 'paneel-item'}${actief ? ' on' : ''}`;
  const inhoud = (
    <>
      <Icon name={item.icoon} size={20} />
      <span>{item.naam}</span>
      {item.extern && <Icon name="external-link" size={16} className="nav-extern" />}
    </>
  );
  if (item.extern) {
    return (
      <a href={item.href} target="_blank" rel="noopener" className={klasse} title={`${item.naam} opent in een nieuw tabblad`}>
        {inhoud}
      </a>
    );
  }
  return (
    <Link href={item.href} className={klasse} aria-current={actief ? 'page' : undefined}>
      {inhoud}
    </Link>
  );
}
