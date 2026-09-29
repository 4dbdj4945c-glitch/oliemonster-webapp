'use client';

/*
  Tekenvlak voor de handtekening van de klant, met de vinger op de telefoon of
  met de muis. Pointer-events voor alles (vinger, pen, muis); touch-action none
  zodat de pagina niet meescrollt tijdens het tekenen. De lijnen worden
  bewaard, zodat draaien van de telefoon of een ander formaat de tekening niet
  wist. Opmaak in globals.css (.handtekening-*).
*/

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Icon } from '@/app/components/ui';

type Punt = [number, number];

export interface HandtekeningVeldRef {
  /** De tekening als PNG (data-URL), of null als er niets getekend is. */
  alsPng: () => string | null;
  wis: () => void;
}

const LIJN = '#0C1B33';

const HandtekeningVeld = forwardRef<HandtekeningVeldRef, { uitgeschakeld?: boolean; onVerander?: (leeg: boolean) => void }>(
  function HandtekeningVeld({ uitgeschakeld = false, onVerander }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const lijnen = useRef<Punt[][]>([]);
    const bezig = useRef<Punt[] | null>(null);
    const [leeg, setLeeg] = useState(true);

    const teken = useCallback(() => {
      const c = canvas.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const schaal = c.width / c.clientWidth || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(schaal, 0, 0, schaal, 0, 0);
      ctx.strokeStyle = LIJN;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const lijn of [...lijnen.current, ...(bezig.current ? [bezig.current] : [])]) {
        if (lijn.length === 0) continue;
        ctx.beginPath();
        ctx.moveTo(lijn[0][0], lijn[0][1]);
        if (lijn.length === 1) ctx.lineTo(lijn[0][0] + 0.1, lijn[0][1] + 0.1);
        // Vloeiend: steeds een boog naar het midden van twee punten.
        for (let i = 1; i < lijn.length - 1; i++) {
          const [x, y] = lijn[i];
          const [nx, ny] = lijn[i + 1];
          ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
        }
        if (lijn.length > 1) ctx.lineTo(lijn[lijn.length - 1][0], lijn[lijn.length - 1][1]);
        ctx.stroke();
      }
    }, []);

    // Het canvas even groot als op het scherm, maal de pixeldichtheid (scherp op de iPhone).
    useEffect(() => {
      const c = canvas.current;
      if (!c) return;
      const pas = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        c.width = Math.round(c.clientWidth * dpr);
        c.height = Math.round(c.clientHeight * dpr);
        teken();
      };
      pas();
      const waarnemer = new ResizeObserver(pas);
      waarnemer.observe(c);
      return () => waarnemer.disconnect();
    }, [teken]);

    const punt = (e: React.PointerEvent<HTMLCanvasElement>): Punt => {
      const r = e.currentTarget.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    const zetLeeg = (w: boolean) => {
      setLeeg(w);
      onVerander?.(w);
    };

    useImperativeHandle(ref, () => ({
      alsPng: () => {
        const c = canvas.current;
        if (!c || lijnen.current.length === 0) return null;
        return c.toDataURL('image/png');
      },
      wis: () => {
        lijnen.current = [];
        bezig.current = null;
        teken();
        zetLeeg(true);
      },
    }));

    return (
      <div className={`handtekening${uitgeschakeld ? ' is-uit' : ''}`}>
        <canvas
          ref={canvas}
          className="handtekening-vlak"
          role="img"
          aria-label={leeg ? 'Tekenvlak voor de handtekening, nog leeg' : 'Tekenvlak met de handtekening'}
          onPointerDown={(e) => {
            if (uitgeschakeld) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            bezig.current = [punt(e)];
            teken();
          }}
          onPointerMove={(e) => {
            if (!bezig.current) return;
            bezig.current.push(punt(e));
            teken();
          }}
          onPointerUp={() => {
            if (!bezig.current) return;
            lijnen.current.push(bezig.current);
            bezig.current = null;
            teken();
            zetLeeg(false);
          }}
          onPointerCancel={() => {
            bezig.current = null;
            teken();
          }}
        />
        <div className="handtekening-onder">
          <span>{leeg ? 'Teken hierboven met je vinger' : 'Getekend'}</span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={uitgeschakeld || leeg}
            onClick={() => {
              lijnen.current = [];
              teken();
              zetLeeg(true);
            }}
          >
            <Icon name="reset" size={16} />
            Opnieuw
          </button>
        </div>
      </div>
    );
  }
);

export default HandtekeningVeld;
