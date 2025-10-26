import "./globals.css";
import "wcs-core/dist/wcs/wcs.css";
import "wcs-core/design-tokens/dist/sncf-voyageurs.css";
import "@sncf/bootstrap-sncf.communication/dist/bootstrap-sncf.css";
import "@sncf/bootstrap-sncf.metier/dist/bootstrap-sncf.min.css";

import React from "react";
import WcsSetup from "./wcs-setup";
import FooterGlobal from "./components/FooterGlobal.jsx";

export default function RootLayout({ children }) {
  // Détection du thème côté serveur (valeur par défaut)

  return (
    <html lang="fr" >
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#ffffff" />
        <title>Ferrovia Connect</title>
        {/* Le script client peut toujours synchroniser le thème après le montage */}

      </head>
      <body className="sncf-voyageurs" >

        <WcsSetup />
        {children}
        <FooterGlobal />
      </body>
    </html>
  );
}
