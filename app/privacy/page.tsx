// De privacyverklaring, openbaar (zonder inloggen), met een link onderaan het
// klantportaal. De tekst staat in ./tekst.ts; zolang CONCEPT true is staat er
// bovenaan duidelijk dat het een concept is. Opmaak: .privacy-* in globals.css.

import type { Metadata } from 'next';
import { Fragment, type ReactNode } from 'react';
import { CONCEPT, PRIVACY_TEKST, VERSIE } from './tekst';

export const metadata: Metadata = {
  title: "Privacyverklaring | It's Done Services",
};

/** **vet** en [nog in te vullen] binnen een regel. */
function inline(tekst: string): ReactNode[] {
  const delen = tekst.split(/(\*\*[^*]+\*\*|\[[^\]]+\])/g).filter(Boolean);
  return delen.map((d, i) => {
    if (d.startsWith('**')) return <strong key={i}>{d.slice(2, -2)}</strong>;
    if (d.startsWith('[')) {
      return (
        <mark key={i} className="privacy-open" title="Nog in te vullen of na te kijken">
          {d.slice(1, -1)}
        </mark>
      );
    }
    return <Fragment key={i}>{d}</Fragment>;
  });
}

function cellen(regel: string): string[] {
  return regel.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

function blok(tekst: string, i: number): ReactNode {
  const regels = tekst.split('\n');
  const eerste = regels[0];
  if (eerste.trim() === '---') return <hr key={i} className="privacy-lijn" />;
  if (eerste.startsWith('### ')) return <h3 key={i}>{inline(eerste.slice(4))}</h3>;
  if (eerste.startsWith('## ')) return <h2 key={i}>{inline(eerste.slice(3))}</h2>;
  if (eerste.startsWith('|')) {
    const rijen = regels.filter((r) => r.startsWith('|') && !/^\|[\s|:]*-[\s|:-]*\|$/.test(r)).map(cellen);
    const [kop, ...rest] = rijen;
    const zonderKop = kop.every((c) => c === '');
    return (
      <div key={i} className="privacy-tabel">
        <table>
          {!zonderKop && (
            <thead>
              <tr>{kop.map((c, k) => <th key={k}>{inline(c)}</th>)}</tr>
            </thead>
          )}
          <tbody>
            {rest.map((r, k) => (
              <tr key={k}>
                {r.map((c, n) => (zonderKop && n === 0 ? <th key={n} scope="row">{inline(c)}</th> : <td key={n}>{inline(c)}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (eerste.startsWith('- ')) {
    const items: { tekst: string; sub: string[] }[] = [];
    for (const r of regels) {
      if (r.startsWith('- ')) items.push({ tekst: r.slice(2), sub: [] });
      else if (/^\s+- /.test(r) && items.length) items[items.length - 1].sub.push(r.trim().slice(2));
    }
    return (
      <ul key={i}>
        {items.map((it, k) => (
          <li key={k}>
            {inline(it.tekst)}
            {it.sub.length > 0 && <ul>{it.sub.map((s, n) => <li key={n}>{inline(s)}</li>)}</ul>}
          </li>
        ))}
      </ul>
    );
  }
  // Een alinea; losse regels (zoals een adres) blijven onder elkaar staan.
  return (
    <p key={i}>
      {regels.map((r, k) => (
        <Fragment key={k}>
          {k > 0 && <br />}
          {inline(r)}
        </Fragment>
      ))}
    </p>
  );
}

export default function PrivacyPagina() {
  const blokken = PRIVACY_TEKST.trim().split(/\n\s*\n/);
  return (
    <div className="privacy">
      <header className="privacy-kop">
        <div className="privacy-kop-in">
          <img src="/logo-navy.png" alt="It's Done Services" />
        </div>
      </header>
      <main className="privacy-inhoud">
        <h1 className="page-title">Privacyverklaring</h1>
        {CONCEPT && (
          <div className="alert alert-warning privacy-concept" role="note">
            <strong>{VERSIE}.</strong> Deze tekst wordt nog nagekeken en kan veranderen. Gemarkeerde
            stukken moeten nog worden ingevuld of nagekeken. Vragen? Mail naar info@itsdoneservices.nl.
          </div>
        )}
        <article className="card privacy-tekst">{blokken.map(blok)}</article>
      </main>
    </div>
  );
}
