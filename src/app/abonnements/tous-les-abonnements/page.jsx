"use client";
import React from "react";
import Link from "next/link";
import Header from "@/app/components/Header";

const tickets = [
  {
    id: "billet-ter",
    title: "Billet TER Mobigo",
    description: "Trajet simple ou aller-retour sur le réseau régional.",
    ctaHref: "/se-deplacer/horaires",
  },
  {
    id: "billet-intercites",
    title: "Billet Intercités",
    description: "Voyagez entre grandes villes en toute simplicité.",
    ctaHref: "/se-deplacer/horaires",
  },
  {
    id: "billet-tgv",
    title: "Billet TGV INOUI / Lyria",
    description: "Rapide et confortable pour vos longues distances.",
    ctaHref: "/se-deplacer/horaires",
  },
];

const abonnements = [
  {
    id: "pass-mobigo-flex",
    title: "Pass Mobigo Flex Quotidien",
    description: "L'abonnement illimité pour vos trajets du quotidien en région.",
    droits: [
      "Voyages illimités sur votre périmètre",
      "Échanges gratuits",
      "Réductions partenaires",
    ],
    price: "à partir de 49€/mois",
    ctaHref: "/abonnements/souscrire",
  },
  {
    id: "mobigo-hebdo",
    title: "Abonnement Mobigo Hebdo",
    description: "Idéal pour une semaine intensive de déplacements.",
    droits: [
      "Voyages illimités 7 jours",
      "Support dématérialisé",
      "Assistance dédiée",
    ],
    price: "à partir de 19€/semaine",
    ctaHref: "/abonnements/souscrire",
  },
  {
    id: "mobigo-mensuel",
    title: "Abonnement Mobigo Mensuel",
    description: "Pour les navetteurs réguliers sur un mois.",
    droits: [
      "Voyages illimités 30 jours",
      "Renouvellement simple",
      "Tarifs adaptés",
    ],
    price: "à partir de 59€/mois",
    ctaHref: "/abonnements/souscrire",
  },
];

export default function TousLesAbonnementsPage() {
  return (
    <>
      <Header />
      <main className="container my-4">
        <div className="row">
          <div className="col-12">
            <h1 className="h2 mb-3">Tous les abonnements et billets</h1>
            <p className="text-muted mb-4">
              Retrouvez ici les tickets disponibles à l'achat et nos abonnements pour voyager plus souvent à petit prix.
            </p>
          </div>
        </div>

        {/* Section Tickets */}
        <section className="mb-5">
          <h2 className="h4 mb-3">Tickets</h2>
          <div className="row g-3">
            {tickets.map((t) => (
              <div className="col-12 col-md-6 col-lg-4" key={t.id}>
                <div className="card h-100 d-flex flex-column">
                  <div className="card-body d-flex flex-column">
                    <h3 className="h5 fw-semibold mb-2">{t.title}</h3>
                    <p className="flex-grow-1 mb-3">{t.description}</p>
                    <Link href={t.ctaHref} className="text-decoration-none align-self-start">
                      <wcs-button>
                        <wcs-mat-icon icon="shopping_basket"></wcs-mat-icon>
                        <span className="ms-1">Acheter</span>
                      </wcs-button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section Abonnements */}
        <section className="mb-5">
          <h2 className="h4 mb-3">Abonnements</h2>
          <div className="row g-3">
            {abonnements.map((a) => (
              <div className="col-12 col-md-6" key={a.id}>
                <div className="card h-100">
                  <div className="card-body d-flex flex-column">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <h3 className="h5 fw-bold m-0">{a.title}</h3>
                      <span className="badge bg-primary-subtle text-primary fw-semibold">{a.price}</span>
                    </div>
                    <p className="mb-3">{a.description}</p>
                    <ul className="mb-4">
                      {a.droits.map((droit, idx) => (
                        <li key={idx}>{droit}</li>
                      ))}
                    </ul>
                    <div>
                      <Link href={a.ctaHref} className="text-decoration-none">
                        <wcs-button>
                          <wcs-mat-icon icon="assignment_add"></wcs-mat-icon>
                          <span className="ms-1">Souscrire</span>
                        </wcs-button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

