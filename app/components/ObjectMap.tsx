'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker, LeafletMouseEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface ObjectMapProps {
  /** Positie van de speld; null = nog geen coördinaat gekozen */
  lat: number | null;
  lng: number | null;
  /** Nieuwe positie na slepen of klikken op de kaart */
  onChange: (lat: number, lng: number) => void;
  height?: number | string;
}

// Oranje speld in de huisstijl. Leaflet wil letterlijke hex.
const KLEUR_SPELD = '#F97316';
const KLEUR_RAND = '#0C1B33';
// Heeze, als de kaart nog niet weet waar hij heen moet.
const START: [number, number] = [51.3835, 5.5601];

/**
 * Kleine kaart met één speld die je kunt verslepen, voor het vastleggen van een
 * object. Je zoekt eerst het adres (PDOK), daarna zet je de speld op de plek waar
 * je echt moet zijn, bijvoorbeeld het sluishoofd in plaats van het bezoekadres.
 * Klikken op de kaart verplaatst de speld ook.
 */
export default function ObjectMap({ lat, lng, onChange, height = 320 }: ObjectMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let gestopt = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (gestopt || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        dragging: true,
        touchZoom: true,
      }).setView(lat !== null && lng !== null ? [lat, lng] : START, lat !== null ? 16 : 11);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);
      map.on('click', (e: LeafletMouseEvent) => onChangeRef.current(e.latlng.lat, e.latlng.lng));
      mapRef.current = map;
      tekenSpeld();
    })();
    return () => {
      gestopt = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tekenSpeld = () => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (lat === null || lng === null) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      return;
    }
    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], {
        draggable: true,
        keyboard: true,
        title: 'Sleep de speld naar de juiste plek',
        icon: L.divIcon({
          className: '',
          html: `<div style="width:26px;height:26px;border-radius:50%;background:${KLEUR_SPELD};border:3px solid ${KLEUR_RAND};box-shadow:0 1px 4px rgba(12,27,51,.4)"></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(map);
      markerRef.current.on('dragend', () => {
        const p = markerRef.current?.getLatLng();
        if (p) onChangeRef.current(p.lat, p.lng);
      });
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }
  };

  // Speld verplaatsen en meebewegen als het adres verandert.
  useEffect(() => {
    tekenSpeld();
    const map = mapRef.current;
    if (map && lat !== null && lng !== null) {
      map.setView([lat, lng], Math.max(map.getZoom(), 16));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        width: '100%',
        maxWidth: '100%',
        background: 'var(--wit)',
        border: '1px solid var(--grijs-200)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        // Eigen stacking context, net als RouteMap: niets van de kaart komt boven de modal uit.
        position: 'relative',
        isolation: 'isolate',
        zIndex: 0,
      }}
    />
  );
}
