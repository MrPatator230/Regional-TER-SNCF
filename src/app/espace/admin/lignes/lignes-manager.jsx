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

  // Suggestions pour l'autocomplete des gares desservies
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
    <div className="modal show" style={{ display: 'block', background: 'rgba(0,0,0,0.2)' }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Créer une ligne</h5>
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}
            <div className="mb-3">
              <div className="progress mb-3" style={{height: 4}}>
                <div className="progress-bar" style={{width: `${step*33.33}%`}}></div>
              </div>
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
                  <button className="btn btn-primary" disabled={!depart || !arrivee || !type || loading} onClick={() => setStep(2)}>Continuer</button>
                </>
              )}
              {step === 2 && (
                <>
                  <div className="mb-3">
                    <label className="form-label">Ajouter une gare desservie</label>
                    <input type="text" className="form-control" value={gareInput} onChange={e => setGareInput(e.target.value)} disabled={loading} placeholder="Nom de la gare" />
                    {gareInput.length >= 2 && gareSuggestions.length > 0 && (
                      <ul className="list-group position-absolute w-100 z-3" style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {gareSuggestions.map(s => (
                          <li key={s.id} className="list-group-item list-group-item-action" style={{ cursor: 'pointer' }} onMouseDown={() => {
                            if (!desservies.find(g => g.id === s.id)) setDesservies([...desservies, s]);
                            setGareInput("");
                            setGareSuggestions([]);
                          }}>{s.name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <ul className="list-group mb-3">
                    {desservies.map((g, i) => (
                      <li key={g.id} className="list-group-item d-flex justify-content-between align-items-center">
                        {g.name}
                        <button className="btn btn-sm btn-danger" onClick={() => setDesservies(desservies.filter((_, idx) => idx !== i))}>Supprimer</button>
                      </li>
                    ))}
                  </ul>
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
          <div className="modal-footer d-flex justify-content-end">
            <button type="button" className="btn btn-secondary" onClick={() => { reset(); onClose(); }}>Fermer</button>
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
  const [desservies, setDesservies] = useState(ligne && Array.isArray(ligne.desservies) ? ligne.desservies.map((id, i) => ({ id, name: (ligne.desservies_names && ligne.desservies_names[i]) || null })) : []);
  const [gareInput, setGareInput] = useState("");
  const [gareSuggestions, setGareSuggestions] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Complète les noms manquants des gares desservies
  useEffect(() => {
    async function fetchMissingNames() {
      const missing = desservies.filter(g => !g.name);
      if (missing.length === 0) return;
      const results = await Promise.all(missing.map(g =>
        fetch(`/api/public/stations/${g.id}`)
          .then(res => res.ok ? res.json() : null)
          .catch(() => null)
      ));
      setDesservies(desservies => desservies.map(g => {
        if (g.name) return g;
        const found = results.find(r => r && (r.id === g.id || r._id === g.id));
        return found ? { ...g, name: found.name } : g;
      }));
    }
    if (desservies.some(g => !g.name)) fetchMissingNames();
    // eslint-disable-next-line
  }, [desservies]);

  // Suggestions pour l'autocomplete des gares desservies
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
    <div className="modal show" style={{ display: 'block', background: 'rgba(0,0,0,0.2)' }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Modifier la ligne</h5>
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}
            <div className="mb-3">
              <div className="progress mb-3" style={{height: 4}}>
                <div className="progress-bar" style={{width: `${step*33.33}%`}}></div>
              </div>
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
                  <button className="btn btn-primary" disabled={!depart || !arrivee || !type || loading} onClick={() => setStep(2)}>Continuer</button>
                </>
              )}
              {step === 2 && (
                <>
                  <div className="mb-3">
                    <label className="form-label">Ajouter une gare desservie</label>
                    <input type="text" className="form-control" value={gareInput} onChange={e => setGareInput(e.target.value)} disabled={loading} placeholder="Nom de la gare" />
                    {gareInput.length >= 2 && gareSuggestions.length > 0 && (
                      <ul className="list-group position-absolute w-100 z-3" style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {gareSuggestions.map(s => (
                          <li key={s.id} className="list-group-item list-group-item-action" style={{ cursor: 'pointer' }} onMouseDown={() => {
                            if (!desservies.find(g => g.id === s.id)) setDesservies([...desservies, s]);
                            setGareInput("");
                            setGareSuggestions([]);
                          }}>{s.name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <ul className="list-group mb-3">
                    {desservies.map((g, i) => (
                      <li key={g.id} className="list-group-item d-flex justify-content-between align-items-center">
                        {g.name}
                        <button className="btn btn-sm btn-danger" onClick={() => setDesservies(desservies.filter((_, idx) => idx !== i))}>Supprimer</button>
                      </li>
                    ))}
                  </ul>
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
          <div className="modal-footer d-flex justify-content-end">
            <button type="button" className="btn btn-secondary" onClick={() => { reset(); onClose(); }}>Fermer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LignesManager() {
  const [lignes, setLignes] = useState([]);
  const [modalCreerVisible, setModalCreerVisible] = useState(false);
  const [modalEditVisible, setModalEditVisible] = useState(false);
  const [ligneAModifier, setLigneAModifier] = useState(null);
  const [ligneASupprimer, setLigneASupprimer] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchLignes = () => {
    setLoading(true);
    fetch('/api/lignes')
      .then(res => res.json())
      .then(data => setLignes(Array.isArray(data) ? data : data.lignes || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLignes();
  }, []);

  return (
    <div className="container mt-4">
      <h1>Gestion des lignes</h1>
      <button className="btn btn-primary mb-3" onClick={() => setModalCreerVisible(true)}>Créer une ligne</button>
      {modalCreerVisible && (
        <ModalCreerLigne show={modalCreerVisible} onClose={() => setModalCreerVisible(false)} onCreated={fetchLignes} />
      )}
      {modalEditVisible && (
        <ModalEditLigne show={modalEditVisible} onClose={() => setModalEditVisible(false)} ligne={ligneAModifier} onUpdated={fetchLignes} />
      )}
      {ligneASupprimer && (
        <div className="modal show" style={{ display: 'block', background: 'rgba(0,0,0,0.2)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Supprimer la ligne</h5>
                <button type="button" className="btn-close" onClick={() => setLigneASupprimer(null)}></button>
              </div>
              <div className="modal-body">
                <p>Voulez-vous vraiment supprimer la ligne <b>{ligneASupprimer.depart_name} - {ligneASupprimer.arrivee_name}</b> ?</p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setLigneASupprimer(null)}>Annuler</button>
                <button className="btn btn-danger" onClick={async () => {
                  await fetch(`/api/lignes/${ligneASupprimer.id}`, { method: 'DELETE' });
                  setLigneASupprimer(null);
                  fetchLignes();
                }}>Supprimer</button>
              </div>
            </div>
          </div>
        </div>
      )}
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
                  <button className="btn btn-sm btn-warning me-2" onClick={() => { setLigneAModifier(ligne); setModalEditVisible(true); }}>Modifier</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setLigneASupprimer(ligne)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
