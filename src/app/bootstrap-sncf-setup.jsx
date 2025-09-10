"use client";
import { useEffect } from "react";

// Charge les scripts JS de Bootstrap SNCF côté client pour l'administration
export default function BootstrapSncfSetup() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Communication JS (composants et comportements)
        await import("@sncf/bootstrap-sncf.communication/dist/bootstrap-sncf.js");
        // Optionnel: si des comportements métier sont requis, décommentez la ligne suivante
        // await import("@sncf/bootstrap-sncf.metier/dist/bootstrap-sncf.min.js");
      } catch (e) {
        if (!cancelled) {
          // silencieux: certains environnements SSR peuvent tenter un import côté serveur
          // l'appel est encapsulé dans useEffect donc uniquement côté client
          // eslint-disable-next-line no-console
          console.warn("Bootstrap SNCF JS non chargé:", e);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}

