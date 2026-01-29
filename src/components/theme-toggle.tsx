"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const THEME_KEY = "theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    const current = document.documentElement.dataset.theme as Theme | undefined;
    const initial = stored ?? current ?? "light";
    const next = initial === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    setMounted(true);
  }, []);

  const handleToggle = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    setTheme(next);
  };

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={handleToggle}
      aria-pressed={theme === "dark"}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {theme === "dark" ? "🌙" : "☀️"}
      </span>
      <span className="theme-toggle__label">
        {mounted ? (theme === "dark" ? "Modo escuro" : "Modo claro") : "Tema"}
      </span>
    </button>
  );
}
