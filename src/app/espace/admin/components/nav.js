"use client";
import React from "react";
import "@sncf/bootstrap-sncf.communication/dist/bootstrap-sncf";
import Link from "next/link";

export default function AdminNav() {
  return (
    <>
      <div style={{ width: 100 }}>
        <wcs-nav aria-label="Main menu">
          <wcs-nav-item className="active">
            <Link href="/espace/admin">
              <wcs-mat-icon icon="home"></wcs-mat-icon>
              <span>Tableau de bord</span>
            </Link>
          </wcs-nav-item>

          <wcs-nav-item className="">
            <Link href="/espace/admin/stations">
              <wcs-mat-icon icon="place"></wcs-mat-icon>
              <span>Gares</span>
            </Link>
          </wcs-nav-item>

          <wcs-nav-item className="">
            <Link href="/espace/admin/schedules">
              <wcs-mat-icon icon="schedule"></wcs-mat-icon>
              <span>Sillons (Horaires)</span>
            </Link>
          </wcs-nav-item>

          <wcs-nav-item className="">
            <Link href="/espace/admin/lignes">
              <wcs-mat-icon icon="alt_route"></wcs-mat-icon>
              <span>Lignes</span>
            </Link>
          </wcs-nav-item>

          <wcs-nav-item className="">
            <Link href="/espace/admin/materiel-roulant">
              <wcs-mat-icon icon="train"></wcs-mat-icon>
              <span>Matériel Roulant</span>
            </Link>
          </wcs-nav-item>

          <wcs-nav-item className="">
            <Link href="/espace/admin/region">
              <wcs-mat-icon icon="build"></wcs-mat-icon>
              <span>Paramètre de l’exploitant</span>
            </Link>
          </wcs-nav-item>

          <wcs-nav-item className="">
            <Link href="/espace/admin/actualites">
              <wcs-mat-icon icon="article"></wcs-mat-icon>
              <span>Gestion de la diffusion d’infos</span>
            </Link>
          </wcs-nav-item>

          <wcs-nav-item className="">
            <Link href="/espace/admin/afficheurs">
              <wcs-mat-icon icon="display_settings"></wcs-mat-icon>
              <span>Afficheurs</span>
            </Link>
          </wcs-nav-item>

          <wcs-nav-item className="">
            <Link href="/espace/admin/perturbations">
              <wcs-mat-icon icon="warning"></wcs-mat-icon>
              <span>Perturbations sillons</span>
            </Link>
          </wcs-nav-item>

          <wcs-nav-item className="">
            <Link href="/espace/admin/quais">
              <wcs-mat-icon icon="view_week"></wcs-mat-icon>
              <span>Attribution des quais</span>
            </Link>
          </wcs-nav-item>

          <wcs-nav-item className="">
            <Link href="/espace/admin/fiches-horaires">
              <wcs-mat-icon icon="picture_as_pdf"></wcs-mat-icon>
              <span>Fiches horaires</span>
            </Link>
          </wcs-nav-item>
        </wcs-nav>
      </div>
    </>
  );
}
