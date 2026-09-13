'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export interface MapStreet {
  id: number;
  street: string;
  lat: number;
  lng: number;
  isDone: boolean;
  orderIndex: number;
  /** Volledige straatlijn(en): [ [ [lng,lat], ... ], ... ] */
  lines?: number[][][] | null;
}

interface RouteMapProps {
  streets: MapStreet[];
  /** Route-traject als GeoJSON-coördinaten [[lng, lat], ...] */
  geometry?: number[][] | null;
  /** Huidige GPS-positie van de gebruiker */
  userPos?: { lat: number; lng: number } | null;
  /** Klik op een straat-marker → afvinken/terugzetten */
  onToggle?: (id: number, next: boolean) => void;
  height?: number | string;
  /** Wijzig deze waarde om de kaart opnieuw op de straten te laten inzoomen */
  fitKey?: string | number;
}

// Kaartpalet, afgestemd op de huisstijl (globals.css). Leaflet wil letterlijke hex.
const KLEUR_BEZOCHT = '#16A34A';   // groen: straat gereden
const KLEUR_TE_DOEN = '#1D4ED8';   // blauw: nog te rijden
const KLEUR_POSITIE = '#F97316';   // oranje: huidige positie
const KLEUR_ROUTE = '#0C1B33';     // navy: rijroute tussen de straten

export default function RouteMap({
  streets,
  geometry,
  userPos,
  onToggle,
  height = 360,
  fitKey,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  const userLayerRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const fittedRef = useRef(false);
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  // Init map één keer.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([52.1, 5.3], 7);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);
      overlayRef.current = L.layerGroup().addTo(map);
      userLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      // Trigger eerste teken-pass.
      draw();
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Her)teken straten + route wanneer data verandert.
  const draw = () => {
    const L = LRef.current;
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!L || !map || !overlay) return;
    overlay.clearLayers();
    const bounds: [number, number][] = [];

    // 1) Rij-route als subtiele gidslijn onder de straten (GeoJSON lng,lat → lat,lng).
    //    Toont hoe je van de ene straat naar de volgende rijdt.
    if (geometry && geometry.length > 1) {
      const latlngs = geometry.map((c) => [c[1], c[0]] as [number, number]);
      L.polyline(latlngs, {
        color: KLEUR_ROUTE,
        weight: 2,
        opacity: 0.45,
        dashArray: '3 7',
      }).addTo(overlay);
    }

    // 2) Elke straat als volledige, gekleurde lijn (blauw = te rijden, groen = gereden).
    for (const s of streets) {
      const color = s.isDone ? KLEUR_BEZOCHT : KLEUR_TE_DOEN;
      const tooltip = `${s.orderIndex + 1}. ${s.street}${s.isDone ? ' (gereden)' : ''}`;
      const handleClick = () => onToggleRef.current?.(s.id, !s.isDone);

      if (s.lines && s.lines.length) {
        for (const line of s.lines) {
          const latlngs = line.map((c) => [c[1], c[0]] as [number, number]);
          latlngs.forEach((ll) => bounds.push(ll));
          const pl = L.polyline(latlngs, {
            color,
            weight: 7,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          });
          pl.bindTooltip(tooltip, { sticky: true });
          if (onToggleRef.current) pl.on('click', handleClick);
          pl.addTo(overlay);
        }
      }

      // Genummerd label + klikpunt op het midpunt van de straat.
      bounds.push([s.lat, s.lng]);
      const label = L.marker([s.lat, s.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:${color};color:#fff;font:700 12px/1 Inter,system-ui,sans-serif;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)">${s.orderIndex + 1}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      });
      label.bindTooltip(tooltip, { direction: 'top', offset: [0, -10] });
      if (onToggleRef.current) label.on('click', handleClick);
      label.addTo(overlay);
    }

    if (!fittedRef.current && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
      fittedRef.current = true;
    }
  };

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streets, geometry]);

  // Forceer opnieuw inzoomen wanneer fitKey wijzigt.
  useEffect(() => {
    if (fitKey === undefined) return;
    fittedRef.current = false;
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Gebruikerspositie apart tekenen (verandert vaak).
  useEffect(() => {
    const L = LRef.current;
    const layer = userLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    if (userPos) {
      L.circleMarker([userPos.lat, userPos.lng], {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: KLEUR_POSITIE,
        fillOpacity: 1,
      })
        .bindTooltip('Jouw positie', { direction: 'top', offset: [0, -6] })
        .addTo(layer);
    }
  }, [userPos]);

  return (
    <div
      ref={containerRef}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        width: '100%',
        background: 'var(--wit)',
        border: '1px solid var(--grijs-200)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        zIndex: 0,
      }}
    />
  );
}
