"use client";
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

// Import Leaflet dynamiquement pour éviter les problèmes SSR
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false, loading: () => <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Chargement de la carte...</div> }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);

// Définition des régions avec leurs couleurs
const REGIONS_COLORS = {
  'alsace': { primary: '#E30613', secondary: '#FFD400', name: 'Alsace' },
  'aquitaine': { primary: '#E30613', secondary: '#009FE3', name: 'Aquitaine' },
  'auvergne': { primary: '#009FE3', secondary: '#8BC53F', name: 'Auvergne' },
  'basse-normandie': { primary: '#E30613', secondary: '#FFD400', name: 'Basse-Normandie' },
  'bourgogne': { primary: '#009FE3', secondary: '#8BC53F', name: 'Bourgogne' },
  'bretagne': { primary: '#000000', secondary: '#FFFFFF', name: 'Bretagne' },
  'centre': { primary: '#E30613', secondary: '#009FE3', name: 'Centre-Val de Loire' },
  'champagne-ardenne': { primary: '#E30613', secondary: '#FFD400', name: 'Champagne-Ardenne' },
  'corse': { primary: '#009FE3', secondary: '#E30613', name: 'Corse' },
  'franche-comte': { primary: '#009FE3', secondary: '#8BC53F', name: 'Franche-Comté' },
  'haute-normandie': { primary: '#E30613', secondary: '#009FE3', name: 'Haute-Normandie' },
  'ile-de-france': { primary: '#009FE3', secondary: '#E30613', name: 'Île-de-France' },
  'languedoc-roussillon': { primary: '#E30613', secondary: '#FFD400', name: 'Languedoc-Roussillon' },
  'limousin': { primary: '#E30613', secondary: '#009FE3', name: 'Limousin' },
  'lorraine': { primary: '#E30613', secondary: '#FFD400', name: 'Lorraine' },
  'midi-pyrenees': { primary: '#E30613', secondary: '#009FE3', name: 'Midi-Pyrénées' },
  'nord-pas-de-calais': { primary: '#E30613', secondary: '#FFD400', name: 'Nord-Pas-de-Calais' },
  'pays-de-la-loire': { primary: '#009FE3', secondary: '#8BC53F', name: 'Pays de la Loire' },
  'picardie': { primary: '#009FE3', secondary: '#E30613', name: 'Picardie' },
  'poitou-charentes': { primary: '#009FE3', secondary: '#FFD400', name: 'Poitou-Charentes' },
  'paca': { primary: '#009FE3', secondary: '#E30613', name: 'Provence-Alpes-Côte d\'Azur' },
  'rhone-alpes': { primary: '#E30613', secondary: '#009FE3', name: 'Rhône-Alpes' },
};

export default function AfficheurInterieurPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const materiel = params.materiel;
  const trainNumber = params.train;
  const regionSlug = searchParams.get('region') || 'bourgogne';
  const modulesParam = searchParams.get('modules') || 'prochain-arret';

  const modules = modulesParam.split(',').filter(Boolean);
  const regionColors = REGIONS_COLORS[regionSlug] || REGIONS_COLORS['bourgogne'];

  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [trainData, setTrainData] = useState(null);
  const [sillonData, setSillonData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mapReady, setMapReady] = useState(false);
  const numeroVoiture = Math.floor(Math.random() * 8) + 1;

  // Charger les données du sillon depuis l'API
  useEffect(() => {
    // Récupérer la date du jour au format YYYY-MM-DD
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    fetch(`/api/sillons/by-train/${trainNumber}?date=${dateStr}`)
      .then(res => res.json())
      .then(data => {
        console.log('Données du sillon récupérées:', data);
        setSillonData(data);
      })
      .catch(err => {
        console.error('Erreur chargement sillon:', err);
      });
  }, [trainNumber]);

  // Charger les données du train
  useEffect(() => {
    // Récupérer la date du jour au format YYYY-MM-DD
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    fetch(`/api/trains/${trainNumber}?date=${dateStr}`)
      .then(res => res.json())
      .then(data => {
        console.log('Données du train récupérées:', data);

        // Vérifier si le train circule aujourd'hui
        if (data.circulation && data.circulation.circulates_today === false) {
          console.warn(`Le train ${trainNumber} ne circule pas aujourd'hui`);
        }

        setTrainData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erreur chargement train:', err);
        setLoading(false);
      });
  }, [trainNumber]);

  // Mettre à jour l'heure
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Rotation des modules toutes les 10 secondes
  useEffect(() => {
    if (modules.length > 1) {
      const interval = setInterval(() => {
        setCurrentModuleIndex((prev) => (prev + 1) % modules.length);
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [modules.length]);

  // Préparer la carte après le chargement
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setMapReady(true);
    }
  }, []);

  const currentModule = modules[currentModuleIndex];

  // Composants pour chaque module
  const ModuleCarte = () => {
    // Calculer le centre de la carte basé sur les arrêts
    const validStops = trainData?.stops?.filter(s => s.lat && s.lon) || [];
    let center = [47.0, 5.0]; // Centre par défaut (France)
    let zoom = 8;

    if (validStops.length > 0) {
      const avgLat = validStops.reduce((sum, s) => sum + parseFloat(s.lat), 0) / validStops.length;
      const avgLon = validStops.reduce((sum, s) => sum + parseFloat(s.lon), 0) / validStops.length;
      center = [avgLat, avgLon];

      // Ajuster le zoom en fonction de la dispersion des points
      if (validStops.length > 1) {
        const lats = validStops.map(s => parseFloat(s.lat));
        const lons = validStops.map(s => parseFloat(s.lon));
        const latDiff = Math.max(...lats) - Math.min(...lats);
        const lonDiff = Math.max(...lons) - Math.min(...lons);
        const maxDiff = Math.max(latDiff, lonDiff);

        if (maxDiff < 0.1) zoom = 12;
        else if (maxDiff < 0.5) zoom = 10;
        else if (maxDiff < 1) zoom = 9;
        else zoom = 8;
      }
    }

    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '20px',
          background: regionColors.primary,
          color: 'white',
          textAlign: 'center',
          fontSize: '28px',
          fontWeight: 'bold'
        }}>
          Carte de la ligne
        </div>
        <div style={{ flex: 1, position: 'relative', background: '#f0f0f0' }}>
          {mapReady && validStops.length > 0 ? (
            <MapContainer
              center={center}
              zoom={zoom}
              style={{ width: '100%', height: '100%', zIndex: 1 }}
              scrollWheelZoom={false}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {validStops.length > 1 && (
                <Polyline
                  positions={validStops.map(s => [parseFloat(s.lat), parseFloat(s.lon)])}
                  color={regionColors.primary}
                  weight={4}
                  opacity={0.8}
                />
              )}
              {validStops.map((stop, idx) => (
                <Marker key={idx} position={[parseFloat(stop.lat), parseFloat(stop.lon)]}>
                  <Popup>
                    <strong>{stop.name}</strong>
                    {stop.arrival_time && <div>Arrivée: {stop.arrival_time}</div>}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
              fontSize: '24px'
            }}>
              {!mapReady ? (
                <>
                  <div style={{ marginBottom: '20px' }}>⏳</div>
                  <div>Chargement de la carte...</div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '20px' }}>📍</div>
                  <div>Aucune donnée géographique disponible</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const ModulePromo = () => (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: `linear-gradient(135deg, ${regionColors.primary} 0%, ${regionColors.secondary} 100%)`,
      color: 'white',
      padding: '40px'
    }}>
      <div style={{ fontSize: '48px', fontWeight: 'bold', marginBottom: '20px' }}>
        🎉 Promotion TER
      </div>
      <div style={{ fontSize: '32px', textAlign: 'center' }}>
        Découvrez nos offres exceptionnelles
      </div>
      <div style={{ fontSize: '24px', marginTop: '20px', opacity: 0.9 }}>
        Réservez dès maintenant sur ter.sncf.com
      </div>
    </div>
  );

  const ModuleProchinArret = () => {
    const prochainArret = trainData?.stops?.find(s => !s.departed) || trainData?.stops?.[0];
    const terminus = trainData?.stops?.[trainData.stops.length - 1];
    const indexProchain = trainData?.stops?.findIndex(s => s.name === prochainArret?.name) || 0;
    const totalStops = trainData?.stops?.length || 1;
    const progression = totalStops > 1 ? (indexProchain / (totalStops - 1)) * 100 : 0;

    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#4A4A4A',
        fontFamily: 'Arial, sans-serif'
      }}>
        {/* Partie supérieure grise avec infos train et barre de progression */}
        <div style={{
          display: 'flex',
          background: '#4A4A4A',
          color: 'white',
          padding: '0',
          height: '35%',
          borderBottom: '3px solid #E0E0E0'
        }}>
          {/* Bloc gauche bleu avec train et heure */}
          <div style={{
            width: '30%',
            background: regionColors.primary,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '20px',
            gap: '15px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ fontSize: '72px', lineHeight: 1 }}>🚆</div>
              <div style={{ fontSize: '64px', fontWeight: 'bold', lineHeight: 1 }}>
                {trainNumber}
              </div>
            </div>
            <div style={{
              fontSize: '72px',
              fontWeight: 'bold',
              lineHeight: 1,
              marginTop: '10px'
            }}>
              {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          {/* Bloc droite avec progression et gares */}
          <div style={{
            flex: 1,
            padding: '30px 40px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '20px'
          }}>
            {/* Noms des gares */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              <div>
                <div style={{ fontSize: '42px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {prochainArret?.name || 'Chargement...'}
                </div>
                <div style={{
                  fontSize: '32px',
                  color: '#E0E0E0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    border: '3px solid white',
                    borderRadius: '50%',
                    background: 'transparent'
                  }}></div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '42px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {terminus?.name || ''}
                </div>
                <div style={{
                  fontSize: '32px',
                  color: '#E0E0E0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '8px'
                }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    border: '3px solid white',
                    borderRadius: '50%',
                    background: 'transparent'
                  }}></div>
                </div>
              </div>
            </div>

            {/* Barre de progression */}
            <div style={{
              position: 'relative',
              height: '12px',
              background: '#6A6A6A',
              borderRadius: '6px',
              overflow: 'visible'
            }}>
              {/* Partie remplie */}
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: `${progression}%`,
                background: regionColors.primary,
                borderRadius: '6px',
                transition: 'width 0.5s ease'
              }}></div>

              {/* Indicateur de position actuelle (train) */}
              <div style={{
                position: 'absolute',
                left: `${progression}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '48px',
                height: '48px',
                background: regionColors.primary,
                borderRadius: '50%',
                border: '4px solid white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                zIndex: 2
              }}>
                🚆
              </div>

              {/* Points aux extrémités */}
              <div style={{
                position: 'absolute',
                left: '0',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '20px',
                height: '20px',
                background: 'white',
                borderRadius: '50%',
                border: '3px solid #6A6A6A'
              }}></div>
              <div style={{
                position: 'absolute',
                right: '0',
                top: '50%',
                transform: 'translate(50%, -50%)',
                width: '20px',
                height: '20px',
                background: 'white',
                borderRadius: '50%',
                border: '3px solid #6A6A6A'
              }}></div>
            </div>

            {/* Horaires */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '36px',
              fontWeight: 'bold',
              marginTop: '5px'
            }}>
              <div>{prochainArret?.arrival_time || '--:--'}</div>
              <div>{terminus?.arrival_time || '--:--'}</div>
            </div>
          </div>
        </div>

        {/* Partie inférieure blanche avec message d'accueil et destination */}
        <div style={{
          flex: 1,
          background: 'white',
          padding: '50px 60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '40px'
        }}>
          <div style={{
            fontSize: '38px',
            color: '#333',
            lineHeight: 1.4
          }}>
            La Région {regionColors.name} et SNCF vous souhaitent la bienvenue à bord du train TER
          </div>

          <div>
            <div style={{
              fontSize: '42px',
              color: '#666',
              marginBottom: '15px'
            }}>
              à destination de :
            </div>
            <div style={{
              fontSize: '72px',
              fontWeight: 'bold',
              color: regionColors.primary,
              lineHeight: 1.2
            }}>
              {terminus?.name || 'Chargement...'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const ModuleTerminus = () => {
    // Utiliser les données du sillon si disponibles, sinon fallback sur trainData
    const stops = sillonData?.stops || trainData?.stops || [];
    const depart = stops[0];
    const terminus = stops[stops.length - 1];
    const sillonId = sillonData?.sillon_id;

    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#4A4A4A',
        fontFamily: 'Arial, sans-serif'
      }}>
        {/* Partie supérieure grise avec infos train et barre de progression */}
        <div style={{
          display: 'flex',
          background: '#4A4A4A',
          color: 'white',
          padding: '0',
          height: '35%',
          borderBottom: '3px solid #E0E0E0'
        }}>
          {/* Bloc gauche bleu avec train et heure */}
          <div style={{
            width: '30%',
            background: regionColors.primary,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '20px',
            gap: '15px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ fontSize: '72px', lineHeight: 1 }}>🚆</div>
              <div style={{ fontSize: '64px', fontWeight: 'bold', lineHeight: 1 }}>
                {trainNumber}
              </div>
            </div>
            <div style={{
              fontSize: '72px',
              fontWeight: 'bold',
              lineHeight: 1,
              marginTop: '10px'
            }}>
              {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            {sillonId && (
              <div style={{
                fontSize: '24px',
                color: 'rgba(255,255,255,0.8)',
                marginTop: '5px'
              }}>
                Sillon #{sillonId}
              </div>
            )}
          </div>

          {/* Bloc droite avec progression et gares */}
          <div style={{
            flex: 1,
            padding: '30px 40px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '20px'
          }}>
            {/* Noms des gares */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              <div>
                <div style={{ fontSize: '42px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {depart?.name || sillonData?.departure_station || 'Chargement...'}
                </div>
                <div style={{
                  fontSize: '32px',
                  color: '#E0E0E0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    border: '3px solid white',
                    borderRadius: '50%',
                    background: 'transparent'
                  }}></div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '42px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {terminus?.name || sillonData?.arrival_station || ''}
                </div>
                <div style={{
                  fontSize: '32px',
                  color: '#E0E0E0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '8px'
                }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    border: '3px solid white',
                    borderRadius: '50%',
                    background: 'transparent'
                  }}></div>
                </div>
              </div>
            </div>

            {/* Barre de progression */}
            <div style={{
              position: 'relative',
              height: '12px',
              background: '#6A6A6A',
              borderRadius: '6px',
              overflow: 'visible'
            }}>
              {/* Partie remplie */}
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: '100%',
                background: regionColors.primary,
                borderRadius: '6px'
              }}></div>

              {/* Indicateur de position actuelle (train) - à la fin */}
              <div style={{
                position: 'absolute',
                right: '0',
                top: '50%',
                transform: 'translate(50%, -50%)',
                width: '48px',
                height: '48px',
                background: regionColors.primary,
                borderRadius: '50%',
                border: '4px solid white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                zIndex: 2
              }}>
                🚆
              </div>

              {/* Points aux extrémités */}
              <div style={{
                position: 'absolute',
                left: '0',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '20px',
                height: '20px',
                background: 'white',
                borderRadius: '50%',
                border: '3px solid #6A6A6A'
              }}></div>
              <div style={{
                position: 'absolute',
                right: '0',
                top: '50%',
                transform: 'translate(50%, -50%)',
                width: '20px',
                height: '20px',
                background: 'white',
                borderRadius: '50%',
                border: '3px solid #6A6A6A'
              }}></div>
            </div>

            {/* Horaires */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '36px',
              fontWeight: 'bold',
              marginTop: '5px'
            }}>
              <div>{depart?.departure_time || depart?.arrival_time || sillonData?.departure_time || '--:--'}</div>
              <div>{terminus?.arrival_time || sillonData?.arrival_time || '--:--'}</div>
            </div>
          </div>
        </div>

        {/* Partie inférieure blanche avec message de terminus */}
        <div style={{
          flex: 1,
          background: 'white',
          padding: '50px 60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '40px'
        }}>
          <div style={{
            fontSize: '38px',
            color: '#333',
            lineHeight: 1.4
          }}>
            La Région {regionColors.name} et SNCF vous remercient d'avoir voyagé à bord du train TER
          </div>

          <div>
            <div style={{
              fontSize: '42px',
              color: '#666',
              marginBottom: '15px'
            }}>
              terminus :
            </div>
            <div style={{
              fontSize: '72px',
              fontWeight: 'bold',
              color: regionColors.primary,
              lineHeight: 1.2
            }}>
              {terminus?.name || sillonData?.arrival_station || 'Chargement...'}
            </div>
          </div>

          <div style={{
            fontSize: '36px',
            color: '#666',
            marginTop: '20px'
          }}>
            Nous espérons vous revoir très prochainement
          </div>
        </div>
      </div>
    );
  };

  const ModuleNumeroVoiture = () => (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: '#fff',
      border: `8px solid ${regionColors.primary}`,
      boxSizing: 'border-box'
    }}>
      <div style={{ fontSize: '48px', color: regionColors.primary, marginBottom: '20px' }}>
        Voiture n°
      </div>
      <div style={{
        fontSize: '160px',
        fontWeight: 'bold',
        color: regionColors.primary,
        lineHeight: 1
      }}>
        {numeroVoiture}
      </div>
      <div style={{ fontSize: '32px', color: '#666', marginTop: '30px' }}>
        {materiel}
      </div>
    </div>
  );

  const ModuleGaresDesservies = () => (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#fff',
      padding: '30px'
    }}>
      <div style={{
        fontSize: '40px',
        fontWeight: 'bold',
        color: regionColors.primary,
        marginBottom: '30px',
        textAlign: 'center',
        borderBottom: `4px solid ${regionColors.secondary}`,
        paddingBottom: '15px'
      }}>
        Gares desservies - Train {trainNumber}
      </div>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '15px',
        padding: '10px'
      }}>
        {trainData?.stops?.map((stop, idx) => (
          <div key={idx} style={{
            padding: '15px 20px',
            background: idx % 2 === 0 ? '#f8f9fa' : '#fff',
            border: `2px solid ${regionColors.primary}20`,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '15px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: regionColors.primary,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '18px'
            }}>
              {idx + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '20px', fontWeight: '600', color: '#333' }}>
                {stop.name}
              </div>
              {stop.arrival_time && (
                <div style={{ fontSize: '16px', color: '#666', marginTop: '4px' }}>
                  {stop.arrival_time}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: regionColors.primary,
        color: 'white',
        fontSize: '48px',
        fontWeight: 'bold'
      }}>
        Chargement...
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: '#000',
      overflow: 'hidden'
    }}>
      {/* Conteneur carré */}
      <div style={{
        width: '100vmin',
        height: '100vmin',
        position: 'relative',
        fontFamily: 'Arial, sans-serif',
        overflow: 'hidden'
      }}>
        {/* Module principal */}
        <div style={{ width: '100%', height: 'calc(100% - 80px)' }}>
          {currentModule === 'carte' && <ModuleCarte />}
          {currentModule === 'promo' && <ModulePromo />}
          {currentModule === 'prochain-arret' && <ModuleProchinArret />}
          {currentModule === 'terminus' && <ModuleTerminus />}
          {currentModule === 'numero-voiture' && <ModuleNumeroVoiture />}
          {currentModule === 'gares-desservies' && <ModuleGaresDesservies />}
        </div>

        {/* Barre inférieure avec informations */}
        <div style={{
          height: '80px',
          background: regionColors.secondary,
          color: regionColors.secondary === '#FFD400' || regionColors.secondary === '#FFFFFF' ? '#000' : '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 40px',
          fontSize: '24px',
          fontWeight: '600',
          borderTop: `4px solid ${regionColors.primary}`
        }}>
          <div>Train {trainNumber} • {materiel}</div>
          <div>{regionColors.name}</div>
          <div>{currentTime.toLocaleTimeString('fr-FR')}</div>
        </div>

        {/* Indicateur de progression des modules */}
        {modules.length > 1 && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            display: 'flex',
            gap: '8px'
          }}>
            {modules.map((_, idx) => (
              <div key={idx} style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: idx === currentModuleIndex ? regionColors.primary : 'rgba(255,255,255,0.5)',
                border: '2px solid white'
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
