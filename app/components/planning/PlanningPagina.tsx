'use client';

// De planning als eigen pagina in de navigatie (Werk, Planning). Kiest het
// analysejaar en toont daaronder PlanningPaneel, dezelfde als de tab op de
// oliemonsterpagina.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGebruiker } from '@/app/components/GebruikerProvider';
import PlanningPaneel from '@/app/components/PlanningPaneel';
import { AppShell } from '@/app/components/ui';

export default function PlanningPagina({ jaar }: { jaar: number }) {
  const user = useGebruiker();
  const router = useRouter();
  const [jaren, setJaren] = useState<number[]>([jaar]);

  useEffect(() => {
    let actueel = true;
    fetch('/api/samples/jaren')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { jaren: { jaar: number }[] } | null) => {
        if (!actueel || !data) return;
        const nu = new Date().getFullYear();
        const set = new Set([...data.jaren.map((j) => j.jaar), nu, nu + 1, jaar]);
        setJaren([...set].sort((a, b) => b - a));
      })
      .catch(() => {});
    return () => {
      actueel = false;
    };
  }, [jaar]);

  return (
    <AppShell title="Planning" wide user={user}>
      <div className="paginakop">
        <div>
          <h1 className="page-title">Planning {jaar}</h1>
          <p className="page-subtitle">Welke objecten je op welke dag bezoekt, met de route en de geschatte tijd.</p>
        </div>
        <div className="paginakop-knoppen">
          <label className="label" htmlFor="planning-jaar">Jaar</label>
          <select
            id="planning-jaar"
            className="select"
            value={String(jaar)}
            onChange={(e) => router.push(`/dashboard/planning?jaar=${e.target.value}`)}
          >
            {jaren.map((j) => (
              <option key={j} value={String(j)}>{j}</option>
            ))}
          </select>
        </div>
      </div>
      <PlanningPaneel analysisYear={jaar} isAdmin={user.role === 'admin'} />
    </AppShell>
  );
}
