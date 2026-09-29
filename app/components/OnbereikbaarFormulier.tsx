'use client';

import FotoKiezer from './FotoKiezer';
import { ONBEREIKBAAR_REDENEN } from '@/lib/unreachableReasons';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';

export interface OnbereikbaarWaarden {
  reden: string;
  toelichting: string;
  omschrijving: string;
  foto: File | null;
}

export function leegOnbereikbaar(): OnbereikbaarWaarden {
  return {
    reden: ONBEREIKBAAR_REDENEN[0].waarde,
    toelichting: '',
    omschrijving: '',
    foto: null,
  };
}

/**
 * Legt vast dat de locatie niet te bereiken was. Geeft de foutmelding terug, of
 * een lege string als het gelukt is.
 */
export async function verstuurOnbereikbaar(
  sampleId: number,
  waarden: OnbereikbaarWaarden
): Promise<string> {
  const form = new FormData();
  form.append('reason', waarden.reden);
  form.append('toelichting', waarden.toelichting);
  form.append('note', waarden.omschrijving);
  if (waarden.foto) form.append('photo', waarden.foto);

  try {
    const res = await fetch(`/api/samples/${sampleId}/unreachable`, {
      method: 'PATCH',
      body: form,
    });
    if (!res.ok) {
      return await foutTekst(res, 'Het vastleggen is niet gelukt.');
    }
    return '';
  } catch {
    return GEEN_VERBINDING;
  }
}

interface Props {
  waarden: OnbereikbaarWaarden;
  onChange: (waarden: OnbereikbaarWaarden) => void;
  uitgeschakeld?: boolean;
}

/*
  De velden van Niet bereikbaar: een reden uit de vaste lijst, een korte
  omschrijving en een eigen foto als bewijs. Zit zowel in het losse venster
  (OnbereikbaarModal) als in het scherm Monster nemen, dus staat apart.
*/
export default function OnbereikbaarFormulier({ waarden, onChange, uitgeschakeld = false }: Props) {
  const gekozen = ONBEREIKBAAR_REDENEN.find((r) => r.waarde === waarden.reden);

  return (
    <div className="veldwerk">
      <div className="veld">
        <label className="label" htmlFor="onbereikbaar-reden">Waarom was de locatie niet te bereiken</label>
        <select
          id="onbereikbaar-reden"
          className="select"
          value={waarden.reden}
          disabled={uitgeschakeld}
          onChange={(e) => onChange({ ...waarden, reden: e.target.value })}
        >
          {ONBEREIKBAAR_REDENEN.map((r) => (
            <option key={r.waarde} value={r.waarde}>{r.label}</option>
          ))}
        </select>
      </div>

      {gekozen?.toelichtingNodig && (
        <div className="veld">
          <label className="label" htmlFor="onbereikbaar-toelichting">Toelichting bij de reden</label>
          <input
            id="onbereikbaar-toelichting"
            type="text"
            className="input"
            value={waarden.toelichting}
            disabled={uitgeschakeld}
            onChange={(e) => onChange({ ...waarden, toelichting: e.target.value })}
          />
        </div>
      )}

      <div className="veld">
        <label className="label" htmlFor="onbereikbaar-omschrijving">Korte omschrijving van wat je aantrof</label>
        <textarea
          id="onbereikbaar-omschrijving"
          className="textarea"
          rows={3}
          placeholder="Bijv. hek dicht en terrein afgezet tot na de brugwerkzaamheden"
          value={waarden.omschrijving}
          disabled={uitgeschakeld}
          onChange={(e) => onChange({ ...waarden, omschrijving: e.target.value })}
        />
      </div>

      <div>
        <p className="label">Foto als bewijs (mag je overslaan)</p>
        <FotoKiezer
          label="Foto van de situatie"
          bestand={waarden.foto}
          icoon="camera"
          uitgeschakeld={uitgeschakeld}
          onKies={(bestand) => onChange({ ...waarden, foto: bestand })}
        />
      </div>

      <p className="hint" style={{ margin: 0 }}>
        Het monster blijft openstaan en blijft meetellen in de planning: het moet
        waarschijnlijk alsnog gebeuren. Dat is dus iets anders dan annuleren.
      </p>
    </div>
  );
}
