"use client";
import React, { useMemo, useState } from "react";
import Header from "@/app/components/Header";

export default function HorairesPage() {
  // Etats du planner (identiques à l'accueil)
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showVia, setShowVia] = useState(false);
  const [via, setVia] = useState("");

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const nowTime = useMemo(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }, []);

  const [outDate, setOutDate] = useState(todayIso);
  const [outTime, setOutTime] = useState(nowTime);
  const [hasReturn, setHasReturn] = useState(false);
  const [retDate, setRetDate] = useState("");
  const [retTime, setRetTime] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [card, setCard] = useState("none");

  const swapStations = () => {
    setFrom((prevFrom) => {
      setTo(prevFrom);
      return to;
    });
  };

  const onSearch = () => {
    const payload = {
      from,
      to,
      via: showVia && via ? via : undefined,
      outbound: { date: outDate, time: outTime },
      inbound: hasReturn && retDate && retTime ? { date: retDate, time: retTime } : undefined,
      passengers,
      card,
    };
    // TODO: brancher avec l'API réelle ou naviguer vers une page de résultats
    // eslint-disable-next-line no-console
    console.log("Recherche horaires:", payload);
    if (!from || !to) {
      alert("Merci de renseigner les gares de départ et d'arrivée.");
      return;
    }
    alert("Recherche lancée. Voir console pour les paramètres.");
  };

  return (
    <>
      <Header />
      <div className="hero-section">
        <h1 className="hero-title">Rechercher un horaire</h1>
        <div className="main-container">
          {/* On réutilise la même carte de planner que sur l'accueil */}
          <div className="planner-container">
            <div className="card planner-card home-planner-card">
              <wcs-button shape="round" mode="clear" className="swap-button" onClick={swapStations} aria-label="Inverser départ et arrivée">
                <wcs-mat-icon icon="swap_vert"></wcs-mat-icon>
              </wcs-button>

              <div className="planner-input">
                <wcs-mat-icon icon="place"></wcs-mat-icon>
                <input
                  type="text"
                  placeholder="Gare de départ"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="Gare de départ"
                  className="flex-grow-1"
                  style={{ border: "none", outline: "none", background: "transparent", width: "100%" }}
                />
              </div>

              <div className="planner-input">
                <wcs-mat-icon icon="place"></wcs-mat-icon>
                <input
                  type="text"
                  placeholder="Gare d'arrivée"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="Gare d'arrivée"
                  className="flex-grow-1"
                  style={{ border: "none", outline: "none", background: "transparent", width: "100%" }}
                />
              </div>

              <div
                className="via-button"
                role="button"
                tabIndex={0}
                onClick={() => setShowVia((v) => !v)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setShowVia((v) => !v)}
              >
                {showVia ? "− Via" : "+ Via"}
              </div>
              {showVia && (
                <div className="planner-input">
                  <wcs-mat-icon icon="alt_route"></wcs-mat-icon>
                  <input
                    type="text"
                    placeholder="Gare via (optionnel)"
                    value={via}
                    onChange={(e) => setVia(e.target.value)}
                    aria-label="Gare via"
                    className="flex-grow-1"
                    style={{ border: "none", outline: "none", background: "transparent", width: "100%" }}
                  />
                </div>
              )}

              <div className="d-flex" style={{ gap: "1rem" }}>
                <div className="planner-input flex-grow-1 d-flex align-items-center" style={{ gap: "0.5rem" }}>
                  <wcs-mat-icon icon="calendar_today"></wcs-mat-icon>
                  <span className="value">Aller</span>
                  <input
                    type="date"
                    value={outDate}
                    min={todayIso}
                    onChange={(e) => setOutDate(e.target.value)}
                    aria-label="Date aller"
                    style={{ border: "none", outline: "none", background: "transparent" }}
                  />
                </div>
                <div className="planner-input d-flex align-items-center justify-content-center time-input">
                  <input
                    type="time"
                    value={outTime}
                    onChange={(e) => setOutTime(e.target.value)}
                    aria-label="Heure aller"
                    style={{ border: "none", outline: "none", background: "transparent", textAlign: "center", width: "100%" }}
                  />
                </div>
              </div>

              <div className="planner-input d-flex align-items-center" style={{ gap: "0.5rem" }}>
                <wcs-mat-icon icon="date_range"></wcs-mat-icon>
                <label className="flex-grow-1" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={hasReturn}
                    onChange={(e) => {
                      setHasReturn(e.target.checked);
                      if (!e.target.checked) {
                        setRetDate("");
                        setRetTime("");
                      }
                    }}
                    aria-label="Activer un retour"
                    style={{ marginRight: "0.5rem" }}
                  />
                  Retour (optionnel)
                </label>
                {hasReturn ? (
                  <div className="d-flex align-items-center" style={{ gap: "0.5rem" }}>
                    <input
                      type="date"
                      value={retDate}
                      min={outDate}
                      onChange={(e) => setRetDate(e.target.value)}
                      aria-label="Date retour"
                      style={{ border: "none", outline: "none", background: "transparent" }}
                    />
                    <input
                      type="time"
                      value={retTime}
                      onChange={(e) => setRetTime(e.target.value)}
                      aria-label="Heure retour"
                      className="time-input small"
                      style={{ border: "none", outline: "none", background: "transparent", textAlign: "center", width: "100%" }}
                    />
                  </div>
                ) : (
                  <strong>--:--</strong>
                )}
              </div>

              <div className="planner-input d-flex align-items-center" style={{ gap: "0.5rem" }}>
                <wcs-mat-icon icon="person"></wcs-mat-icon>
                <div className="flex-grow-1 d-flex align-items-center" style={{ gap: "0.5rem" }}>
                  <label htmlFor="nb-voyageurs" className="mb-0">
                    Voyageurs
                  </label>
                  <input
                    id="nb-voyageurs"
                    type="number"
                    min={1}
                    max={9}
                    value={passengers}
                    onChange={(e) => setPassengers(Math.max(1, Math.min(9, Number(e.target.value) || 1)))}
                    aria-label="Nombre de voyageurs"
                    className="numeric-input"
                    style={{ border: "none", outline: "none", background: "transparent", width: "100%" }}
                  />
                  <span>,</span>
                  <label htmlFor="carte-reduction" className="mb-0">
                    Carte
                  </label>
                  <select
                    id="carte-reduction"
                    value={card}
                    onChange={(e) => setCard(e.target.value)}
                    aria-label="Carte de réduction"
                    style={{ border: "none", outline: "none", background: "transparent" }}
                  >
                    <option value="none">Sans carte</option>
                    <option value="avantage">Carte Avantage</option>
                    <option value="liberte">Carte Liberté</option>
                    <option value="jeune">Carte Jeune</option>
                  </select>
                </div>
                <wcs-button mode="clear" shape="round" className="p-0" onClick={() => setPassengers((n) => Math.min(9, n + 1))} aria-label="Ajouter un voyageur">
                  <wcs-mat-icon icon="add"></wcs-mat-icon>
                </wcs-button>
              </div>

              <wcs-button className="search-button" size="l" onClick={onSearch}>
                Rechercher
              </wcs-button>
            </div>
            {/* Pas de colonne info à droite sur cette page */}
          </div>
        </div>
      </div>
    </>
  );
}
