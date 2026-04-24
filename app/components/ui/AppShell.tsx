'use client';

import { ReactNode } from 'react';

interface AppShellProps {
  title: string;
  leftExtra?: ReactNode;
  rightActions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}

export default function AppShell({ title, leftExtra, rightActions, children, wide = false }: AppShellProps) {
  return (
    <div className="app-page">
      <div className="toolbar">
        <div className="toolbar-inner">
          <div className="toolbar-left">
            <img src="/header_logo.png" alt="It's Done Services" className="toolbar-logo" />
            <span className="toolbar-divider" />
            <span className="toolbar-title">{title}</span>
            {leftExtra}
          </div>
          <div className="toolbar-right">{rightActions}</div>
        </div>
      </div>
      <div className={wide ? 'app-content-wide' : 'app-content'}>{children}</div>
    </div>
  );
}
