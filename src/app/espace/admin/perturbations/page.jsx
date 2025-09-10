"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";

export default function PerturbationsAdmin() {
  const [tab, setTab] = useState("lignes");
  const [perturbations, setPerturbations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (tab === "lignes") {
      setLoading(true);
      fetch("/api/perturbations?type=lignes")
        .then((res) => res.json())
        .then((data) => {
          // Toujours stocker un tableau
          if (Array.isArray(data)) {
            setPerturbations(data);
          } else if (data && Array.isArray(data.perturbations)) {
            setPerturbations(data.perturbations);
          } else {
            setPerturbations([]);
          }
          setLoading(false);
        })
        .catch((e) => {
          setError("Erreur lors du chargement");
          setPerturbations([]);
          setLoading(false);
        });
    }
  }, [tab]);

  return (
    <div>
      <h1>Perturbations</h1>
      <div className="mb-4">
        <button
          className={
            tab === "lignes"
              ? "btn btn-primary me-2"
              : "btn btn-outline-primary me-2"
          }
          onClick={() => setTab("lignes")}
        >
          Lignes
        </button>
        <button
          className={
            tab === "sillons" ? "btn btn-primary" : "btn btn-outline-primary"
          }
          onClick={() => setTab("sillons")}
        >
          Sillons
        </button>
      </div>
      {tab === "lignes" && (
        <div>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 className="h5">Perturbations par ligne</h2>
            <Link
              href="/espace/admin/perturbations/lignes/creation"
              className="btn btn-success"
            >
              Créer
            </Link>
          </div>
          <div id="perturbations-lignes-list">
            {loading && <p>Chargement…</p>}
            {error && <p className="text-danger">{error}</p>}
            {!loading && !error && (
              <div className="table-responsive">
                <table className="table table-bordered table-hover align-middle">
                  <thead>
                    <tr>
                      <th>Titre</th>
                      <th>Type</th>
                      <th>Ligne</th>
                      <th>Début</th>
                      <th>Fin</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(perturbations) && perturbations.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center">
                          Aucune perturbation
                        </td>
                      </tr>
                    ) : (
                      Array.isArray(perturbations) && perturbations.map((p) => (
                        <tr key={p.id}>
                          <td>{p.titre}</td>
                          <td>{p.type}</td>
                          <td>{p.ligne_nom ? p.ligne_nom : "-"}</td>
                          <td>
                            {p.date_debut
                              ? new Date(p.date_debut).toLocaleDateString()
                              : "-"}
                          </td>
                          <td>
                            {p.date_fin
                              ? new Date(p.date_fin).toLocaleDateString()
                              : "-"}
                          </td>
                          <td>{p.statut || "-"}</td>
                          <td>
                            <Link
                              href={`/espace/admin/perturbations/lignes/${p.id}`}
                              className="btn btn-sm btn-outline-primary me-1"
                            >
                              Voir
                            </Link>
                            <Link
                              href={`/espace/admin/perturbations/lignes/edition/${p.id}`}
                              className="btn btn-sm btn-outline-secondary me-1"
                            >
                              Éditer
                            </Link>
                            <button className="btn btn-sm btn-outline-danger">
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "sillons" && (
        <div>
          <h2 className="h5">Perturbations par sillon</h2>
          {/* À implémenter : gestion des perturbations sillons */}
          <p>Gestion des perturbations sillons à venir…</p>
        </div>
      )}
    </div>
  );
}
