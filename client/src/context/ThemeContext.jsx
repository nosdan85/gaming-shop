import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const THEME_STORAGE_KEY = 'nos_theme_preference';
const VALID_THEMES = new Set(['light', 'dark']);

const ThemeContext = createContext({
  theme: 'light',
  isDark: false,
  toggleTheme: () => {}
});

const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'light';

  try {
    const stored = String(localStorage.getItem(THEME_STORAGE_KEY) || '').trim().toLowerCase();
    if (VALID_THEMES.has(stored)) return stored;
  } catch {
    // Ignore storage read errors.
  }

  return 'light';
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write errors.
    }
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    isDark: theme === 'dark',
    toggleTheme: () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

