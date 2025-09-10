"use client";
import React, { useEffect, useState } from "react";

function AutocompleteGare({ label, value, onChange, disabled }) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (input.length < 2) {
      setSuggestions([]);
      return;
    }
    fetch(`/api/public/stations/search?q=${encodeURIComponent(input)}&limit=8`)
      .then(res => res.json())
      .then(data => setSuggestions(data.items || []));
  }, [input]);

  return (
    <div className="mb-3 position-relative">
      <label className="form-label">{label}</label>
      <input
        type="text"
        className="form-control"
        value={value?.name || input}
        onChange={e => {
          setInput(e.target.value);
          onChange(null);
        }}
        onFocus={() => setShow(true)}
        disabled={disabled}
        autoComplete="off"
      />
      {show && suggestions.length > 0 && !value && (
        <ul className="list-group position-absolute w-100 z-3" style={{ maxHeight: 200, overflowY: 'auto' }}>
          {suggestions.map(s => (
            <li
              key={s.id}
              className="list-group-item list-group-item-action"
              style={{ cursor: 'pointer' }}
              onMouseDown={() => {
                onChange(s);
                setInput("");
                setShow(false);
              }}
            >
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModalCreerLigne({ show, onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [depart, setDepart] = useState(null);
  const [arrivee, setArrivee] = useState(null);
  const [type, setType] = useState("");
  const [desservies, setDesservies] = useState([]);
  const [gareInput, setGareInput] = useState("");
  const [gareSuggestions, setGareSuggestions] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Autocomplétion pour gares desservies
  useEffect(() => {
    if (gareInput.length < 2) {
      setGareSuggestions([]);
      return;
    }
    fetch(`/api/public/stations/search?q=${encodeURIComponent(gareInput)}&limit=8`)
      .then(res => res.json())
      .then(data => setGareSuggestions(data.items || []));
  }, [gareInput]);

  const reset = () => {
    setStep(1);
    setDepart(null);
    setArrivee(null);
    setType("");
    setDesservies([]);
    setGareInput("");
    setGareSuggestions([]);
    setError("");
    setLoading(false);
  };

  const handleCreate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/lignes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depart_station_id: depart.id,
          arrivee_station_id: arrivee.id,
          exploitation_type: type,
          desservies: desservies.map(g => g.id)
        })
      });
      if (!res.ok) throw new Error();
      onCreated && onCreated();
      reset();
      onClose();
    } catch {
      setError("Erreur lors de la création de la ligne");
    }
    setLoading(false);
  };

  if (!show) return null;

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.3)' }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Créer une ligne</h5>
            <button type="button" className="btn-close" onClick={() => { reset(); onClose(); }}></button>
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}
            {step === 1 && (
              <>
                <AutocompleteGare label="Gare de départ" value={depart} onChange={setDepart} disabled={loading} />
                <AutocompleteGare label="Gare d'arrivée" value={arrivee} onChange={setArrivee} disabled={loading} />
                <div className="mb-3">
                  <label className="form-label">Type d'exploitation</label>
                  <select className="form-select" value={type} onChange={e => setType(e.target.value)} disabled={loading}>
                    <option value="">Sélectionner</option>
                    <option value="voyageur">Voyageur</option>
                    <option value="fret">FRET</option>
                    <option value="exploitation">Exploitation</option>
                  </select>
                </div>
                <button className="btn btn-primary" disabled={!depart || !arrivee || !type || loading} onClick={() => setStep(2)}>
                  Continuer
                </button>
              </>
            )}
            {step === 2 && (
              <>
                <div className="mb-3">
                  <label className="form-label">Ajouter une gare desservie</label>
                  <input
                    type="text"
                    className="form-control"
                    value={gareInput}
                    onChange={e => setGareInput(e.target.value)}
                    disabled={loading}
                    placeholder="Nom de la gare"
                  />
                  {gareSuggestions.length > 0 && (
                    <ul className="list-group position-absolute w-100 z-3" style={{ maxHeight: 200, overflowY: 'auto' }}>
                      {gareSuggestions.map(s => (
                        <li
                          key={s.id}
                          className="list-group-item list-group-item-action"
                          style={{ cursor: 'pointer' }}
                          onMouseDown={() => {
                            if (!desservies.find(g => g.id === s.id)) setDesservies([...desservies, s]);
                            setGareInput("");
                            setGareSuggestions([]);
                          }}
                        >
                          {s.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label">Gares desservies</label>
                  <ul className="list-group">
                    {desservies.map((g, i) => (
                      <li key={g.id} className="list-group-item d-flex justify-content-between align-items-center">
                        {g.name}
                        <button className="btn btn-sm btn-outline-danger" onClick={() => setDesservies(desservies.filter((_, idx) => idx !== i))}>
                          Supprimer
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="d-flex justify-content-between">
                  <button className="btn btn-secondary" onClick={() => setStep(1)} disabled={loading}>Retour</button>
                  <button className="btn btn-primary" onClick={() => setStep(3)} disabled={loading}>Continuer</button>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <h6>Résumé</h6>
                <ul className="list-group mb-3">
                  <li className="list-group-item"><b>Départ :</b> {depart?.name}</li>
                  <li className="list-group-item"><b>Arrivée :</b> {arrivee?.name}</li>
                  <li className="list-group-item"><b>Type :</b> {type}</li>
                  <li className="list-group-item"><b>Gares desservies :</b>
                    <ul className="mb-0">
                      {desservies.map(g => <li key={g.id}>{g.name}</li>)}
                    </ul>
                  </li>
                </ul>
                <div className="d-flex justify-content-between">
                  <button className="btn btn-secondary" onClick={() => setStep(2)} disabled={loading}>Retour</button>
                  <button className="btn btn-success" onClick={handleCreate} disabled={loading}>Créer la ligne</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalEditLigne({ show, onClose, ligne, onUpdated }) {
  const [step, setStep] = useState(1);
  const [depart, setDepart] = useState(ligne ? { id: ligne.depart_station_id, name: ligne.depart_name } : null);
  const [arrivee, setArrivee] = useState(ligne ? { id: ligne.arrivee_station_id, name: ligne.arrivee_name } : null);
  const [type, setType] = useState(ligne ? ligne.exploitation_type : "");
  const [desservies, setDesservies] = useState(ligne && Array.isArray(ligne.desservies) ? ligne.desservies.map((id, i) => ({ id, name: (ligne.desservies_names && ligne.desservies_names[i]) || id })) : []);
  const [gareInput, setGareInput] = useState("");
  const [gareSuggestions, setGareSuggestions] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (gareInput.length < 2) {
      setGareSuggestions([]);
      return;
    }
    fetch(`/api/public/stations/search?q=${encodeURIComponent(gareInput)}&limit=8`)
      .then(res => res.json())
      .then(data => setGareSuggestions(data.items || []));
  }, [gareInput]);

  useEffect(() => {
    if (ligne) {
      setDepart({ id: ligne.depart_station_id, name: ligne.depart_name });
      setArrivee({ id: ligne.arrivee_station_id, name: ligne.arrivee_name });
      setType(ligne.exploitation_type);
      setDesservies(Array.isArray(ligne.desservies) ? ligne.desservies.map((id, i) => ({ id, name: (ligne.desservies_names && ligne.desservies_names[i]) || id })) : []);
      setStep(1);
      setError("");
      setLoading(false);
    }
  }, [ligne]);

  const reset = () => {
    setStep(1);
    setError("");
    setLoading(false);
  };

  const handleUpdate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/lignes/${ligne.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depart_station_id: depart.id,
          arrivee_station_id: arrivee.id,
          exploitation_type: type,
          desservies: desservies.map(g => g.id)
        })
      });
      if (!res.ok) throw new Error();
      onUpdated && onUpdated();
      reset();
      onClose();
    } catch {
      setError("Erreur lors de la modification de la ligne");
    }
    setLoading(false);
  };

  if (!show || !ligne) return null;

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.3)' }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Modifier la ligne</h5>
            <button type="button" className="btn-close" onClick={() => { reset(); onClose(); }}></button>
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}
            {step === 1 && (
              <>
                <AutocompleteGare label="Gare de départ" value={depart} onChange={setDepart} disabled={loading} />
                <AutocompleteGare label="Gare d'arrivée" value={arrivee} onChange={setArrivee} disabled={loading} />
                <div className="mb-3">
                  <label className="form-label">Type d'exploitation</label>
                  <select className="form-select" value={type} onChange={e => setType(e.target.value)} disabled={loading}>
                    <option value="">Sélectionner</option>
                    <option value="voyageur">Voyageur</option>
                    <option value="fret">FRET</option>
                    <option value="exploitation">Exploitation</option>
                  </select>
                </div>
                <button className="btn btn-primary" disabled={!depart || !arrivee || !type || loading} onClick={() => setStep(2)}>
                  Continuer
                </button>
              </>
            )}
            {step === 2 && (
              <>
                <div className="mb-3">
                  <label className="form-label">Ajouter une gare desservie</label>
                  <input
                    type="text"
                    className="form-control"
                    value={gareInput}
                    onChange={e => setGareInput(e.target.value)}
                    disabled={loading}
                    placeholder="Nom de la gare"
                  />
                  {gareSuggestions.length > 0 && (
                    <ul className="list-group position-absolute w-100 z-3" style={{ maxHeight: 200, overflowY: 'auto' }}>
                      {gareSuggestions.map(s => (
                        <li
                          key={s.id}
                          className="list-group-item list-group-item-action"
                          style={{ cursor: 'pointer' }}
                          onMouseDown={() => {
                            if (!desservies.find(g => g.id === s.id)) setDesservies([...desservies, s]);
                            setGareInput("");
                            setGareSuggestions([]);
                          }}
                        >
                          {s.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label">Gares desservies</label>
                  <ul className="list-group">
                    {desservies.map((g, i) => (
                      <li key={g.id} className="list-group-item d-flex justify-content-between align-items-center">
                        {g.name}
                        <button className="btn btn-sm btn-outline-danger" onClick={() => setDesservies(desservies.filter((_, idx) => idx !== i))}>
                          Supprimer
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="d-flex justify-content-between">
                  <button className="btn btn-secondary" onClick={() => setStep(1)} disabled={loading}>Retour</button>
                  <button className="btn btn-primary" onClick={() => setStep(3)} disabled={loading}>Continuer</button>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <h6>Résumé</h6>
                <ul className="list-group mb-3">
                  <li className="list-group-item"><b>Départ :</b> {depart?.name}</li>
                  <li className="list-group-item"><b>Arrivée :</b> {arrivee?.name}</li>
                  <li className="list-group-item"><b>Type :</b> {type}</li>
                  <li className="list-group-item"><b>Gares desservies :</b>
                    <ul className="mb-0">
                      {desservies.map(g => <li key={g.id}>{g.name}</li>)}
                    </ul>
                  </li>
                </ul>
                <div className="d-flex justify-content-between">
                  <button className="btn btn-secondary" onClick={() => setStep(2)} disabled={loading}>Retour</button>
                  <button className="btn btn-success" onClick={handleUpdate} disabled={loading}>Enregistrer</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LignesAdmin() {
  const [lignes, setLignes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editModal, setEditModal] = useState({ show: false, ligne: null });

  const fetchLignes = () => {
    setLoading(true);
    fetch("/api/lignes")
      .then(res => res.json())
      .then(data => setLignes(data.lignes || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLignes();
  }, []);

  // Suppression de ligne
  const handleDelete = async (id) => {
    if (!window.confirm("Supprimer cette ligne ?")) return;
    setLoading(true);
    await fetch(`/api/lignes/${id}`, { method: "DELETE" });
    fetchLignes();
  };

  return (
    <div className="container my-4">
      <h1 className="h3 mb-3">Lignes</h1>
      <p className="text-muted">Créez, modifiez et supprimez les lignes de train.</p>
      <wcs-button color="primary" onClick={() => setShowModal(true)} class="mb-3">
        Créer une ligne
      </wcs-button>
      <ModalCreerLigne show={showModal} onClose={() => setShowModal(false)} onCreated={fetchLignes} />
      <ModalEditLigne show={editModal.show} onClose={() => setEditModal({ show: false, ligne: null })} ligne={editModal.ligne} onUpdated={fetchLignes} />
      {loading ? (
        <div>Chargement…</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Départ</th>
              <th>Arrivée</th>
              <th>Type</th>
              <th>Gares desservies</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map(ligne => (
              <tr key={ligne.id}>
                <td>{ligne.depart_name}</td>
                <td>{ligne.arrivee_name}</td>
                <td>{ligne.exploitation_type}</td>
                <td>
                  <span className="badge bg-info">{Array.isArray(ligne.desservies) ? ligne.desservies.length : 0}</span>
                </td>
                <td>
                  <wcs-button color="primary" fill="clear" size="small" onClick={() => setEditModal({ show: true, ligne })}>
                    Modifier
                  </wcs-button>
                  <wcs-button color="danger" fill="clear" size="small" onClick={() => handleDelete(ligne.id)}>
                    Supprimer
                  </wcs-button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
