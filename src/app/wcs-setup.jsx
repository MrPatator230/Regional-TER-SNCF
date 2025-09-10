"use client";
import { useEffect } from "react";

export default function WcsSetup() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Charge les Web Components WCS côté client
    import("wcs-core/loader").then(({ defineCustomElements }) => {
      try {
        defineCustomElements(window);
      } catch (_) {
        // ignore si déjà défini
      }
    });
  }, []);

  return null;
}
