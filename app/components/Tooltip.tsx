'use client';

import { useState, useEffect, ReactNode } from 'react';

interface TooltipProps {
  text: string;
  children: ReactNode;
}

export default function Tooltip({ text, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isVisible) {
      // Start animation immediately
      setIsAnimating(true);
    } else {
      // Delay removing from DOM until fade out completes
      const timeout = setTimeout(() => setIsAnimating(false), 150);
      return () => clearTimeout(timeout);
    }
  }, [isVisible]);

  return (
    <>
      <style jsx>{`
        .tooltip-wrap {
          position: relative;
          display: inline-flex;
        }

        .tooltip {
          position: absolute;
          bottom: 100%;
          left: 50%;
          margin-bottom: 8px;
          transform: translateX(-50%);
          padding: 6px 10px;
          background: var(--wit);
          border: 1px solid var(--grijs-200);
          border-radius: 8px;
          box-shadow: var(--shadow-md);
          color: var(--navy);
          font-size: 12px;
          font-weight: 500;
          line-height: 1.4;
          white-space: nowrap;
          pointer-events: none;
          z-index: 50;
          transition: opacity 0.15s;
        }

        .tooltip-pijl {
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 6px solid var(--grijs-200);
        }

        .tooltip-pijl::after {
          content: '';
          position: absolute;
          top: -7px;
          left: -5px;
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 5px solid var(--wit);
        }
      `}</style>

      <div
        className="tooltip-wrap"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
        {isAnimating && (
          <div className="tooltip" role="tooltip" style={{ opacity: isVisible ? 1 : 0 }}>
            {text}
            <div className="tooltip-pijl" />
          </div>
        )}
      </div>
    </>
  );
}
