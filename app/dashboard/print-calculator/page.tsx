'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, NavButton, Icons } from '@/app/components/ui';

interface User {
  userId: number;
  username: string;
  role: string;
  isLoggedIn: boolean;
}

// Alle invoerwaarden als string opgeslagen, zodat tussentijds typen (leeg veld,
// decimalen) soepel werkt. Bij het rekenen parsen we naar getallen.
const DEFAULTS: Record<string, string> = {
  uurtarief: '65',
  materiaalPerStuk: '0.126',
  inktPrijsPerMl: '0.40',
  inktMlPerStuk: '0.10',
  batchGrootte: '10',
  printtijdPlaat: '20',
  handsOnTijd: '4',
  printerPrijs: '2499',
  printerLevensduurUren: '2500',
  reinigingsInktPerUur: '1',
  winstopslag: '60',
};

const STORAGE_KEY = 'print-calculator-v1';

export default function PrintCalculatorPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [v, setV] = useState<Record<string, string>>(DEFAULTS);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  // Opgeslagen waarden terughalen, zodat aanpassingen blijven staan.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setV({ ...DEFAULTS, ...JSON.parse(saved) });
    } catch {
      /* genegeerd */
    }
  }, []);

  // Aanpassingen automatisch bewaren.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    } catch {
      /* genegeerd */
    }
  }, [v]);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (!data.isLoggedIn) { router.push('/login'); return; }
      if (data.requiresPasswordChange) { router.push('/set-password'); return; }
      setUser(data);
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const set = (key: string, value: string) => setV(prev => ({ ...prev, [key]: value }));
  const num = (key: string) => {
    const n = parseFloat((v[key] ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  // ---- Rekenwerk (methode B: hands-on tijd + machinekost) ----
  const batch = Math.max(1, num('batchGrootte'));

  // Machinekost per print-uur = afschrijving + reinigingsinkt
  const afschrijvingPerUur = num('printerLevensduurUren') > 0
    ? num('printerPrijs') / num('printerLevensduurUren')
    : 0;
  const reinigingPerUur = num('reinigingsInktPerUur') * num('inktPrijsPerMl');
  const machineKostPerUur = afschrijvingPerUur + reinigingPerUur;

  const printtijdUren = num('printtijdPlaat') / 60;

  // Kosten per batch
  const materiaalBatch = batch * num('materiaalPerStuk');
  const inktBatch = batch * num('inktMlPerStuk') * num('inktPrijsPerMl');
  const arbeidBatch = (num('handsOnTijd') / 60) * num('uurtarief');
  const machineBatch = machineKostPerUur * printtijdUren;
  const totaalBatch = materiaalBatch + inktBatch + arbeidBatch + machineBatch;

  // Per stuk
  const materiaalStuk = materiaalBatch / batch;
  const inktStuk = inktBatch / batch;
  const arbeidStuk = arbeidBatch / batch;
  const machineStuk = machineBatch / batch;
  const kostprijsStuk = totaalBatch / batch;

  // Verkoop
  const opslag = num('winstopslag') / 100;
  const verkoopStuk = kostprijsStuk * (1 + opslag);
  const winstStuk = verkoopStuk - kostprijsStuk;
  const brutomarge = verkoopStuk > 0 ? (winstStuk / verkoopStuk) * 100 : 0;

  const eur = (n: number) => n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
  const eur3 = (n: number) => '€ ' + n.toFixed(3).replace('.', ',');

  const resetDefaults = () => setV(DEFAULTS);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#64748B', fontSize: '15px' }}>Laden...</p>
      </div>
    );
  }

  const field = (label: string, key: string, unit: string, step = 'any', help?: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="field-input-wrap">
        <input
          className="glass-input"
          type="number"
          inputMode="decimal"
          step={step}
          min="0"
          value={v[key]}
          onChange={(e) => set(key, e.target.value)}
        />
        <span className="field-unit">{unit}</span>
      </div>
      {help && <span className="field-help">{help}</span>}
    </label>
  );

  return (
    <AppShell
      title="Printkosten calculator"
      rightActions={
        <>
          <NavButton icon={Icons.Back} onClick={() => router.push('/dashboard')}>Dashboard</NavButton>
          <NavButton icon={Icons.Logout} danger onClick={handleLogout}>Uitloggen</NavButton>
        </>
      }
    >
      <style jsx>{`
        .layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          align-items: start;
        }
        @media (min-width: 900px) {
          .layout { grid-template-columns: 1.3fr 1fr; }
          .results { position: sticky; top: 90px; }
        }
        .group { margin-bottom: 18px; }
        .group-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--accent);
          margin: 0 0 14px 0;
        }
        .fields {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 14px 16px;
        }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
        .field-input-wrap { position: relative; display: flex; align-items: center; }
        .field-input-wrap :global(input) { padding-right: 52px; }
        .field-unit {
          position: absolute;
          right: 12px;
          font-size: 12px;
          color: var(--text-tertiary);
          pointer-events: none;
        }
        .field-help { font-size: 11px; color: var(--text-tertiary); line-height: 1.4; }

        .hero { text-align: center; padding: 4px 0 18px; }
        .hero-label {
          font-size: 12px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 6px;
        }
        .hero-value { font-size: 42px; font-weight: 800; color: var(--text-primary); line-height: 1; letter-spacing: -1px; }
        .hero-sub { font-size: 13px; color: var(--text-tertiary); margin-top: 8px; }

        .sale-row {
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
          margin: 4px 0 18px;
        }
        .sale-box {
          background: var(--accent-soft);
          border-radius: var(--radius-lg);
          padding: 14px; text-align: center;
        }
        .sale-box.profit { background: var(--success-soft); }
        .sale-box-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); margin-bottom: 5px; }
        .sale-box-value { font-size: 22px; font-weight: 700; color: var(--accent); }
        .sale-box.profit .sale-box-value { color: var(--success); }

        .breakdown { width: 100%; border-collapse: collapse; font-size: 13px; }
        .breakdown th {
          text-align: right; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;
          color: var(--text-tertiary); font-weight: 600; padding: 0 0 8px; border-bottom: 1px solid var(--border);
        }
        .breakdown th:first-child { text-align: left; }
        .breakdown td { padding: 9px 0; text-align: right; color: var(--text-primary); border-bottom: 1px solid var(--border-subtle); }
        .breakdown td:first-child { text-align: left; color: var(--text-secondary); }
        .breakdown tr.total td { font-weight: 700; border-top: 2px solid var(--border); border-bottom: none; padding-top: 11px; }
        .breakdown-title { font-size: 13px; font-weight: 700; color: var(--text-primary); margin: 22px 0 10px; }

        .meta-note { font-size: 12px; color: var(--text-tertiary); margin-top: 16px; line-height: 1.5; }
        .actions { display: flex; justify-content: flex-end; margin-top: 8px; }
      `}</style>

      <h1 className="page-title">Printkosten calculator</h1>
      <p className="page-subtitle">
        Reken de kostprijs per bedrukt item uit (methode B: jouw hands-on tijd + machinekost).
        Pas de getallen aan naar jouw situatie &mdash; ze worden automatisch bewaard.
      </p>

      <div className="layout">
        {/* ---- Invoer ---- */}
        <div className="glass-card-padded">
          <div className="group">
            <p className="group-title">Materiaal &amp; inkt</p>
            <div className="fields">
              {field('Materiaal per stuk', 'materiaalPerStuk', '€', 'any', 'Bv. bierviltje: €12,60 / 100 = €0,126')}
              {field('Inktprijs', 'inktPrijsPerMl', '€/ml', 'any', '100 ml flesje ≈ €40 → €0,40/ml')}
              {field('Inkt per stuk', 'inktMlPerStuk', 'ml', 'any', 'Som van C+M+Y+K+W+G uit de printsoftware')}
            </div>
          </div>

          <div className="group">
            <p className="group-title">Tijd &amp; tarief</p>
            <div className="fields">
              {field('Uurtarief', 'uurtarief', '€/u')}
              {field('Aantal per plaat', 'batchGrootte', 'stuks')}
              {field('Printtijd per plaat', 'printtijdPlaat', 'min', 'any', 'Printer draait zelf — telt als machinetijd')}
              {field('Hands-on tijd per plaat', 'handsOnTijd', 'min', 'any', 'Plaat in-/uitleggen, job starten')}
            </div>
          </div>

          <div className="group">
            <p className="group-title">Machine</p>
            <div className="fields">
              {field('Aanschafprijs printer', 'printerPrijs', '€')}
              {field('Levensduur', 'printerLevensduurUren', 'print-uren', 'any', 'Over hoeveel draaiuren je de printer afschrijft')}
              {field('Reinigingsinkt', 'reinigingsInktPerUur', 'ml/u', 'any', 'Inkt die self-cleaning per print-uur verbruikt')}
            </div>
          </div>

          <div className="group" style={{ marginBottom: 0 }}>
            <p className="group-title">Verkoop</p>
            <div className="fields">
              {field('Winstopslag op kostprijs', 'winstopslag', '%')}
            </div>
          </div>

          <div className="actions">
            <button className="btn btn-secondary btn-sm" onClick={resetDefaults}>Terug naar standaardwaarden</button>
          </div>
        </div>

        {/* ---- Resultaat ---- */}
        <div className="results">
          <div className="glass-card-padded">
            <div className="hero">
              <div className="hero-label">Kostprijs per stuk</div>
              <div className="hero-value">{eur(kostprijsStuk)}</div>
              <div className="hero-sub">bij {batch} stuks per plaat &middot; {eur(totaalBatch)} per plaat</div>
            </div>

            <div className="sale-row">
              <div className="sale-box">
                <div className="sale-box-label">Adviesverkoop</div>
                <div className="sale-box-value">{eur(verkoopStuk)}</div>
              </div>
              <div className="sale-box profit">
                <div className="sale-box-label">Winst / stuk</div>
                <div className="sale-box-value">{eur(winstStuk)}</div>
              </div>
            </div>

            <table className="breakdown">
              <thead>
                <tr>
                  <th>Post</th>
                  <th>Per stuk</th>
                  <th>Per plaat</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Materiaal</td>
                  <td>{eur3(materiaalStuk)}</td>
                  <td>{eur(materiaalBatch)}</td>
                </tr>
                <tr>
                  <td>Inkt</td>
                  <td>{eur3(inktStuk)}</td>
                  <td>{eur(inktBatch)}</td>
                </tr>
                <tr>
                  <td>Arbeid (hands-on)</td>
                  <td>{eur3(arbeidStuk)}</td>
                  <td>{eur(arbeidBatch)}</td>
                </tr>
                <tr>
                  <td>Machinekost</td>
                  <td>{eur3(machineStuk)}</td>
                  <td>{eur(machineBatch)}</td>
                </tr>
                <tr className="total">
                  <td>Kostprijs</td>
                  <td>{eur(kostprijsStuk)}</td>
                  <td>{eur(totaalBatch)}</td>
                </tr>
              </tbody>
            </table>

            <p className="breakdown-title">Verkoop</p>
            <table className="breakdown">
              <tbody>
                <tr>
                  <td>Adviesverkoopprijs</td>
                  <td colSpan={2}>{eur(verkoopStuk)}</td>
                </tr>
                <tr>
                  <td>Winst per stuk</td>
                  <td colSpan={2}>{eur(winstStuk)}</td>
                </tr>
                <tr>
                  <td>Brutomarge</td>
                  <td colSpan={2}>{brutomarge.toFixed(0)}%</td>
                </tr>
              </tbody>
            </table>

            <p className="meta-note">
              Machinekost = {eur(machineKostPerUur)}/print-uur (afschrijving {eur(afschrijvingPerUur)} + reiniging {eur(reinigingPerUur)}).
              De hands-on tijd is jouw eigen werk; de printtijd loopt de printer zelf en telt alleen als machinekost.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
