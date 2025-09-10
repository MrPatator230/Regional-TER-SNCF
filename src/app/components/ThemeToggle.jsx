"use client";
import { useEffect, useRef, useState } from "react";

export default function ThemeToggle() {
  const switchRef = useRef(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Init from ThemeManager or localStorage
    const getTheme = () => {
      if (typeof window === "undefined") return "light";
      if (typeof window.__getTheme === "function") return window.__getTheme();
      try {
        const saved = window.localStorage.getItem("theme");
        if (saved === "dark" || saved === "light") return saved;
      } catch {}
      return document.documentElement?.dataset?.theme || "light";
    };
    const t = getTheme();
    setChecked(t === "dark");
  }, []);

  useEffect(() => {
    if (switchRef.current && switchRef.current.checked !== checked) {
      // keep web component property in sync
      switchRef.current.checked = checked;
    }
  }, [checked]);

  useEffect(() => {
    if (!switchRef.current) return;
    const el = switchRef.current;
    const onChange = (ev) => {
      // WCS emits `wcsChange` event with { detail: { checked } }
      const isChecked = ev?.detail?.checked ?? !checked;
      const theme = isChecked ? "dark" : "light";
      setChecked(isChecked);
      if (typeof window.__setTheme === "function") window.__setTheme(theme);
      else window.dispatchEvent(new CustomEvent("theme:change", { detail: theme }));
    };
    el.addEventListener("wcsChange", onChange);
    return () => el.removeEventListener("wcsChange", onChange);
  }, [checked]);

  const handleClick = () => {
    const next = !checked;
    const theme = next ? "dark" : "light";
    setChecked(next);
    if (typeof window.__setTheme === "function") window.__setTheme(theme);
    else window.dispatchEvent(new CustomEvent("theme:change", { detail: theme }));
  };

  return (
    <div className="d-flex align-items-center ms-2" title="Basculer thème">
      {/* Composant WCS */}
      <wcs-switch ref={switchRef} onClick={handleClick}>
        <span slot="label-left">Clair</span>
        <span slot="label-right">Sombre</span>
      </wcs-switch>
    </div>
  );
}
