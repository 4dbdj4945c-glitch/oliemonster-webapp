'use client';

// Eén terugkerende taak als regel: soort, titel, plek, interval, de volgende
// datum met termijn en status. Voor het contractenoverzicht, de contractpagina
// en het klantdossier; knoppen (Uitgevoerd, Bewerken) geeft de pagina mee.

import Link from 'next/link';
import { Icon } from '@/app/components/ui';
import { TAAK_STATUS_BADGE, TAAK_STATUS_LABEL, dagKort, intervalTekst, taakSoortInfo, termijnTekst, vandaagNl } from '@/lib/contracten';
import type { Taak } from './types';

export default function TaakRegel({ taak, knoppen, kinderen }: { taak: Taak; knoppen?: React.ReactNode; kinderen?: React.ReactNode }) {
  const vandaag = vandaagNl();
  return (
    <li className="rij contract-taak">
      <span className="icoonvak" aria-hidden="true"><Icon name={taakSoortInfo(taak.soort).icoon} /></span>
      <span className="rij-tekst">
        <strong>{taak.titel}</strong>
        <span>
          {[taak.object.name, taak.installatie?.naam].filter(Boolean).join(', ')}. {taak.soortLabel}, {intervalTekst(taak.intervalMaanden)}.
        </span>
        {taak.laatstUitgevoerdOp && <span>Laatst uitgevoerd {dagKort(taak.laatstUitgevoerdOp)}</span>}
        {kinderen}
      </span>
      <span className="contract-taak-status">
        <span className="datum">
          {taak.gepland ? (
            <Link href={`/dashboard/planning/dag/${taak.gepland.planId}`}>Gepland {dagKort(taak.gepland.dag)}</Link>
          ) : (
            dagKort(taak.volgendeOp)
          )}
        </span>
        <span className={taak.status === 'verlopen' ? 'tekst-te-laat' : undefined}>
          {taak.gepland ? `verwacht ${dagKort(taak.volgendeOp)}` : termijnTekst(taak.volgendeOp, vandaag)}
        </span>
        <span className={`badge ${TAAK_STATUS_BADGE[taak.status]}`}>{TAAK_STATUS_LABEL[taak.status]}</span>
      </span>
      {knoppen && <span className="rij-knoppen">{knoppen}</span>}
    </li>
  );
}
