"use client";
import React, { useEffect, useState } from "react";
import Header from "@/app/components/Header";
import Link from "next/link";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { platformForStation } from '@/app/utils/platform';
import { usePerturbations } from '@/app/hooks/usePerturbations';
import PerturbationBanner from '@/app/components/PerturbationBanner';

export default function BoardPage(){
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const typeParam = (searchParams.get("type") || "departures").toLowerCase();
  const [type, setType] = useState(typeParam === "arrivals" ? "arrivals" : "departures");
  const [data, setData] = useState(null); // {station,{days:[]}}
  // Nouveaux états pour expansion & session & détails
  const [openId, setOpenId] = useState(null); // schedule ouvert
  const [details, setDetails] = useState({}); // id -> {loading, schedule}
  const [session, setSession] = useState(null);
  const [favorites, setFavorites] = useState([]); // schedule_id[]
  const [selectedArrivalMap, setSelectedArrivalMap] = useState({}); // scheduleId -> arrival station
  const [marked, setMarked] = useState(new Set()); // multi sélection
  const [showGoCart, setShowGoCart] = useState(false);
  // Etats individuels par horaire: scheduleId -> { passengers, card }
  const [forms, setForms] = useState({});
  const getForm = (id)=> forms[id] || { passengers:1, card:'none' };
  const updateForm = (id, patch)=> setForms(f=> ({ ...f, [id]: { ...getForm(id), ...patch } }));
  // Etats manquants réintroduits
  const [choosing, setChoosing] = useState(false);
  const [addedIds, setAddedIds] = useState(new Set());
  // Voies synchronisées par horaire (schedule_id -> platform)
  const [platformsBySchedule, setPlatformsBySchedule] = useState({});
  // Utilisation du hook pour les perturbations
  const { loading: loadingPerturbations, getPerturbationsForLine } = usePerturbations();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Quand le query param change
  useEffect(() => {
    setType(typeParam === "arrivals" ? "arrivals" : "departures");
  }, [typeParam]);

  useEffect(() => {
    let aborted = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`/api/public/stations/${id}/board?type=${type}&days=2`, { cache: "no-store" });
        if(res.status===410){ if(!aborted) { setError('Sillons en refonte — horaires indisponibles'); setData(null); } return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!aborted) setData(json);
      } catch (e) {
        if (!aborted) setError("Impossible de charger les horaires.");
      } finally { if (!aborted) setLoading(false); }
    }
    load();
    return () => { aborted = true; };
  }, [id, type]);

  useEffect(() => {
    fetch('/api/public/session').then(r=>r.json()).then(j=> setSession(j.user || null)).catch(()=>{});
    fetch('/api/public/favorites').then(r=>r.json()).then(j=> setFavorites(j.favorites||[])).catch(()=>{});
  }, []);

  const titre = type === "departures" ? "Prochains départs" : "Prochaines arrivées";

  function onToggle(newType) {
    // Mettre à jour l'état local immédiatement
    setType(newType === "arrivals" ? "arrivals" : "departures");
    // Puis mettre à jour l'URL pour la persistance
    router.push(`/se-deplacer/prochains-departs/${id}?type=${newType}`);
    // Réinitialiser les états d'expansion
    setOpenId(null);
    setDetails({});
  }

  const days = data?.days || [];

  const formatDate = (iso) => {
    try {
      const raw = new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" });
      return raw.charAt(0).toUpperCase() + raw.slice(1); // Capitalise uniquement la première lettre (jour), conserve le mois en minuscule
    } catch { return iso; }
  };

  const toggleSchedule = async (sched, stationName, compoundId, dayDate) => {
    if (openId === compoundId) { setOpenId(null); return; }
    setOpenId(compoundId);
    if (!details[compoundId]) {
      setDetails(d => ({...d, [compoundId]: { loading: true, schedule: null }}));
      try {
        // 1. Si un nouveau parcours (reroute) est déjà fourni par le board (schedule_overrides), on l'utilise en priorité.
        if(sched.reroute && Array.isArray(sched.reroute.stops) && sched.reroute.stops.length){
          const stops = sched.reroute.stops.map(st=> ({
            station_name: st.station || st.station_name || '',
            time: st.departure || st.arrival || '',
            arrival_time: st.arrival || '',
            departure_time: st.departure || '',
            platform: st.platform || st.voie || st.track || st.platform_code || null
          }));
          const boardIndex = stops.findIndex(s=> s.station_name.toLowerCase() === stationName.toLowerCase());
          const scheduleObj = {
            id: sched.id,
            train_type: sched.train_type || '',
            train_number: sched.train_number || '',
            operator: 'SNCF Voyageurs',
            info: sched.info || (sched.rerouted? 'Parcours modifié' : ''),
            board_index: boardIndex >=0 ? boardIndex : 0,
            stops,
            delay_min: sched.delay_min || null,
            delay_cause: sched.delay_cause || null,
            rerouted: true,
            cancelled: !!sched.cancelled,
            original_stops: Array.isArray(sched.original_stops)? sched.original_stops: null,
            original_stops_detailed: Array.isArray(sched.original_stops_detailed)? sched.original_stops_detailed: null,
            original_destination: sched.original_destination,
            original_origin: sched.original_origin,
            new_destination: sched.destination,
            new_origin: sched.origin
          };
          setDetails(d => ({...d, [compoundId]: { loading: false, schedule: scheduleObj }}));
          // Mémorise la voie pour la gare courante si disponible
          const currentStop = stops.find(st => normalizeStation(st.station_name||'') === normalizeStation(stationName||''));
          if(currentStop && currentStop.platform){
            setPlatformsBySchedule(m => ({ ...m, [sched.id]: currentStop.platform }));
          }
          return; // pas de fetch journeys nécessaire
        }
        // Construire l'URL journeys: on cherche le trajet complet entre la gare affichée et la destination finale
        const from = stationName;
        const to = type === 'departures' ? sched.destination : sched.origin;
        // On fournit time et date pour filtrer, limit raisonnable
        const url = `/api/public/journeys?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&time=${encodeURIComponent(sched.time)}&date=${encodeURIComponent(dayDate)}&limit=10`;
        const res = await fetch(url);
        if(res.status===410){
          // Fallback vers les arrêts du sillon brut
          try {
            const r2 = await fetch(`/api/public/schedules/${sched.id}`);
            if (r2.ok) {
              const j2 = await r2.json();
              const stops2 = (j2.stops||[]).map(st => ({
                station_name: st.station_name || st.station || '',
                time: st.departure_time || st.arrival_time || st.time || null,
                arrival_time: st.arrival_time || null,
                departure_time: st.departure_time || null,
                platform: st.platform || st.voie || st.track || st.platform_code || null
              }));
              const boardIndex2 = stops2.findIndex(s=> (s.station_name||'').toLowerCase() === from.toLowerCase());
              const scheduleObj2 = {
                id: sched.id,
                train_type: sched.train_type || j2.train_type || '',
                train_number: sched.train_number || j2.train_number || '',
                operator: 'SNCF Voyageurs',
                info: sched.info || '',
                board_index: boardIndex2 >=0 ? boardIndex2 : 0,
                stops: stops2,
                delay_min: sched.delay_min || null,
                delay_cause: sched.delay_cause || null,
                cancelled: !!sched.cancelled
              };
              setDetails(d => ({...d, [compoundId]: { loading: false, schedule: scheduleObj2 }}));
              const currentStop2 = stops2.find(st => normalizeStation(st.station_name||'') === normalizeStation(from||''));
              if(currentStop2 && currentStop2.platform){
                setPlatformsBySchedule(m => ({ ...m, [sched.id]: currentStop2.platform }));
              }
              return;
            }
          } catch(_) {}
          setDetails(d => ({...d, [compoundId]: { loading: false, schedule: null }}));
          return;
        }
        const json = await res.json();
        let item = null;
        if(Array.isArray(json.items)) {
            item = json.items.find(i=> i.scheduleId === sched.id) || json.items.find(i=> i.trainNumber === sched.train_number && i.departure === sched.time);
        }
        if(!item) {
          // Fallback vers les arrêts du sillon brut si aucun item pertinant
          try {
            const r2 = await fetch(`/api/public/schedules/${sched.id}`);
            if (r2.ok) {
              const j2 = await r2.json();
              const stops2 = (j2.stops||[]).map(st => ({
                station_name: st.station_name || st.station || '',
                time: st.departure_time || st.arrival_time || st.time || null,
                arrival_time: st.arrival_time || null,
                departure_time: st.departure_time || null,
                platform: st.platform || st.voie || st.track || st.platform_code || null
              }));
              const boardIndex2 = stops2.findIndex(s=> (s.station_name||'').toLowerCase() === from.toLowerCase());
              const scheduleObj2 = {
                id: sched.id,
                train_type: sched.train_type || j2.train_type || '',
                train_number: sched.train_number || j2.train_number || '',
                operator: 'SNCF Voyageurs',
                info: sched.info || '',
                board_index: boardIndex2 >=0 ? boardIndex2 : 0,
                stops: stops2,
                delay_min: sched.delay_min || null,
                delay_cause: sched.delay_cause || null,
                cancelled: !!sched.cancelled
              };
              setDetails(d => ({...d, [compoundId]: { loading: false, schedule: scheduleObj2 }}));
              const currentStop2 = stops2.find(st => normalizeStation(st.station_name||'') === normalizeStation(from||''));
              if(currentStop2 && currentStop2.platform){
                setPlatformsBySchedule(m => ({ ...m, [sched.id]: currentStop2.platform }));
              }
              return;
            }
          } catch(_) {}
          throw new Error('Aucun détail');
        }
        const stops = (item.allStops||item.stops||[]).map((st)=>
          (
            {
              station_name: st.station || st.station_name || '',
              time: st.arrival || st.departure || st.time || null,
              arrival_time: st.arrival || null,
              departure_time: st.departure || null,
              platform: st.platform || st.voie || st.track || st.platform_code || null
            }
          )
        );
        // Si journeys ne renvoie qu'un tronçon (ex: depuis la gare du tableau), compléter avec le sillon complet
        let finalStops = stops;
        try {
          const originName = (sched.origin || item.origin || '').toLowerCase();
          const destName = (sched.destination || item.destination || '').toLowerCase();
          const firstName = (stops[0]?.station_name || '').toLowerCase();
          const lastName = (stops[stops.length-1]?.station_name || '').toLowerCase();
          const isFull = stops.length>0 && firstName === originName && lastName === destName;
          if(!isFull){
            const rFull = await fetch(`/api/public/schedules/${sched.id}`);
            if(rFull.ok){
              const jFull = await rFull.json();
              const full = (jFull.stops||[]).map(st=> ({
                station_name: st.station_name || st.station || '',
                time: st.departure_time || st.arrival_time || st.time || null,
                arrival_time: st.arrival_time || null,
                departure_time: st.departure_time || null,
                platform: st.platform || st.voie || st.track || st.platform_code || null
              }));
              if(full.length){ finalStops = full; }
            }
          }
        } catch(_) {}
        const boardIndex = finalStops.findIndex(s=> s.station_name.toLowerCase() === from.toLowerCase());
        const scheduleObj = {
          id: sched.id,
            train_type: sched.train_type || item.trainType || '',
            train_number: sched.train_number || item.trainNumber || '',
            operator: 'SNCF Voyageurs',
            info: (()=> { const disruptions = item.disruptions || item.perturbations || item.alerts || []; const disruptMsg = Array.isArray(disruptions)? disruptions.map(d=> d.message || d.text || d.label || d.title).filter(Boolean).join(' \n'):''; return disruptMsg || item.info || sched.info || ''; })(),
            board_index: boardIndex >=0 ? boardIndex : 0,
            stops: finalStops,
            delay_min: sched.delay_min || null,
            delay_cause: sched.delay_cause || null,
            cancelled: !!sched.cancelled
        };
        setDetails(d => ({...d, [compoundId]: { loading: false, schedule: scheduleObj }}));
        // Mémorise la voie pour la gare courante si disponible
        const currentStop = finalStops.find(st => normalizeStation(st.station_name||'') === normalizeStation(from||''));
        if(currentStop && currentStop.platform){
          setPlatformsBySchedule(m => ({ ...m, [sched.id]: currentStop.platform }));
        }
      } catch(e) {
        // Dernier filet de sécurité: tenter encore le sillon brut
        try {
          const r2 = await fetch(`/api/public/schedules/${sched.id}`);
          if (r2.ok) {
            const j2 = await r2.json();
            const stops2 = (j2.stops||[]).map(st => ({
              station_name: st.station_name || st.station || '',
              time: st.departure_time || st.arrival_time || st.time || null,
              arrival_time: st.arrival_time || null,
              departure_time: st.departure_time || null,
              platform: st.platform || st.voie || st.track || st.platform_code || null
            }));
            const boardIndex2 = stops2.findIndex(s=> (s.station_name||'').toLowerCase() === stationName.toLowerCase());
            const scheduleObj2 = {
              id: sched.id,
              train_type: sched.train_type || j2.train_type || '',
              train_number: sched.train_number || j2.train_number || '',
              operator: 'SNCF Voyageurs',
              info: sched.info || '',
              board_index: boardIndex2 >=0 ? boardIndex2 : 0,
              stops: stops2,
              delay_min: sched.delay_min || null,
              delay_cause: sched.delay_cause || null,
              cancelled: !!sched.cancelled
            };
            setDetails(d => ({...d, [compoundId]: { loading: false, schedule: scheduleObj2 }}));
            const currentStop2 = stops2.find(st => normalizeStation(st.station_name||'') === normalizeStation(stationName||''));
            if(currentStop2 && currentStop2.platform){
              setPlatformsBySchedule(m => ({ ...m, [sched.id]: currentStop2.platform }));
            }
            return;
          }
        } catch(_) {}
        setDetails(d => ({...d, [compoundId]: { loading: false, schedule: null }}));
      }
    }
  };

  const canBuy = session && session.role === 'client';
  const addToCart = async (sched) => {
    if (!canBuy) { if (!session) router.push('/se-connecter'); else alert('Fonction réservée aux clients.'); return; }
    const selectedArrival = selectedArrivalMap[sched.id];
    if (!selectedArrival) { alert('Sélectionnez une gare d\'arrivée.'); return; }
    const { passengers, card } = getForm(sched.id);
    try {
      setChoosing(true);
      const res = await fetch('/api/public/cart', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ schedule_id: sched.id, origin: data.station.name, destination: selectedArrival, passengers, card }) });
      const j = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(j.error||'Ajout panier échoué');
      setAddedIds(prev=> new Set(prev).add(sched.id));
      window.dispatchEvent(new Event('cart-updated'));
      setShowGoCart(true);
    } catch(e) { alert(e.message||'Erreur'); }
    finally { setChoosing(false); }
  };

  const bulkAdd = async () => {
    if (!canBuy) { if (!session) router.push('/se-connecter'); else alert('Fonction réservée aux clients.'); return; }
    const ready = Array.from(marked).filter(id => selectedArrivalMap[id] && !addedIds.has(id));
    if (!ready.length) { alert('Sélectionnez au moins un horaire et une gare d\'arrivée.'); return; }
    setChoosing(true);
    try {
      for (const idSched of ready) {
        const arrival = selectedArrivalMap[idSched];
        const { passengers, card } = getForm(idSched);
        const res = await fetch('/api/public/cart', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ schedule_id: idSched, origin: data.station.name, destination: arrival, passengers, card }) });
        if (res.ok) {
          setAddedIds(prev=> new Set(prev).add(idSched));
        }
      }
      window.dispatchEvent(new Event('cart-updated'));
      setShowGoCart(true);
    } finally {
      setChoosing(false);
    }
  };

  const toggleMark = (id) => {
    setMarked(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleFavorite = (schedule_id, isFav) => {
    if(!session) { router.push('/se-connecter'); return; }
    const method = isFav ? 'DELETE':'POST';
    fetch('/api/public/favorites', { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ schedule_id }) })
      .then(r=>r.json()).then(()=>{
        setFavorites(f=> isFav ? f.filter(id=>id!==schedule_id) : [...f, schedule_id]);
      }).catch(()=>{});
  };

  const addMinutes = (hhmm, mins) => {
    if(!hhmm || typeof mins !== 'number') return hhmm;
    const [h,m] = hhmm.split(':').map(n=>parseInt(n,10));
    if(isNaN(h)||isNaN(m)) return hhmm;
    const date = new Date(0,0,1,h,m,0,0);
    date.setMinutes(date.getMinutes()+mins);
    return String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
  };

  const formatTrainType = (t) => {
    if(!t) return '';
    const norm = (t+'' ).trim().toUpperCase();
    if(norm === 'SNCF-VOYAGEURS-LOGO') return 'TER';
    return norm;
  };

  // Normalisation robuste des noms de gares (ex: "Dijon-Ville" ≈ "Dijon")
  const normalizeStation = (name) => {
    if(!name) return '';
    let s = (name+"").normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    s = s.trim().toLowerCase();
    // Supprime suffixes courants
    s = s.replace(/[- ]?ville$/,'');
    // Compacte
    s = s.replace(/[^a-z0-9]/g,'');
    return s;
  };
  const findStationIndex = (stops, name) => {
    const key = normalizeStation(name);
    if(!key) return -1;
    return (stops||[]).findIndex(st => normalizeStation(st.station_name) === key);
  };

  // Détermine les libellés d'origine et de destination à afficher (préférence aux valeurs reroutées)
  const getEndpointLabels = (schedDet, sLite) => {
    const originNew = schedDet?.new_origin || sLite?.new_origin || null;
    const destNew = schedDet?.new_destination || sLite?.new_destination || null;
    const originOrig = schedDet?.original_origin || sLite?.original_origin || schedDet?.origin || sLite?.origin || '';
    const destOrig = schedDet?.original_destination || sLite?.original_destination || schedDet?.destination || sLite?.destination || '';
    const originLabel = originNew || originOrig || '';
    const destLabel = destNew || destOrig || '';
    return {
      originLabel,
      destLabel,
      originWasChanged: !!(originNew && normalizeStation(originNew) !== normalizeStation(originOrig)),
      destWasChanged: !!(destNew && normalizeStation(destNew) !== normalizeStation(destOrig))
    };
  };

  // Récupère les perturbations à afficher pour un sillon
  const getPerturbationsForSchedule = (schedule) => {
    if (!schedule || !schedule.ligne_id) return [];

    // Récupère les perturbations pour la ligne de ce sillon
    const linePerturbations = linesPerturbations[schedule.ligne_id] || [];

    // Renvoie toutes les perturbations pour cette ligne, sans filtrage supplémentaire
    return linePerturbations;
  };

  const filterSchedulesForDisplay = (schedules = []) => {
    const pickBetter = (a, b) => {
      // Préfère un sillon rerouté, sinon supprimé, sinon avec info de retard, sinon garde le premier
      const ar = !!(a && (a.rerouted || a.reroute));
      const br = !!(b && (b.rerouted || b.reroute));
      if (ar !== br) return br ? b : a;
      const ac = !!(a && a.cancelled);
      const bc = !!(b && b.cancelled);
      if (ac !== bc) return bc ? b : a;
      const ad = typeof (a && a.delay_min) === 'number';
      const bd = typeof (b && b.delay_min) === 'number';
      if (ad !== bd) return bd ? b : a;
      // Dernier recours: garder le plus renseigné (info)
      const ai = (a && (a.info || '')).length;
      const bi = (b && (b.info || '')).length;
      if (ai !== bi) return bi > ai ? b : a;
      return a; // stable
    };

    schedules.forEach((sched) => {
      const trainNumber = sched.train_number;
      const dayDate = sched.day_date; // Assurez-vous que cette propriété existe dans les données

      if (!filteredSchedules[trainNumber] || filteredSchedules[trainNumber].day_date < dayDate) {
        filteredSchedules[trainNumber] = sched;
      }
    });

    return Object.values(filteredSchedules);
  };

  return (
    <>
      <Header />
      <main className="board-wrapper">
        <nav className="pd-breadcrumb" aria-label="Fil d'ariane">
          <ol>
            <li><Link href="/" aria-label="Accueil"><wcs-mat-icon icon="home" aria-hidden="true"></wcs-mat-icon></Link></li>
            <li aria-hidden="true">›</li>
            <li><Link href="/se-deplacer/prochains-departs">Prochains départs</Link></li>
            <li aria-hidden="true">›</li>
            <li aria-current="page">Gare {data?.station?.name || "..."}</li>
          </ol>
        </nav>

        <header className="board-header">
          <div>
            <h1 className="board-title">{titre}</h1>
            {data?.station?.name && <h2 className="board-station">Gare {data.station.name}</h2>}
            <div className="board-pills">
              <button type="button" className={"pill" + (type === "departures" ? " active" : "")} onClick={() => onToggle("departures")} aria-pressed={type === "departures"}>Départs SNCF</button>
              <button type="button" className={"pill" + (type === "arrivals" ? " active" : "")} onClick={() => onToggle("arrivals")} aria-pressed={type === "arrivals"}>Arrivées SNCF</button>
            </div>
          </div>
          {data?.station?.name && (
            <div className="board-actions">
              <Link href="#" className="act-link"><wcs-mat-icon icon="info" aria-hidden="true"></wcs-mat-icon> Infos pratiques {data.station.name}</Link>
              <Link href="/se-deplacer/prochains-departs" className="act-link"><wcs-mat-icon icon="search" aria-hidden="true"></wcs-mat-icon> Changer de gare</Link>
            </div>
          )}
        </header>

        {loading && <div className="board-loading">Chargement…</div>}
        {error && <div className="board-error" role="alert">{error}</div>}

        {!loading && !error && (
          <div className="board-card" role="table" aria-label={titre}>
            <div className="board-head" role="rowgroup">
              <div className="board-row head" role="row">
                <div role="columnheader" className="col time">{type === "departures" ? "Départ" : "Arrivée"}</div>
                <div role="columnheader" className="col dest">{type === "departures" ? "Destination" : "Origine"}</div>
                <div role="columnheader" className="col mode">Mode</div>
                <div role="columnheader" className="col voie">Voie</div>
                <div role="columnheader" className="col fav">Favori</div>
              </div>
            </div>
            <div className="board-body" role="rowgroup">
              {days.map(day => {
                const now = new Date();
                const todayStr = now.toISOString().slice(0,10);
                const currentTime = now.toTimeString().slice(0,5);
                const isToday = day.date === todayStr;
                const visibleSchedules = isToday ? day.schedules.filter(s => (s.time || '') >= currentTime) : day.schedules;
                return (
                  <React.Fragment key={day.date}>
                    <div className="day-separator" role="row"><div className="day-label">{formatDate(day.date)}</div></div>
                    {visibleSchedules.length === 0 && (
                      <div className="board-row empty" role="row"><div className="col time">—</div><div className="col dest">Aucun train</div></div>
                    )}
                    {visibleSchedules.map(s => {
                      const compoundId = `${day.date}::${s.id}`;
                      const isOpen = openId === compoundId;
                      const infoText = details[compoundId]?.schedule?.info || s.info || '';
                      // Perturbations filtrées pour ce sillon, selon sa ligne/heure/date
                      const ligneId = s.ligne_id || s.line_id || null;
                      const schedulePerturbations = (ligneId && !loadingPerturbations) ? getPerturbationsForLine(ligneId, s.time, day.date) : [];
                      // Variables calculées manquantes
                      const boardPlatform = platformsBySchedule[s.id] || platformForStation(s, data?.station?.name || '');
                      const hasDelay = !!(s.delay_min && !s.cancelled);
                      const infoDelayFallback = null;
                      const isCancelledFlag = !!s.cancelled;
                      const isRerouteFlag = !!(s.rerouted || s.reroute);
                      const hasPureInfo = !!(infoText && !hasDelay);
                      const disruptionFlags = [];
                      if (typeof s.delay_min === 'number' && s.delay_min > 0 && !s.cancelled) {
                        disruptionFlags.push({ type: 'delay', text: `+${s.delay_min}’`, aria: `Retard ${s.delay_min} minutes` });
                      }
                      if (s.cancelled) {
                        disruptionFlags.push({ type: 'cancel', text: 'Supprimé', aria: 'Train supprimé' });
                      }
                      if (s.rerouted || s.reroute) {
                        disruptionFlags.push({ type: 'reroute', text: 'Modifié', aria: 'Parcours modifié' });
                      }

                      return (
                        <React.Fragment key={compoundId}>
                          <div
                            className={"board-row schedule-row" + (s.cancelled ? " cancelled" : "") + (isOpen ? " open" : "")}
                            role="row"
                            tabIndex={0}
                            onClick={() => toggleSchedule(s, data.station.name, compoundId, day.date)}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSchedule(s, data.station.name, compoundId, day.date)}
                            aria-expanded={isOpen}
                          >
                            <div className="col time" role="cell">
                              {s.cancelled ? (
                                <span className="time-base strike cancelled-text">{s.time}</span>
                              ) : s.delay_min ? (
                                <div className="dual-time">
                                  <span className="t-orig strike" aria-label="Heure prévue initiale">{s.time}</span>
                                  <span className="t-new" aria-label={`Heure estimée avec retard ${s.delay_min} minutes`}>{addMinutes(s.time, s.delay_min)}</span>
                                </div>
                              ) : (
                                <span className="time-base">{s.time}</span>
                              )}
                              {disruptionFlags.map(f => (
                                <span key={f.type} className={`flag flag-${f.type}`} aria-label={f.aria}>{f.text}</span>
                              ))}
                            </div>
                            <div className="col dest" role="cell">
                              {s.cancelled ? (
                                <span className="cancelled-text strike">{type === 'departures' ? s.destination : s.origin}</span>
                              ) : (
                                (() => {
                                  if (
                                    s.rerouted &&
                                    type === 'departures' &&
                                    s.original_destination &&
                                    s.destination &&
                                    s.original_destination.toLowerCase() !== s.destination.toLowerCase()
                                  ) {
                                    return <><span className="new-dest">{s.destination}</span></>;
                                  }
                                  if (
                                    s.rerouted &&
                                    type === 'arrivals' &&
                                    s.original_origin &&
                                    s.origin &&
                                    s.original_origin.toLowerCase() !== s.origin.toLowerCase()
                                  ) {
                                    return <><span className="new-dest">{s.origin}</span></>;
                                  }
                                  return type === 'departures' ? s.destination : s.origin;
                                })()
                              )}
                              {type === 'departures' && !s.cancelled && s.rerouted && s.original_destination && s.destination && s.destination.toLowerCase() !== s.original_destination.toLowerCase() && (
                                <span className="dest-badge" aria-label="Nouvelle destination">Nouvelle gare de Destination</span>
                              )}
                            </div>
                            <div className="col mode" role="cell">
                              {s.cancelled ? (
                                <span className="cancelled-text strike">
                                  {(() => {
                                    const isCar = /car|bus/i.test(s.train_type || '');
                                    const iconClass = isCar ? 'sncf-icon icons-itinerary-bus-2' : 'sncf-icon icons-itinerary-train';
                                    const modeLabel = isCar ? 'Car' : 'Train';
                                    return <><span className={iconClass} aria-hidden="true" style={{ fontSize: '1.1em', verticalAlign: 'middle', marginRight: 4 }}></span> {modeLabel} {s.train_type ? formatTrainType(s.train_type) : ''} {s.train_number || ''}</>;
                                  })()}
                                </span>
                              ) : (
                                (() => {
                                  const isCar = /car|bus/i.test(s.train_type || '');
                                  const iconClass = isCar ? 'sncf-icon icons-itinerary-bus-2' : 'sncf-icon icons-itinerary-train';
                                  const modeLabel = isCar ? 'Car' : 'Train';
                                  return <><span className={iconClass} aria-hidden="true" style={{ fontSize: '1.1em', verticalAlign: 'middle', marginRight: 4 }}></span> {modeLabel} {s.train_type ? formatTrainType(s.train_type) : ''} {s.train_number || ''}</>;
                                })()
                              )}
                            </div>
                            <div className="col voie" role="cell">
                              <span className={"platform" + (s.cancelled ? " cancelled-text strike" : "")}>{boardPlatform}</span>
                            </div>
                            <div className="col fav" role="cell">
                              <wcs-button
                                mode="clear"
                                size="s"
                                shape="round"
                                aria-label="Favori"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(s.id, favorites.includes(s.id));
                                }}
                              >
                                <wcs-mat-icon icon={favorites.includes(s.id) ? 'favorite' : 'favorite_border'}></wcs-mat-icon>
                              </wcs-button>
                            </div>
                          </div>

                          { (hasDelay || hasPureInfo) && (
                            <>
                              {hasDelay && !s.cancelled && (
                                <div className="board-row sub delay-row" role="row" aria-hidden={false}>
                                  <div className="col time" role="cell"></div>
                                  <div className="col dest info" role="cell">
                                    <div className="delay-info-text">
                                      <div className="di-line main">
                                        <span className="di-ico delay-clock" aria-hidden="true"><wcs-mat-icon icon="schedule" aria-hidden="true"></wcs-mat-icon></span>
                                        <span className="di-text">{(infoDelayFallback || (s.delay_min ? `Retard estimé de ${s.delay_min} min` : 'Retard')) + (s.delay_cause ? ` — ${s.delay_cause}` : '')}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="col mode" role="cell"></div>
                                  <div className="col voie" role="cell"></div>
                                  <div className="col fav" role="cell"></div>
                                </div>
                              )}
                              {hasPureInfo && (
                                <div className={"board-row sub info-row" + ((isCancelledFlag || isRerouteFlag) ? " danger-row" : "")} role="row" aria-hidden={false} aria-live={(isCancelledFlag || isRerouteFlag) ? 'polite' : undefined}>
                                  <div className="col time" role="cell"></div>
                                  <div className="col dest info" role="cell"><wcs-mat-icon icon="info" aria-hidden="true"></wcs-mat-icon> <span className="one-line">{infoText}</span></div>
                                  <div className="col mode" role="cell"></div>
                                  <div className="col voie" role="cell"></div>
                                  <div className="col fav" role="cell"></div>
                                </div>
                              )}
                            </>
                          )}

                          {/* Affichage des perturbations pour ce sillon */}
                          {Array.isArray(schedulePerturbations) && schedulePerturbations.length > 0 && (
                            <>
                              {schedulePerturbations.map((perturbation, index) => (
                                <div className="board-row sub perturbation-row" role="row" key={`${s.id}-perturbation-${index}`}>
                                  <div className="col time" role="cell"></div>
                                  <div className="col dest info" role="cell">
                                    <PerturbationBanner perturbation={perturbation} />
                                  </div>
                                  <div className="col mode" role="cell"></div>
                                  <div className="col voie" role="cell"></div>
                                  <div className="col fav" role="cell"></div>
                                </div>
                              ))}
                            </>
                          )}

                          {isOpen && (
                            <div className="details-panel show">
                              {details[compoundId]?.loading && <div className="details-loading">Chargement des arrêts…</div>}
                              {!details[compoundId]?.loading && details[compoundId]?.schedule && (()=> {
                                const schedDet = details[compoundId].schedule;
                                // Fusion de l'itinéraire original et du nouveau pour marquer les arrêts supprimés
                                let displayStops = schedDet.stops || [];
                                if(schedDet.rerouted && Array.isArray(schedDet.original_stops_detailed)){
                                  const newMap = new Map();
                                  (schedDet.stops||[]).forEach(st => { if(st.station_name) newMap.set((st.station_name+"").toLowerCase(), st); });
                                  displayStops = schedDet.original_stops_detailed.map(os => {
                                    const key = (os.station_name||'').toLowerCase();
                                    const match = newMap.get(key);
                                    if(match){
                                      return { ...match, removed:false };
                                    }
                                    return { station_name: os.station_name, arrival_time: os.arrival_time, departure_time: os.departure_time, time: os.departure_time||os.arrival_time||null, platform: null, removed:true };
                                  });
                                }
                                // Si train supprimé: on remplace l'affichage par l'itinéraire original (si dispo) tout barré rouge
                                if(schedDet.cancelled){
                                  const base = Array.isArray(schedDet.original_stops_detailed) && schedDet.original_stops_detailed.length ? schedDet.original_stops_detailed : (schedDet.stops||[]);
                                  displayStops = base.map(os=> ({ station_name: os.station_name, arrival_time: os.arrival_time, departure_time: os.departure_time, time: os.departure_time||os.arrival_time||null, platform:null, removed:true, cancelled:true }));
                                }
                                // Forcer la plage entre l'origine et le terminus du sillon (préférence au reroute)
                                const originPref = schedDet.new_origin || s.new_origin || s.original_origin || s.origin || (displayStops[0]?.station_name || '');
                                const destPref = schedDet.new_destination || s.new_destination || s.original_destination || s.destination || (displayStops[displayStops.length-1]?.station_name || '');
                                const oIdxFull = findStationIndex(displayStops, originPref);
                                const dIdxFull = findStationIndex(displayStops, destPref);
                                let rangeStops = displayStops;
                                if(oIdxFull>=0 && dIdxFull>=0 && oIdxFull<=dIdxFull){
                                  rangeStops = displayStops.slice(oIdxFull, dIdxFull+1);
                                }
                                // Synchronisation: en DEPARTS itinéraire COMPLET (origine->terminus), en ARRIVEES couper jusqu'à la gare du tableau
                                const boardStation = (data?.station?.name || '');
                                const boardKey = normalizeStation(boardStation);
                                const idxInRange = rangeStops.findIndex(st => normalizeStation(st.station_name) === boardKey);
                                let slicedStops = rangeStops;
                                // Ancien découpage en mode "arrivals" supprimé pour conserver le terminus
                                // if(idxInRange >= 0){
                                //   if(type === 'departures'){
                                //     slicedStops = rangeStops; // complet
                                //   } else {
                                //     slicedStops = rangeStops.slice(0, idxInRange+1);
                                //   }
                                // }
                                // Indices de badges
                                const firstActiveIdx = (()=> { const i = slicedStops.findIndex(s=> !s.removed); return i>=0? i: 0; })();
                                const lastActiveIdx = (()=> { const i = [...slicedStops].reverse().findIndex(s=> !s.removed); return i>=0? (slicedStops.length-1-i) : (slicedStops.length-1); })();
                                // Prépare la liste finale avec origine/destination visibles
                                const { originLabel, destLabel, originWasChanged, destWasChanged } = getEndpointLabels(schedDet, s);
                                let listStops = slicedStops.slice();
                                const oriInListIdx = findStationIndex(listStops, originLabel);
                                const dstInListIdx = findStationIndex(listStops, destLabel);
                                const originDisplayTime = (slicedStops[firstActiveIdx]?.departure_time || slicedStops[firstActiveIdx]?.time || '-');
                                const destDisplayTime = (slicedStops[lastActiveIdx]?.arrival_time || slicedStops[lastActiveIdx]?.time || '-');
                                const originDisplayPlatform = (slicedStops[firstActiveIdx]?.platform ?? null);
                                const destDisplayPlatform = (slicedStops[lastActiveIdx]?.platform ?? null);
                                if(originLabel && oriInListIdx === -1){
                                  listStops.unshift({ station_name: originLabel, time: originDisplayTime, departure_time: originDisplayTime, platform: originDisplayPlatform, synthetic:true });
                                }
                                if(destLabel && dstInListIdx === -1){
                                  listStops.push({ station_name: destLabel, time: destDisplayTime, arrival_time: destDisplayTime, platform: destDisplayPlatform, synthetic:true });
                                }
                                return (
                                  <div className="details-content">
                                    {/* Affichage du bandeau Information en une ligne (icône + texte) uniquement */}
                                    {schedDet.info && (
                                      <div className="alert-info-block" role="note" aria-label="Information trafic" style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#e6f4fa', borderRadius: '4px', color: '#0088ce', fontWeight: 600, marginBottom: '12px'}}>
                                        <span className="ai-icon" aria-hidden="true" style={{fontSize: '20px'}}>i</span>
                                        <span className="ai-title">Information</span>
                                      </div>
                                    )}
                                    {/* Card détaillée pour la cause (message info) */}
                                    {schedDet.info && (
                                      <div className="info-card-detail" style={{background: '#e6f4fa', borderLeft: '4px solid #0088ce', borderRadius: '4px', padding: '16px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px'}}>
                                        <span className="ai-icon" aria-hidden="true" style={{fontSize: '24px', color: '#0088ce', marginTop: '2px'}}>i</span>
                                        <div>
                                          <div style={{fontWeight: 700, color: '#0088ce', marginBottom: '4px'}}>Information</div>
                                          <div className="ai-message" style={{color: '#333'}}>{schedDet.info}</div>
                                        </div>
                                      </div>
                                    )}
                                    <div className="route-summary" role="group" aria-label="Origine et destination">
                                      <div className="rs-item"><span className="rs-label">Provenance</span><span className={"rs-value" + (originWasChanged? ' changed':'')}>{originLabel || '-'}</span></div>
                                      <div className="rs-item"><span className="rs-label">Destination</span><span className={"rs-value" + (destWasChanged? ' changed':'')}>{destLabel || '-'}</span></div>
                                    </div>
                                    <section className="stops-section">
                                      <h3>Liste des gares</h3>
                                      <p className="subtitle">desservies par le train {formatTrainType(schedDet.train_type)} {schedDet.train_number}</p>
                                      <p className="operator">Opéré par SNCF Voyageurs</p>
                                      <div className="stops-table" role="table">
                                        <div className="stops-head" role="rowgroup">
                                          <div className="stops-row head" role="row">
                                            <div className="st-col arr" role="columnheader">Arrivée</div>
                                            <div className="st-col dep" role="columnheader">Départ</div>
                                            <div className="st-col name" role="columnheader">Gare</div>
                                            <div className="st-col voie" role="columnheader">Voie</div>
                                          </div>
                                        </div>
                                        <div className="stops-body" role="rowgroup">
                                          {listStops.map((st, idx) => {
                                            const isRemoved = !!st.removed;
                                            const isCancelledStop = !!st.cancelled;
                                            const isCurrent = (normalizeStation(st.station_name) === normalizeStation(data?.station?.name || ''));
                                            const isOriginRow = normalizeStation(st.station_name) === normalizeStation(originLabel);
                                            const isDestRow = normalizeStation(st.station_name) === normalizeStation(destLabel);
                                            const isOriginBadge = !isRemoved && isOriginRow;
                                            const isTerminusBadge = !isRemoved && isDestRow;
                                            // Sélection arrivée
                                            const boardListIdx = listStops.findIndex(x => normalizeStation(x.station_name) === boardKey);
                                            const selectable = !isRemoved && !isCancelledStop && idx > boardListIdx;
                                            const selectedName = selectedArrivalMap[s.id] || null;
                                            const isSelected = selectable && selectedName && normalizeStation(selectedName) === normalizeStation(st.station_name);
                                            const rowClasses = [
                                              'stops-row',
                                              isRemoved ? 'removed' : '',
                                              isCancelledStop ? 'cancelled' : '',
                                              idx === 0 ? 'first' : '',
                                              isSelected ? 'selected' : ''
                                            ].filter(Boolean).join(' ');
                                            const handleClick = (e)=>{ e.stopPropagation(); if(!selectable) return; setSelectedArrivalMap(m=> ({...m, [s.id]: st.station_name})); };
                                            // Correction ici : schedDet est bien dans le scope
                                            const delayMin = (typeof schedDet?.delay_min === 'number' ? schedDet.delay_min : (typeof s?.delay_min === 'number' ? s.delay_min : null));
                                            const showDelayed = !!delayMin && !isRemoved && !isCancelledStop;
                                            // Correction affichage arrivée/départ pour origine/terminus
                                            let arrBase = null, depBase = null;
                                            if (isOriginRow) {
                                              arrBase = null;
                                              depBase = st.departure_time || st.time || null;
                                            } else if (isDestRow) {
                                              arrBase = st.arrival_time || st.time || null;
                                              depBase = null;
                                            } else {
                                              arrBase = st.arrival_time || null;
                                              depBase = st.departure_time || null;
                                            }
                                            return (
                                              <div key={(st.station_name||'') + '#' + idx} className={rowClasses} role="row" onClick={handleClick}>
                                                <div className="st-col arr" role="cell">
                                                  {arrBase ? (
                                                    showDelayed && !isOriginRow && !isDestRow ? (
                                                      <div className="dual-time small">
                                                        <span className="t-orig strike">{arrBase}</span>
                                                        <span className="t-new">{addMinutes(arrBase, delayMin)}</span>
                                                      </div>
                                                    ) : (
                                                      <span className={isRemoved ? 'removed-time strike' : ''}>{arrBase}</span>
                                                    )
                                                  ) : <span className={isRemoved ? 'removed-time strike' : ''}>-</span>}
                                                </div>
                                                <div className="st-col dep" role="cell">
                                                  {depBase ? (
                                                    showDelayed && !isOriginRow && !isDestRow ? (
                                                      <div className="dual-time small">
                                                        <span className="t-orig strike">{depBase}</span>
                                                        <span className="t-new">{addMinutes(depBase, delayMin)}</span>
                                                      </div>
                                                    ) : (
                                                      <span className={isRemoved ? 'removed-time strike' : ''}>{depBase}</span>
                                                    )
                                                  ) : <span className={isRemoved ? 'removed-time strike' : ''}>-</span>}
                                                </div>
                                                <div className="st-col name" role="cell">
                                                  <span className={isRemoved ? 'removed-name' : ''}>{st.station_name}</span>
                                                  {isCurrent && <span className="stop-badge here" aria-hidden="true">Ici</span>}
                                                  {!isRemoved && isOriginBadge && <span className="stop-badge origin" aria-hidden="true">Départ</span>}
                                                  {!isRemoved && isTerminusBadge && <span className="stop-badge terminus" aria-hidden="true">Terminus</span>}
                                                </div>
                                                <div className="st-col voie" role="cell">{(isCurrent && (platformsBySchedule[s.id] || platformForStation(s, data?.station?.name || ''))) || st.platform || '-'}</div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      {/* Bloc réservation */}
                                      {(!s.cancelled) && (()=>{
                                        const f = getForm(s.id);
                                        const pax = Math.max(1, parseInt(f.passengers||1,10));
                                        const cardMap = { none:'Sans carte', jeune:'Carte Jeune', senior:'Carte Senior', weekend:'Carte Week-end' };
                                        const cardLbl = cardMap[f.card] || 'Sans carte';
                                        const arrivalChosen = !!selectedArrivalMap[s.id];
                                        const toggleEdit = ()=> updateForm(s.id, { editing: !f.editing });
                                        return (
                                          <div className="buy-section" aria-label="Achat">
                                            <h4 className="buy-title">Vous souhaitez acheter un trajet ?</h4>
                                            <p className="buy-help">Sélectionnez votre gare d'arrivée dans la liste ci-dessus</p>
                                            <div className="buy-form">
                                              <div className="buy-line" role="group" aria-label="Voyageurs et carte">
                                                <wcs-mat-icon icon="person" aria-hidden="true"></wcs-mat-icon>
                                                <div className="sum-meta">{pax} voyageur{pax>1?'s':''}, {cardLbl}</div>
                                                <wcs-button size="s" shape="round" mode="clear" aria-label="Modifier voyageurs et carte" onClick={e=>{ e.preventDefault(); e.stopPropagation(); toggleEdit(); }}>
                                                  <wcs-mat-icon icon="edit"></wcs-mat-icon>
                                                </wcs-button>
                                              </div>
                                              {f.editing && (
                                                <div className="buy-line" role="group" aria-label="Edition voyageurs et carte">
                                                  <label style={{fontSize:'.8rem'}}>Voyageurs
                                                    <input type="number" min={1} max={8} value={pax} onChange={e=> updateForm(s.id,{ passengers: Math.max(1, Math.min(8, parseInt(e.target.value||'1',10))) })} />
                                                  </label>
                                                  <label style={{fontSize:'.8rem'}}>Carte
                                                    <select value={f.card||'none'} onChange={e=> updateForm(s.id,{ card:e.target.value })}>
                                                      <option value="none">Sans carte</option>
                                                      <option value="jeune">Carte Jeune</option>
                                                      <option value="senior">Carte Senior</option>
                                                      <option value="weekend">Carte Week-end</option>
                                                    </select>
                                                  </label>
                                                </div>
                                              )}
                                              <wcs-button className="buy-btn" onClick={()=> addToCart(s)} disabled={!arrivalChosen || choosing}>
                                                Acheter ce trajet
                                              </wcs-button>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </section>
                                  </div>
                                );
                              })()}
                              {!details[compoundId]?.loading && !details[compoundId]?.schedule && (
                                <div className="details-content">
                                  <section className="stops-section">
                                    <h3>Liste des gares</h3>
                                    <p className="subtitle">desservies par le train {formatTrainType(s.train_type)} {s.train_number || ''}</p>
                                    <p className="operator">Opéré par SNCF Voyageurs</p>
                                    {(() => {
                                      // Construit dynamiquement les arrêts depuis le sillon inclus dans l'objet s
                                      let displayStops = [];
                                      // Prépare une liste de stops courants si reroute fourni côté board
                                      if (s.reroute && Array.isArray(s.reroute.stops) && s.reroute.stops.length) {
                                        const currentStops = s.reroute.stops.map(st => ({
                                          station_name: st.station || st.station_name || '',
                                          time: st.departure || st.arrival || '',
                                          arrival_time: st.arrival || '',
                                          departure_time: st.departure || '',
                                          platform: st.platform || st.voie || st.track || st.platform_code || null
                                        }));
                                        // Si itinéraire original détaillé fourni: fusion pour marquer les arrêts supprimés
                                        if (s.rerouted && Array.isArray(s.original_stops_detailed) && s.original_stops_detailed.length) {
                                          const newMap = new Map();
                                          currentStops.forEach(st => { if (st.station_name) newMap.set((st.station_name + '').toLowerCase(), st); });
                                          displayStops = s.original_stops_detailed.map(os => {
                                            const key = (os.station_name || '').toLowerCase();
                                            const match = newMap.get(key);
                                            if (match) {
                                              return { ...match, removed: false };
                                            }
                                            return {
                                              station_name: os.station_name,
                                              arrival_time: os.arrival_time,
                                              departure_time: os.departure_time,
                                              time: os.departure_time || os.arrival_time || null,
                                              platform: os.platform || os.voie || os.track || os.platform_code || null,
                                              removed: true
                                            };
                                          });
                                        } else {
                                          displayStops = currentStops;
                                        }
                                      } else if (Array.isArray(s.original_stops_detailed) && s.original_stops_detailed.length) {
                                        // Utilise l'itinéraire original détaillé si disponible
                                        displayStops = s.original_stops_detailed.map(os => ({
                                          station_name: os.station_name,
                                          arrival_time: os.arrival_time,
                                          departure_time: os.departure_time,
                                          time: os.departure_time || os.arrival_time || null,
                                          platform: os.platform || os.voie || os.track || os.platform_code || null
                                        }));
                                      } else if (Array.isArray(s.stops) && s.stops.length) {
                                        // Dernier recours: stops simples si présents
                                        displayStops = s.stops.map(st => ({
                                          station_name: st.station || st.station_name || '',
                                          time: st.time || st.departure || st.arrival || null,
                                          arrival_time: st.arrival || null,
                                          departure_time: st.departure || null,
                                          platform: st.platform || st.voie || st.track || st.platform_code || null
                                        }));
                                      }

                                      // Si train supprimé: affiche l'itinéraire (original si dispo) barré
                                      if (s.cancelled) {
                                        const base = Array.isArray(s.original_stops_detailed) && s.original_stops_detailed.length ? s.original_stops_detailed : displayStops;
                                        displayStops = base.map(os => ({
                                          station_name: os.station_name,
                                          arrival_time: os.arrival_time,
                                          departure_time: os.departure_time,
                                          time: os.time || os.departure_time || os.arrival_time || null,
                                          platform: os.platform || os.voie || os.track || os.platform_code || null,
                                          removed: true,
                                          cancelled: true
                                        }));
                                      }

                                      // Forcer la plage entre l'origine et le terminus du sillon (préférence au reroute)
                                      const originPref = s.new_origin || s.original_origin || s.origin || (displayStops[0]?.station_name || '');
                                      const destPref = s.new_destination || s.original_destination || s.destination || (displayStops[displayStops.length-1]?.station_name || '');
                                      const oIdxFull = findStationIndex(displayStops, originPref);
                                      const dIdxFull = findStationIndex(displayStops, destPref);
                                      let rangeStops = displayStops;
                                      if(oIdxFull>=0 && dIdxFull>=0 && oIdxFull<=dIdxFull){
                                        rangeStops = displayStops.slice(oIdxFull, dIdxFull+1);
                                      }

                                      // Découpe: en DEPARTS on garde TOUT (entre origine->terminus), en ARRIVEES on coupe jusqu'à la gare du tableau incluse
                                      const boardStation = (data?.station?.name || '');
                                      const boardKey = normalizeStation(boardStation);
                                      const idxInRange = rangeStops.findIndex(st => normalizeStation(st.station_name) === boardKey);
                                      let slicedStops = rangeStops;
                                      // Ancien découpage en mode "arrivals" supprimé pour conserver le terminus
                                      // if (idxInRange >= 0) {
                                      //   if (type === 'departures') {
                                      //     slicedStops = rangeStops; // pas de découpe
                                      //   } else {
                                      //     slicedStops = rangeStops.slice(0, idxInRange + 1);
                                      //   }
                                      // }

                                      const firstActiveIdx = (()=>{ const i = slicedStops.findIndex(s => !s.removed); return i>=0? i : 0; })();
                                      const lastActiveIdx = (()=>{ const i = [...slicedStops].reverse().findIndex(s => !s.removed); return i>=0? (slicedStops.length-1-i) : (slicedStops.length-1); })();
                                      const { originLabel, destLabel, originWasChanged, destWasChanged } = getEndpointLabels(null, s);
                                      // Liste finale avec endpoints visibles
                                      let listStops = slicedStops.slice();
                                      const oriInListIdx = findStationIndex(listStops, originLabel);
                                      const dstInListIdx = findStationIndex(listStops, destLabel);
                                      const originDisplayTime = (slicedStops[firstActiveIdx]?.departure_time || slicedStops[firstActiveIdx]?.time || '-');
                                      const destDisplayTime = (slicedStops[lastActiveIdx]?.arrival_time || slicedStops[lastActiveIdx]?.time || '-');
                                      const originDisplayPlatform = (slicedStops[firstActiveIdx]?.platform ?? null);
                                      const destDisplayPlatform = (slicedStops[lastActiveIdx]?.platform ?? null);
                                      if(originLabel && oriInListIdx === -1){
                                        listStops.unshift({ station_name: originLabel, time: originDisplayTime, departure_time: originDisplayTime, platform: originDisplayPlatform, synthetic:true });
                                      }
                                      if(destLabel && dstInListIdx === -1){
                                        listStops.push({ station_name: destLabel, time: destDisplayTime, arrival_time: destDisplayTime, platform: destDisplayPlatform, synthetic:true });
                                      }

                                      return (
                                        <>
                                          <div className="route-summary" role="group" aria-label="Origine et destination">
                                            <div className="rs-item"><span className="rs-label">Provenance</span><span className={"rs-value" + (originWasChanged? ' changed':'')}>{originLabel || '-'}</span></div>
                                            <div className="rs-item"><span className="rs-label">Destination</span><span className={"rs-value" + (destWasChanged? ' changed':'')}>{destLabel || '-'}</span></div>
                                          </div>
                                          <div className="stops-table" role="table">
                                            <div className="stops-head" role="rowgroup">
                                              <div className="stops-row head" role="row">
                                                <div className="st-col arr" role="columnheader">Arrivée</div>
                                                <div className="st-col dep" role="columnheader">Départ</div>
                                                <div className="st-col name" role="columnheader">Gare</div>
                                                <div className="st-col voie" role="columnheader">Voie</div>
                                              </div>
                                            </div>
                                            <div className="stops-body" role="rowgroup">
                                              {listStops.map((st, idx) => {
                                                const isRemoved = !!st.removed;
                                                const isCancelledStop = !!st.cancelled;
                                                const isCurrent = (normalizeStation(st.station_name) === normalizeStation(data?.station?.name || ''));
                                                const isOriginRow = normalizeStation(st.station_name) === normalizeStation(originLabel);
                                                const isDestRow = normalizeStation(st.station_name) === normalizeStation(destLabel);
                                                const isOriginBadge = !isRemoved && isOriginRow;
                                                const isTerminusBadge = !isRemoved && isDestRow;
                                                // Sélection arrivée
                                                const boardListIdx = listStops.findIndex(x => normalizeStation(x.station_name) === boardKey);
                                                const selectable = !isRemoved && !isCancelledStop && idx > boardListIdx;
                                                const selectedName = selectedArrivalMap[s.id] || null;
                                                const isSelected = selectable && selectedName && normalizeStation(selectedName) === normalizeStation(st.station_name);
                                                const rowClasses = [
                                                  'stops-row',
                                                  isRemoved ? 'removed' : '',
                                                  isCancelledStop ? 'cancelled' : '',
                                                  idx === 0 ? 'first' : '',
                                                  isSelected ? 'selected' : ''
                                                ].filter(Boolean).join(' ');
                                                const handleClick = (e)=>{ e.stopPropagation(); if(!selectable) return; setSelectedArrivalMap(m=> ({...m, [s.id]: st.station_name})); };
                                                // Correction ici : schedDet est bien dans le scope
                                                const delayMin = (typeof schedDet?.delay_min === 'number' ? schedDet.delay_min : (typeof s?.delay_min === 'number' ? s.delay_min : null));
                                                const showDelayed = !!delayMin && !isRemoved && !isCancelledStop;
                                                // Correction affichage arrivée/départ pour origine/terminus
                                                let arrBase = null, depBase = null;
                                                if (isOriginRow) {
                                                  arrBase = null;
                                                  depBase = st.departure_time || st.time || null;
                                                } else if (isDestRow) {
                                                  arrBase = st.arrival_time || st.time || null;
                                                  depBase = null;
                                                } else {
                                                  arrBase = st.arrival_time || null;
                                                  depBase = st.departure_time || null;
                                                }
                                                return (
                                                  <div key={(st.station_name||'') + '#' + idx} className={rowClasses} role="row" onClick={handleClick}>
                                                    <div className="st-col arr" role="cell">
                                                      {arrBase ? (
                                                        showDelayed && !isOriginRow && !isDestRow ? (
                                                          <div className="dual-time small">
                                                            <span className="t-orig strike">{arrBase}</span>
                                                            <span className="t-new">{addMinutes(arrBase, delayMin)}</span>
                                                          </div>
                                                        ) : (
                                                          <span className={isRemoved ? 'removed-time strike' : ''}>{arrBase}</span>
                                                        )
                                                      ) : <span className={isRemoved ? 'removed-time strike' : ''}>-</span>}
                                                    </div>
                                                    <div className="st-col dep" role="cell">
                                                      {depBase ? (
                                                        showDelayed && !isOriginRow && !isDestRow ? (
                                                          <div className="dual-time small">
                                                            <span className="t-orig strike">{depBase}</span>
                                                            <span className="t-new">{addMinutes(depBase, delayMin)}</span>
                                                          </div>
                                                        ) : (
                                                          <span className={isRemoved ? 'removed-time strike' : ''}>{depBase}</span>
                                                        )
                                                      ) : <span className={isRemoved ? 'removed-time strike' : ''}>-</span>}
                                                    </div>
                                                    <div className="st-col name" role="cell">
                                                      <span className={isRemoved ? 'removed-name' : ''}>{st.station_name}</span>
                                                      {isCurrent && <span className="stop-badge here" aria-hidden="true">Ici</span>}
                                                      {!isRemoved && isOriginBadge && <span className="stop-badge origin" aria-hidden="true">Départ</span>}
                                                      {!isRemoved && isTerminusBadge && <span className="stop-badge terminus" aria-hidden="true">Terminus</span>}
                                                    </div>
                                                    <div className="st-col voie" role="cell">{(isCurrent && (platformsBySchedule[s.id] || platformForStation(s, data?.station?.name || ''))) || st.platform || '-'}</div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                          {/* Bloc réservation */}
                                          {(!s.cancelled) && (()=>{
                                            const f = getForm(s.id);
                                            const pax = Math.max(1, parseInt(f.passengers||1,10));
                                            const cardMap = { none:'Sans carte', jeune:'Carte Jeune', senior:'Carte Senior', weekend:'Carte Week-end' };
                                            const cardLbl = cardMap[f.card] || 'Sans carte';
                                            const arrivalChosen = !!selectedArrivalMap[s.id];
                                            const toggleEdit = ()=> updateForm(s.id, { editing: !f.editing });
                                            return (
                                              <div className="buy-section" aria-label="Achat">
                                                <h4 className="buy-title">Vous souhaitez acheter un trajet ?</h4>
                                                <p className="buy-help">Sélectionnez votre gare d'arrivée dans la liste ci-dessus</p>
                                                <div className="buy-form">
                                                  <div className="buy-line" role="group" aria-label="Voyageurs et carte">
                                                    <wcs-mat-icon icon="person" aria-hidden="true"></wcs-mat-icon>
                                                    <div className="sum-meta">{pax} voyageur{pax>1?'s':''}, {cardLbl}</div>
                                                    <wcs-button size="s" shape="round" mode="clear" aria-label="Modifier voyageurs et carte" onClick={e=>{ e.preventDefault(); e.stopPropagation(); toggleEdit(); }}>
                                                      <wcs-mat-icon icon="edit"></wcs-mat-icon>
                                                    </wcs-button>
                                                  </div>
                                                  {f.editing && (
                                                    <div className="buy-line" role="group" aria-label="Edition voyageurs et carte">
                                                      <label style={{fontSize:'.8rem'}}>Voyageurs
                                                        <input type="number" min={1} max={8} value={pax} onChange={e=> updateForm(s.id,{ passengers: Math.max(1, Math.min(8, parseInt(e.target.value||'1',10))) })} />
                                                      </label>
                                                      <label style={{fontSize:'.8rem'}}>Carte
                                                        <select value={f.card||'none'} onChange={e=> updateForm(s.id,{ card:e.target.value })}>
                                                          <option value="none">Sans carte</option>
                                                          <option value="jeune">Carte Jeune</option>
                                                          <option value="senior">Carte Senior</option>
                                                          <option value="weekend">Carte Week-end</option>
                                                        </select>
                                                      </label>
                                                    </div>
                                                  )}
                                                  <wcs-button className="buy-btn" onClick={()=> addToCart(s)} disabled={!arrivalChosen || choosing}>
                                                    Acheter ce trajet
                                                  </wcs-button>
                                                </div>
                                              </div>
                                            );
                                          })()}
                                        </>
                                      );
                                    })()}
                                  </section>
                                </div>
                              )}
                            </div>
                          )}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
              {marked.size > 0 && (
                <div className="bulk-bar">
                  <span>{marked.size} sélection(s)</span>
                  <wcs-button size="s" onClick={bulkAdd} disabled={choosing}>Ajouter la sélection</wcs-button>
                </div>
              )}
              {showGoCart && (
                <div className="go-cart-fab" role="alert">
                  <wcs-button size="s" onClick={()=>router.push('/panier')}>
                    Voir le panier
                  </wcs-button>
                </div>
              )}
            </div>
          )};
        {showGoCart && (
          <div className="go-cart-fab" role="alert">
            <wcs-button size="s" onClick={()=>router.push('/panier')}>
              Voir le panier
            </wcs-button>
          </div>
        )}
      </main>
      <style jsx>{`
        .board-wrapper { max-width:1250px; margin:0 auto; padding:1rem 1.5rem 3rem; }
        .pd-breadcrumb { font-size:.75rem; margin-bottom:1.25rem; }
        .pd-breadcrumb ol { list-style:none; display:flex; gap:.4rem; padding:0; margin:0; }
        .pd-breadcrumb a { color:#0d5637; text-decoration:none; }
        .board-header { display:flex; justify-content:space-between; gap:2rem; flex-wrap:wrap; align-items:flex-start; }
        .board-title { font-size:1.6rem; margin:0 0 .2rem; font-weight:800; }
        .board-station { font-size:1.05rem; margin:.1rem 0 1rem; font-weight:600; }
        .board-pills { display:flex; gap:.5rem; }
        .pill { background:#dedede; border:none; padding:.5rem 1.15rem; border-radius:999px; font-size:.8rem; font-weight:600; cursor:pointer; }
        .pill.active { background:#0d5637; color:#fff; }
        .board-actions { display:flex; gap:1.4rem; font-size:.72rem; align-items:center; }
        .act-link { color:#0d5637; display:inline-flex; gap:.3rem; align-items:center; text-decoration:none; }
        .act-link:hover { text-decoration:underline; }
        .board-card { background:#fff; border-radius:6px; padding:.75rem 0 .5rem; box-shadow:0 2px 6px rgba(0,0,0,.08); }
        .board-row { display:grid; grid-template-columns:90px 1fr 260px 70px 60px; font-size:.78rem; align-items:center; padding:.3rem .75rem; column-gap:.75rem; }
        .board-row.head { font-size:.7rem; font-weight:600; border-bottom:1px solid #d7d7d7; background:#fff; }
        .board-row.sub { background:#f1f7fa; border-bottom:1px solid #e5e5e5; }
        /* Bandeau retard (orange) */
        .board-row.sub.delay-row { background:#fff3cd; border-bottom:1px solid #ffe69c; position:relative; }
        .board-row.sub.delay-row:before { content:""; position:absolute; top:-8px; left:16px; width:0; height:0; border-style:solid; border-width:8px 8px 0 8px; border-color:#fff3cd transparent transparent transparent; }
        .delay-row .col.dest.info { color:#7a3e00; }
        .delay-row .delay-info-text{ background:transparent; border-left:0; padding:.55rem 0; border-radius:0; box-shadow:none; }
        .delay-row .di-line.main{ display:flex; align-items:center; gap:.5rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .delay-row .di-text{ flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .delay-row .delay-info-text .di-line.cause{ display:none; }
        .delay-row .di-ico.delay-clock { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:#ffc107; color:#fff; margin-right:.25rem; box-shadow:inset 0 0 0 2px rgba(255,255,255,.25); }
        .delay-row .di-ico.delay-clock wcs-mat-icon { font-size:16px; line-height:1; }
        /* Bandeau info en rouge pour suppression/modification de parcours */
        .board-row.sub.info-row.danger-row { background:#f8d7da; border-bottom-color:#f1aeb5; position:relative; }
        .board-row.sub.info-row.danger-row:before { content:""; position:absolute; top:-8px; left:16px; width:0; height:0; border-style:solid; border-width:8px 8px 0 8px; border-color:#f8d7da transparent transparent transparent; }
        .info-row.danger-row .col.dest.info{ color:#7a0010; }
        .info-row.danger-row .di-line.main{ display:flex; align-items:center; gap:.5rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .info-row.danger-row .di-text{ flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        /* .info-row.danger-row .di-line.cause{ display:none; } */
        .info-row.danger-row .di-ico.delay-clock { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:#dc3545; color:#fff; margin-right:.25rem; box-shadow:inset 0 0 0 2px rgba(255,255,255,.25); }
        .info-row.danger-row .di-ico.delay-clock wcs-mat-icon { font-size:16px; line-height:1; }
        /* Info suppression en une ligne */
        .info-row.danger-row .col.dest.info{ display:flex; align-items:center; gap:.5rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .info-row.danger-row .col.dest.info .one-line{ flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .board-loading, .board-error { margin:2rem 0; text-align:center; font-size:.9rem; }
        .schedule-row { cursor:pointer; border-top:2px solid transparent; }
        .schedule-row.open { border-top-color:#c9b800; }
        .col.time .delay { margin-left:4px; color:#b40000; font-weight:600; font-size:.65rem; }
        .col.time { display:flex; flex-wrap:wrap; align-items:center; gap:.25rem; }
        .dual-time { display:flex; flex-direction:column; line-height:1.05; }
        .dual-time .t-orig { font-weight:600; }
        .dual-time .t-orig.strike { text-decoration:line-through; opacity:.65; }
        .dual-time .t-new { color:#ff9f34; font-weight:600; }
        .dual-time.small .t-orig { font-size:.68rem; }
        .dual-time.small .t-new { font-size:.62rem; }
        .col.time .time-base { font-weight:600; }
        .col.time .time-flags { display:inline-flex; gap:.25rem; flex-wrap:wrap; }
        .col.time .flag { background:#222; color:#fff; font-size:.55rem; font-weight:700; padding:.15rem .4rem; border-radius:4px; line-height:1; text-transform:uppercase; letter-spacing:.5px; }
        .col.time .flag.flag-delay { background:#ff9f34; color:#422600; }
        .col.time .flag.flag-cancel { background:#b40000; }
        .col.time .flag.flag-reroute { background:#0d5637; }
        .col.fav { display:flex; justify-content:center; }
        .col.voie .platform { font-weight:700; font-size:.9rem; }
        .details-panel { background:#eaf0d3; padding:0 1.25rem; overflow:hidden; transition:max-height .5s ease, opacity .35s ease; max-height:0; opacity:0; border-radius:10px; }
        .details-panel.show { max-height:1200px; opacity:1; padding:1rem 1.25rem 1.75rem; }
        /* Ancienne règle dépendant d'une seule sous-ligne supprimée */
        /* .schedule-row.open + .board-row.sub + .details-panel { ... } */
        .details-content { animation: fadeSlide .45s ease; }
        @keyframes fadeSlide { from { opacity:0; transform:translateY(-6px);} to { opacity:1; transform:translateY(0);} }
        @media (max-width:900px){ .details-panel { padding:.9rem .9rem 1.4rem; } }
        .bulk-bar { position:sticky; bottom:0; background:#fff; border-top:1px solid #ccc; padding:.5rem .75rem; display:flex; justify-content:space-between; align-items:center; }
        .go-cart-fab { position:fixed; bottom:24px; right:24px; z-index:60; }
        /* Styles détaillés réintroduits pour la liste des gares */
        .details-info-text { background:#e6f1f8; padding:.9rem 1rem; border-radius:4px; font-size:.72rem; line-height:1.3; position:relative; margin:0 0 1rem; white-space:pre-line; }
        .alert-info-block { background:#eef5f9; border-radius:0 0 4px 4px; padding:1.1rem 1.4rem 1.2rem; margin:0 0 1.1rem; box-shadow:inset 0 1px 0 #dbe7ef; }
        .alert-info-block:before { content:""; position:absolute; top:0; left:0; right:0; height:0; border-top:0 solid transparent; border-left:0 solid transparent; }
        .ai-header { display:flex; align-items:center; gap:.6rem; margin:0 0 .55rem; }
        .ai-icon { width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; background:#1b5f90; color:#fff; font-size:.8rem; font-weight:600; border-radius:50%; box-shadow:0 0 0 2px #e6f2f8; }
        .ai-title { font-size:1.05rem; font-weight:700; letter-spacing:.3px; }
        .ai-message { margin:0; font-size:.9rem; line-height:1.45; white-space:pre-line; }
        /* Suppression des styles placeholder inutilisés */
        .details-info-empty, .badge-info { display:none; }
        .stops-section h3 { margin:.2rem 0 .2rem; font-size:1rem; font-weight:800; }
        .stops-section .subtitle { margin:0 0 .4rem; font-size:.75rem; }
        .stops-section .operator { font-size:.65rem; margin:0 0 1rem; color:#5a5a5a; }
        .stops-table { border:0; font-size:.82rem; }
        .stops-head { color:#6b6b6b; font-weight:600; }
        .stops-row { display:grid; grid-template-columns:70px 70px 1fr 60px; align-items:center; padding:.5rem .4rem .5rem .2rem; position:relative; cursor:pointer; }
        .stops-row.head { cursor:default; padding:.25rem .2rem; font-size:.78rem; }
        .stops-row.first { font-weight:700; }
        .stops-row:not(.head):not(.selected):hover { background:#f7fbe8; }
        .stops-row.selected { background:#0d5637; color:#fff; }
        .st-col.time, .st-col.arr, .st-col.dep { color:#1a1a1a; font-variant-numeric:tabular-nums; }
        .st-col.name { position:relative; padding-left:32px; z-index:2; }
        .st-col.voie { text-align:left; color:#1a1a1a; font-weight:600; }
        .stops-body { position:relative; }
        /* Barre verticale + points alignés entre temps et nom */
        .stops-body:before { content:""; position:absolute; top:.5rem; bottom:.5rem; left:140px; width:3px; background:#c9b800; border-radius:6px; }
        .stops-row:before { content:""; position:absolute; left:140px; top:50%; width:12px; height:12px; transform:translate(-6px,-50%); border:2px solid #0d5637; background:#fff; border-radius:50%; box-sizing:border-box; z-index:1; }
        /* Suppression du bloc gradient avec variables CSS pour éviter les erreurs de compilation */
        .stops-row.first:before { background:#fff; }
        .stops-row.active:before { background:#fff; }
        .stops-row.selected:before { border-color:#0d5637; background:#fff; }
        .stops-row.removed { color:#555; opacity:.8; cursor:default; }
        .stops-row.removed .removed-name { text-decoration:line-through; }
        .stops-row.removed .removed-time.strike { text-decoration:line-through; opacity:.75; }
        .stops-row.removed .removed-label { background:#b40000; color:#fff; font-weight:700; font-size:.5rem; padding:.15rem .35rem; border-radius:4px; text-transform:uppercase; letter-spacing:.5px; display:inline-block; }
        .stops-body.cancelled-itinerary:before { display:none; }
        .stops-row.cancelled:before { display:none; }
        .stops-row.cancelled { cursor:default; }
        .cancelled-text { color:#b40000; }
        .cancelled-label { background:#b40000; color:#fff; font-weight:700; font-size:.5rem; padding:.15rem .35rem; border-radius:4px; text-transform:uppercase; letter-spacing:.5px; display:inline-block; }
        .orig-dest.strike { text-decoration:line-through; opacity:.55; margin-right:.35rem; font-weight:500; }
        .new-dest { font-weight:600; }
        .dest-badge { margin-left:.45rem; background:#0d5637; color:#fff; font-size:.5rem; font-weight:700; padding:.18rem .4rem .2rem; border-radius:4px; text-transform:uppercase; letter-spacing:.6px; display:inline-block; line-height:1; }
        .stop-badge.terminus { margin-left:.4rem; background:#0d5637; color:#fff; font-size:.5rem; font-weight:700; padding:.18rem .4rem .2rem; border-radius:4px; text-transform:uppercase; letter-spacing:.6px; display:inline-block; line-height:1; }
        .stop-badge.origin { margin-left:.4rem; background:#0d5637; color:#fff; font-size:.5rem; font-weight:700; padding:.18rem .4rem .2rem; border-radius:4px; text-transform:uppercase; letter-spacing:.6px; display:inline-block; line-height:1; }
        .stop-badge.here { margin-left:.4rem; background:#0d5637; color:#fff; font-size:.5rem; font-weight:700; padding:.18rem .4rem .2rem; border-radius:4px; text-transform:uppercase; letter-spacing:.6px; display:inline-block; line-height:1; }
        /* Bloc achat (style proche de la maquette) */
        .buy-section { margin-top:1.1rem; }
        .buy-title { margin:.6rem 0 .2rem; font-size:.95rem; font-weight:800; }
        .buy-help { margin:0 0 .8rem; font-size:.78rem; color:#333; }
        .buy-form { display:flex; gap:.75rem; align-items:center; flex-wrap:wrap; }
        .buy-line { display:inline-flex; align-items:center; gap:.5rem; background:#fff; border-radius:10px; padding:.55rem .75rem; box-shadow:0 1px 0 rgba(0,0,0,.05); }
        .buy-line input[type="number"], .buy-line select { border:none; background:transparent; font-size:.85rem; }
        .buy-btn { border-radius:10px; }
        .route-summary { display:grid; grid-template-columns:1fr 1fr; gap:.6rem 1rem; padding:.6rem .4rem .4rem; margin:.2rem 0 .6rem; background:#fff; border-radius:6px; }
        .rs-item { display:flex; align-items:baseline; gap:.5rem; font-size:.82rem; }
        .rs-label { min-width:92px; color:#555; font-weight:600; text-transform:uppercase; font-size:.68rem; letter-spacing:.4px; }
        .rs-value { font-weight:700; }
        .rs-value.changed { color:#0d5637; }
      `}</style>
    </>
  );
}
