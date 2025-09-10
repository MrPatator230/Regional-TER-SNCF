"use client";
import React from 'react';
import Link from 'next/link';

/**
 * Bandeau d'information affichant les détails d'une perturbation
 * @param {Object} props
 * @param {Object} props.perturbation - Données de la perturbation
 */
export default function PerturbationBanner({ perturbation, mode = 'classic' }) {
  if (!perturbation) return null;

  // Formatage des dates pour l'affichage
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  };

  // Format l'heure depuis une chaîne ISO ou une heure simple
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    if (timeStr.includes('T')) {
      try {
        const date = new Date(timeStr);
        return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return timeStr;
      }
    }
    return timeStr;
  };

  // Mode classique : une seule ligne icône + Information
  if (mode === 'classic') {
    return (
      <div className="perturbation-banner-classic" style={{display:'flex',alignItems:'center',gap:'8px',background:'#e6f4fa',borderRadius:'4px',padding:'0.5px 12px',color:'#0088ce',fontWeight:600}}>
        <span className="perturbation-icon" aria-hidden="true" style={{fontSize:'20px'}}>
          <wcs-mat-icon icon="info" aria-hidden="true"></wcs-mat-icon>
        </span>
        <span className="perturbation-title">Information</span>
      </div>
    );
  }

  // Mode détail : card Information avec cause
  if (mode === 'detail') {
    return (
      <div className="perturbation-banner-detail" style={{background:'#e6f4fa',borderLeft:'4px solid #0088ce',borderRadius:'4px',padding:'16px',marginBottom:'16px',display:'flex',alignItems:'flex-start',gap:'12px'}}>
        <span className="perturbation-icon" aria-hidden="true" style={{fontSize:'24px',color:'#0088ce',marginTop:'2px'}}>
          <wcs-mat-icon icon="info" aria-hidden="true"></wcs-mat-icon>
        </span>
        <div>
          <div style={{fontWeight:700,color:'#0088ce',marginBottom:'4px'}}>Information</div>
          <div className="perturbation-cause" style={{color:'#333'}}>{perturbation.data?.cause || 'Aucune cause précisée.'}</div>
        </div>
      </div>
    );
  }

  // Contenu du bandeau en fonction du type de perturbation
  const renderPerturbationContent = () => {
    const { type, titre, description, date_debut, date_fin, data } = perturbation;

    const dateDebut = formatDate(date_debut);
    const dateFin = formatDate(date_fin);

    // Heures de perturbation pour les travaux
    let horaires = '';
    if (data?.horaire_interruption) {
      horaires = `${data.horaire_interruption.debut || ''} - ${data.horaire_interruption.fin || ''}`;
    }

    switch (type) {
      case 'travaux':
        return (
          <>
            <div className="perturbation-header">
              <strong>{titre}</strong>
              {dateDebut && dateFin && (
                <span className="perturbation-date">Du {dateDebut} au {dateFin}</span>
              )}
              {horaires && <span className="perturbation-hours">de {horaires}</span>}
            </div>
            {description && <div className="perturbation-description">{description}</div>}
            {data?.jours && data.jours.length > 0 && (
              <div className="perturbation-days">
                Jours concernés : {data.jours.join(', ')}
              </div>
            )}
          </>
        );

      case 'modif_parcours':
        return (
          <>
            <div className="perturbation-header">
              <strong>{titre}</strong>
              {dateDebut && <span className="perturbation-date">À partir du {dateDebut}</span>}
            </div>
            {description && <div className="perturbation-description">{description}</div>}
          </>
        );

      case 'arret_temporaire':
        return (
          <>
            <div className="perturbation-header">
              <strong>{titre}</strong>
              {dateFin && <span className="perturbation-date">Reprise prévue : {dateFin}</span>}
            </div>
            {description && <div className="perturbation-description">{description}</div>}
            {data?.cause && <div className="perturbation-cause">Cause : {data.cause}</div>}
          </>
        );

      default:
        return (
          <>
            <div className="perturbation-header">
              <strong>{titre}</strong>
            </div>
            {description && <div className="perturbation-description">{description}</div>}
          </>
        );
    }
  };

  return (
    <div className="perturbation-banner">
      <div className="perturbation-icon">
        <wcs-mat-icon icon="warning" aria-hidden="true"></wcs-mat-icon>
      </div>
      <div className="perturbation-content">
        {renderPerturbationContent()}
        <Link href={`/se-deplacer/travaux/${perturbation.id}`} className="perturbation-link">
          Plus d'informations
        </Link>
      </div>
      <style jsx>{`
        .perturbation-banner {
          background-color: #fff8e1;
          border-left: 4px solid #ffc107;
          padding: 12px;
          margin: 8px 0;
          display: flex;
          align-items: flex-start;
          border-radius: 4px;
        }
        .perturbation-icon {
          color: #ff9800;
          margin-right: 12px;
          display: flex;
          align-items: center;
        }
        .perturbation-content {
          flex: 1;
        }
        .perturbation-header {
          margin-bottom: 4px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: baseline;
        }
        .perturbation-description {
          margin-bottom: 8px;
        }
        .perturbation-date, .perturbation-hours, .perturbation-days, .perturbation-cause {
          font-size: 0.9em;
          color: #666;
        }
        .perturbation-link {
          font-size: 0.9em;
          text-decoration: underline;
          color: #0055a4;
          display: inline-block;
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
}
