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

    // Route-lijn (GeoJSON is lng,lat → Leaflet wil lat,lng)
    if (geometry && geometry.length > 1) {
      const latlngs = geometry.map((c) => [c[1], c[0]] as [number, number]);
      L.polyline(latlngs, {
        color: '#1D4ED8',
        weight: 4,
        opacity: 0.75,
      }).addTo(overlay);
    }

    // Straat-markers
    const bounds: [number, number][] = [];
    for (const s of streets) {
      bounds.push([s.lat, s.lng]);
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 9,
        color: '#ffffff',
        weight: 2,
        fillColor: s.isDone ? '#16A34A' : '#DC2626',
        fillOpacity: 0.95,
      });
      marker.bindTooltip(`${s.orderIndex + 1}. ${s.street}${s.isDone ? ' ✓' : ''}`, {
        direction: 'top',
        offset: [0, -6],
      });
      if (onToggleRef.current) {
        marker.on('click', () => onToggleRef.current?.(s.id, !s.isDone));
      }
      marker.addTo(overlay);
    }

    if (!fittedRef.current && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
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
        fillColor: '#1D4ED8',
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
        borderRadius: 16,
        overflow: 'hidden',
        zIndex: 0,
      }}
    />
  );
}
