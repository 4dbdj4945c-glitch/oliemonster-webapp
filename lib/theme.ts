// Theme configuration - It's Done Services Style
export const THEMES = {
  blue: {
    primary: {
      bg: 'bg-gray-900',
      bgHover: 'hover:bg-gray-800',
      text: 'text-gray-900',
      textHover: 'hover:text-gray-700',
      border: 'border-gray-300',
      ring: 'ring-gray-900',
      focus: 'focus:ring-gray-900',
    },
    secondary: {
      bg: 'bg-white',
      bgHover: 'hover:bg-gray-50',
    },
    accent: {
      bg: 'bg-gray-900',
      bgHover: 'hover:bg-gray-800',
    },
  },
  green: {
    primary: {
      bg: 'bg-gray-900',
      bgHover: 'hover:bg-gray-800',
      text: 'text-gray-900',
      textHover: 'hover:text-gray-700',
      border: 'border-gray-300',
      ring: 'ring-gray-900',
      focus: 'focus:ring-gray-900',
    },
    secondary: {
      bg: 'bg-white',
      bgHover: 'hover:bg-gray-50',
    },
    accent: {
      bg: 'bg-gray-900',
      bgHover: 'hover:bg-gray-800',
    },
  },
  purple: {
    primary: {
      bg: 'bg-gray-900',
      bgHover: 'hover:bg-gray-800',
      text: 'text-gray-900',
      textHover: 'hover:text-gray-700',
      border: 'border-gray-300',
      ring: 'ring-gray-900',
      focus: 'focus:ring-gray-900',
    },
    secondary: {
      bg: 'bg-white',
      bgHover: 'hover:bg-gray-50',
    },
    accent: {
      bg: 'bg-gray-900',
      bgHover: 'hover:bg-gray-800',
    },
  },
  red: {
    primary: {
      bg: 'bg-gray-900',
      bgHover: 'hover:bg-gray-800',
      text: 'text-gray-900',
      textHover: 'hover:text-gray-700',
      border: 'border-gray-300',
      ring: 'ring-gray-900',
      focus: 'focus:ring-gray-900',
    },
    secondary: {
      bg: 'bg-white',
      bgHover: 'hover:bg-gray-50',
    },
    accent: {
      bg: 'bg-gray-900',
      bgHover: 'hover:bg-gray-800',
    },
  },
  dark: {
    primary: {
      bg: 'bg-gray-900',
      bgHover: 'hover:bg-gray-800',
      text: 'text-gray-900',
      textHover: 'hover:text-gray-700',
      border: 'border-gray-300',
      ring: 'ring-gray-900',
      focus: 'focus:ring-gray-900',
    },
    secondary: {
      bg: 'bg-white',
      bgHover: 'hover:bg-gray-50',
    },
    accent: {
      bg: 'bg-gray-900',
      bgHover: 'hover:bg-gray-800',
    },
  },
};

export type ThemeId = keyof typeof THEMES;

export function getTheme(themeId: string = 'blue') {
  return THEMES[themeId as ThemeId] || THEMES.blue;
}
