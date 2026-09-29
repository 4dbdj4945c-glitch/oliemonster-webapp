'use client';

import { useEffect, useMemo } from 'react';
import Icon from './ui/Icon';
import type { IconNaam } from './ui';

interface Props {
  label: string;
  /** Wat de gebruiker koos; null als er nog niets gekozen is */
  bestand: File | null;
  onKies: (bestand: File | null) => void;
  icoon?: IconNaam;
  /** Foto die er al staat, bijvoorbeeld van een eerdere poging */
  bestaandeUrl?: string | null;
  uitgeschakeld?: boolean;
}

/*
  Eén groot tikvlak om een foto te maken of te kiezen. Bedoeld voor een telefoon
  met werkhandschoenen aan, dus flink groter dan een gewone knop. `capture`
  opent op de telefoon meteen de camera achterop.
  Opmaak staat in globals.css (zie STIJL.md: geen styled-jsx in losse componenten).
*/
export default function FotoKiezer({
  label,
  bestand,
  onKies,
  icoon = 'camera',
  bestaandeUrl = null,
  uitgeschakeld = false,
}: Props) {
  // Eén blob-URL per gekozen bestand, en weer opruimen zodra het bestand wisselt
  // of het venster dichtgaat. Zonder useMemo maakt elke render een nieuwe URL:
  // dat lekt geheugen en laat de voorbeeldfoto knipperen.
  const gekozenUrl = useMemo(() => (bestand ? URL.createObjectURL(bestand) : null), [bestand]);
  useEffect(() => {
    if (!gekozenUrl) return;
    return () => URL.revokeObjectURL(gekozenUrl);
  }, [gekozenUrl]);

  const voorbeeld = gekozenUrl ?? bestaandeUrl;

  return (
    <div className={`foto-kiezer${bestand ? ' foto-kiezer-gevuld' : ''}`}>
      <label className="foto-kiezer-vlak">
        {voorbeeld ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={voorbeeld} alt="" className="foto-kiezer-beeld" />
        ) : (
          <Icon name={icoon} size={32} />
        )}
        <span className="foto-kiezer-tekst">{label}</span>
        <span className="foto-kiezer-naam">
          {bestand ? bestand.name : bestaandeUrl ? 'Foto staat er al' : 'Tik om een foto te maken'}
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={uitgeschakeld}
          onChange={(e) => {
            const gekozen = e.target.files?.[0] ?? null;
            onKies(gekozen);
            e.target.value = '';
          }}
        />
      </label>
      {bestand && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onKies(null)}
          disabled={uitgeschakeld}
        >
          <Icon name="image-remove" size={16} />
          Foto weghalen
        </button>
      )}
    </div>
  );
}
