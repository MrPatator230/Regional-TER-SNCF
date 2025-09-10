"use client";
import React, { useEffect } from "react";
import Link from "next/link";
import Header from "./components/Header";

export default function Error({ error, reset }) {
  useEffect(() => {
    // Optionnel: log côté client pour faciliter le debug
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <>
      <Header />
      <main className="container my-5">
        <div className="row justify-content-center">
          <div className="col-12 col-lg-8 text-center">
            <img src="/img/brand/ter-bfc.svg" alt="TER BFC" height="56" className="mb-3" />
            <div className="d-flex align-items-center justify-content-center mb-2" style={{ gap: "0.5rem" }}>
              <wcs-mat-icon icon="warning_amber" style={{ fontSize: "32px", color: "var(--wcs-warning)" }}></wcs-mat-icon>
              <h1 className="h3 m-0">Oups, une erreur est survenue</h1>
            </div>
            <p className="text-muted mb-4">Un problème est survenu lors du chargement de la page. Vous pouvez retenter ou revenir à l'accueil.</p>
            {error?.message && (
              <details className="mb-4">
                <summary>Détails techniques</summary>
                <pre className="text-start bg-light p-3 rounded" style={{ whiteSpace: "pre-wrap" }}>{String(error.message)}</pre>
              </details>
            )}
            <div className="d-flex justify-content-center gap-2">
              {typeof reset === "function" && (
                <wcs-button onClick={() => reset()}>
                  <wcs-mat-icon icon="refresh"></wcs-mat-icon>
                  <span className="ms-1">Réessayer</span>
                </wcs-button>
              )}
              <Link href="/" className="text-decoration-none">
                <wcs-button>
                  <wcs-mat-icon icon="home"></wcs-mat-icon>
                  <span className="ms-1">Retour à l'accueil</span>
                </wcs-button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

