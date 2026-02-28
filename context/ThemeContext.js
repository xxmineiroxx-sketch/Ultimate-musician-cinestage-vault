import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loadSession, saveSession, defaultSession } from '../services/sessionStore';

const ThemeContext = createContext({
  isDark: true,
  colors: {},
  setDarkMode: () => {},
});

const DARK_COLORS = {
  background: '#020617',
  card: '#0B1220',
  cardAlt: '#0A1020',
  border: '#111827',
  borderAlt: '#1F2937',
  text: '#E5E7EB',
  muted: '#9CA3AF',
  subtle: '#94A3B8',
  link: '#60A5FA',
  pill: '#111827',
  pillActive: '#4F46E5',
  danger: '#B91C1C',
  success: '#0F766E',
};

const LIGHT_COLORS = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  cardAlt: '#F1F5F9',
  border: '#E2E8F0',
  borderAlt: '#CBD5F5',
  text: '#0F172A',
  muted: '#475569',
  subtle: '#64748B',
  link: '#2563EB',
  pill: '#E2E8F0',
  pillActive: '#2563EB',
  danger: '#DC2626',
  success: '#059669',
};

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    (async () => {
      const session = await loadSession();
      if (typeof session?.darkMode === 'boolean') {
        setIsDark(session.darkMode);
      }
    })();
  }, []);

  async function setDarkMode(value) {
    setIsDark(value);
    const current = (await loadSession()) || defaultSession();
    await saveSession({ ...current, darkMode: value, lastUpdated: new Date().toISOString() });
  }

  const colors = useMemo(() => (isDark ? DARK_COLORS : LIGHT_COLORS), [isDark]);

  const contextValue = useMemo(() => ({ isDark, colors, setDarkMode }), [isDark, colors]);

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

