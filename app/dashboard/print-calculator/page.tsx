'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/app/components/ui';

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
      if (data.role === 'viewer_oil2025') { router.replace('/dashboard/oliemonsters'); return; }
      setUser(data);
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
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
      <div className="laadscherm">Laden...</div>
    );
  }

  // mode: 'numeric' voor velden met alleen gehele getallen (cijfertoetsenbord zonder komma)
  const field = (label: string, key: string, unit: string, step = 'any', help?: string, mode: 'decimal' | 'numeric' = 'decimal') => (
    <label className="field">
      <span className="label">{label}</span>
      <div className="field-input-wrap">
        <input
          className="input"
          type="number"
          inputMode={mode}
          step={step}
          min="0"
          value={v[key]}
          onChange={(e) => set(key, e.target.value)}
        />
        <span className="field-unit">{unit}</span>
      </div>
      {help && <span className="hint">{help}</span>}
    </label>
  );

  return (
    <AppShell
      title="Printkosten calculator"
      user={user}
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
          .results { position: sticky; top: 80px; }
        }
        .group { margin-bottom: 20px; }
        .fields {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 14px 16px;
        }
        .field { display: flex; flex-direction: column; gap: 5px; }
        .field :global(.label), .field :global(.hint) { margin: 0; }
        :global(.field-input-wrap) { position: relative; display: flex; align-items: center; }
        :global(.field-input-wrap input) { padding-right: 52px; }
        :global(.field-unit) {
          position: absolute;
          right: 11px;
          font-size: 12px;
          color: var(--grijs-400);
          pointer-events: none;
        }
        .actions { display: flex; justify-content: flex-end; margin-top: 8px; }

        .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
        .stat-hoofd { margin-bottom: 12px; }
        .stat-sub { font-size: 12px; color: var(--grijs-500); margin-top: 6px; }

        .breakdown { width: 100%; border-collapse: collapse; font-size: 13px; }
        .breakdown th {
          text-align: right; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
          color: var(--grijs-500); font-weight: 700; padding: 0 0 8px; border-bottom: 1px solid var(--grijs-200);
        }
        .breakdown th:first-child { text-align: left; }
        .breakdown td { padding: 9px 0; text-align: right; color: var(--navy); border-bottom: 1px solid var(--grijs-200); }
        .breakdown td:first-child { text-align: left; color: var(--grijs-500); }
        .breakdown tr.total td { font-weight: 700; border-top: 2px solid var(--grijs-200); border-bottom: none; padding-top: 11px; }

        /* Telefoon: velden onder elkaar, resultaattegels in 2 kolommen, resetknop volle breedte */
        @media (max-width: 640px) {
          .layout { gap: 16px; }
          .fields { grid-template-columns: 1fr; gap: 12px; }
          .actions { margin-top: 14px; }
          .actions :global(.btn) { width: 100%; min-height: 44px; font-size: 14px; }
          .stats { gap: 10px; }
          .tabel-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
      `}</style>

      <h1 className="page-title">Printkosten calculator</h1>
      <p className="page-subtitle">
        Reken de kostprijs per bedrukt item uit (methode B: jouw hands-on tijd + machinekost).
        Pas de getallen aan naar jouw situatie, ze worden automatisch bewaard.
      </p>

      <div className="layout">
        {/* ---- Invoer ---- */}
        <div className="card card-padded">
          <div className="group">
            <p className="section-label">Materiaal &amp; inkt</p>
            <div className="fields">
              {field('Materiaal per stuk', 'materiaalPerStuk', '€', 'any', 'Bv. bierviltje: €12,60 / 100 = €0,126')}
              {field('Inktprijs', 'inktPrijsPerMl', '€/ml', 'any', '100 ml flesje ≈ €40 → €0,40/ml')}
              {field('Inkt per stuk', 'inktMlPerStuk', 'ml', 'any', 'Som van C+M+Y+K+W+G uit de printsoftware')}
            </div>
          </div>

          <div className="group">
            <p className="section-label">Tijd &amp; tarief</p>
            <div className="fields">
              {field('Uurtarief', 'uurtarief', '€/u')}
              {field('Aantal per plaat', 'batchGrootte', 'stuks', 'any', undefined, 'numeric')}
              {field('Printtijd per plaat', 'printtijdPlaat', 'min', 'any', 'Printer draait zelf, telt als machinetijd')}
              {field('Hands-on tijd per plaat', 'handsOnTijd', 'min', 'any', 'Plaat in-/uitleggen, job starten')}
            </div>
          </div>

          <div className="group">
            <p className="section-label">Machine</p>
            <div className="fields">
              {field('Aanschafprijs printer', 'printerPrijs', '€')}
              {field('Levensduur', 'printerLevensduurUren', 'print-uren', 'any', 'Over hoeveel draaiuren je de printer afschrijft', 'numeric')}
              {field('Reinigingsinkt', 'reinigingsInktPerUur', 'ml/u', 'any', 'Inkt die self-cleaning per print-uur verbruikt')}
            </div>
          </div>

          <div className="group" style={{ marginBottom: 0 }}>
            <p className="section-label">Verkoop</p>
            <div className="fields">
              {field('Winstopslag op kostprijs', 'winstopslag', '%')}
            </div>
          </div>

          <div className="actions">
            <button className="btn btn-sm" onClick={resetDefaults}>Terug naar standaardwaarden</button>
          </div>
        </div>

        {/* ---- Resultaat ---- */}
        <div className="results">
          <div className="stat-card stat-hoofd">
            <div className="stat-value" style={{ color: 'var(--oranje)', fontSize: '36px' }}>{eur(kostprijsStuk)}</div>
            <div className="stat-label">Kostprijs per stuk</div>
            <div className="stat-sub">bij {batch} stuks per plaat &middot; {eur(totaalBatch)} per plaat</div>
          </div>

          <div className="stats">
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--oranje)' }}>{eur(verkoopStuk)}</div>
              <div className="stat-label">Adviesverkoop</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--groen-tekst)' }}>{eur(winstStuk)}</div>
              <div className="stat-label">Winst per stuk</div>
            </div>
          </div>

          <div className="card card-padded">
            <p className="section-label">Opbouw kostprijs</p>
            <div className="tabel-scroll">
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
            </div>

            <p className="section-label" style={{ margin: '22px 0 10px' }}>Verkoop</p>
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

            <p className="hint" style={{ marginTop: '16px' }}>
              Machinekost = {eur(machineKostPerUur)}/print-uur (afschrijving {eur(afschrijvingPerUur)} + reiniging {eur(reinigingPerUur)}).
              De hands-on tijd is jouw eigen werk; de printtijd loopt de printer zelf en telt alleen als machinekost.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
