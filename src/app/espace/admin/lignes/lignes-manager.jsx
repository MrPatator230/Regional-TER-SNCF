"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

const TYPES = [
  { value: "voyageur", label: "Voyageur" },
  { value: "fret", label: "FRET" },
  { value: "exploitation", label: "Exploitation" },
];
const DAYS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

function emptyForm() {
  return {
    id: null,
    depart_station_id: 0,
    arrivee_station_id: 0,
    exploitation_type: "",
    desservies: [], // array of station ids
  };
}

export default function LignesManager() {
  const [lignes, setLignes] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm());
  const [pickStationId, setPickStationId] = useState(0);

  const displayInfoDlgRef = useRef(null);
  const [displayInfoDialogOpen, setDisplayInfoDialogOpen] = useState(false);
  const [displayInfoForm, setDisplayInfoForm] = useState({
    ligne_id: null,
    titre: '',
    message: '',
    priority: 'normal',
    date_debut: '',
    date_fin: ''
  });
  // Fonctions info affichage manquantes
  function openDisplayInfo(ligne){
    setDisplayInfoForm({ ligne_id: ligne.id, titre: '', message: '', priority: 'normal', date_debut: '', date_fin: '' });
    setDisplayInfoDialogOpen(true);
  }
  function closeDisplayInfo(){ setDisplayInfoDialogOpen(false); }

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (!dlgRef.current) return;
    try {
      if (dialogOpen) dlgRef.current.showModal?.();
      else dlgRef.current.close?.();
    } catch {}
  }, [dialogOpen]);

  function StepProgress() {
    const stepsMeta = [
      { key: 0, label: 'Général' },
      { key: 1, label: 'Gares desservies' },
      { key: 2, label: 'Résumé' }
    ];
    return (
      <div className="mb-3">
        <div className="d-flex justify-content-between align-items-center" style={{ gap: '0.75rem' }}>
          {stepsMeta.map((s, idx) => {
            const state = step === idx ? 'active' : (step > idx ? 'done' : 'todo');
            return (
              <div key={s.key} className="flex-fill text-center" style={{ minWidth: 0 }}>
                <div style={{ position: 'relative', padding: '0 4px' }}>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 4,
                      background: state === 'done' ? 'var(--wcs-color-primary)' : (state === 'active' ? 'var(--wcs-color-primary-40, #4f46e5)' : '#e0e0e0'),
                      transition: 'background .25s'
                    }}
                  />
                  <small style={{ display: 'block', marginTop: 6, fontWeight: state === 'active' ? 600 : 400 }}>
                    {s.label}
                  </small>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    );
  }

  async function fetchAll() {
    setLoading(true);
    setError("");
    try {
      const [resL, resS] = await Promise.all([
        fetch("/api/lignes", { cache: "no-store" }),
        fetch("/api/stations", { cache: "no-store" }),
      ]);
      const jsonL = await resL.json();
      const jsonS = await resS.json();
      if (!resL.ok) throw new Error(jsonL?.error || "Erreur chargement lignes");
      if (!resS.ok) throw new Error(jsonS?.error || "Erreur chargement gares");
      setLignes(jsonL.lignes || []);
      setStations(jsonS.stations || []);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm(emptyForm());
    setStep(0);
    setPickStationId(0);
    setDialogOpen(true);
  }

  function openEdit(l) {
    setForm({
      id: l.id,
      depart_station_id: l.depart_station_id,
      arrivee_station_id: l.arrivee_station_id,
      exploitation_type: l.exploitation_type,
      desservies: Array.isArray(l.desservies) ? l.desservies : [],
    });
    setStep(0);
    setPickStationId(0);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  // Chargement des services pour modif_parcours
  useEffect(()=>{
    if(!perturbDialogOpen) return;
    if(perturbForm.type !== 'modif_parcours') return;
    if(!perturbForm.ligne_id || !perturbForm.date_debut || !perturbForm.date_fin) return; // besoin des bornes
    refreshServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perturbDialogOpen, perturbForm.type, perturbForm.ligne_id, perturbForm.date_debut, perturbForm.date_fin, perturbForm.heure_debut, perturbForm.heure_fin]);

  // Chargement des sillons pour l'onglet Options (travaux)
  useEffect(()=>{
    // Ancien flux
    if(perturbDialogOpen && perturbForm.type === 'travaux' && perturbTab === 1 && perturbForm.ligne_id && perturbForm.heure_debut && perturbForm.heure_fin){
      fetchOptionsSillons();
      return;
    }
    // Éditeur (nouveau flux)
    if(perturbEditorOpen && (perturbEdit?.type === 'travaux') && perturbEditorTab === 1 && perturbEdit?.ligne_id && perturbEdit?.heure_debut && perturbEdit?.heure_fin){
      fetchOptionsSillons();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perturbDialogOpen, perturbForm.type, perturbTab, perturbForm.ligne_id, perturbForm.heure_debut, perturbForm.heure_fin, perturbEditorOpen, perturbEditorTab, perturbEdit?.type, perturbEdit?.ligne_id, perturbEdit?.heure_debut, perturbEdit?.heure_fin]);

  // Chargement des sillons de substitution
  useEffect(()=>{
    // Ancien flux
    if(perturbDialogOpen && perturbForm.type === 'travaux' && perturbTab === 2 && perturbForm.ligne_id && perturbForm.date_debut && perturbForm.date_fin && perturbForm.substitution_autocar){
      fetchSubstitutionSillons();
      return;
    }
    // Éditeur (nouveau flux)
    if(perturbEditorOpen && (perturbEdit?.type === 'travaux') && perturbEditorTab === 2 && perturbEdit?.ligne_id && perturbEdit?.date_debut && perturbEdit?.date_fin && perturbEdit?.substitution_autocar){
      fetchSubstitutionSillons();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perturbDialogOpen, perturbForm.type, perturbTab, perturbForm.ligne_id, perturbForm.date_debut, perturbForm.date_fin, perturbForm.substitution_autocar, perturbEditorOpen, perturbEditorTab, perturbEdit?.type, perturbEdit?.ligne_id, perturbEdit?.date_debut, perturbEdit?.date_fin, perturbEdit?.substitution_autocar]);

  function fetchSubstitutionSillons(){
    // Utilise la source adéquate selon le flux affiché
    const src = perturbDialogOpen ? perturbForm : perturbEdit;
    if(!src?.ligne_id || !src?.date_debut || !src?.date_fin) return;
    let abort = false;
    (async()=>{
      setSubstitutionSillonsLoading(true);
      setSubstitutionSillonsError('');
      try {
        // const fromTs = `${src.date_debut}T${src.heure_debut||'00:00'}`; // non utilisé pour l’appel
        // const toTs = `${src.date_fin}T${src.heure_fin||'23:59'}`;
        const res = await fetch(`/api/schedules?ligne_id=${src.ligne_id}&is_substitution=1`);
        if(!res.ok) throw new Error('Impossible de charger les sillons de substitution');
        const data = await res.json();
        if(abort) return;
        setSubstitutionSillons(Array.isArray(data) ? data : []);
      } catch(e){
        if(!abort) setSubstitutionSillonsError(e.message || 'Erreur chargement sillons de substitution');
      }
      finally {
        if(!abort) setSubstitutionSillonsLoading(false);
      }
    })();
    return ()=>{ abort = true; };
  }

  function fetchOptionsSillons(){
    const src = perturbDialogOpen ? perturbForm : perturbEdit;
    if(!src?.ligne_id) return;
    let abort=false;
    (async()=>{
      setOptionsSillonsLoading(true);
      setOptionsSillonsError('');
      try{
        const res = await fetch(`/api/schedules?ligne_id=${src.ligne_id}`);
        if(!res.ok) throw new Error('Impossible de charger les sillons');
        const list = await res.json();
        if(abort) return;
        // Filtre par plage horaire choisie
        const start = src.heure_debut || '00:00';
        const end = src.heure_fin || '23:59';
        const toM = (t)=>{ const [H,M]=String(t||'').split(':').map(Number); return (H||0)*60+(M||0); };
        const sM = toM(start), eM = toM(end);
        const inRange = (t)=>{
          const m = toM(t);
          return sM<=eM ? (m>=sM && m<=eM) : (m>=sM || m<=eM); // couvre minuit
        };
        const filtered = (Array.isArray(list)? list:[]).filter(s=> inRange(s.departure_time||s.departureTime));
        setOptionsSillons(filtered);
      } catch(e){ if(!abort) setOptionsSillonsError(e.message||'Erreur chargement sillons'); }
      finally { if(!abort) setOptionsSillonsLoading(false); }
    })();
    return ()=>{ abort=true; };
  }

  // Charge les services (sillons) pour modif_parcours selon la plage
  async function refreshServices(){
    if(!perturbForm.ligne_id || !perturbForm.date_debut || !perturbForm.date_fin) return;
    setServicesLoading(true); setServicesError('');
    try{
      // Utilise l'API des sillons administrateur
      const params = new URLSearchParams();
      params.set('ligne_id', String(perturbForm.ligne_id));
      params.set('withStops','1');
      const res = await fetch(`/api/schedules?${params.toString()}`);
      const list = await res.json();
      if(!res.ok) throw new Error(list?.error||'Erreur chargement sillons');
      setServices(Array.isArray(list)? list: []);
    } catch(e){ setServicesError(e.message||'Erreur chargement'); setServices([]); }
    finally { setServicesLoading(false); }
  }

  const [perturbations, setPerturbations] = useState([]); // Liste des perturbations de la ligne sélectionnée
  const [perturbLoading, setPerturbLoading] = useState(false);
  const [perturbError, setPerturbError] = useState("");
  const [perturbEdit, setPerturbEdit] = useState(null); // null = pas d’édition, sinon objet perturbation
  const [perturbEditSaving, setPerturbEditSaving] = useState(false);
  const [perturbEditError, setPerturbEditError] = useState("");
  const [perturbDeleteId, setPerturbDeleteId] = useState(null);
  const [perturbDeleteError, setPerturbDeleteError] = useState("");
  const [perturbDialogLigne, setPerturbDialogLigne] = useState(null); // Ligne dont on affiche la liste des perturbations

  // Nouvelle fonction pour charger les perturbations d’une ligne
  async function loadPerturbations(ligneId) {
    setPerturbLoading(true); setPerturbError("");
    try {
      const res = await fetch(`/api/perturbations?ligne_id=${ligneId}`);
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || 'Erreur chargement perturbations');
      setPerturbations(js.perturbations || []);
    } catch (e) {
      setPerturbError(e.message || 'Erreur');
      setPerturbations([]);
    } finally {
      setPerturbLoading(false);
    }
  }

  // Ouvre la liste des perturbations pour une ligne
  function openPerturbationsDialog(ligne) {
    setPerturbDialogLigne(ligne);
    setPerturbEdit(null);
    loadPerturbations(ligne.id);
  }
  function closePerturbationsDialog() {
    setPerturbDialogLigne(null);
    setPerturbEdit(null);
    setPerturbations([]);
  }

  // Ouvre le formulaire d’édition/création
  function openPerturbEdit(perturb) {
    setPerturbEdit(perturb || {
      id: null,
      ligne_id: perturbDialogLigne?.id,
      type: 'travaux',
      titre: '',
      description: '',
      date_debut: '',
      date_fin: '',
      heure_debut: '',
      heure_fin: '',
      jours: [],
      cause: '',
      modification: { service_id: null, original: null, updated: null },
      bloquer_sillons: false,
      substitution_autocar: false,
      substitution_details: '',
      sillon_substitution: false,
      substitution_sillons: [],
      exclude_sillons_enabled: false,
      exclude_schedules: [],
      banner_all: false,
      banner_days_before: 0
    });
    setPerturbEditError("");
    setPerturbEditorOpen(true);
  }
  function closePerturbEdit() {
    setPerturbEditorOpen(false);
    setPerturbEdit(null);
    setPerturbEditError("");
  }

  // Sauvegarde (création/édition)
  async function savePerturbEdit(e) {
    e?.preventDefault?.();
    setPerturbEditSaving(true); setPerturbEditError("");
    try {
      const p = perturbEdit;
      if (!p.ligne_id) throw new Error("Ligne manquante");
      if (!p.titre?.trim()) throw new Error("Titre obligatoire");
      if (!p.type) throw new Error("Type obligatoire");
      const payload = {
        ligne_id: p.ligne_id,
        type: p.type,
        titre: p.titre,
        description: p.description || p.cause || '',
        date_debut: p.date_debut ? `${p.date_debut}T${p.heure_debut||'00:00'}` : null,
        date_fin: p.date_fin ? `${p.date_fin}T${p.heure_fin||'23:59'}` : null,
        data: {
          jours: p.jours,
          cause: p.cause,
          modification: p.modification,
          bloquer_sillons: p.bloquer_sillons,
          substitution_autocar: p.substitution_autocar,
          substitution_details: p.substitution_details,
          sillon_substitution: p.sillon_substitution,
          substitution_sillons: p.substitution_sillons,
          exclude_sillons_enabled: p.exclude_sillons_enabled,
          exclude_schedules: p.exclude_schedules,
          banner_all: p.banner_all,
          banner_days_before: p.banner_days_before
        }
      };
      let res, js;
      if (p.id) {
        res = await fetch(`/api/perturbations/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        res = await fetch('/api/perturbations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      js = await res.json();
      if (!res.ok) throw new Error(js?.error || 'Erreur enregistrement');
      closePerturbEdit();
      await loadPerturbations(p.ligne_id);
    } catch (e) {
      setPerturbEditError(e.message || 'Erreur');
    } finally {
      setPerturbEditSaving(false);
    }
  }

  // Suppression
  async function deletePerturbation(id) {
    if (!window.confirm('Supprimer cette perturbation ?')) return;
    setPerturbDeleteId(id); setPerturbDeleteError("");
    try {
      const res = await fetch(`/api/perturbations/${id}`, { method: 'DELETE' });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js?.error || 'Suppression impossible');
      await loadPerturbations(perturbDialogLigne.id);
    } catch (e) {
      setPerturbDeleteError(e.message || 'Erreur');
    } finally {
      setPerturbDeleteId(null);
    }
  }


  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <wcs-button onClick={openCreate}>
            <wcs-mat-icon icon="add"></wcs-mat-icon>
            Créer une ligne
          </wcs-button>
        </div>
        {loading && <span>Chargement…</span>}
      </div>

      {error && <div className="alert alert-warning">{error}</div>}

      {!loading && lignes.length === 0 && <p>Aucune ligne pour l’instant.</p>}

      {!loading && lignes.length > 0 && (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>Ligne</th>
                <th>Type</th>
                <th>Gares desservies</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const depart = stationById.get(l.depart_station_id)?.name || l.depart_name || `#${l.depart_station_id}`;
                const arrivee = stationById.get(l.arrivee_station_id)?.name || l.arrivee_name || `#${l.arrivee_station_id}`;
                const typeLabel = TYPES.find((t) => t.value === l.exploitation_type)?.label || l.exploitation_type;
                return (
                  <tr key={l.id}>
                    <td>
                      <wcs-mat-icon icon="alt_route" class="me-1"></wcs-mat-icon>
                      {depart} → {arrivee}
                    </td>
                    <td>{typeLabel}</td>
                    <td>
                      {Array.isArray(l.desservies) && l.desservies.length > 0 ? (
                        <span className="badge bg-light text-muted">{l.desservies.length} gare(s)</span>
                      ) : (
                        <span className="text-muted">Aucune</span>
                      )}
                    </td>
                    <td className="text-end">
                      <wcs-button mode="stroked" size="s" onClick={() => openEdit(l)}>
                        <wcs-mat-icon icon="edit"></wcs-mat-icon>
                        Modifier
                      </wcs-button>
                      <wcs-button class="ms-2" mode="flat" size="s" danger onClick={() => onDelete(l.id)}>
                        <wcs-mat-icon icon="delete" />
                        Supprimer
                      </wcs-button>
                      <wcs-button class="ms-2" mode="stroked" size="s" onClick={() => openDisplayInfo(l)}>
                        <wcs-mat-icon icon="feed"></wcs-mat-icon>
                        Info affichage
                      </wcs-button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogue création/édition de ligne (restauré) */}
      {dialogOpen && (
        <dialog
          ref={dlgRef}
          style={{ width: 760, maxWidth: "95%", height: "80vh", display: 'flex', flexDirection: 'column' }}
          onClose={closeDialog}
        >
          <StepProgress />
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h2 className="h5 m-0">{form.id ? "Modifier la ligne" : "Créer une ligne"}</h2>
            <button type="button" className="btn btn-sm btn-light" onClick={closeDialog}>Fermer</button>
          </div>
          <form onSubmit={onSubmitCreateOrEdit} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {step === 0 && (
                <div>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Gare de départ</label>
                      <select className="form-select" value={form.depart_station_id} onChange={(e)=> setForm(f=>({...f, depart_station_id: Number(e.target.value)}))} required>
                        <option value={0}>Choisir…</option>
                        {stations.map((s)=> <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Gare d’arrivée</label>
                      <select className="form-select" value={form.arrivee_station_id} onChange={(e)=> setForm(f=>({...f, arrivee_station_id: Number(e.target.value)}))} required>
                        <option value={0}>Choisir…</option>
                        {stations.map((s)=> <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="form-label">Type d’exploitation</label>
                    <div className="d-flex gap-3 flex-wrap">
                      {TYPES.map((t)=> (
                        <label className="form-check" key={t.value}>
                          <input type="radio" className="form-check-input" name="exploitation_type" checked={form.exploitation_type===t.value} onChange={()=> setForm(f=>({...f, exploitation_type: t.value}))} />
                          <span className="form-check-label ms-1">{t.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {step === 1 && (
                <div>
                  <div className="mb-3">
                    <label className="form-label">Ajouter une gare desservie</label>
                    <div className="d-flex gap-2">
                      <select className="form-select" style={{maxWidth: 360}} value={pickStationId} onChange={(e)=> setPickStationId(Number(e.target.value))}>
                        <option value={0}>Choisir…</option>
                        {stations.map((s)=> <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <button type="button" className="btn btn-outline-primary" onClick={addDesservie}>Ajouter</button>
                    </div>
                    <div className="form-text">Ne pas ajouter la gare de départ ou d’arrivée. Chaque gare ne peut être ajoutée qu’une seule fois.</div>
                  </div>
                  <div className="list-group">
                    {form.desservies.length===0 && <div className="text-muted">Aucune gare desservie ajoutée pour l’instant.</div>}
                    {form.desservies.map((id)=> (
                      <div key={id} className="list-group-item d-flex justify-content-between align-items-center">
                        <div>{stationById.get(id)?.name || `#${id}`}</div>
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={()=> removeDesservie(id)}>
                          <wcs-mat-icon icon="delete"></wcs-mat-icon>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {step === 2 && (
                <div>
                  <div className="mb-2"><strong>Départ:</strong> {stationById.get(form.depart_station_id)?.name || '-'}</div>
                  <div className="mb-2"><strong>Arrivée:</strong> {stationById.get(form.arrivee_station_id)?.name || '-'}</div>
                  <div className="mb-2"><strong>Type:</strong> {TYPES.find(t=>t.value===form.exploitation_type)?.label || form.exploitation_type}</div>
                  <div className="mb-2">
                    <strong>Gares desservies:</strong>
                    {form.desservies.length===0 ? (
                      <span className="ms-1 text-muted">Aucune</span>
                    ) : (
                      <ul className="mt-2">{form.desservies.map((id,i)=> <li key={i}>{stationById.get(id)?.name}</li>)}</ul>
                    )}
                  </div>
                  <div className="d-flex justify-content-end mt-4">
                    <button type="submit" className="btn btn-success" disabled={saving}>{saving ? "Création…" : (form.id ? "Enregistrer" : "Créer la ligne")}</button>
                  </div>
                </div>
              )}
            </div>
          </form>
          <div className="d-flex justify-content-between align-items-center pt-2 mt-2" style={{ borderTop: '1px solid #eee' }}>
            <wcs-button mode="clear" onClick={()=> setStep(s=> Math.max(0, s-1))} disabled={step===0}>Previous</wcs-button>
            <wcs-button mode="clear" onClick={()=> setStep(s=> Math.min(2, s+1))} disabled={(step===0 && !(Number(form.depart_station_id)>0 && Number(form.arrivee_station_id)>0 && form.depart_station_id!==form.arrivee_station_id && !!form.exploitation_type)) || step===2}>Next</wcs-button>
          </div>
        </dialog>
      )}

      {displayInfoDialogOpen && (
        <dialog ref={displayInfoDlgRef} style={{ width: 560, maxWidth:'95%' }} onClose={closeDisplayInfo}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h2 className="h5 m-0">Nouvelle info affichage (ligne {displayInfoForm.ligne_id})</h2>
            <button type="button" className="btn btn-sm btn-light" onClick={closeDisplayInfo}>Fermer</button>
          </div>
          <form onSubmit={submitDisplayInfo} className="vstack" style={{ gap: '1rem' }}>
            <div>
              <label className="form-label">Titre (optionnel)</label>
              <input className="form-control" value={displayInfoForm.titre} onChange={e=>setDisplayInfoForm(f=>({...f,titre:e.target.value}))} placeholder="Ex: Infos trafic matinée" />
            </div>
            <div>
              <label className="form-label">Message</label>
              <textarea className="form-control" rows={4} required value={displayInfoForm.message} onChange={e=>setDisplayInfoForm(f=>({...f,message:e.target.value}))} placeholder="Texte diffusé sur les écrans des gares" />
            </div>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Date début (optionnel)</label>
                <input type="date" className="form-control" value={displayInfoForm.date_debut} onChange={e=>setDisplayInfoForm(f=>({...f,date_debut:e.target.value}))} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Date fin (optionnel)</label>
                <input type="date" className="form-control" value={displayInfoForm.date_fin} onChange={e=>setDisplayInfoForm(f=>({...f,date_fin:e.target.value}))} />
              </div>
            </div>
            <div>
              <label className="form-label">Priorité</label>
              <select className="form-select" value={displayInfoForm.priority} onChange={e=>setDisplayInfoForm(f=>({...f,priority:e.target.value}))}>
                <option value="low">Faible</option>
                <option value="normal">Normale</option>
                <option value="high">Haute</option>
              </select>
            </div>
            <div className="d-flex justify-content-end">
              <button type="submit" className="btn btn-primary" disabled={displayInfoSaving || !displayInfoForm.message.trim()}>{displayInfoSaving? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </dialog>
      )}
    </div>


  );
}
