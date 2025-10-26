"use client";
import React, { useState, useEffect } from 'react';

// Définition des régions TER de 2016 avec leurs couleurs CSS
const REGIONS_2016 = [
  { name: 'Alsace', slug: 'alsace', primary: '#E30613', secondary: '#FFD400' },
  { name: 'Aquitaine', slug: 'aquitaine', primary: '#E30613', secondary: '#009FE3' },
  { name: 'Auvergne', slug: 'auvergne', primary: '#009FE3', secondary: '#8BC53F' },
  { name: 'Basse-Normandie', slug: 'basse-normandie', primary: '#E30613', secondary: '#FFD400' },
  { name: 'Bourgogne', slug: 'bourgogne', primary: '#009FE3', secondary: '#8BC53F' },
  { name: 'Bretagne', slug: 'bretagne', primary: '#000000', secondary: '#FFFFFF' },
  { name: 'Centre-Val de Loire', slug: 'centre', primary: '#E30613', secondary: '#009FE3' },
  { name: 'Champagne-Ardenne', slug: 'champagne-ardenne', primary: '#E30613', secondary: '#FFD400' },
  { name: 'Corse', slug: 'corse', primary: '#009FE3', secondary: '#E30613' },
  { name: 'Franche-Comté', slug: 'franche-comte', primary: '#009FE3', secondary: '#8BC53F' },
  { name: 'Haute-Normandie', slug: 'haute-normandie', primary: '#E30613', secondary: '#009FE3' },
  { name: 'Île-de-France', slug: 'ile-de-france', primary: '#009FE3', secondary: '#E30613' },
  { name: 'Languedoc-Roussillon', slug: 'languedoc-roussillon', primary: '#E30613', secondary: '#FFD400' },
  { name: 'Limousin', slug: 'limousin', primary: '#E30613', secondary: '#009FE3' },
  { name: 'Lorraine', slug: 'lorraine', primary: '#E30613', secondary: '#FFD400' },
  { name: 'Midi-Pyrénées', slug: 'midi-pyrenees', primary: '#E30613', secondary: '#009FE3' },
  { name: 'Nord-Pas-de-Calais', slug: 'nord-pas-de-calais', primary: '#E30613', secondary: '#FFD400' },
  { name: 'Pays de la Loire', slug: 'pays-de-la-loire', primary: '#009FE3', secondary: '#8BC53F' },
  { name: 'Picardie', slug: 'picardie', primary: '#009FE3', secondary: '#E30613' },
  { name: 'Poitou-Charentes', slug: 'poitou-charentes', primary: '#009FE3', secondary: '#FFD400' },
  { name: 'Provence-Alpes-Côte d\'Azur', slug: 'paca', primary: '#009FE3', secondary: '#E30613' },
  { name: 'Rhône-Alpes', slug: 'rhone-alpes', primary: '#E30613', secondary: '#009FE3' },
];

// Modules disponibles pour les afficheurs intérieurs
const MODULES_DISPONIBLES = [
  { id: 'carte', label: 'Carte de la ligne (Leaflet)' },
  { id: 'promo', label: 'Promotions' },
  { id: 'prochain-arret', label: 'Prochain arrêt' },
  { id: 'terminus', label: 'Terminus du train' },
  { id: 'numero-voiture', label: 'Numéro de voiture' },
  { id: 'gares-desservies', label: 'Liste des gares desservies' },
];

export default function AfficheursInterieursPage() {
  const [region, setRegion] = useState('');
  const [numeroTrain, setNumeroTrain] = useState('');
  const [typeMateriel, setTypeMateriel] = useState('');
  const [modulesSelectionnes, setModulesSelectionnes] = useState([]);
  const [trainsSuggestions, setTrainsSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [materielTypes, setMaterielTypes] = useState([]);
  const [trainData, setTrainData] = useState(null);
  const [loadingTrainData, setLoadingTrainData] = useState(false);

  // Récupérer les types de matériel disponibles
  useEffect(() => {
    fetch('/api/materiel-roulant')
      .then(res => res.json())
      .then(data => {
        if (data && data.materiels) {
          const types = [...new Set(data.materiels.map(m => m.type))].filter(Boolean);
          setMaterielTypes(types);
        }
      })
      .catch(err => console.error('Erreur lors du chargement du matériel:', err));
  }, []);

  // Autocomplétion pour les numéros de train
  useEffect(() => {
    if (numeroTrain.length >= 2) {
      fetch(`/api/schedules/search?train=${encodeURIComponent(numeroTrain)}`)
        .then(res => res.json())
        .then(data => {
          setTrainsSuggestions(data.trains || []);
          setShowSuggestions(true);
        })
        .catch(err => console.error('Erreur autocomplétion:', err));
    } else {
      setTrainsSuggestions([]);
      setShowSuggestions(false);
    }
  }, [numeroTrain]);

  // Charger les données du train quand le numéro change (et qu'il a au moins 4 chiffres)
  useEffect(() => {
    if (numeroTrain.length >= 4) {
      setLoadingTrainData(true);
      const today = new Date().toISOString().split('T')[0];

      fetch(`/api/trains/${numeroTrain}?date=${today}`)
        .then(res => res.json())
        .then(data => {
          if (!data.error) {
            setTrainData(data);
            // Pré-remplir le type de matériel si disponible
            if (data.rolling_stock && !typeMateriel) {
              setTypeMateriel(data.rolling_stock);
            }
          } else {
            setTrainData(null);
          }
          setLoadingTrainData(false);
        })
        .catch(err => {
          console.error('Erreur chargement données train:', err);
          setTrainData(null);
          setLoadingTrainData(false);
        });
    } else {
      setTrainData(null);
    }
  }, [numeroTrain]);

  const handleModuleToggle = (moduleId) => {
    setModulesSelectionnes(prev => {
      if (prev.includes(moduleId)) {
        return prev.filter(id => id !== moduleId);
      } else {
        return [...prev, moduleId];
      }
    });
  };

  const handleOpenAfficheur = (e) => {
    e.preventDefault();

    if (!region || !numeroTrain || !typeMateriel || modulesSelectionnes.length === 0) {
      alert('Veuillez remplir tous les champs et sélectionner au moins un module');
      return;
    }

    const regionData = REGIONS_2016.find(r => r.slug === region);
    const modulesParam = modulesSelectionnes.join(',');

    const url = `/afficheurs/interieurs/${encodeURIComponent(typeMateriel)}/${encodeURIComponent(numeroTrain)}?region=${regionData.slug}&modules=${modulesParam}`;
    window.open(url, '_blank');
  };

  const selectedRegion = REGIONS_2016.find(r => r.slug === region);

  return (
    <div>
      <h1>Afficheurs intérieurs de trains</h1>
      <p>Configurez l'afficheur intérieur pour visualiser les informations à bord du train.</p>

      <form onSubmit={handleOpenAfficheur} className="admin-form admin-form--wide">

        {/* Sélection de la région */}
        <wcs-form-field label="Région TER (2016)">
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="form-control"
          >
            <option value="">-- Sélectionnez une région --</option>
            {REGIONS_2016.map(r => (
              <option key={r.slug} value={r.slug}>{r.name}</option>
            ))}
          </select>
        </wcs-form-field>

        {/* Aperçu des couleurs de la région */}
        {selectedRegion && (
          <div className="color-preview">
            <div className="color-preview__title">Aperçu des couleurs :</div>
            <div className="color-preview__swatches">
              <div className="color-swatch" style={{ backgroundColor: selectedRegion?.primary }} />
              <span className="color-preview__label">Couleur principale</span>
              <div className="color-swatch" style={{ backgroundColor: selectedRegion?.secondary }} />
              <span className="color-preview__label">Couleur secondaire</span>
            </div>
          </div>
        )}

        {/* Type de matériel */}
        <wcs-form-field label="Type de matériel">
          <select
            value={typeMateriel}
            onChange={(e) => setTypeMateriel(e.target.value)}
            className="form-control"
          >
            <option value="">-- Sélectionnez le type de matériel --</option>
            {materielTypes.length > 0 ? (
              materielTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))
            ) : (
              <>
                <option value="AGC">AGC</option>
                <option value="Regio2N">Regio 2N</option>
                <option value="Z2N">Z 2N</option>
                <option value="Z27500">Z 27500</option>
                <option value="X73500">X 73500</option>
                <option value="B82500">B 82500</option>
              </>
            )}
          </select>
        </wcs-form-field>

        {/* Numéro de train avec autocomplétion */}
        <wcs-form-field label="Numéro de train">
          <div className="suggestion-wrap">
             <wcs-input
               value={numeroTrain}
               onInput={(e) => setNumeroTrain(e.target.value)}
               placeholder="Ex: 885401"
               onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
               onFocus={() => numeroTrain.length >= 2 && setShowSuggestions(true)}
             />

             {showSuggestions && trainsSuggestions.length > 0 && (
              <div className="suggestions-list">
                {trainsSuggestions.map((train, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setNumeroTrain(train.numero || train.train_number || train);
                      setShowSuggestions(false);
                    }}
                    className="suggestion-item"
                  >
                    {train.numero || train.train_number || train}
                  </div>
                ))}
              </div>
             )}
           </div>
         </wcs-form-field>

        {/* Prévisualisation des données du train */}
        {trainData && (
          <div className="preview-box">
            <div className="preview-box__title">Données du train :</div>
            <div className="preview-box__content">
              <div><strong>Numéro :</strong> {trainData.numero || trainData.train_number}</div>
              <div><strong>Type de matériel :</strong> {trainData.rolling_stock || 'N/A'}</div>
              <div><strong>Provenance :</strong> {trainData.provenance || 'Inconnue'}</div>
              <div><strong>Destination :</strong> {trainData.destination || 'Inconnue'}</div>
              <div><strong>Heure de départ :</strong> {new Date(trainData.departure_time).toLocaleTimeString('fr-FR')}</div>
              <div><strong>Heure d'arrivée :</strong> {new Date(trainData.arrival_time).toLocaleTimeString('fr-FR')}</div>
            </div>
          </div>
        )}

        {/* Sélection des modules */}
        <wcs-form-field label="Modules à afficher">
          <div className="modules-box">
            {MODULES_DISPONIBLES.map(module => (
              <div key={module.id} className="module-item">
                <label>
                  <input
                    type="checkbox"
                    checked={modulesSelectionnes.includes(module.id)}
                    onChange={() => handleModuleToggle(module.id)}
                  />
                  <span>{module.label}</span>
                </label>
              </div>
            ))}

            {modulesSelectionnes.length > 1 && (
              <div className="info-box">
                ℹ️ Les modules sélectionnés alterneront toutes les 10 secondes dans l'ordre coché
              </div>
            )}
          </div>
        </wcs-form-field>

        {/* Ordre des modules */}
        {modulesSelectionnes.length > 1 && (
          <div className="order-box">
            <div className="order-box__title">Ordre d'affichage :</div>
            <ol>
              {modulesSelectionnes.map(moduleId => {
                const module = MODULES_DISPONIBLES.find(m => m.id === moduleId);
                return <li key={moduleId}>{module?.label}</li>;
              })}
            </ol>
          </div>
        )}

        <div className="submit-row">
          <wcs-button
            type="submit"
            mode="primary"
            disabled={!region || !numeroTrain || !typeMateriel || modulesSelectionnes.length === 0}
          >
            Ouvrir l'afficheur intérieur
          </wcs-button>
        </div>
      </form>
    </div>
  );
}
