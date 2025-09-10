"use client";
import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/app/components/Header';

function formatDateTime(dt) {
  if (!dt) return '—';
  try {
    const d = new Date(dt);
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return dt; }
}

const TYPE_META = {
  travaux: { label: 'Travaux', color: 'warning' },
  arret_temporaire: { label: 'Arrêt temporaire', color: 'danger' },
  modif_parcours: { label: 'Modification de parcours', color: 'info' }
};

export default function TravauxEtPerturbationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lignes, setLignes] = useState([]);
  const [perturbations, setPerturbations] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true); setError('');
      try {
        const [resL, resP] = await Promise.all([
          fetch('/api/lignes/public', { cache: 'no-store' }),
          fetch('/api/perturbations/public', { cache: 'no-store' })
        ]);
        const jsonL = await resL.json();
        const jsonP = await resP.json();
        if (!resL.ok) throw new Error(jsonL?.error || 'Erreur chargement lignes');
        if (!resP.ok) throw new Error(jsonP?.error || 'Erreur chargement perturbations');
        if (!alive) return;
        setLignes(jsonL.lignes || []);
        setPerturbations(jsonP.perturbations || []);
      } catch (e) {
        if (!alive) return;
        setError(e.message || 'Erreur');
      } finally { if (alive) setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, []);

  const perturbationsParLigne = useMemo(() => {
    const map = new Map();
    for (const p of perturbations) {
      if (!map.has(p.ligne_id)) map.set(p.ligne_id, []);
      map.get(p.ligne_id).push(p);
    }
    // Tri interne des perturbations par date_debut DESC puis id DESC
    for (const list of map.values()) {
      list.sort((a,b) => (new Date(b.date_debut||b.created_at||0)) - (new Date(a.date_debut||a.created_at||0)) || b.id - a.id);
    }
    return map;
  }, [perturbations]);

  const lignesSansPerturbation = useMemo(() => {
    return lignes.filter(l => !perturbationsParLigne.has(l.id));
  }, [lignes, perturbationsParLigne]);

  async function refreshPerturbations(manual = false) {
    try {
      if (manual) setRefreshing(true);
      const resP = await fetch('/api/perturbations/public', { cache: 'no-store' });
      const jsonP = await resP.json();
      if (resP.ok) {
        setPerturbations(jsonP.perturbations || []);
        setLastUpdate(new Date());
      }
    } catch (e) {
      // silencieux pour auto-refresh
      if (manual) alert(e.message || 'Erreur rafraîchissement');
    } finally { if (manual) setRefreshing(false); }
  }

  // Intervalle de rafraîchissement automatique (60s)
  useEffect(() => {
    const id = setInterval(() => {
      refreshPerturbations(false);
    }, 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <Header />
      <div className="container my-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between mb-3" style={{ gap: '1rem' }}>
          <div>
            <h1 className="h3 m-0">Travaux & perturbations</h1>
            <p className="text-muted mb-0">Consultez la situation des lignes. Les lignes listées ci‑dessous affichent un accordéon si des perturbations sont présentes.</p>
          </div>
          <div className="d-flex align-items-center" style={{ gap: '.5rem' }}>
            {lastUpdate && <span className="text-muted small">MAJ: {lastUpdate.toLocaleTimeString('fr-FR')}</span>}
            <wcs-button size="s" mode="stroked" onClick={() => refreshPerturbations(true)} disabled={refreshing || loading}>
              {refreshing ? 'Rafraîchissement…' : 'Rafraîchir'}
            </wcs-button>
          </div>
        </div>

        {loading && <div>Chargement…</div>}
        {error && <div className="alert alert-warning">{error}</div>}

        {!loading && !error && (
          <>
            {perturbations.length === 0 && (
              <div className="alert alert-success">Aucune perturbation active ou programmée.</div>
            )}

            {/* Lignes avec perturbations */}
            {perturbations.length > 0 && (
              <div className="mb-4">
                <h2 className="h5 mb-3">Lignes impactées</h2>
                <wcs-accordion style={{ display: 'block' }}>
                  {lignes.filter(l => perturbationsParLigne.has(l.id)).map(l => {
                    const list = perturbationsParLigne.get(l.id) || [];
                    const intitule = `${l.depart_name || '??'} → ${l.arrivee_name || '??'}`;
                    return (
                      <wcs-accordion-panel key={l.id} open>
                        <span slot="header" style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', gap: '1rem' }}>
                          <span>
                            <wcs-mat-icon icon="alt_route" class="me-1" />
                            {intitule}
                          </span>
                          <span className="badge bg-primary">{list.length}</span>
                        </span>
                        <wcs-accordion-content>
                          <div className="vstack" style={{ gap: '1rem' }}>
                            {list.map(p => {
                              const meta = TYPE_META[p.type] || { label: p.type, color: 'secondary' };
                              return (
                                <div key={p.id} className="card" style={{ borderLeft: '4px solid var(--wcs-color-primary,#4f46e5)' }}>
                                  <div className="card-body p-3">
                                    <div className="d-flex justify-content-between align-items-start flex-wrap" style={{ gap: '.75rem' }}>
                                      <h3 className="h6 m-0 flex-grow-1">{p.titre}</h3>
                                      <span className={`badge bg-${meta.color}`}>{meta.label}</span>
                                    </div>
                                    {p.description && <p className="mt-2 mb-2" style={{ whiteSpace: 'pre-wrap' }}>{p.description}</p>}
                                    <ul className="list-unstyled small text-muted mb-0">
                                      <li><strong>Début:</strong> {formatDateTime(p.date_debut)}</li>
                                      <li><strong>Fin estimée:</strong> {formatDateTime(p.date_fin)}</li>
                                    </ul>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </wcs-accordion-content>
                      </wcs-accordion-panel>
                    );
                  })}
                </wcs-accordion>
              </div>
            )}

            {/* Lignes sans perturbation */}
            <div>
              <h2 className="h5 mb-3">Toutes les lignes</h2>
              <div className="row g-3">
                {lignes.map(l => {
                  const intitule = `${l.depart_name || '??'} → ${l.arrivee_name || '??'}`;
                  const impactees = perturbationsParLigne.has(l.id);
                  return (
                    <div key={l.id} className="col-md-6 col-lg-4">
                      <div className={`card h-100 ${impactees ? 'border-warning' : ''}`}>
                        <div className="card-body py-3 d-flex flex-column">
                          <div className="d-flex align-items-center mb-2" style={{ gap: '.5rem' }}>
                            <wcs-mat-icon icon="alt_route" />
                            <strong style={{ fontSize: '.95rem' }}>{intitule}</strong>
                          </div>
                          {impactees ? (
                            <span className="badge bg-warning text-dark align-self-start">Perturbations</span>
                          ) : (
                            <span className="badge bg-success align-self-start">OK</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
