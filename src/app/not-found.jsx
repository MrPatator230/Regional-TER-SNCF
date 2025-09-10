import React from "react";
import Link from "next/link";
import Header from "./components/Header";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="container my-5">
        <div className="row justify-content-center">
          <div className="col-12 col-lg-8 text-center">
            <img src="/img/brand/ter-bfc.svg" alt="TER BFC" height="56" className="mb-3" />
            <div className="d-flex align-items-center justify-content-center mb-2" style={{ gap: "0.5rem" }}>
              <wcs-mat-icon icon="search_off" style={{ fontSize: "32px", color: "var(--wcs-primary)" }}></wcs-mat-icon>
              <h1 className="h3 m-0">Page introuvable</h1>
            </div>
            <p className="text-muted mb-4">La page que vous recherchez n'existe pas ou a été déplacée.</p>
            <Link href="/" className="text-decoration-none">
              <wcs-button>
                <wcs-mat-icon icon="home"></wcs-mat-icon>
                <span className="ms-1">Retour à l'accueil</span>
              </wcs-button>
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

