import "./globals.css";
import "wcs-core/dist/wcs/wcs.css";
import "wcs-core/design-tokens/dist/sncf-voyageurs.css";
import "@sncf/bootstrap-sncf.communication/dist/bootstrap-sncf.css";
import "@sncf/bootstrap-sncf.metier/dist/bootstrap-sncf.min.css";

import React from "react";
import WcsSetup from "./wcs-setup";
import FooterGlobal from "./components/FooterGlobal.jsx";
import {achemineFont} from "@/fonts/achemine";

export default function RootLayout({ children }) {
  // Détection du thème côté serveur (valeur par défaut)
  const defaultTheme = "light";
  return (
    <html lang="fr" data-theme={defaultTheme}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#ffffff" />
        <title>Ferrovia Connect</title>
        {/* Le script client peut toujours synchroniser le thème après le montage */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "!function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement&&(document.documentElement.dataset.theme=t);if(document.body){document.body.dataset.theme=t;document.body.classList.toggle('dark',t==='dark')}}catch(e){}}();",
          }}
        />
        <link href="/css/bootstrap-sncf.min.css" rel="stylesheet" id={"light"} />

      </head>
      <body className="sncf-voyageurs" >

        <WcsSetup />
        {children}
        <FooterGlobal />
      </body>
    </html>
  );
}
