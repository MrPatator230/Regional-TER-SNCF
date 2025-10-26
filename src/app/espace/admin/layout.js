"use client";

import "../../globals.css";
import "wcs-core/dist/wcs/wcs.css";
import "wcs-core/design-tokens/dist/sncf-reseau.css";
import "@sncf/bootstrap-sncf.communication/dist/bootstrap-sncf.css";
import "@sncf/bootstrap-sncf.metier/dist/bootstrap-sncf.min.css";

import React, { useEffect, useRef } from "react";
import WcsSetup from "@/app/wcs-setup";
import Nav from "@/app/espace/admin/components/nav";

export default function AdminLayout({ children }) {
  const tooltipRef = useRef(null);

  useEffect(() => {
    // Some WCS tooltips expect a 'for' attribute
    try {
      if (tooltipRef.current && typeof tooltipRef.current.setAttribute === 'function') {
        tooltipRef.current.setAttribute('for', 'accessibility-menu-button');
      }
    } catch (e) {
      // ignore
    }
  }, []);

  return (
    <>
      {/* Setup nécessaire pour les composants WCS */}
      <WcsSetup />

      {/* Barre haute d'actions (composants web WCS) */}
      <div className="admin-topbar">
        <wcs-galactic text="Espace administration">
          <wcs-button id="accessibility-menu-button" mode="clear" size="s">
            Accessibilité
            <wcs-mat-icon size="s" icon="arrow_drop_down" />
          </wcs-button>

          <wcs-tooltip ref={tooltipRef} theme="light" trigger="click" interactive>
            <h3>Accessibilité</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <wcs-switch>Police dyslexie</wcs-switch>
              <wcs-switch>Interlignage augmenté</wcs-switch>
            </div>

            <h3 style={{ marginTop: 12 }}>Contrastes</h3>
            <wcs-switch>Contrastes renforcés</wcs-switch>
          </wcs-tooltip>

          <div style={{ marginLeft: 12 }}>
            <wcs-button mode="clear" size="s">Langue : FR</wcs-button>
          </div>
        </wcs-galactic>
      </div>

      {/* Layout principal : sidebar + contenu */}
      <div className="admin-wrapper">
        <aside className="admin-sidebar" aria-label="Navigation administration">
          <Nav />
        </aside>

        <main className="admin-content" role="main">
          {children}
        </main>
      </div>

      {/* Styles locaux pour la layout admin */}
      <style jsx global>{`
        .admin-topbar { padding: 12px 18px; background: #fff; box-shadow: 0 1px 0 rgba(0,0,0,0.04); z-index: 50; }
        .admin-wrapper{ display: flex; gap: 16px; align-items: flex-start; padding: 18px; box-sizing: border-box; }
        .admin-sidebar{ flex: 0 0 280px; max-width: 280px; }
        .admin-content{ flex: 1 1 auto; min-width: 0; background: transparent; }

        /* Small screens: sidebar becomes top stacked */
        @media (max-width: 900px) {
          .admin-wrapper{ flex-direction: column; padding: 12px; }
          .admin-sidebar{ width: 100%; max-width: none; }
        }
      `}</style>
    </>
  );
}
