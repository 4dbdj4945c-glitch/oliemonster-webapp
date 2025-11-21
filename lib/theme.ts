// Theme configuration
export const THEMES = {
  blue: {
    primary: {
      bg: 'bg-blue-600',
      bgHover: 'hover:bg-blue-700',
      text: 'text-blue-600',
      textHover: 'hover:text-blue-900',
      border: 'border-blue-500',
      ring: 'ring-blue-500',
      focus: 'focus:ring-blue-500',
    },
    secondary: {
      bg: 'bg-gray-600',
      bgHover: 'hover:bg-gray-700',
    },
    accent: {
      bg: 'bg-green-600',
      bgHover: 'hover:bg-green-700',
    },
  },
  green: {
    primary: {
      bg: 'bg-green-600',
      bgHover: 'hover:bg-green-700',
      text: 'text-green-600',
      textHover: 'hover:text-green-900',
      border: 'border-green-500',
      ring: 'ring-green-500',
      focus: 'focus:ring-green-500',
    },
    secondary: {
      bg: 'bg-teal-600',
      bgHover: 'hover:bg-teal-700',
    },
    accent: {
      bg: 'bg-emerald-600',
      bgHover: 'hover:bg-emerald-700',
    },
  },
  purple: {
    primary: {
      bg: 'bg-purple-600',
      bgHover: 'hover:bg-purple-700',
      text: 'text-purple-600',
      textHover: 'hover:text-purple-900',
      border: 'border-purple-500',
      ring: 'ring-purple-500',
      focus: 'focus:ring-purple-500',
    },
    secondary: {
      bg: 'bg-pink-600',
      bgHover: 'hover:bg-pink-700',
    },
    accent: {
      bg: 'bg-fuchsia-600',
      bgHover: 'hover:bg-fuchsia-700',
    },
  },
  red: {
    primary: {
      bg: 'bg-red-600',
      bgHover: 'hover:bg-red-700',
      text: 'text-red-600',
      textHover: 'hover:text-red-900',
      border: 'border-red-500',
      ring: 'ring-red-500',
      focus: 'focus:ring-red-500',
    },
    secondary: {
      bg: 'bg-orange-600',
      bgHover: 'hover:bg-orange-700',
    },
    accent: {
      bg: 'bg-rose-600',
      bgHover: 'hover:bg-rose-700',
    },
  },
  dark: {
    primary: {
      bg: 'bg-gray-700',
      bgHover: 'hover:bg-gray-800',
      text: 'text-gray-700',
      textHover: 'hover:text-gray-900',
      border: 'border-gray-600',
      ring: 'ring-gray-600',
      focus: 'focus:ring-gray-600',
    },
    secondary: {
      bg: 'bg-slate-700',
      bgHover: 'hover:bg-slate-800',
    },
    accent: {
      bg: 'bg-zinc-600',
      bgHover: 'hover:bg-zinc-700',
    },
  },
};

export type ThemeId = keyof typeof THEMES;

export function getTheme(themeId: string = 'blue') {
  return THEMES[themeId as ThemeId] || THEMES.blue;
}
