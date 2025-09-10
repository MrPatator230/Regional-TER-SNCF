"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Header from "@/app/components/Header";
import { useRouter } from "next/navigation"; // ajout

export default function ProchainsDepartsPage() {
  const [mode, setMode] = useState("departures"); // departures | arrivals
  const [station, setStation] = useState("");
  // --- Nouveaux états pour l'autocomplétion ---
  const [stationId, setStationId] = useState(null);
  const [suggestions, setSuggestions] = useState([]); // {id,name}[]
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const debounceRef = useRef(null);
  const boxRef = useRef(null);
  const router = useRouter();

  // Fetch suggestions avec debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = station.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setStationId(null); // reset si on modifie manuellement
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/public/stations/search?q=${encodeURIComponent(q)}&limit=8`);
        const json = await res.json();
        setSuggestions(Array.isArray(json.items) ? json.items : []);
        setOpen(true);
        setHighlight(-1);
      } catch (e) {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 220); // 220ms debounce
    return () => clearTimeout(debounceRef.current);
  }, [station]);

  // Fermer si clic extérieur
  useEffect(() => {
    function onClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const selectSuggestion = (item) => {
    setStation(item.name);
    setStationId(item.id);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      if (highlight >= 0 && suggestions[highlight]) {
        e.preventDefault();
        selectSuggestion(suggestions[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const onSubmit = () => {
    if (!station.trim()) {
      alert("Merci de saisir une gare.");
      return;
    }
    if (!stationId) {
      alert("Veuillez choisir une gare dans la liste.");
      return;
    }
    router.push(`/se-deplacer/prochains-departs/${stationId}?type=${mode}`);
  };

  return (
    <>
      <Header />
      <main className="pd-wrapper" aria-labelledby="pd-title">
        <nav className="pd-breadcrumb" aria-label="Fil d'ariane">
          <ol>
            <li>
              <Link href="/" className="home-link" aria-label="Accueil">
                <wcs-mat-icon icon="home" aria-hidden="true"></wcs-mat-icon>
              </Link>
            </li>
            <li aria-hidden="true" className="chevron">›</li>
            <li aria-current="page">Prochains départs</li>
          </ol>
        </nav>

        <div className="pd-hero-icon" aria-hidden="true">
          <svg width="140" height="140" viewBox="0 0 160 160" fill="none" role="img" aria-label="Icône tableau départs">
            <circle cx="50" cy="46" r="26" stroke="#0d5637" strokeWidth="4" fill="#fff" />
            <path d="M46 32v16l12 6" stroke="#0d5637" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="70" y="28" width="72" height="84" rx="6" stroke="#0d5637" strokeWidth="4" fill="#fff" />
            <rect x="78" y="40" width="32" height="18" rx="2" fill="#0d5637" fillOpacity="0.12" stroke="#0d5637" strokeWidth="2" />
            <rect x="78" y="66" width="48" height="8" rx="2" fill="#0d5637" fillOpacity="0.15" />
            <rect x="78" y="80" width="48" height="8" rx="2" fill="#0d5637" fillOpacity="0.15" />
            <path d="M70 116l20 16h32l20-16" stroke="#0d5637" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 id="pd-title" className="pd-title">Prochains départs</h1>
        <p className="pd-subtitle">Tableaux des départs et arrivées de plus de 5000 gares</p>

        <div className="pd-pills" role="tablist" aria-label="Type d'affichage">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "departures"}
            className={"pd-pill" + (mode === "departures" ? " active" : "")}
            onClick={() => setMode("departures")}
          >
            Départs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "arrivals"}
            className={"pd-pill" + (mode === "arrivals" ? " active" : "")}
            onClick={() => setMode("arrivals")}
          >
            Arrivées
          </button>
        </div>

        <div className="pd-search-box" ref={boxRef} role="combobox" aria-expanded={open} aria-owns="station-listbox" aria-haspopup="listbox">
          <wcs-mat-icon icon="search" aria-hidden="true"></wcs-mat-icon>
          <input
            type="text"
            placeholder="Rechercher une gare"
            aria-label="Rechercher une gare"
            value={station}
            onChange={(e) => { setStation(e.target.value); setStationId(null); }}
            onKeyDown={onKeyDown}
            aria-autocomplete="list"
            aria-controls="station-listbox"
          />
          {loading && <span className="pd-loader" aria-hidden="true">…</span>}
          {open && suggestions.length > 0 && (
            <ul id="station-listbox" role="listbox" className="pd-suggestions">
              {suggestions.map((s, idx) => (
                <li
                  key={s.id}
                  role="option"
                  aria-selected={idx === highlight}
                  className={"pd-suggestion" + (idx === highlight ? " highlight" : "")}
                  onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                  onMouseEnter={() => setHighlight(idx)}
                >
                  {s.name}
                </li>
              ))}
            </ul>
          )}
          {open && !loading && suggestions.length === 0 && (
            <div className="pd-suggestions pd-empty">Aucun résultat</div>
          )}
        </div>

        <wcs-button class="pd-submit" size="m" onClick={onSubmit} disabled={!station.trim()}>
          Afficher les horaires
        </wcs-button>
      </main>
      <style jsx>{`
        .pd-wrapper { max-width: 760px; margin: 0 auto; padding: 1.25rem 1.5rem 4rem; text-align: center; }
        .pd-breadcrumb { text-align: left; font-size: .8rem; margin: .25rem 0 1.5rem; }
        .pd-breadcrumb ol { list-style:none; padding:0; margin:0; display:flex; align-items:center; gap:.4rem; }
        .pd-breadcrumb a { color: #0d5637; display:inline-flex; padding:.25rem; border-radius:4px; }
        .pd-breadcrumb a:hover { background:#e5f2eb; text-decoration:none; }
        .pd-breadcrumb li[aria-current="page"] { border:1px dotted #0d5637; padding:.2rem .4rem; border-radius:3px; font-weight:600; }
        .pd-hero-icon { margin: 1rem 0 .5rem; }
        .pd-title { font-size:1.9rem; margin:.5rem 0 .3rem; font-weight:800; }
        .pd-subtitle { margin:0 0 1.2rem; color:#444; font-size:.95rem; }
        .pd-pills { display:flex; justify-content:center; gap:.5rem; margin-bottom:1.3rem; }
        .pd-pill { background:#e0e0e0; border:none; padding:.55rem 1.4rem; border-radius:999px; font-weight:600; font-size:.9rem; cursor:pointer; transition:background .2s,color .2s; }
        .pd-pill.active { background:#0d5637; color:#fff; }
        .pd-pill:not(.active):hover { background:#d3d3d3; }
        .pd-search-box { position:relative; display:flex; align-items:center; background:#fff; border:1px solid #e1e1e1; border-radius:6px; padding:.7rem 1rem; max-width:420px; margin:0 auto; gap:.6rem; box-shadow:0 2px 4px rgba(0,0,0,.05); }
        .pd-loader { font-size:.9rem; color:#666; }
        .pd-suggestions { list-style:none; margin:0; padding:0; position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #d7d7d7; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,.12); z-index:20; max-height:260px; overflow:auto; text-align:left; }
        .pd-suggestion { padding:.55rem .85rem; font-size:.9rem; cursor:pointer; }
        .pd-suggestion.highlight, .pd-suggestion:hover { background:#0d5637; color:#fff; }
        .pd-empty { position:absolute; top:100%; left:0; right:0; padding:.7rem .9rem; font-size:.85rem; color:#555; background:#fff; border:1px solid #d7d7d7; border-radius:6px; margin-top:2px; z-index:20; }
        @media (max-width:600px){ .pd-title { font-size:1.6rem; } }
      `}</style>
    </>
  );
}
