"use client";
import React, { useEffect, useMemo, useState } from "react";

function Filters({ items, selectedTypes, onToggleType, onClear, nameQuery, onChangeName, technicalQuery, onChangeTechnical, capMin, capMax, onChangeCapMin, onChangeCapMax, hasImageOnly, onToggleHasImage }) {
  const types = useMemo(() => {
    const s = new Set(items.map((i) => i.train_type).filter(Boolean));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [items]);

  return (
    <aside className="row">
      <div className="col-12">
        <div className="card">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h3 className="h3 m-0">Filtres</h3>
              <button className="btn btn-link" onClick={onClear}>Effacer</button>
            </div>

            <div className="form-group">
              <label htmlFor="f-name">Nom contient</label>
              <input id="f-name" className="form-control" value={nameQuery} onChange={(e) => onChangeName(e.target.value)} placeholder="Ex: Regio" />
            </div>

            <div className="form-group">
              <label htmlFor="f-tech">Nom technique contient</label>
              <input id="f-tech" className="form-control" value={technicalQuery} onChange={(e) => onChangeTechnical(e.target.value)} placeholder="Ex: Z555" />
            </div>

            <div className="form-row">
              <div className="form-group col-6">
                <label htmlFor="f-cap-min">Capacité min</label>
                <input id="f-cap-min" type="number" min="0" className="form-control" value={capMin} onChange={(e) => onChangeCapMin(e.target.value)} />
              </div>
              <div className="form-group col-6">
                <label htmlFor="f-cap-max">Capacité max</label>
                <input id="f-cap-max" type="number" min="0" className="form-control" value={capMax} onChange={(e) => onChangeCapMax(e.target.value)} />
              </div>
            </div>

            <div className="custom-control custom-checkbox mb-3">
              <input type="checkbox" id="f-has-image" className="custom-control-input" checked={hasImageOnly} onChange={onToggleHasImage} />
              <label htmlFor="f-has-image" className="custom-control-label">Avec image uniquement</label>
            </div>

            {types.length === 0 ? (
              <div className="text-muted">Aucun type disponible</div>
            ) : (
              <>
                <div className="mb-2 font-weight-bold">Type de train</div>
                <ul className="list-unstyled mb-0">
                  {types.map((t) => (
                    <li key={t} className="mb-1">
                      <label className="custom-control custom-checkbox m-0">
                        <input
                          type="checkbox"
                          className="custom-control-input"
                          checked={selectedTypes.includes(t)}
                          onChange={() => onToggleType(t)}
                        />
                        <span className="custom-control-label">{t}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function EditModal({ open, item, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    setLoading(false);
  }, [open, item?.id]);

  if (!open || !item) return null;

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    setLoading(true);
    try {
      const res = await fetch(`/api/materiel-roulant/${item.id}`, {
        method: "PUT",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Erreur serveur");
        return;
      }
      const data = await res.json();
      onSaved(data);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal show" style={{ display: "block", background: "rgba(0,0,0,.3)" }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Modifier le matériel</h5>
            <button className="close" onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body">
            {error ? <div className="form-error mb-3">{error}</div> : null}
            <form id="edit-form" onSubmit={onSubmit} encType="multipart/form-data">
              <div className="form-group">
                <label className="required" htmlFor="e-name">Nom</label>
                <input id="e-name" name="name" className="form-control" defaultValue={item.name} required />
              </div>
              <div className="form-group">
                <label className="required" htmlFor="e-technicalName">Nom technique</label>
                <input id="e-technicalName" name="technicalName" className="form-control" defaultValue={item.technical_name} required />
              </div>
              <div className="form-group">
                <label className="required" htmlFor="e-capacity">Capacité</label>
                <input id="e-capacity" name="capacity" type="number" min="1" className="form-control" defaultValue={item.capacity} required />
              </div>
              <div className="form-group">
                <label className="required" htmlFor="e-trainType">Type de train</label>
                <input id="e-trainType" name="trainType" className="form-control" defaultValue={item.train_type} required />
              </div>
              <div className="form-group">
                <label htmlFor="e-image">Remplacer l’image (optionnel)</label>
                <input id="e-image" name="image" type="file" accept="image/*" className="form-control" />
              </div>
            </form>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" form="edit-form" disabled={loading}>{loading ? "Enregistrement..." : "Enregistrer"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Composant d'image avec flèches pour faire défiler horizontalement
function TrainImage({ src, alt, height = 160, step = 12 }) {
  const [pos, setPos] = useState(0); // démarrer tout à gauche (0%)
  const clamp = (v) => Math.max(0, Math.min(100, v));
  const moveLeft = () => setPos((p) => clamp(p - step));
  const moveRight = () => setPos((p) => clamp(p + step));

  const canLeft = pos > 0;
  const canRight = pos < 100;

  return (
    <div className="card-img-top position-relative" style={{ height, overflow: "hidden" }}>
      <img
        className="w-100 h-100"
        src={src}
        alt={alt}
        style={{ objectFit: "cover", objectPosition: `${pos}% center` }}
      />
      {canLeft && (
        <button
          type="button"
          aria-label="Défiler vers la gauche"
          className="btn btn-light btn-sm position-absolute"
          style={{ top: "50%", left: 8, transform: "translateY(-50%)", opacity: 0.85 }}
          onClick={moveLeft}
        >
          ‹
        </button>
      )}
      {canRight && (
        <button
          type="button"
          aria-label="Défiler vers la droite"
          className="btn btn-light btn-sm position-absolute"
          style={{ top: "50%", right: 8, transform: "translateY(-50%)", opacity: 0.85 }}
          onClick={moveRight}
        >
          ›
        </button>
      )}
    </div>
  );
}

export default function MaterielList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [nameQuery, setNameQuery] = useState("");
  const [technicalQuery, setTechnicalQuery] = useState("");
  const [capMin, setCapMin] = useState("");
  const [capMax, setCapMax] = useState("");
  const [hasImageOnly, setHasImageOnly] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [isEditOpen, setEditOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/materiel-roulant", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Erreur de chargement");
        return;
      }
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    function onCreated(e) {
      const m = e?.detail;
      if (!m || !m.id) return;
      setItems((prev) => [m, ...prev]);
    }
    window.addEventListener('materiel:created', onCreated);
    return () => window.removeEventListener('materiel:created', onCreated);
  }, []);

  function toggleType(t) {
    setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }
  function clearFilters() {
    setSelectedTypes([]);
    setNameQuery("");
    setTechnicalQuery("");
    setCapMin("");
    setCapMax("");
    setHasImageOnly(false);
  }

  const filtered = useMemo(() => {
    let list = items;
    if (selectedTypes.length > 0) {
      list = list.filter((i) => selectedTypes.includes(i.train_type));
    }
    if (nameQuery.trim()) {
      const q = nameQuery.trim().toLowerCase();
      list = list.filter((i) => (i.name || "").toLowerCase().includes(q));
    }
    if (technicalQuery.trim()) {
      const q = technicalQuery.trim().toLowerCase();
      list = list.filter((i) => (i.technical_name || "").toLowerCase().includes(q));
    }
    const min = capMin === "" ? null : Number(capMin);
    const max = capMax === "" ? null : Number(capMax);
    if (min !== null && !Number.isNaN(min)) {
      list = list.filter((i) => Number(i.capacity) >= min);
    }
    if (max !== null && !Number.isNaN(max)) {
      list = list.filter((i) => Number(i.capacity) <= max);
    }
    if (hasImageOnly) {
      list = list.filter((i) => !!i.hasImage);
    }
    return list;
  }, [items, selectedTypes, nameQuery, technicalQuery, capMin, capMax, hasImageOnly]);

  function onEdit(item) {
    setEditItem(item);
    setEditOpen(true);
  }
  function onSaved(updated) {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? { ...it, ...updated } : it)));
  }
  function onCloseEdit() {
    setEditOpen(false);
    setEditItem(null);
  }

  async function onDelete(item) {
    // confirm
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Supprimer "${item.name}" ?`)) return;
    try {
      const res = await fetch(`/api/materiel-roulant/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "Suppression impossible");
        return;
      }
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="row">
      <div className="col-12 col-lg-3 mb-3">
        <Filters
          items={items}
          selectedTypes={selectedTypes}
          onToggleType={toggleType}
          onClear={clearFilters}
          nameQuery={nameQuery}
          onChangeName={setNameQuery}
          technicalQuery={technicalQuery}
          onChangeTechnical={setTechnicalQuery}
          capMin={capMin}
          capMax={capMax}
          onChangeCapMin={setCapMin}
          onChangeCapMax={setCapMax}
          hasImageOnly={hasImageOnly}
          onToggleHasImage={() => setHasImageOnly((v) => !v)}
        />
      </div>

      <div className="col-12 col-lg-9">
        {loading ? (
          <div>Chargement...</div>
        ) : error ? (
          <div className="form-error">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-muted">Aucun matériel correspondant.</div>
        ) : (
          <div className="row">
            {filtered.map((item) => (
              <div className="col-12 col-md-6 col-xl-4 mb-3" key={item.id}>
                <div className="card h-100">
                  {item.hasImage ? (
                    <TrainImage
                      src={`/api/materiel-roulant/${item.id}/image`}
                      alt={`${item.name} visuel`}
                      height={160}
                    />
                  ) : (
                    <div className="card-img-top d-flex align-items-center justify-content-center bg-light" style={{ height: 160 }}>
                      <span className="text-muted">Aucune image</span>
                    </div>
                  )}
                  <div className="card-body d-flex flex-column">
                    <div className="mb-2">
                      <div className="h5 m-0">{item.name}</div>
                      <div className="text-muted">{item.technical_name}</div>
                    </div>
                    <ul className="list-unstyled mb-3 text-muted">
                      <li>Type: {item.train_type || "—"}</li>
                      <li>Capacité: {item.capacity}</li>
                      <li>N° série: <span className="text-primary">{item.serial_number}</span></li>
                    </ul>
                    <div className="mt-auto d-flex justify-content-between">
                      <button className="btn btn-secondary" onClick={() => onEdit(item)}>Modifier</button>
                      <button className="btn btn-danger" onClick={() => onDelete(item)}>Supprimer</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <EditModal open={isEditOpen} item={editItem} onClose={onCloseEdit} onSaved={onSaved} />
    </div>
  );
}
