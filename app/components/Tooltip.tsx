'use client';

import { useState, useEffect, ReactNode } from 'react';

interface TooltipProps {
  text: string;
  children: ReactNode;
}

export default function Tooltip({ text, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check theme
    const checkTheme = () => {
      const theme = localStorage.getItem('theme') || document.documentElement.getAttribute('data-theme');
      setIsDark(theme === 'dark');
    };
    
    checkTheme();
    
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
    
    return () => observer.disconnect();
  }, []);

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

  const bgColor = isDark ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.9)';
  const textColor = isDark ? '#000000' : '#ffffff';
  const arrowColor = isDark ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.9)';

  return (
    <div 
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isAnimating && (
        <div
          className="absolute bottom-full left-1/2 mb-2 px-3 py-1.5 text-sm font-medium rounded-lg shadow-lg pointer-events-none whitespace-nowrap z-50 transition-opacity duration-150"
          style={{
            backgroundColor: bgColor,
            color: textColor,
            opacity: isVisible ? 1 : 0,
            transform: 'translateX(-50%)',
          }}
        >
          {text}
          {/* Arrow */}
          <div
            className="absolute top-full left-1/2"
            style={{
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: `6px solid ${arrowColor}`,
              transform: 'translateX(-50%)',
            }}
          />
        </div>
      )}
    </div>
  );
}
