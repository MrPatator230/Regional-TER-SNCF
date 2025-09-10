"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

const SERVICE_OPTIONS = ["TER", "TGV", "Intercités", "Fret"];
const TRANSPORT_OPTIONS = [
  { key: "bus", label: "Bus", color: "#1976d2" },
  { key: "train", label: "Train", color: "#333" },
  { key: "tramway", label: "Tramway", color: "#009688" },
  { key: "métro", label: "Métro", color: "#9c27b0" },
  { key: "tram-train", label: "Tram-Train", color: "#ff9800" },
];

function Badge({ t }) {
  const meta = TRANSPORT_OPTIONS.find(o => o.key === t);
  if (!meta) return null;
  return (
    <span className="badge me-1" style={{ background: meta.key === 'train' ? undefined : meta.color, border: meta.key === 'train' ? '1px solid #ccc' : 'none', color: meta.key === 'train' ? '#333' : '#fff' }}>
      {meta.key === 'train' ? (<>
        <wcs-mat-icon icon="train" style={{ verticalAlign: '-3px' }}></wcs-mat-icon>
        <span className="ms-1">{meta.label}</span>
      </>) : meta.label}
    </span>
  );
}

function emptyForm() {
  return {
    id: null,
    name: "",
    station_type: "urbaine",
    services: [],
    platforms: [{ name: "Quai A", distance_m: 0 }],
    transports: [],
  };
}

export default function StationsManager() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [lines, setLines] = useState([]); // lignes disponibles
  const [lineFilter, setLineFilter] = useState("");
  const [transportFilter, setTransportFilter] = useState([]); // tableau des transports sélectionnés
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const dlgRef = useRef(null);

  useEffect(() => {
    fetchList();
  }, []);

  useEffect(() => {
    if (!dlgRef.current) return;
    if (dialogOpen) {
      try { dlgRef.current.showModal?.(); } catch {}
    } else {
      try { dlgRef.current.close?.(); } catch {}
    }
  }, [dialogOpen]);

  useEffect(()=>{ // chargement des lignes pour filtre
    (async()=>{
      try { const r = await fetch('/api/lignes', { cache:'no-store' }); if(r.ok){ const j = await r.json(); setLines(j.lignes||[]); } } catch(_){}
    })();
  },[]);

  async function fetchList() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stations", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erreur de chargement");
      setStations(json.stations || []);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(s) {
    setForm({
      id: s.id,
      name: s.name || "",
      station_type: s.station_type || "urbaine",
      services: Array.isArray(s.services) ? s.services : [],
      platforms: Array.isArray(s.platforms) && s.platforms.length ? s.platforms : [{ name: "Quai A", distance_m: 0 }],
      transports: Array.isArray(s.transports) ? s.transports : [],
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  function updatePlatform(i, patch) {
    setForm(f => {
      const arr = [...f.platforms];
      arr[i] = { ...arr[i], ...patch };
      return { ...f, platforms: arr };
    });
  }

  function addPlatform() {
    setForm(f => ({ ...f, platforms: [...(f.platforms || []), { name: "", distance_m: 0 }] }));
  }

  function removePlatform(i) {
    setForm(f => ({ ...f, platforms: f.platforms.filter((_, idx) => idx !== i) }));
  }

  async function onSubmit(e) {
    e?.preventDefault?.();
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        station_type: form.station_type,
        services: form.services,
        platforms: (form.platforms || []).map(p => ({ name: String(p.name || '').trim(), distance_m: Number(p.distance_m || 0) })),
        transports: form.transports,
      };

      let res, json;
      if (form.id) {
        res = await fetch(`/api/stations/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Erreur lors de la modification");
      } else {
        res = await fetch("/api/stations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Erreur lors de la création");
      }

      closeDialog();
      await fetchList();
    } catch (e) {
      setError(e.message || "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id) {
    if (!confirm("Supprimer cette gare ?")) return;
    try {
      const res = await fetch(`/api/stations/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Suppression impossible");
      await fetchList();
    } catch (e) {
      alert(e.message || "Erreur");
    }
  }

  const displayHint = useMemo(() => form.station_type === 'urbaine' ? '12 h' : '30 min', [form.station_type]);

  // Ensemble stations par ligne (cache léger)
  const lineStationsMap = useMemo(()=>{
    const map = new Map();
    lines.forEach(l=>{
      const ids = new Set([l.depart_station_id, ...(Array.isArray(l.desservies)? l.desservies: []), l.arrivee_station_id]);
      map.set(String(l.id), ids);
    });
    return map;
  },[lines]);

  const filteredStations = useMemo(()=>{
    const arr = stations.filter(s=>{
      if(search.trim() && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if(lineFilter){ const setIds = lineStationsMap.get(lineFilter); if(!setIds || !setIds.has(s.id)) return false; }
      if(transportFilter.length){
        if(!Array.isArray(s.transports)) return false;
        const hasAll = transportFilter.every(t=> s.transports.includes(t));
        if(!hasAll) return false;
      }
      return true;
    });
    return arr;
  },[stations, search, lineFilter, transportFilter, lineStationsMap]);

  // Reset page si filtre change / taille modifiée
  useEffect(()=>{ setPage(1); }, [search, lineFilter, transportFilter]);
  useEffect(()=>{ const totalPages = Math.max(1, Math.ceil(filteredStations.length / pageSize)); if(page> totalPages) setPage(totalPages); }, [filteredStations, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredStations.length / pageSize));
  const paginatedStations = filteredStations.slice((page-1)*pageSize, page*pageSize);

  function toggleTransportFilter(key){
    setTransportFilter(prev=> prev.includes(key)? prev.filter(k=>k!==key): [...prev, key]);
  }
  function clearFilters(){ setLineFilter(""); setTransportFilter([]); setSearch(""); }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <wcs-button onClick={openCreate}>
            <wcs-mat-icon icon="add"></wcs-mat-icon>
            Créer une gare
          </wcs-button>
        </div>
        {loading && <span>Chargement…</span>}
      </div>

      <div className="d-flex flex-row gap-3">
        <aside className="filters-sidebar border rounded p-3 bg-light" style={{width:280, flex:'0 0 280px', alignSelf:'flex-start'}}>
          <h5 className="mb-3" style={{fontSize:'0.95rem'}}>Filtres</h5>
          <div className="mb-3">
            <label className="form-label">Recherche</label>
            <input className="form-control" placeholder="Nom de gare" value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="form-label">Ligne</label>
            <select className="form-select" value={lineFilter} onChange={e=>setLineFilter(e.target.value)}>
              <option value="">(Toutes)</option>
              {lines.map(l=> <option key={l.id} value={String(l.id)}>{l.depart_name || '??'} ➜ {l.arrivee_name || '??'}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">Transports</label>
            <div className="d-flex flex-wrap gap-2">
              {TRANSPORT_OPTIONS.map(o=> (
                <button type="button" key={o.key} onClick={()=>toggleTransportFilter(o.key)} className={`btn btn-sm ${transportFilter.includes(o.key)?'btn-primary':'btn-outline-secondary'}`}>{o.label}</button>
              ))}
            </div>
          </div>
          <div className="d-flex justify-content-between align-items-center mt-2">
            <button type="button" className="btn btn-light btn-sm" onClick={clearFilters}>Réinitialiser</button>
            <span className="text-muted small">{filteredStations.length}/{stations.length}</span>
          </div>
        </aside>

        <div className="flex-grow-1">
          {error && (
            <div className="alert alert-warning">{error}</div>
          )}

          {!loading && stations.length === 0 && (
            <p>Aucune gare pour l’instant.</p>
          )}

          {!loading && stations.length > 0 && (
            <div className="table-responsive">
              <table className="table align-middle">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Type</th>
                    <th>Services</th>
                    <th>Quais</th>
                    <th>Transports</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStations.map(s => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.station_type === 'urbaine' ? 'Gare urbaine' : 'Gare de ville'}<div className="text-muted small">Fenêtre d’affichage: {s.display_window_minutes} min</div></td>
                      <td>{Array.isArray(s.services) ? s.services.join(', ') : ''}</td>
                      <td>{Array.isArray(s.platforms) ? s.platforms.length : 0}</td>
                      <td>
                        {Array.isArray(s.transports) && s.transports.map(t => <Badge key={t} t={t} />)}
                      </td>
                      <td className="text-end">
                        <wcs-button mode="stroked" size="s" onClick={() => openEdit(s)}>
                          <wcs-mat-icon icon="edit"></wcs-mat-icon>
                          Modifier
                        </wcs-button>
                        <wcs-button class="ms-2" mode="flat" size="s" danger onClick={() => onDelete(s.id)}>
                          <wcs-mat-icon icon="delete"></wcs-mat-icon>
                          Supprimer
                        </wcs-button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-2">
                <div className="small text-muted">Page {page} / {totalPages} – {filteredStations.length} résultats</div>
                <div className="d-flex gap-1">
                  <button type="button" className="btn btn-sm btn-light" disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Précédent</button>
                  <button type="button" className="btn btn-sm btn-light" disabled={page===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Suivant</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <dialog ref={dlgRef} style={{ width: 720, maxWidth: '95%' }} onClose={closeDialog}>
        <form onSubmit={onSubmit}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 className="h5 m-0">{form.id ? 'Modifier la gare' : 'Créer une gare'}</h2>
            <button type="button" className="btn btn-sm btn-light" onClick={closeDialog}>Fermer</button>
          </div>

          <div className="mb-3">
            <label className="form-label">Nom de la gare</label>
            <input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>

          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Type de gare</label>
              <select className="form-select" value={form.station_type} onChange={e => setForm(f => ({ ...f, station_type: e.target.value }))}>
                <option value="urbaine">Gare urbaine (fenêtre {"12 h"})</option>
                <option value="ville">Gare de ville (fenêtre {"30 min"})</option>
              </select>
              <div className="form-text">Fenêtre d’affichage des quais: {displayHint}</div>
            </div>
            <div className="col-md-6">
              <label className="form-label">Services</label>
              <div className="d-flex flex-wrap gap-2">
                {SERVICE_OPTIONS.map(s => (
                  <label key={s} className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={form.services.includes(s)}
                      onChange={(e) => setForm(f => ({
                        ...f,
                        services: e.target.checked ? [...f.services, s] : f.services.filter(x => x !== s)
                      }))}
                    />
                    <span className="form-check-label ms-1">{s}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="form-label">Quais</label>
            <div className="list-group mb-2">
              {(form.platforms || []).map((p, i) => (
                <div className="list-group-item" key={i}>
                  <div className="row g-2 align-items-end">
                    <div className="col-6">
                      <label className="form-label">Nom</label>
                      <input className="form-control" value={p.name} onChange={e => updatePlatform(i, { name: e.target.value })} required />
                    </div>
                    <div className="col-4">
                      <label className="form-label">Distance (m)</label>
                      <input type="number" min="0" className="form-control" value={p.distance_m} onChange={e => updatePlatform(i, { distance_m: e.target.value })} required />
                    </div>
                    <div className="col-2 text-end">
                      <button type="button" className="btn btn-outline-danger" onClick={() => removePlatform(i)} title="Supprimer">
                        <wcs-mat-icon icon="delete"></wcs-mat-icon>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <wcs-button mode="stroked" onClick={addPlatform}>
              <wcs-mat-icon icon="add"></wcs-mat-icon>
              Ajouter un quai
            </wcs-button>
          </div>

          <div className="mt-4">
            <label className="form-label">Transports en commun desservant la gare</label>
            <div className="d-flex flex-wrap gap-2">
              {TRANSPORT_OPTIONS.map(o => (
                <label key={o.key} className="form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={form.transports.includes(o.key)}
                    onChange={(e) => setForm(f => ({
                      ...f,
                      transports: e.target.checked ? [...f.transports, o.key] : f.transports.filter(x => x !== o.key)
                    }))}
                  />
                  <span className="form-check-label ms-1">
                    {o.key === 'train' ? <><wcs-mat-icon icon="train"></wcs-mat-icon> <span className="ms-1">{o.label}</span></> : o.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2 mt-4">
            <button type="button" className="btn btn-light" onClick={closeDialog}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Enregistrement…' : (form.id ? 'Enregistrer' : 'Créer')}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
