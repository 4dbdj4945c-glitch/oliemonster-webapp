'use client';

import { ReactNode } from 'react';

interface NavButtonProps {
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  ariaLabel?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
}

export default function NavButton({
  onClick,
  children,
  icon,
  danger = false,
  ariaLabel,
  type = 'button',
  disabled = false,
}: NavButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`nav-btn${danger ? ' nav-btn-danger' : ''}`}
    >
      {icon}
      {children}
    </button>
  );
}
