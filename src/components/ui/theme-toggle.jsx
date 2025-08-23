import React from "react";
import { Sun, Moon } from "lucide-react";

function getInitialTheme() {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {}
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

export default function ThemeToggle({ className = "" }) {
  const [theme, setTheme] = React.useState(() => getInitialTheme());

  React.useEffect(() => {
    const root = document.documentElement; // <html>
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem("theme", theme);
    } catch {}
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      className={`fixed top-4 right-4 z-50 inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-gray-900 shadow hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 ${className}`}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
      <span className="text-sm hidden sm:inline">
        {theme === "dark" ? "Light" : "Dark"}
      </span>
    </button>
  );
}
