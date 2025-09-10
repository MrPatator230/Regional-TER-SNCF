"use client";
import React, { useState } from "react";

export default function MaterielForm({ asCard = true, hidePreview = false, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!hidePreview) setCreated(null);
    const form = e.currentTarget;
    const fd = new FormData(form);

    const capacity = Number(fd.get("capacity"));
    if (!fd.get("name") || !fd.get("technicalName") || !fd.get("trainType") || !capacity) {
      setError("Tous les champs sont requis.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/materiel-roulant", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Erreur serveur");
        return;
      }
      const data = await res.json();
      try { window.dispatchEvent(new CustomEvent('materiel:created', { detail: data })); } catch {}
      if (!hidePreview) setCreated(data);
      if (typeof onSuccess === 'function') {
        try { onSuccess(data); } catch {}
      }
      form.reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const FormInner = (
    <>
      {error ? <div className="form-error mb-3">{error}</div> : null}
      <form onSubmit={onSubmit} encType="multipart/form-data">
        <div className="form-group">
          <label htmlFor="name" className="required">Nom du matériel roulant</label>
          <input id="name" name="name" className="form-control" placeholder="Ex: Regio 2N" required />
        </div>
        <div className="form-group">
          <label htmlFor="technicalName" className="required">Nom technique</label>
          <input id="technicalName" name="technicalName" className="form-control" placeholder="Ex: Z55500" required />
        </div>
        <div className="form-group">
          <label htmlFor="capacity" className="required">Capacité</label>
          <input id="capacity" name="capacity" type="number" min="1" className="form-control" placeholder="Ex: 350" required />
        </div>
        <div className="form-group">
          <label htmlFor="trainType" className="required">Type de train (livrée / exploitant)</label>
          <input id="trainType" name="trainType" className="form-control" placeholder="Ex: TER BFC" required />
        </div>
        <div className="form-group">
          <label htmlFor="image">Visuel du train (image)</label>
          <input id="image" name="image" type="file" accept="image/*" className="form-control" />
          <small className="form-text text-muted">Optionnel. Le fichier sera stocké sur disque (public/img/m-r).</small>
        </div>
        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Création..." : "Créer"}
        </button>
      </form>
      {created && !hidePreview ? (
        <div className="mt-3">
          <div className="d-flex align-items-center">
            <div className="mr-3">
              {created.hasImage ? (
                <img
                  src={`/api/materiel-roulant/${created.id}/image`}
                  alt="Visuel matériel roulant"
                  className="img-thumbnail"
                  style={{ maxWidth: 160 }}
                />
              ) : (
                <div className="text-muted">Aucune image</div>
              )}
            </div>
            <div>
              <div className="font-weight-bold">{created.name} ({created.technical_name})</div>
              <div className="text-muted">Capacité: {created.capacity} • Type: {created.train_type}</div>
              <div className="text-primary">Numéro de série: {created.serial_number}</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  if (!asCard) {
    return FormInner;
  }

  return (
    <div className="card">
      <div className="card-body">
        <h2 className="h2">Créer un matériel roulant</h2>
        {FormInner}
      </div>
    </div>
  );
}
