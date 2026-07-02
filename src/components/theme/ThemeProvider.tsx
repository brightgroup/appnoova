"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  applyThemePreference,
  getStoredThemePreference,
  persistThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference
} from "@/lib/theme";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  /** true tras leer localStorage en el cliente */
  ready: boolean;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("dark");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = getStoredThemePreference();
    setPreferenceState(stored);
    setResolved(applyThemePreference(stored));
    setReady(true);
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(applyThemePreference("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    persistThemePreference(next);
    setPreferenceState(next);
    setResolved(applyThemePreference(next));
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, ready, setPreference }),
    [preference, resolved, ready, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme debe usarse dentro de ThemeProvider");
  }
  return ctx;
}
