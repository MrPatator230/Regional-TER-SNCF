"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Editor } from '@tinymce/tinymce-react';

const ETAPES = [
  "Général",
  "Diffusion",
  "Contenu",
  "Circulation",
  "Substitutions",
  "Récapitulatif"
];

const PERTURB_TYPES = [
  { value: "travaux", label: "Travaux" },
  { value: "infos", label: "Information" },
  { value: "avertissement", label: "Avertissement" },
];

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export default function CreationPerturbationLigne() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    type: "travaux",
    ligne_id: "",
    date_debut: "",
    date_fin: "",
    jours: [],
    heure_debut: "",
    heure_fin: "",
    titre: "",
    contenu: "",
    impact_circulation: false,
    sillons_impactes: [],
    substitutions: false,
    sillons_substitution: [],
  });
  const [saving, setSaving] = useState(false);
  const [lignes, setLignes] = useState([]);
  const [loadingLignes, setLoadingLignes] = useState(true);
  const [errorLignes, setErrorLignes] = useState("");
  const [sillons, setSillons] = useState([]);
  const [loadingSillons, setLoadingSillons] = useState(false);
  const [errorSillons, setErrorSillons] = useState("");
  const [sillonsSub, setSillonsSub] = useState([]);
  const [loadingSillonsSub, setLoadingSillonsSub] = useState(false);
  const [errorSillonsSub, setErrorSillonsSub] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function fetchLignes() {
      setLoadingLignes(true);
      setErrorLignes("");
      try {
        const res = await fetch("/api/lignes", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Erreur chargement lignes");
        setLignes(data.lignes || []);
      } catch (e) {
        setErrorLignes(e.message || "Erreur de chargement");
      } finally {
        setLoadingLignes(false);
      }
    }
    fetchLignes();
  }, []);

  useEffect(() => {
    // Charger les sillons si on est à l'étape Circulation, que l'impact est coché, et que tout est rempli
    if (
      step === 3 &&
      form.type === "travaux" &&
      form.impact_circulation &&
      form.ligne_id &&
      form.date_debut &&
      form.date_fin &&
      form.heure_debut &&
      form.heure_fin
    ) {
      async function fetchSillons() {
        setLoadingSillons(true);
        setErrorSillons("");
        try {
          const res = await fetch(`/api/schedules?ligne_id=${form.ligne_id}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "Erreur chargement sillons");
          // Filtrer par heure de début/fin
          const toM = t => { const [H, M] = String(t || '').split(":").map(Number); return (H || 0) * 60 + (M || 0); };
          const sM = toM(form.heure_debut), eM = toM(form.heure_fin);
          const inRange = t => {
            const m = toM(t);
            return sM <= eM ? (m >= sM && m <= eM) : (m >= sM || m <= eM);
          };
          const filtered = (Array.isArray(data) ? data : []).filter(s => inRange(s.departure_time || s.departureTime));
          setSillons(filtered);
        } catch (e) {
          setErrorSillons(e.message || "Erreur de chargement");
          setSillons([]);
        } finally {
          setLoadingSillons(false);
        }
      }
      fetchSillons();
    }
  }, [step, form.type, form.impact_circulation, form.ligne_id, form.date_debut, form.date_fin, form.heure_debut, form.heure_fin]);

  useEffect(() => {
    if (
      step === 4 &&
      form.type === "travaux" &&
      form.substitutions &&
      form.ligne_id &&
      form.date_debut &&
      form.date_fin
    ) {
      async function fetchSillonsSub() {
        setLoadingSillonsSub(true);
        setErrorSillonsSub("");
        try {
          const res = await fetch(`/api/schedules?ligne_id=${form.ligne_id}&is_substitution=1`);
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "Erreur chargement sillons substitution");
          setSillonsSub(Array.isArray(data) ? data : []);
        } catch (e) {
          setErrorSillonsSub(e.message || "Erreur de chargement");
          setSillonsSub([]);
        } finally {
          setLoadingSillonsSub(false);
        }
      }
      fetchSillonsSub();
    }
  }, [step, form.type, form.substitutions, form.ligne_id, form.date_debut, form.date_fin]);

  const nextStep = () => setStep(s => Math.min(ETAPES.length - 1, s + 1));
  const prevStep = () => setStep(s => Math.max(0, s - 1));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        ligne_id: form.ligne_id,
        titre: form.titre,
        description: form.contenu,
        date_debut: form.date_debut ? `${form.date_debut}T${form.heure_debut || '00:00'}` : null,
        date_fin: form.date_fin ? `${form.date_fin}T${form.heure_fin || '23:59'}` : null,
        data: {
          jours: form.jours,
          horaire_interruption: form.type === 'travaux' ? { debut: form.heure_debut, fin: form.heure_fin } : undefined,
          exclude_schedules: form.type === 'travaux' && form.impact_circulation ? form.sillons_impactes : undefined,
          substitutions: form.type === 'travaux' && form.substitutions ? form.sillons_substitution : undefined,
        }
      };
      // Nettoyage des undefined
      Object.keys(payload.data).forEach(k => payload.data[k] === undefined && delete payload.data[k]);
      const res = await fetch('/api/perturbations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json())?.error || 'Erreur lors de la création');
      setSaving(false);
      router.push("/espace/admin/perturbations");
    } catch (e) {
      alert(e.message || 'Erreur lors de la création');
      setSaving(false);
    }
  };

  return (
    <div>
      <h1>Créer une perturbation sur une ligne</h1>
      {/* Stepper React custom, remplace le WCS */}
      <div className="sncf-stepper mb-4">
        <ol className="sncf-stepper-list d-flex flex-row list-unstyled p-0 m-0">
          {ETAPES.map((etape, idx) => (
            <li key={etape} className={
              'sncf-stepper-step flex-fill text-center ' +
              (idx < step ? 'completed' : idx === step ? 'active' : 'upcoming')
            }>
              <div className="sncf-stepper-circle mx-auto mb-1">
                {idx < step ? <span>&#10003;</span> : idx + 1}
              </div>
              <div className="sncf-stepper-label small">{etape}</div>
            </li>
          ))}
        </ol>
      </div>
      <style jsx>{`
        .sncf-stepper-list { counter-reset: step; }
        .sncf-stepper-step { position: relative; }
        .sncf-stepper-circle {
          width: 2.2em; height: 2.2em; border-radius: 50%;
          background: #e9ecef; color: #6c757d; display: flex; align-items: center; justify-content: center;
          font-weight: bold; font-size: 1.1em; border: 2px solid #e9ecef;
        }
        .sncf-stepper-step.active .sncf-stepper-circle {
          background: #0070f3; color: #fff; border-color: #0070f3;
        }
        .sncf-stepper-step.completed .sncf-stepper-circle {
          background: #43a047; color: #fff; border-color: #43a047;
        }
        .sncf-stepper-step:not(:last-child)::after {
          content: '';
          position: absolute; top: 50%; right: -50%; left: 50%; height: 4px;
          background: #e9ecef; z-index: 0; transform: translateY(-50%);
        }
        .sncf-stepper-step.completed:not(:last-child)::after {
          background: #43a047;
        }
        .sncf-stepper-step.active .sncf-stepper-label {
          color: #0070f3;
        }
        .sncf-stepper-step.completed .sncf-stepper-label {
          color: #43a047;
        }
      `}</style>
      <div className="mb-4 d-flex gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={prevStep} disabled={step === 0}>Previous</button>
        <button type="button" className="btn btn-outline-primary" onClick={nextStep} disabled={((form.type !== "travaux" && step >= 3) || (form.type === "travaux" && step >= 5))}>Next</button>
      </div>
      <form onSubmit={handleSubmit}>
        {step === 0 && (
          <div>
            <h2 className="h5">Général</h2>
            <div className="mb-3">
              <label className="form-label">Type de perturbation</label>
              <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} required>
                {PERTURB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Ligne concernée</label>
              {loadingLignes ? (
                <div>Chargement des lignes…</div>
              ) : errorLignes ? (
                <div className="text-danger">{errorLignes}</div>
              ) : (
                <select className="form-select" value={form.ligne_id} onChange={e => setForm(f => ({ ...f, ligne_id: e.target.value }))} required>
                  <option value="">Choisir…</option>
                  {lignes.map(l => (
                    <option key={l.id} value={l.id}>{l.nom || l.name || `Ligne #${l.id}`}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            <h2 className="h5">Diffusion</h2>
            <div className="mb-3">
              <label className="form-label">Date de début de diffusion</label>
              <input type="date" className="form-control" value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))} required />
            </div>
            <div className="mb-3">
              <label className="form-label">Date de fin de diffusion</label>
              <input type="date" className="form-control" value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))} required />
            </div>
            {form.type === "travaux" && (
              <>
                <div className="mb-3">
                  <label className="form-label">Jours de travaux</label>
                  <div className="d-flex flex-wrap gap-2">
                    {JOURS.map((j, idx) => (
                      <label key={j} className="form-check">
                        <input type="checkbox" className="form-check-input" checked={form.jours.includes(idx)} onChange={e => {
                          setForm(f => ({
                            ...f,
                            jours: e.target.checked ? [...f.jours, idx] : f.jours.filter(d => d !== idx)
                          }));
                        }} />
                        <span className="form-check-label ms-1">{j}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="mb-3 row">
                  <div className="col-md-6">
                    <label className="form-label">Heure de début des travaux</label>
                    <input type="time" className="form-control" value={form.heure_debut} onChange={e => setForm(f => ({ ...f, heure_debut: e.target.value }))} required={form.type === "travaux"} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Heure de fin des travaux</label>
                    <input type="time" className="form-control" value={form.heure_fin} onChange={e => setForm(f => ({ ...f, heure_fin: e.target.value }))} required={form.type === "travaux"} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        {step === 2 && (
          <div>
            <h2 className="h5">Contenu</h2>
            <div className="mb-3">
              <label className="form-label">Titre</label>
              <input
                type="text"
                className="form-control"
                value={form.titre}
                onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Contenu</label>
              <Editor
                apiKey="1l7z08kf4ai6ze5gyn4g3ge34a69w9m07arnmj0cvug2ptp8"
                value={form.contenu}
                init={{
                  height: 200,
                  menubar: false,
                  plugins: [
                    'advlist autolink lists link image charmap preview anchor',
                    'searchreplace visualblocks code fullscreen',
                    'insertdatetime media table paste help wordcount'
                  ],
                  toolbar:
                    'undo redo | formatselect | bold italic underline | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | removeformat | help',
                }}
                onEditorChange={val => setForm(f => ({ ...f, contenu: val }))}
              />
            </div>
          </div>
        )}
        {step === 3 && form.type === "travaux" && (
          <div>
            <h2 className="h5">Circulation</h2>
            <div className="form-check mb-3">
              <input
                type="checkbox"
                className="form-check-input"
                id="impact-circulation"
                checked={form.impact_circulation}
                onChange={e => setForm(f => ({ ...f, impact_circulation: e.target.checked, sillons_impactes: [] }))}
              />
              <label className="form-check-label ms-1" htmlFor="impact-circulation">
                Cette perturbation impacte la circulation sur la ligne
              </label>
            </div>
            {form.impact_circulation && (
              <div>
                {loadingSillons ? (
                  <div>Chargement des sillons…</div>
                ) : errorSillons ? (
                  <div className="text-danger">{errorSillons}</div>
                ) : sillons.length === 0 ? (
                  <div className="text-muted">Aucun sillon trouvé pour la période et la plage horaire sélectionnées.</div>
                ) : (
                  <div>
                    <div className="mb-2">Sélectionnez les sillons qui ne circuleront pas :</div>
                    <div className="list-group">
                      {sillons.map(s => (
                        <label key={s.id} className="list-group-item d-flex align-items-center gap-2">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={form.sillons_impactes.includes(s.id)}
                            onChange={e => setForm(f => ({
                              ...f,
                              sillons_impactes: e.target.checked
                                ? [...f.sillons_impactes, s.id]
                                : f.sillons_impactes.filter(id => id !== s.id)
                            }))}
                          />
                          <span>{s.nom || s.name || `Sillon #${s.id}`} ({s.departure_time || s.departureTime})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {step === 4 && form.type === "travaux" && (
          <div>
            <h2 className="h5">Substitutions</h2>
            <div className="form-check mb-3">
              <input
                type="checkbox"
                className="form-check-input"
                id="substitutions"
                checked={form.substitutions}
                onChange={e => setForm(f => ({ ...f, substitutions: e.target.checked, sillons_substitution: [] }))}
              />
              <label className="form-check-label ms-1" htmlFor="substitutions">
                Des substitutions sont prévues
              </label>
            </div>
            {form.substitutions && (
              <div>
                {loadingSillonsSub ? (
                  <div>Chargement des sillons de substitution…</div>
                ) : errorSillonsSub ? (
                  <div className="text-danger">{errorSillonsSub}</div>
                ) : sillonsSub.length === 0 ? (
                  <div className="text-muted">Aucun sillon de substitution trouvé pour la période sélectionnée.</div>
                ) : (
                  <div>
                    <div className="mb-2">Sélectionnez les sillons de substitution à activer :</div>
                    <div className="list-group">
                      {sillonsSub.map(s => (
                        <label key={s.id} className="list-group-item d-flex align-items-center gap-2">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={form.sillons_substitution.includes(s.id)}
                            onChange={e => setForm(f => ({
                              ...f,
                              sillons_substitution: e.target.checked
                                ? [...f.sillons_substitution, s.id]
                                : f.sillons_substitution.filter(id => id !== s.id)
                            }))}
                          />
                          <span>{s.nom || s.name || `Sillon #${s.id}`} ({s.departure_time || s.departureTime})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {((step === 3 && form.type !== "travaux") || (step === 5 && form.type === "travaux")) && (
          <div>
            <h2 className="h5">Récapitulatif</h2>
            <ul className="list-group mb-3">
              <li className="list-group-item"><strong>Type :</strong> {PERTURB_TYPES.find(t => t.value === form.type)?.label}</li>
              <li className="list-group-item"><strong>Ligne :</strong> {lignes.find(l => String(l.id) === String(form.ligne_id))?.nom || lignes.find(l => String(l.id) === String(form.ligne_id))?.name || form.ligne_id}</li>
              <li className="list-group-item"><strong>Date de début :</strong> {form.date_debut} {form.heure_debut}</li>
              <li className="list-group-item"><strong>Date de fin :</strong> {form.date_fin} {form.heure_fin}</li>
              {form.type === 'travaux' && (
                <>
                  <li className="list-group-item"><strong>Jours de travaux :</strong> {form.jours.map(j => JOURS[j]).join(', ')}</li>
                  <li className="list-group-item"><strong>Impact circulation :</strong> {form.impact_circulation ? 'Oui' : 'Non'}</li>
                  {form.impact_circulation && (
                    <li className="list-group-item"><strong>Sillons non circulants :</strong> {form.sillons_impactes.length ? form.sillons_impactes.map(id => {
                      const s = sillons.find(si => si.id === id); return s ? (s.nom || s.name || `#${s.id}`) : `#${id}`;
                    }).join(', ') : 'Aucun'}</li>
                  )}
                  <li className="list-group-item"><strong>Substitutions :</strong> {form.substitutions ? 'Oui' : 'Non'}</li>
                  {form.substitutions && (
                    <li className="list-group-item"><strong>Sillons de substitution :</strong> {form.sillons_substitution.length ? form.sillons_substitution.map(id => {
                      const s = sillonsSub.find(si => si.id === id); return s ? (s.nom || s.name || `#${s.id}`) : `#${id}`;
                    }).join(', ') : 'Aucun'}</li>
                  )}
                </>
              )}
              <li className="list-group-item"><strong>Titre :</strong> {form.titre}</li>
              <li className="list-group-item"><strong>Contenu :</strong> <span dangerouslySetInnerHTML={{__html: form.contenu}} /></li>
            </ul>
            <button type="submit" className="btn btn-success" disabled={saving}>{saving ? "Création…" : "Créer la perturbation"}</button>
          </div>
        )}
        <div className="d-flex justify-content-between mt-4">
          <button type="button" className="btn btn-outline-secondary" onClick={prevStep} disabled={step === 0}>Précédent</button>
          {((form.type !== "travaux" && step < 3) || (form.type === "travaux" && step < 5)) && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={nextStep}
              disabled={
                (step === 0 && (!form.type || !form.ligne_id)) ||
                (step === 1 && (
                  !form.date_debut ||
                  !form.date_fin ||
                  (form.type === "travaux" && (
                    form.jours.length === 0 ||
                    !form.heure_debut ||
                    !form.heure_fin
                  ))
                )) ||
                (step === 2 && (!form.titre.trim() || !form.contenu || form.contenu === '<p><br></p>')) ||
                (step === 3 && form.type === "travaux" && form.impact_circulation && sillons.length > 0 && form.sillons_impactes.length === 0) ||
                (step === 4 && form.type === "travaux" && form.substitutions && sillonsSub.length > 0 && form.sillons_substitution.length === 0)
              }
            >
              Suivant
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
