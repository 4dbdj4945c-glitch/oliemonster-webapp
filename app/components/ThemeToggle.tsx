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
      className="fixed top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 z-50"
      style={{
        backgroundColor: theme === 'dark' ? '#ffffff' : '#0a0a0a',
        border: `1px solid ${theme === 'dark' ? '#ffffff' : '#0a0a0a'}`,
      }}
      aria-label="Toggle theme"
    >
      <span
        className="text-lg"
        style={{
          color: theme === 'dark' ? '#0a0a0a' : '#ffffff',
        }}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </span>
    </button>
  );
}
