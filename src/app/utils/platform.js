// Utilitaires de synchronisation de voie (quai) entre listes et détails

// Normalisation robuste des noms de gares (ex: "Dijon-Ville" ≈ "Dijon")
export function normalizeStation(name) {
  if (!name) return '';
  let s = (name + '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.trim().toLowerCase();
  // Supprime suffixes courants
  s = s.replace(/[- ]?ville$/, '');
  // Compacte
  s = s.replace(/[^a-z0-9]/g, '');
  return s;
}

// Extrait la plateforme à partir d'un objet stop (plusieurs alias possibles)
function stopPlatform(st) {
  if (!st) return null;
  return (
    st.platform ||
    st.voie ||
    st.track ||
    st.platform_code ||
    st.departure_platform ||
    st.arrival_platform ||
    null
  );
}

// Cherche un arrêt par nom de gare normalisé dans un tableau de stops
function findStopPlatform(stops, stationName) {
  const key = normalizeStation(stationName);
  if (!key || !Array.isArray(stops)) return null;
  for (const st of stops) {
    const n = normalizeStation(st.station_name || st.station || '');
    if (n && n === key) {
      const p = stopPlatform(st);
      if (p) return p;
    }
  }
  return null;
}

// Retourne la plateforme à afficher pour une gare donnée sur un sillon (schedule)
export function platformForStation(schedule, stationName) {
  if (!schedule || !stationName) return null;
  // 1) Si reroute/stops fournis côté objet, priorité
  if (schedule.reroute && Array.isArray(schedule.reroute.stops) && schedule.reroute.stops.length) {
    const p = findStopPlatform(schedule.reroute.stops, stationName);
    if (p) return p;
  }
  // 2) Détails originaux si présents
  if (Array.isArray(schedule.original_stops_detailed) && schedule.original_stops_detailed.length) {
    const p = findStopPlatform(schedule.original_stops_detailed, stationName);
    if (p) return p;
  }
  // 3) Stops simples
  if (Array.isArray(schedule.stops) && schedule.stops.length) {
    const p = findStopPlatform(schedule.stops, stationName);
    if (p) return p;
  }
  // 4) Champs directs de plateforme (board)
  return (
    schedule.platform ||
    schedule.departure_platform ||
    schedule.arrival_platform ||
    schedule.track ||
    schedule.platform_code ||
    null
  );
}

