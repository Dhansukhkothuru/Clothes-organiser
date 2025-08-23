import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ClothesOrganizer from "./pages/ClothesOrganizer";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import ThemeToggle from "./components/ui/theme-toggle";

function AppRouter() {
  const [route, setRoute] = React.useState(
    () => window.location.hash.slice(2) || ""
  );
  const [authed, setAuthed] = React.useState(() => {
    const token =
      localStorage.getItem("token") || sessionStorage.getItem("token");
    return Boolean(token);
  });
  const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5174/api";
  // Initialize theme once at app start
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("theme");
      const root = document.documentElement;
      if (stored === "dark") root.classList.add("dark");
      else root.classList.remove("dark");
    } catch {}
  }, []);
  React.useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(2) || "");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // First page logic: if not authed, go to signin; after signup/signin, go home
  React.useEffect(() => {
    const token =
      localStorage.getItem("token") || sessionStorage.getItem("token");
    setAuthed(Boolean(token));
    if (!token) {
      if (route !== "signin" && route !== "signup") {
        window.location.hash = "#/signin";
      }
    }
  }, [route]);

  // Optional: if no account exists, push user to signup
  React.useEffect(() => {
    (async () => {
      if (authed) return;
      try {
        const res = await fetch(`${API_URL}/health`);
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.counts?.users === 0) {
          if (route !== "signup") window.location.hash = "#/signup";
        }
      } catch {}
    })();
  }, [authed]);

  const goHome = () => {
    window.location.hash = "";
  };
  const onAuthed = () => {
    setAuthed(true);
    goHome();
  };

  if (route === "signin")
    return (
      <>
        <ThemeToggle />
        <SignIn onAuthed={onAuthed} />
      </>
    );
  if (route === "signup")
    return (
      <>
        <ThemeToggle />
        <SignUp onAuthed={onAuthed} />
      </>
    );
  return (
    <>
      <ThemeToggle />
      <ClothesOrganizer
        onLogout={() => {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          sessionStorage.removeItem("token");
          sessionStorage.removeItem("user");
          setAuthed(false);
          window.location.hash = "#/signin";
        }}
      />
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);
