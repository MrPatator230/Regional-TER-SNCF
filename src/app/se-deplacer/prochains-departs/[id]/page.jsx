"use client";
import React, { useEffect, useState } from "react";
import Header from "@/app/components/Header";
import Link from "next/link";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { usePerturbations } from '@/app/hooks/usePerturbations';

export default function BoardPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const typeParam = (searchParams.get("type") || "departures").toLowerCase();
  const [type, setType] = useState(typeParam === "arrivals" ? "arrivals" : "departures");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // sélection se fait par paire scheduleId + date (ex: '1234_2025-09-19')
  const [selectedScheduleKey, setSelectedScheduleKey] = useState(null);

  // Récupération des perturbations côté client (pour afficher la carte d'info par ligne)
  const { getPerturbationsForLine, perturbations } = usePerturbations();

  // Ajout d'un état pour suivre les perturbations globales
  const [perturbationsTick, setPerturbationsTick] = useState(0);

  useEffect(() => {
    setType(typeParam === "arrivals" ? "arrivals" : "departures");
  }, [typeParam]);

  // Écouteur global pour recharger les sillons lorsque les perturbations changent
  useEffect(() => {
    function onUpdate() {
      setPerturbationsTick((t) => t + 1);
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('perturbations:updated', onUpdate);
      return () => window.removeEventListener('perturbations:updated', onUpdate);
    }
    return undefined;
  }, []);

  // Recharger les sillons en fonction des perturbations
  useEffect(() => {
    let aborted = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/public/stations/${id}/board?type=${type}&days=2`, { cache: "no-store" });
        if (res.status === 410) {
          if (!aborted) {
            setError("Sillons en refonte — horaires indisponibles");
            setData(null);
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!aborted) setData(json);
      } catch (e) {
        if (!aborted) setError("Impossible de charger les horaires.");
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    load();
    return () => {
      aborted = true;
    };
  }, [id, type, perturbationsTick]);

  // Ajout d'une fonction pour récupérer les perturbations des sillons par jour
  const enrichSillonsWithDailyPerturbations = (sillons, perturbations) => {
    if (!Array.isArray(sillons) || !sillons.length) return sillons || [];
    if (!Array.isArray(perturbations) || !perturbations.length) return sillons;

    // helpers locaux
    function safeToStr(v){ if(v === undefined || v === null) return ''; try{ return String(v).trim(); }catch(e){ return ''; } }
    function normalizeIdNum(v){ if(v === undefined || v === null) return null; const n = Number(v); return Number.isNaN(n) ? null : n; }

    // Mappe une perturbation quotidienne vers status_key/status/delay (même logique que côté API serveur)
    function mapPerturbToStatusLocal(match){
      if(!match) return { status_key: 'on_time', status: "A L'HEURE", delay: null, cancelledFlag: false };
      const rawType = safeToStr(match.type || match.titre || match.title || (match.data && (match.data.type || match.data.titre)) || '').toLowerCase();
      const cancelledFlag = !!match.cancelled || !!match.cancelled_at || !!(match.data && match.data.cancelled);
      const isCancelled = rawType.includes('supprim') || rawType.includes('annul') || rawType.includes('cancel') || cancelledFlag;
      const isDelay = rawType.includes('retard') || rawType.includes('delay') || rawType.includes('late');
      const isSubst = rawType.includes('substitut') || rawType.includes('remplac') || rawType.includes('substitution');
      const isIncident = rawType.includes('incident') || rawType.includes('panne');
      const isModified = rawType.includes('modif') || rawType.includes('modification') || rawType.includes('modifié');
      const isAdvanced = rawType.includes('avance') || rawType.includes('avancé') || rawType.includes('avancee');

      let status_key = 'on_time';
      let status = "A L'HEURE";
      let delay = null;

      if(isCancelled){ status_key = 'cancelled'; status = 'supprimé'; }
      else if(isDelay){
        status_key = 'delayed';
        status = 'retardé';
        delay = match.delay_minutes || match.delay_min || match.delay || match.retard_min || (match.data && (match.data.delay_minutes || match.data.delay_min || match.data.delay || match.data.retard_min)) || null;
        if(typeof delay === 'string' && delay.trim() === '') delay = null;
        if(delay != null) delay = Number(delay) || null;
      } else if(isSubst){ status_key = 'substituted'; status = 'remplacé'; }
      else if(isIncident){ status_key = 'incident'; status = 'incident'; }
      else if(isModified){ status_key = 'modified'; status = 'modifié'; }
      else if(isAdvanced){ status_key = 'advanced'; status = 'avancé'; }
      else if(cancelledFlag){ status_key = 'cancelled'; status = 'supprimé'; }

      return { status_key, status, delay, cancelledFlag };
    }

    return sillons.map((sillon) => {
      const sId = normalizeIdNum(sillon.id);
      const sDate = String(sillon.date || '').slice(0,10);
      const perturbation = perturbations.find((p) => {
        const pSid = normalizeIdNum(p.schedule_id ?? p.sillon_id ?? p.sillonId ?? p.sillonId);
        const pDate = p.date ? String(p.date).slice(0,10) : null;
        return pSid && sId && pSid === sId && pDate && sDate && pDate === sDate;
      });

      if (perturbation) {
        const mapped = mapPerturbToStatusLocal(perturbation);
        const isSupp = mapped.status_key === 'cancelled';
        const isDelay = mapped.status_key === 'delayed';
        const delayVal = mapped.delay != null ? Number(mapped.delay) : (perturbation.delay_minutes != null ? Number(perturbation.delay_minutes) : (sillon.delay_minutes != null ? Number(sillon.delay_minutes) : (sillon.delay_min != null ? Number(sillon.delay_min) : null)));

        return {
          ...sillon,
          // flag utilisé par le rendu
          cancelled: isSupp || !!sillon.cancelled,
          // mettre à jour les champs de retard (legacy et actuels)
          delay_minutes: delayVal != null ? delayVal : (sillon.delay_minutes != null ? Number(sillon.delay_minutes) : 0),
          delay_min: delayVal != null ? delayVal : (sillon.delay_min != null ? Number(sillon.delay_min) : 0),
          delay_cause: perturbation.cause || perturbation.message || sillon.delay_cause || null,
          cancel_message: perturbation.message || perturbation.cause || sillon.cancel_message || null,
          // canonical fields pour usage plus moderne
          status_key: mapped.status_key,
          status: mapped.status,
          // garder un champ legacy pour compatibilité
          status_legacy: isSupp ? 'supprimé' : (isDelay ? 'retard' : (sillon.status || null)),
        };
      }
      return sillon;
    });
  };

  // Synchronisation des schedules (data.days[].schedules) avec les perturbations quotidiennes
  useEffect(() => {
    if (!data || !Array.isArray(data.days) || !data.days.length) return;
    if (!Array.isArray(perturbations) || !perturbations.length) return;

    let changed = false;
    const newDays = data.days.map(day => {
      const origSchedules = Array.isArray(day.schedules) ? day.schedules : [];
      const enriched = enrichSillonsWithDailyPerturbations(origSchedules, perturbations);
      // simple comparaison JSON pour détecter changement (suffisant pour petites listes)
      try{
        if (JSON.stringify(enriched) !== JSON.stringify(origSchedules)) changed = true;
      }catch(e){ /* ignore stringify errors */ }
      return { ...day, schedules: enriched };
    });

    if (changed) {
      setData(prev => ({ ...prev, days: newDays }));
    }
  }, [perturbations, data?.days]);

  const titre = type === "departures" ? "Prochains départs" : "Prochaines arrivées";

  const formatDate = (isoDate) => {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      });
    } catch {
      return isoDate;
    }
  };

  // helper: retourne la meilleure cause de suppression disponible pour un horaire
  const getCancelCause = (sched) => {
    if (!sched) return 'Conditions de départ non réunies';

    // Priorités de champs connus envoyés par l'API / enrichissements clients
    const candidates = [
      sched.cancel_reason,
      sched.cancel_message,
      sched.cancel_cause,
      sched.cause,
      sched.info,         // souvent "Supprimé – <cause>" côté API
      sched.info_message,
      sched.message,
    ].filter(Boolean);

    // Tenter d'extraire une cause depuis des chaînes du type "Supprimé – <cause>" ou "Supprimé - <cause>" ou "Supprimé: <cause>"
    const extractFromInfo = (text) => {
      if (typeof text !== 'string') return null;
      const m = text.match(/supprim[eé]\s*(?:–|-|:)\s*(.+)/i);
      if (m && m[1]) return m[1].trim();
      return null;
    };

    for (const c of candidates) {
      const extracted = extractFromInfo(c);
      if (extracted && !/conditions de départs? non réunies/i.test(extracted)) return extracted;
    }

    // Retourner le premier candidat non générique
    for (const c of candidates) {
      if (typeof c === 'string' && !/conditions de départs? non réunies/i.test(c)) return c.trim();
    }

    // fallback
    return 'Conditions de départ non réunies';
  };

  return (
    <>
      <Header />
      <main className="board-wrapper">
        <nav className="pd-breadcrumb" aria-label="Fil d'ariane">
          <ol className="breadcrumb-horizontal-left">
            <li><Link href="/" aria-label="Accueil"><wcs-mat-icon icon="home" aria-hidden="true"></wcs-mat-icon></Link></li>
            <li aria-hidden="true">›</li>
            <li><Link href="/se-deplacer/prochains-departs">Prochains départs</Link></li>
            <li aria-hidden="true">›</li>
            <li aria-current="page">Gare {data?.station?.name || "..."}</li>
          </ol>
        </nav>

        <header className="board-header">
          <div>
            <h1>{titre}</h1>
            {data?.station?.name && <h2>Gare {data.station.name}</h2>}
          </div>
          <div className="board-actions">
            <Link href="#" className="act-link">Infos pratiques {data?.station?.name}</Link>
            <Link href="/se-deplacer/prochains-departs" className="act-link">Changer de gare</Link>
          </div>
        </header>

        <div className="board-pills">
          <button type="button" className={type === "departures" ? "active" : ""} onClick={() => router.push(`/se-deplacer/prochains-departs/${id}?type=departures`)}>Départs </button>
          <button type="button" className={type === "arrivals" ? "active" : ""} onClick={() => router.push(`/se-deplacer/prochains-departs/${id}?type=arrivals`)}>Arrivées </button>
        </div>

        {loading && <p>Chargement...</p>}
        {error && <p>{error}</p>}

        {!loading && !error && (
          <div className="board-card">
            <div className="board-head">
              <div>{type === "arrivals" ? "Arrivée" : "Départ"}</div>
              {type === "arrivals" && <div>Provenance</div>}
              {type !== "arrivals" && <div>Destination</div>}
              <div>Mode</div>
              <div>Voie</div>
            </div>
            <div className="board-body">
              {data?.days?.map(day => {
                // Filtrage des horaires selon la date et l'heure
                const now = new Date();
                const dayDate = new Date(day.date);
                let filteredSchedules = day.schedules;
                if (
                  dayDate.toDateString() === now.toDateString()
                ) {
                  // Jour courant : ne garder que les horaires à venir
                  filteredSchedules = day.schedules.filter(schedule => {
                    // On suppose que schedule.time est au format "HH:mm"
                    const [h, m] = schedule.time.split(":");
                    const scheduleDate = new Date(day.date);
                    scheduleDate.setHours(Number(h), Number(m), 0, 0);
                    return scheduleDate >= now;
                  });
                }
                // Jour suivant : on garde tout
                return (
                  <React.Fragment key={day.date}>
                    <div className="day-separator">{formatDate(day.date)}</div>
                    {filteredSchedules.map(schedule => {
                      // Récupérer perturbations ligne actives (côté client) pour afficher la carte d'info
                      const linePerts = getPerturbationsForLine(schedule.ligne_id, schedule.time, day.date) || [];
                      const linePert = linePerts.length ? linePerts[0] : null;
                       // Avoid double display: filter out origin/terminus from the stops list
                      const allStops = Array.isArray(schedule.stops) ? schedule.stops : [];
                      const depName = String(schedule.departureStation || schedule.departure_station || schedule.origin || '').trim().toLowerCase();
                      const arrName = String(schedule.arrivalStation || schedule.arrival_station || schedule.destination || '').trim().toLowerCase();
                      // filter out explicit origin/terminus matches
                      const filtered = allStops.filter(s => {
                        const name = String(s.station || s.station_name || '').trim().toLowerCase();
                        if(!name) return false;
                        if(depName && name === depName) return false;
                        if(arrName && name === arrName) return false;
                        return true;
                      });
                      // deduplicate by station name (preserve first occurrence)
                      const seen = new Set();
                      const stopsToRender = [];
                      for(const s of filtered){
                        const name = String(s.station || s.station_name || '').trim().toLowerCase();
                        if(seen.has(name)) continue;
                        seen.add(name);
                        stopsToRender.push(s);
                      }
                      
                      // Ensure origin and terminus are visible in the detail view
                      const originName = String(schedule.origin || schedule.departureStation || schedule.departure_station || '').trim();
                      const terminusName = String(schedule.destination || schedule.arrivalStation || schedule.arrival_station || '').trim();
                      const originTime = schedule.schedule_departure_time || schedule.departure_time || schedule.time || '';
                      const terminusTime = schedule.schedule_arrival_time || schedule.arrival_time || '';
                      const originStop = originName ? { station_name: originName, station_id: `origin_${schedule.id}`, time: originTime, origin: true, platform: schedule.platform || '' } : null;
                      const terminusStop = terminusName ? { station_name: terminusName, station_id: `dest_${schedule.id}`, time: terminusTime, dest: true, platform: schedule.platform || '' } : null;
                      // Build final list to render: origin -> intermediates -> terminus
                      const displayStops = [];
                      if (originStop) displayStops.push(originStop);
                      for (const s of stopsToRender) displayStops.push(s);
                      if (terminusStop) displayStops.push(terminusStop);

                      return (
                        <React.Fragment key={schedule.id}>
                          <div className={`board-row-wrapper ${selectedScheduleKey === `${String(schedule.id)}_${day.date}` ? 'open' : ''}`} aria-expanded={selectedScheduleKey === `${String(schedule.id)}_${day.date}`}>
                            <div
                              className={`board-row ${schedule.cancelled ? 'cancelled' : ''}`}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                const key = `${String(schedule.id)}_${day.date}`;
                                setSelectedScheduleKey(prev => (prev === key ? null : key));
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { const key = `${String(schedule.id)}_${day.date}`; setSelectedScheduleKey(prev => (prev === key ? null : key)); } }}
                            >
                              <div className="col-time">
                                <span>{schedule.time}</span>
                              </div>
                              <div className="col-destination">
                                {type === 'arrivals' ? (
                                  <div className="dest-name">{schedule.origin || '-'}</div>
                                ) : (
                                  <div className="dest-name">{schedule.destination || '-'}</div>
                                )}
                              </div>
                              <div className="col-mode">{schedule.train_type} {schedule.train_number}</div>
                              <div className="col-right">
                                <div className="col-platform">{schedule.platform || "-"}</div>
                                <div className="row-toggle" aria-hidden="true">{selectedScheduleKey === `${String(schedule.id)}_${day.date}` ? '▲' : '▾'}</div>
                              </div>
                            </div>
                            {/* Bandeau de retard orange sous la ligne horaire, au-dessus du bandeau d'info */}
                            {schedule.delay_minutes > 0 && (
                              <div className="delay-banner-below" role="status" aria-live="polite" style={{background:'#ffe5c2', color:'#a65c00', display:'flex',alignItems:'center',gap:8,padding:'4px 12px',borderRadius:6,margin:'2px 0'}}>
                                <span className="info-icon" aria-hidden="true">
                                  <wcs-mat-icon icon="train_alert" />
                                </span>
                                <span className="info-title" style={{fontWeight:'bold'}}>Retardé de {schedule.delay_minutes} min</span>
                              </div>
                            )}
                            {/* Bandeau d'information classique, affiché sous le bandeau de retard */}
                            {!schedule.cancelled && schedule.infoBanner && (
                              <div className={`line-info-banner info`} role="status" aria-live="polite">
                                <div className="banner-inner">
                                  <div className="info-icon" aria-hidden="true"><wcs-mat-icon icon="info" /></div>
                                  <div className="info-content">
                                    <div className="info-title">Information</div>
                                    {schedule.info_message && <div className="info-text">{schedule.info_message}</div>}
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* Si le sillon est supprimé : appliquer style 'cancelled' et afficher un bandeau rouge intégré */}
                            {schedule.cancelled && (
                              <div className="cancel-banner" role="status" aria-live="polite">
                                <div className="banner-inner">
                                  <div className="info-icon" aria-hidden="true">
                                    <wcs-mat-icon icon="warning" />
                                  </div>
                                  <div className="info-content">
                                    <div className="info-title">Supprimé</div>
                                    {/* Afficher la cause de suppression : utiliser le helper getCancelCause */}
                                  </div>
                                </div>
                              </div>
                            )}
                            {selectedScheduleKey === `${String(schedule.id)}_${day.date}` && (
                              <>
                                <div className={`schedule-details ${schedule.cancelled ? 'cancelled' : ''}`}>
                                  {/* top header like in mock - if cancelled, show struck-through visuals */}
                                  <div className="schedule-topbar">
                                    <div className="top-left">
                                      <div className={`top-time ${schedule.cancelled ? 'struck' : ''}`}>{schedule.time}</div>
                                      <div className={`top-dest ${schedule.cancelled ? 'struck' : ''}`}>{schedule.destination || schedule.origin || ''}</div>
                                    </div>
                                    <div className={`top-center ${schedule.cancelled ? 'struck' : ''}`}>{schedule.train_type} {schedule.train_number}</div>
                                    <div className="top-right">{schedule.mode_icon || ''}</div>
                                  </div>
                                  {/* Détail du retard */}
                                  {schedule.delay_minutes > 0 && (
                                    <div className="delay-details card" role="status" aria-live="polite">
                                      <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                        <div style={{ color: '#e67e22', fontSize: 24 }} aria-hidden="true">
                                          <wcs-mat-icon icon="train_alert" />
                                        </div>
                                        <div>
                                          <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>Retardé de {schedule.delay_minutes} min</div>
                                          {schedule.delay_cause && (
                                            <div style={{ marginTop: 4, color: '#a65c00' }}>{schedule.delay_cause}</div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Card d'information liée à la ligne (bandeau global) */}
                                  {(linePert || schedule.infoBanner) && (
                                    <div className="info-line-card card">
                                      <div className="card-body">
                                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                          <div style={{ color: '#2b6fa8', fontSize: 20 }} aria-hidden="true"><wcs-mat-icon icon="info" /></div>
                                          <div>
                                            <h4 className="h6 m-0">{linePert?.titre || 'Information sur la ligne'}</h4>
                                            {(linePert?.description || schedule.info_message) && (
                                              <div style={{ whiteSpace: 'pre-wrap', marginTop: 6, color: '#113049' }}>{linePert?.description || schedule.info_message}</div>
                                            )}
                                            {linePert && (
                                              <div className="small text-muted" style={{ marginTop: 8 }}>
                                                {linePert.date_debut ? `Du ${new Date(linePert.date_debut).toLocaleDateString('fr-FR')}` : ''}{linePert.date_fin ? ` au ${new Date(linePert.date_fin).toLocaleDateString('fr-FR')}` : ''}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {schedule.cancelled ? (
                                    <>
                                      {/* grand bandeau rouge */}
                                      <div className="cancel-hero" role="alert">
                                        <div className="hero-icon"><wcs-mat-icon icon="error_outline" /></div>
                                        <div className="hero-body">
                                          <div className="hero-title">Supprimé</div>
                                          <div className="hero-sub">{getCancelCause(schedule)}</div>
                                        </div>
                                      </div>

                                      {/* si message d'info complémentaire : bandeau bleu */}
                                      {schedule.message && (
                                        <div className="info-hero">
                                          <div className="info-icon"><wcs-mat-icon icon="info" /></div>
                                          <div className="info-body">
                                            <div className="info-title">Information</div>
                                            <div className="info-text">{schedule.message}</div>
                                          </div>
                                        </div>
                                      )}

                                      <h3 className="stops-title">Liste des gares</h3>
                                      <div className="stops-subtitle">Desservies (arrêts supprimés indiqués)</div>

                                      <div className="stops-headers cancelled-headers">
                                        <div className="h-time">Départ</div>
                                        <div className="h-marker"></div>
                                        <div className="h-name">Gare</div>
                                        <div className="h-platform">Voie</div>
                                      </div>

                                      {Array.isArray(schedule.stops) && schedule.stops.length > 0 ? (
                                        <ul className="stops-list cancelled-list">
                                          {displayStops.map((stop, i) => {
                                            const displayedTime = stop.time || stop.departure_time || stop.arrival_time || '-';
                                            const isLast = i === displayStops.length - 1;
                                            return (
                                              <li key={`${schedule.id}_${stop.station_id || i}_${i}`} className={`${isLast ? 'last' : ''}`}>
                                                {/* Garder le même markup que les arrêts normaux pour réutiliser la barre verticale */}
                                                <div className="stop-time struck">{displayedTime}</div>
                                                <div className="stop-marker-cell"><span className="stop-marker" aria-hidden="true"></span></div>
                                                <div className="stop-name">
                                                  <span className="struck">{stop.station_name}</span>
                                                  {/* raison affichée sous le nom de la gare */}
                                                  <div className="removed-sub">{getCancelCause(schedule)}</div>
                                                </div>
                                                <div className="stop-platform">-</div>
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      ) : (
                                        <div className="no-stops">Détails non disponibles pour cet horaire.</div>
                                      )}
                                    </>
                                  ) : (
                                    /* non-cancelled original rendering */
                                    <>
                                      {/* petite zone d'information bleu */}
                                      {schedule.message && (
                                        <div className="schedule-info">
                                          <div className="info-icon"><wcs-mat-icon icon="info" /></div>
                                          <div className="info-text">{schedule.message}</div>
                                        </div>
                                      )}

                                      <h3 className="stops-title">Liste des gares</h3>
                                      <div className="stops-subtitle">desservies par le {schedule.train_type} {schedule.train_number}</div>

                                      <div className="stops-headers">
                                        <div className="h-time">Départ</div>
                                        <div className="h-marker"></div>
                                        <div className="h-name">Gare</div>
                                        <div className="h-platform">Voie</div>
                                      </div>

                                      {Array.isArray(schedule.stops) && schedule.stops.length > 0 ? (
                                        <ul className="stops-list">
                                          {displayStops.map((stop, i) => {
                                            const isOrigin = !!stop.origin;
                                            const isDest = !!stop.dest;
                                            const displayedTime = isOrigin
                                              ? (schedule.schedule_departure_time || stop.time || stop.departure_time || stop.arrival_time || '-')
                                              : (isDest
                                                ? (schedule.schedule_arrival_time || stop.time || stop.arrival_time || stop.departure_time || '-')
                                                : (stop.time || stop.arrival_time || stop.departure_time || '-'));

                                            return (
                                              <li key={`${schedule.id}_${stop.station_id || i}_${i}`} className={`${i === displayStops.length - 1 ? 'last' : ''} ${stop.origin ? 'origin' : ''} ${stop.dest ? 'dest' : ''}`}>
                                                <div className="stop-time">{displayedTime}</div>
                                                <div className="stop-marker-cell"><span className="stop-marker" aria-hidden="true"></span></div>
                                                <div className="stop-name">
                                                  {stop.station_name}
                                                  {stop.origin && <span className="station-badge origin">Origine</span>}
                                                  {stop.dest && <span className="station-badge dest">Terminus</span>}
                                                </div>
                                                <div className="stop-platform">{stop.platform || "-"}</div>
                                              </li>
                                             );
                                           })}
                                        </ul>
                                      ) : (
                                        <div className="no-stops">Détails non disponibles pour cet horaire.</div>
                                      )}
                                    </>
                                  )}


                                </div>
                              </>
                            )}
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
             </div>
           </div>
         )}
       </main>
       <style jsx>{`
         /* Styles pour affichage sillon supprimé (inspiré de la maquette) */
        .schedule-details.cancelled { background: #eef4d6; }
        .schedule-topbar .struck { text-decoration: line-through; color: rgba(0,0,0,0.35); }
        .cancel-hero { background: #f6e0e0; border-radius: 4px; display:flex; gap:12px; padding:18px; margin:12px 0; align-items:flex-start; }
        .cancel-hero .hero-icon { color:#b51f2b; font-size:28px; display:flex; align-items:center; }
        .cancel-hero .hero-title{ font-weight:700; color:#b51f2b; font-size:20px }
        .cancel-hero .hero-sub{ color:#6b4f4f; margin-top:6px }
        .info-hero { background:#e9f6fb; border-radius:4px; display:flex; gap:12px; padding:16px; margin:12px 0; }
        .info-hero .info-icon{ color:#2b6fa8; font-size:22px }
        .info-hero .info-title{ font-weight:700 }
        /* Reprendre le markup standard pour la barre verticale (.stop-marker + :after) */
        .stops-list.cancelled-list { list-style:none; padding:0; margin:0; background: #eaf0c9; border-radius:6px; padding: 12px 12px 24px 12px; }
        .stops-list.cancelled-list li { display:grid; grid-template-columns:90px 24px 1fr 100px; gap:8px; align-items:flex-start; padding:12px 0; position:relative }
        /* afficher tout le texte de la liste en rouge tout en conservant la barre verticale verte */
        .stops-list.cancelled-list .stop-time { color:#b00000; text-decoration:line-through; padding-top:4px }
        .stops-list.cancelled-list .stop-marker-cell { display:flex; align-items:flex-start; justify-content:center }
        /* conserve la couleur de la timeline (stop-marker) mais texte rouge */
        .stops-list.cancelled-list .stop-name { color:#b00000; font-weight:700 }
        .stops-list.cancelled-list .stop-name .struck { text-decoration: line-through; display:block; color:#b00000 }
        .stops-list.cancelled-list .removed-sub { margin-top:6px; color:#b00000; font-size:13px }
        .stops-list.cancelled-list .stop-platform{ color:#b00000; padding-top:4px }
        .info-line-card { margin:12px 0; border-left:4px solid #2b6fa8; background:#eaf6ff; }
        .info-line-card .card-body { padding:12px; }
         .board-wrapper {
           padding: 24px;
           background: #f6f6f6;
           min-height: 100vh;
           display: flex;
           flex-direction: column;
           align-items: center;
         }
         .pd-breadcrumb {
           margin-bottom: 16px;
           text-align: left;
         }
         .breadcrumb-horizontal-left {
           display: flex;
           gap: 8px;
           list-style: none;
           padding: 0;
           margin: 0;
           font-size: 0.9rem;
           color: #333;
           align-items: center;
         }
         .breadcrumb-horizontal-left li {
           display: inline;
         }
         .breadcrumb-horizontal-left li a {
           text-decoration: none;
           color: #267a3a;
         }
         .breadcrumb-horizontal-left li[aria-hidden="true"] {
           color: #666;
         }
         .board-header {
           display: flex;
           justify-content: space-between;
           align-items: center;
           width: 100%;
           max-width: 980px;
           margin-bottom: 24px;
         }
         .board-actions {
           display: flex;
           flex-direction: column;
           align-items: flex-end;
         }
         .act-link {
           color: #267a3a;
           text-decoration: none;
           margin-bottom: 8px;
         }
         .board-pills {
           display: flex;
           gap: 8px;
           margin-bottom: 24px;
         }
         .board-pills button {
           padding: 8px 16px;
           border: none;
           border-radius: 20px;
           background: #e6e6e6;
           color: #333;
           cursor: pointer;
         }
         .board-pills button.active {
           background: #2f7030;
           color: #fff;
         }
         .board-card {
           max-width: 980px;
           width: 100%;
           background: #fff;
           border-radius: 8px;
           box-shadow: 0 0 0 1px rgba(0,0,0,0.04);
           overflow: hidden;
         }
         .board-head {
           display: grid;
           grid-template-columns: 1fr 2fr 2fr 1fr;
           background: #f4e5b0;
           padding: 8px;
           font-weight: bold;
         }
         .board-body {
           display: grid;
           grid-template-columns: 1fr 2fr 2fr 1fr;
           gap: 8px;
           padding: 8px;
         }
         .board-row {
           display: grid;
           grid-template-columns: 90px 1fr 1fr 150px;
           align-items: center;
           gap: 8px;
           cursor: pointer;
         }
         .board-row-wrapper { grid-column: span 4; display: block; }
         .board-row-wrapper:hover .board-row { background: #fbfbfb; }
         .board-row-wrapper:focus { outline: none; }
         .board-row:focus { outline: 2px solid rgba(38,122,58,0.14); }
         .board-row-wrapper .col-time { padding-left: 12px; color: #2f7030; font-weight: 600; }
         .board-row-wrapper .col-destination { color: #213a21; }
         .board-row-wrapper .col-mode { color: #666; }
         .board-row-wrapper .col-right { display:flex; align-items:center; gap:12px; justify-content:flex-end; padding-right:12px }
         .row-toggle { width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center; border-radius:18px; background:#e7f4ea; color:#267a3a; font-size:12px; border:1px solid #d7ead8 }
         .board-row-wrapper.open .board-row { background: #ffffff; border-top: 1px solid #e6e6e6; border-bottom: 1px solid #e6e6e6; box-shadow: inset 0 -1px 0 rgba(0,0,0,0.02); padding: 10px 0; }
         .day-separator {
            grid-column: span 4;
            background: #e6ebc7;
            padding: 8px;
            font-weight: bold;
            position: relative;
            z-index: 1; /* lower than details */
          }
         .schedule-details {
           grid-column: span 4;
           background: #eef4d6; /* pale green */
           padding: 0 24px 28px 24px;
           border-top: 0; /* visual continuity with open row */
           position: relative;
           z-index: 3; /* above separators */
           margin-top: 6px;
         }
         .board-row-wrapper.open { position: relative; z-index: 4; }
         /* add small separator below details when open to mimic design */
         .board-row-wrapper.open + .schedule-details { margin-top: 4px; }
         .schedule-topbar { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#ffffff; border-radius:4px 4px 0 0; margin-bottom:12px; }
         .top-left { display:flex; flex-direction:column; }
         .top-time { color:#2f7030; font-weight:700 }
         .top-dest { color:#213a21; font-size:0.95rem }
         .top-center { color:#2f4f26; font-weight:700 }
         .stops-title { margin:0; font-size:1.15rem; color:#2f4f26; padding-top:6px }
         .stops-subtitle { color:#666; margin-bottom:12px }
         .stops-headers { display:grid; grid-template-columns:90px 24px 1fr 100px; gap:8px; padding:8px 0; color:#566c4f; font-weight:600 }
         .stops-list { list-style:none; padding:0; margin: 0 0 16px 0; }
         .stops-list li { display:grid; grid-template-columns:90px 24px 1fr 100px; gap:8px; align-items:center; padding:8px 0; }
         .stop-marker-cell { display:flex; align-items:center; justify-content:center; position:relative }
         .stop-marker { display:inline-block; width:12px; height:12px; border-radius:50%; background:#fff; border:3px solid #267a3a; position:relative }
         .stop-marker:after { content:""; position:absolute; left:50%; top:14px; transform:translateX(-50%); width:2px; height:220%; background:#b9c27a }
         .stops-list li.last .stop-marker:after { display:none }
         .station-badge { margin-left:8px; padding:2px 8px; border-radius:12px; font-size:0.75rem; color:#fff; display:inline-block; vertical-align:middle }
         /* Bandeau exactement comme la maquette : pleine largeur, hauteur fixe, icône ronde, titre plus grand
            - le contenu commence aligné après la colonne horaire (90px)
            - triangle blanc en haut aligné sur la colonne horaire
            - pas d'espace entre plusieurs bandeaux */
         .line-info-banner { grid-column: span 4; position:relative; margin:0; width:100%; }
         .line-info-banner + .line-info-banner { margin-top:0; }
         .line-info-banner .banner-inner { display:flex; align-items:center; gap:12px; min-height:32px; padding:0 16px; box-sizing:border-box; padding-left:98px; }

         /* triangle blanc pointant vers le haut, ajusté pour la hauteur réduite */
         .line-info-banner:before { content:''; position:absolute; left:90px; top:-6px; width:0; height:0; border-left:8px solid transparent; border-right:8px solid transparent; border-bottom:8px solid #fff; }

         /* variante info (bleu pâle) */
         .line-info-banner.info .banner-inner { background:#eaf6fb; color:#0b3b66; }
         .line-info-banner.info .info-icon { background:#2f86d6 }

         /* variante danger (rose pâle) */
         .line-info-banner.danger .banner-inner { background:#faecec; color:#6b1f1a; }
         .line-info-banner.danger .info-icon { background:#c94a42 }

         /* icône ronde */
         .line-info-banner .info-icon { width:28px; height:28px; min-width:28px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:14px; color:#fff }
         .line-info-banner .info-icon wcs-mat-icon { font-size:16px; color:#fff }

         /* texte : titre plus grand et alignement précis */
         .line-info-banner .info-content { display:flex; flex-direction:column }
         .line-info-banner .info-title { font-weight:600; font-size:18px; line-height:1; }
         .line-info-banner .info-text { font-size:14px; margin-top:4px; opacity:0.95 }

         /* retirer arrondis/ombres pour coller à la maquette */
         .line-info-banner .banner-inner { border-radius:0; box-shadow:none; }
         /* séparateur placé sous la zone de détail lorsqu'elle est ouverte */
         .detail-separator { grid-column: span 4; height: 1px; background: #e6e6e6; margin: 6px 0 8px 0; }
         /* variante légèrement visible pour thèmes sombres (fallback) */
         @media (prefers-color-scheme: dark) {
           .detail-separator { background: rgba(255,255,255,0.06); }
         }

         /* Styles pour ligne supprimée */
         .board-row.cancelled .col-time,
         .board-row.cancelled .col-destination,
         .board-row.cancelled .col-mode {
           color: #b00000;
           text-decoration: line-through;
         }
         /* masquer la voie pour les suppressions */
         .board-row.cancelled .col-platform { display: none; }

         /* bannière rouge compacte collée à la ligne */
         .cancel-banner {
           grid-column: span 4;
           display:flex;
           align-items:center;
           gap:8px;
           background:#c9302c;
           color:#fff;
           padding:4px 8px; /* réduit pour être de la même taille que la ligne */
           border-radius:0; /* coins carrés pour coller visuellement */
           margin-top: -4px; /* remonte la bannière pour la coller au bas de la ligne */
           font-weight:700;
           font-size:0.95rem; /* taille proche de la ligne */
           line-height:1;
         }
         /* inner wrapper pour s'assurer d'une seule ligne */
         .cancel-banner .banner-inner { display:inline-flex; align-items:center; gap:8px; width:100%; }
         .cancel-banner .info-icon {
           width:20px;
           height:20px;
           min-width:20px;
           display:flex;
           align-items:center;
           justify-content:center;
           background:rgba(255,255,255,0.12);
           border-radius:50%;
           font-size:14px;
         }
         .cancel-banner .info-icon wcs-mat-icon { font-size:14px; color:#fff }
         .cancel-banner .info-title {
           font-weight:700;
           font-size:0.95rem;
           line-height:1;
           white-space:nowrap;
           overflow:hidden;
           text-overflow:ellipsis;
         }

         /* Nouveau composant pour afficher le détail d'un sillon avec la liste complète des gares */
         .sillon-detail-empty {
           padding: 16px;
           text-align: center;
           color: #666;
           font-style: italic;
         }
         .details-content {
           padding: 0 24px 24px 24px;
         }
         .static-detail {
           padding: 0;
           border-radius: 8px;
           background: #fff;
           box-shadow: 0 2px 4px rgba(0,0,0,0.1);
           margin-top: 8px;
         }
         .schedule-topbar {
           display: grid;
           grid-template-columns: 1fr 2fr 1fr;
           align-items: center;
           padding: 12px 16px;
           background: #f9f9f9;
           border-bottom: 1px solid #e6e6e6;
         }
         .top-left {
           display: flex;
           flex-direction: column;
           align-items: flex-start;
         }
         .top-time {
           font-size: 1.5rem;
           line-height: 1;
           color: #2f7030;
           margin: 0;
         }
         .top-dest {
           font-size: 1.1rem;
           color: #213a21;
           margin: 4px 0 0 0;
         }
         .top-center {
           text-align: center;
         }
         .top-right {
           text-align: right;
         }
         .schedule-info {
           display: flex;
           align-items: center;
           gap: 8px;
           background: #eaf6fb;
           padding: 12px;
           border-radius: 4px;
           margin-bottom: 16px;
         }
         .info-icon {
           color: #2f86d6;
           font-size: 20px;
         }
         .stops-title {
           margin: 0 0 8px 0;
           font-size: 1.2rem;
           color: #2f4f26;
         }
         .stops-subtitle {
           margin: 0 0 16px 0;
           color: #666;
           font-size: 0.9rem;
         }
         .stops-headers {
           display: grid;
           grid-template-columns: 90px 24px 1fr 100px;
           gap: 8px;
           padding: 8px 0;
           color: #566c4f;
           font-weight: 600;
         }
         .stops-list {
           list-style: none;
           padding: 0;
           margin: 0 0 16px 0;
         }
         .stops-list li {
           display: grid;
           grid-template-columns: 90px 24px 1fr 100px;
           gap: 8px;
           align-items: center;
           padding: 8px 0;
         }
         .stop-marker-cell {
           display: flex;
           align-items: center;
           justify-content: center;
           position: relative;
         }
         .stop-marker {
           display: inline-block;
           width: 12px;
           height: 12px;
           border-radius: 50%;
           background: #fff;
           border: 3px solid #267a3a;
           position: relative;
         }
         .stop-marker:after {
           content: "";
           position: absolute;
           left: 50%;
           top: 14px;
           transform: translateX(-50%);
           width: 2px;
           height: 220%;
           background: #b9c27a;
         }
         .stops-section {
           background: #eef3d3;
           border-radius: 8px;
           padding: 24px 32px;
           margin-top: 12px;
         }
         .stops-section .stop-time {
           font-family: Avenir;
           font-weight: 400;
           color: #26321f;
           text-align: right;
         }
         .stops-section .redesign-stop-time {
           font-family: Avenir;
           font-weight: 400;
           color: #26321f;
           text-align: right;
         }
         .stops-section .redesign-stop-gare {
           font-family: Avenir;
           font-weight: 400;
           color: #26321f;
         }
         .stops-section .redesign-stop-voie {
           font-family: Avenir;
           font-weight: 400;
           color: #26321f;
           text-align: right;
         }
         .stops-section .redesign-stop-timeline {
           position: relative;
           height: 44px;
           display: flex;
           align-items: center;
           justify-content: center;
           width: 36px;
         }
         .stops-section .redesign-stop-timeline:before {
           content: '';
           position: absolute;
           left: 50%;
           top: 6px;
           bottom: 6px;
           width: 4px;
           background: #2b7030;
           border-radius: 2px;
           transform: translateX(-50%);
         }
         .stops-section .redesign-stop-timeline:after {
           content: '';
           position: absolute;
           left: 50%;
           top: 14px;
           width: 12px;
           height: 12px;
           background: #2b7030;
           border-radius: 50%;
           z-index: 2;
         }
         .stops-section .stop-marker-cell {
           display: flex;
           align-items: center;
           justify-content: center;
           position: relative;
         }
         .stops-section .stop-marker {
           display: inline-block;
           width: 12px;
           height: 12px;
           border-radius: 50%;
           background: #fff;
           border: 3px solid #267a3a;
           position: relative;
         }
         .stops-section .stop-marker:after {
           content: "";
           position: absolute;
           left: 50%;
           top: 14px;
           transform: translateX(-50%);
           width: 2px;
           height: 220%;
           background: #b9c27a;
         }
         .stops-section li {
           display: grid;
           grid-template-columns: 90px 24px 1fr 100px;
           gap: 8px;
           align-items: center;
           padding: 8px 0;
         }
         .stops-section li.last .stop-marker:after {
           display: none;
         }
         .station-badge {
           margin-left: 8px;
           padding: 2px 8px;
           border-radius: 12px;
           font-size: 0.75rem;
           color: #fff;
           display: inline-block;
           vertical-align: middle;
         }
         /* Ajout du style pour le bandeau de retard inline dans la colonne horaire */
         .delay-banner-inline {
           display: flex;
           align-items: center;
           gap: 6px;
           background: #ffe5b0;
           color: #a65c00;
           border-radius: 12px;
           padding: 2px 10px;
           font-weight: 600;
           font-size: 0.95rem;
           margin-top: 4px;
           margin-bottom: 2px;
         }
         .delay-banner-inline .info-icon {
           color: #e67e22;
           font-size: 18px;
           display: flex;
           align-items: center;
         }
         .delay-banner-inline .info-title {
           font-weight: 600;
           font-size: 0.95rem;
         }
         .delay-banner-below {
           display: flex;
           align-items: center;
           gap: 8px;
           background: #ffe5b0;
           color: #a65c00;
           border-radius: 12px;
           padding: 8px 16px;
           font-weight: 600;
           font-size: 1rem;
           margin: 8px 0 0 0;
           box-shadow: 0 1px 4px rgba(0,0,0,0.04);
         }
         .delay-banner-below .info-icon {
           color: #e67e22;
           font-size: 22px;
           display: flex;
           align-items: center;
         }
         .delay-banner-below .info-title {
           font-weight: 600;
           font-size: 1rem;
         }
       `}</style>
    </>
  );
}
