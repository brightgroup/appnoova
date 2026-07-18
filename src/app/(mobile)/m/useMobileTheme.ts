"use client";

import { useCallback, useEffect, useState } from "react";
import { getStoredMobileTheme, persistMobileTheme, type MobileThemePreference } from "./mobile-theme";

export function useMobileTheme() {
  const [theme, setThemeState] = useState<MobileThemePreference>("dark");

  useEffect(() => {
    setThemeState(getStoredMobileTheme());
  }, []);

  const setTheme = useCallback((next: MobileThemePreference) => {
    setThemeState(next);
    persistMobileTheme(next);
    document.getElementById("nv-m-root")?.setAttribute("data-theme", next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggle };
}
