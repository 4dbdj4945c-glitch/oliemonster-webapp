'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    // Check localStorage for saved theme
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return (
    <button
      onClick={toggleTheme}
      className="fixed top-8 right-8 w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 z-50 hover:scale-105 active:scale-95"
      style={{
        backgroundColor: 'var(--accent)',
        border: '1px solid var(--accent)',
      }}
      aria-label="Toggle theme"
    >
      <span
        className="text-xl"
        style={{
          color: 'var(--background)',
          lineHeight: 1,
        }}
      >
        {theme === 'dark' ? '◐' : '◑'}
      </span>
    </button>
  );
}
