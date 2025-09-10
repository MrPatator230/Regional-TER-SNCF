"use client";
import { useEffect, useRef } from "react";

export default function ThemeManager() {
  const currentThemeRef = useRef("light");

  useEffect(() => {
    const docEl = document.documentElement;
    const body = document.body;

    const readStored = () => {
      try {
        const v = localStorage.getItem("theme");
        if (v === "light" || v === "dark") return v;
      } catch {}
      return null;
    };

    const getPreferred = () => {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    };

    const apply = (theme) => {
      currentThemeRef.current = theme;
      // dataset pour stylage conditionnel
      docEl.dataset.theme = theme;
      body.dataset.theme = theme;
      // classe utilitaire si besoin
      body.classList.toggle("dark", theme === "dark");

      // activer/désactiver les feuilles de style light/dark si présentes
      const light = document.getElementById("light");
      const dark = document.getElementById("dark");
      if (light) light.disabled = theme !== "light";
      if (dark) dark.disabled = theme !== "dark";

      // meta theme-color basique
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", theme === "dark" ? "#0b0c0c" : "#ffffff");

      try { localStorage.setItem("theme", theme); } catch {}
      // notifier
      window.dispatchEvent(new CustomEvent("theme:applied", { detail: theme }));
    };

    const initial = readStored() || getPreferred();
    apply(initial);

    // Expose helpers globaux pour d'autres composants (ThemeToggle)
    window.__getTheme = () => currentThemeRef.current;
    window.__setTheme = (t) => apply(t === "dark" ? "dark" : "light");

    // Écoute des changements venant d'autres parties de l'app
    const onExternalChange = (ev) => {
      const t = ev?.detail === "dark" ? "dark" : ev?.detail === "light" ? "light" : null;
      if (t) apply(t);
    };
    window.addEventListener("theme:change", onExternalChange);

    // Suivre les changements système si l'utilisateur n'a rien stocké
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMq = (e) => {
      // si l'utilisateur n'a pas défini manuellement, suivre système
      if (!readStored()) apply(e.matches ? "dark" : "light");
    };
    if (mq?.addEventListener) mq.addEventListener("change", onMq);
    else mq?.addListener && mq.addListener(onMq);

    return () => {
      window.removeEventListener("theme:change", onExternalChange);
      if (mq?.removeEventListener) mq.removeEventListener("change", onMq);
      else mq?.removeListener && mq.removeListener(onMq);
    };
  }, []);

  return null;
}
