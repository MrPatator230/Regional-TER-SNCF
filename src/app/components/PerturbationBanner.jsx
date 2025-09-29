"use client";
import React from 'react';

export default function PerturbationBanner({ perturbation }) {
  if (!perturbation) return null;

  // Helpers pour extraire les infos possibles depuis plusieurs shapes d'API
  const getType = () => {
    return String(perturbation.type || perturbation.data?.type || perturbation.titre || '').toLowerCase();
  };
  const getDelayMinutes = () => {
    const candidates = [perturbation.data?.retard_min, perturbation.data?.delay_min, perturbation.delay_min, perturbation.delay, perturbation.retard_min, perturbation.minutes];
    for (const c of candidates) {
      if (typeof c === 'number' && !Number.isNaN(c)) return c;
      if (typeof c === 'string' && c.trim() !== '' && !Number.isNaN(Number(c))) return Number(c);
    }
    return null;
  };
  const getCause = () => {
    return perturbation.cause || perturbation.data?.cause || perturbation.description || perturbation.data?.description || perturbation.reason || null;
  };

  const type = getType();
  const mins = getDelayMinutes();
  const cause = getCause();

  // Déterminer le variant: cancel | delay | default
  const isCancel = type.includes('supprim') || type.includes('annul') || type.includes('cancel') || !!perturbation.cancelled;
  const isDelay = type.includes('retard') || type.includes('delay') || mins != null;

  let text;
  if (isCancel) {
    text = 'Supprimé';
    if (cause) text += ` — ${cause}`;
  } else if (isDelay) {
    // Afficher le type si fourni (ex: 'Retard') puis le temps
    const label = 'Retard';
    if (mins != null) text = `${label} estimé ${mins} min` + (cause ? ` — ${cause}` : '');
    else text = `${label}` + (cause ? ` — ${cause}` : '');
  } else if (perturbation.titre || perturbation.title) {
    text = perturbation.titre || perturbation.title;
    if (cause && !text.includes(cause)) text += ` — ${cause}`;
  } else if (perturbation.description) {
    text = perturbation.description;
  } else {
    text = 'Perturbation';
  }

  // Choix de l'icône et des classes
  const iconName = isCancel ? 'report' : (isDelay ? 'schedule' : 'info');
  const variantClass = isCancel ? 'pb-cancel' : (isDelay ? 'pb-delay' : 'pb-default');
  const iconTitle = isCancel ? 'Train supprimé' : (isDelay ? 'Retard estimé' : 'Information');

  return (
    <div className={`perturbation-banner ${variantClass}`} role="note" aria-live="polite">
      <span className="pb-icon" aria-hidden="true" title={iconTitle}><wcs-mat-icon icon={iconName}></wcs-mat-icon></span>
      <span className="pb-text">{text}</span>

      <style jsx>{`
        .perturbation-banner { display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:4px; font-weight:600; font-size:0.95rem; position:relative; margin-top:8px; }
        .perturbation-banner::before { content: ''; position: absolute; top: -8px; left: 18px; width:0; height:0; border-left:8px solid transparent; border-right:8px solid transparent; border-bottom:8px solid var(--pb-triangle-color, transparent); }
        .perturbation-banner .pb-icon { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; flex:0 0 28px; border-radius:50%; }
        .perturbation-banner .pb-icon wcs-mat-icon { font-size:16px; }
        .perturbation-banner .pb-text { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        /* Cancel: rouge (icône blanche sur cercle rouge, fond clair) */
        .perturbation-banner.pb-cancel { background:#fdecea; border-left:0; color:#9b1b1b; --pb-triangle-color: #fdecea; }
        .perturbation-banner.pb-cancel .pb-icon { background:#b30000; color:#fff; }

        /* Delay: orange (icône blanche sur cercle orange, fond pâle) */
        .perturbation-banner.pb-delay { background:#fff4e6; border-left:0; color:#8a4a06; --pb-triangle-color: #fff4e6; }
        .perturbation-banner.pb-delay .pb-icon { background:#b35900; color:#fff; }

        /* Default: pale */
        .perturbation-banner.pb-default { background:#eef4fb; border-left:0; color:#0b637f; --pb-triangle-color: #eef4fb; }
        .perturbation-banner.pb-default .pb-icon { background:#0b637f; color:#fff; }

        /* Assurer qu'on garde une ligne compacte dans le tableau */
        @media (max-width: 720px) {
          .perturbation-banner { font-size:0.9rem; }
        }
      `}</style>
    </div>
  );
}
