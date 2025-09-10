import "../../globals.css";
import "wcs-core/dist/wcs/wcs.css";
import "wcs-core/design-tokens/dist/sncf-voyageurs.css";
import "@sncf/bootstrap-sncf.communication/dist/bootstrap-sncf.css";
import "@sncf/bootstrap-sncf.metier/dist/bootstrap-sncf.min.css";

import React from "react";
import WcsSetup from "@/app/wcs-setup";
import Nav from "@/app/espace/admin/components/nav";
import BootstrapSncfSetup from "@/app/bootstrap-sncf-setup";

export default function RootLayout({ children }) {
    const defaultTheme = "light";
    return (
        <html lang="fr" data-theme={defaultTheme}>
        <head>
            <meta charSet="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <meta name="theme-color" content="#ffffff" />
            <title>Ferrovia Connect</title>
            {/* Script: force le thème clair en admin */}
            <script
                dangerouslySetInnerHTML={{
                    __html: `!function(){try{var t='light';var d=document.documentElement,b=document.body;if(d){d.dataset.theme=t}if(b){b.dataset.theme=t;b.classList.remove('dark')}var light=document.getElementById('light'),dark=document.getElementById('dark');if(light) light.disabled=false;if(dark) dark.disabled=true;var meta=document.querySelector('meta[name="theme-color"]');if(meta) meta.setAttribute('content','#ffffff');try{localStorage.setItem('theme','light')}catch(e){}}catch(e){}}();`,
                }}
            />
        </head>
        <body className="sncf-voyageurs">
        <wcs-galactic text="Espace administration">

            <wcs-button id="accessibility-menu-button" mode="clear" size="s">
                Accessibilité
                <wcs-mat-icon size="s" icon="arrow_drop_down"></wcs-mat-icon>
            </wcs-button>
            <wcs-tooltip theme="light" trigger="click" interactive="" htmlFor="accessibility-menu-button">
                <h3>Accessibilité</h3>
                <wcs-switch>Police dyslexie</wcs-switch>
                <wcs-switch>Interlignage augmenté</wcs-switch>

                <h3>Constrastes</h3>
                <wcs-switch checked="">Contrastes renforcés</wcs-switch>
            </wcs-tooltip>
            <div id="tooltip-tippy">
            </div>
            <wcs-button mode="clear" size="s">Langue : FR</wcs-button>

        </wcs-galactic>

        {/* Styles minimaux pour la mise en page avec barre latérale */}
        <style>{`.admin-wrapper{display:flex;gap:1rem;align-items:flex-start;padding:1rem}.admin-sidebar{flex:0 0 260px;max-width:260px}.admin-content{flex:1 1 auto;min-width:0}`}</style>

        <div className="admin-wrapper">
            <aside className="admin-sidebar">

                <Nav/>
            </aside>

            <main className="admin-content">
                {children}
            </main>
        </div>

        {/* Initialisation des Web Components WCS et scripts Bootstrap SNCF (JS) */}
        <WcsSetup/>
        <BootstrapSncfSetup/>

        </body>
        </html>
    );
}
