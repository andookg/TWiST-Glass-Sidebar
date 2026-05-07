"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

const THEME_KEY = "twist-sidebar-theme";
const GLASS_KEY = "twist-sidebar-glass-flow";

export function useTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [glassFlowMode, setGlassFlowMode] = useState(true);

  /* ── hydrate from localStorage ── */
  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_KEY);
    if (savedTheme === "light" || savedTheme === "dark") {
      setThemeMode(savedTheme);
    }

    const savedGlass = window.localStorage.getItem(GLASS_KEY);
    if (savedGlass === "on" || savedGlass === "off") {
      setGlassFlowMode(savedGlass === "on");
    }
  }, []);

  /* ── sync theme to <html> ── */
  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem(THEME_KEY, themeMode);
  }, [themeMode]);

  /* ── sync glass flow to <html> ── */
  useEffect(() => {
    document.documentElement.dataset.glassFlow = glassFlowMode ? "on" : "off";
    window.localStorage.setItem(GLASS_KEY, glassFlowMode ? "on" : "off");
  }, [glassFlowMode]);

  const toggleTheme = useCallback(() => {
    setThemeMode((current) => (current === "light" ? "dark" : "light"));
  }, []);

  const toggleGlassFlow = useCallback(() => {
    setGlassFlowMode((current) => !current);
  }, []);

  return { themeMode, glassFlowMode, toggleTheme, toggleGlassFlow } as const;
}
