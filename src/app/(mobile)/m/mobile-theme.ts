// Theming aislado del panel móvil (/m). No comparte estado con
// src/lib/theme.ts (que controla <html> para todo el resto de la app) —
// key de localStorage propio, aplicado a un wrapper local (#nv-m-root),
// nunca a <html>/<body>.

export type MobileThemePreference = "light" | "dark";

export const MOBILE_THEME_STORAGE_KEY = "noova-m-theme";

export function getStoredMobileTheme(): MobileThemePreference {
  if (typeof window === "undefined") return "dark";
  try {
    return localStorage.getItem(MOBILE_THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function persistMobileTheme(pref: MobileThemePreference): void {
  try {
    localStorage.setItem(MOBILE_THEME_STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
}

/** Inline script anti-flash — fija data-theme en #nv-m-root antes de pintar. */
export const MOBILE_THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  MOBILE_THEME_STORAGE_KEY
)})==="light"?"light":"dark";var el=document.getElementById("nv-m-root");if(el)el.setAttribute("data-theme",p);}catch(e){}})();`;
