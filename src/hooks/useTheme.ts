import { useEffect, useState } from "react";

function loadTheme(): "light" | "dark" {
  try {
    const saved =
      localStorage.getItem("diffractr:theme") ??
      localStorage.getItem("diffraction:theme");

    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* Storage is optional. */
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState(loadTheme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");

    try {
      localStorage.setItem("diffractr:theme", theme);
    } catch {
      /* Keep the switch usable without storage. */
    }
  }, [theme]);

  return [theme, setTheme] as const;
}
