"use client";
import React, { useEffect, useState, useMemo } from 'react';
import './page.css';
import { FaTrain } from "react-icons/fa";
import { FaCircleInfo } from "react-icons/fa6";
import { FaClock } from "react-icons/fa";
import { MdCancel } from "react-icons/md";
import Marquee from '../../../../components/Marquee';
import { platformForStation } from '@/app/utils/platform';

export default function AfficheurEVAArrivees(){
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [now,setNow]=useState(new Date());
  const [showDelayAlt, setShowDelayAlt] = useState(true); // toggler pour alternance "retardé" / "+XX min"
  const [perturbations, setPerturbations] = useState([]);
  // Map des attributions admin (schedule_id -> platform)
  const [adminPlatformsMap, setAdminPlatformsMap] = useState({});
  const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const gare = search ? (search.get('gare') || '').trim() : '';
  const dateParam = search ? (search.get('date') || search.get('jour') || null) : null;
  const fallbackParam = search ? (search.get('fallback') || null) : null;
  const shouldFallback = fallbackParam === null ? true : (['1','true','yes'].includes(String(fallbackParam).toLowerCase()));

  // Normalisation simple des noms (supprime accents, met en minuscule, espaces normalisés)
  function normStr(s){ if(!s) return ''; try{ return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim(); }catch(e){ return String(s||'').toLowerCase().replace(/\s+/g,' ').trim(); } }
  const gareNormalized = normStr(gare);

  // Vérifie si un train circule sur la date refDate en regardant un éventuel champ days/service_days
  function maskToServiceDays(mask, listStr){
    // helper: convertir parts (strings) en jours JS (0..6)
    const partsToJs = (parts) => {
      const out = [];
      const map = { lun:1, mar:2, mer:3, jeu:4, ven:5, sam:6, dim:7, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, sun:7 };
      (parts || []).forEach(p => {
        if(p === null || p === undefined) return;
        const s = String(p).trim(); if(!s) return;
        if(/^[0-9]+$/.test(s)){
          let n = Number(s);
          if(n >= 0 && n <= 6) n = n + 1; // accepter 0..6 -> 1..7
          if(n >= 1 && n <= 7){ const js = (n === 7) ? 0 : n; out.push(js); }
        } else {
          const key = s.slice(0,3).toLowerCase(); if(map[key]){ const n = map[key]; const js = (n === 7) ? 0 : n; out.push(js); }
        }
      });
      return Array.from(new Set(out)).sort((a,b)=>a-b);
    };

    // 1) si listStr fourni (privilégier)
    if(listStr){
      try{
        const s = String(listStr||'').trim();
        if(/^[01]{7}$/.test(s)){
          const out = [];
          for(let i=0;i<7;i++){ if(s[i] === '1') out.push((i+1)%7); }
          return Array.from(new Set(out)).sort((a,b)=>a-b);
        }
        const parts = s.split(/[;,\s]+/).map(p=>p.trim()).filter(Boolean);
        const nums = partsToJs(parts);
        if(nums && nums.length) return nums;
      }catch(e){/* fallback */}
    }

    // 2) mask absent
    if(mask === null || mask === undefined) return null;

    // 3) interpréter mask comme entier bitmask
    const m = Number(mask);
    if(Number.isNaN(m)) return null;
    const days = [];
    for(let bit=0; bit<7; bit++){
      if((m >> bit) & 1){ const jsDay = (bit + 1) % 7; days.push(jsDay); }
    }
    return Array.from(new Set(days)).sort((a,b)=>a-b);
  }

  // Vérifie si un train circule sur la date refDate en regardant un éventuel champ days/service_days
  function matchesServiceDays(item, refDate){
    // candidates : privilégier les champs explicitement listés
    const ds = item.service_days ?? item.days ?? item.operating_days ?? item.days_mask_list ?? item.days_mask ?? item.daysMask ?? item.running_days ?? null;
    if(ds === null || ds === undefined) return true; // pas d'info -> on assume circulation

    const wd = refDate.getDay(); // 0=dimanche

    // helper pour parser des valeurs variées en tableau JS-days
    const parseCandidateToJs = (value) => {
      if(value === null || value === undefined) return null;
      // tableau
      if(Array.isArray(value)){
        const parts = value.map(v => String(v).trim());
        // si tableau de nombres -> convertir
        return partsToJsLocal(parts);
      }
      if(typeof value === 'number'){
        return maskToServiceDays(value, null);
      }
      if(typeof value === 'string'){
        const s = value.trim();
        if(s === '') return null;
        if(/^[01]{7}$/.test(s)){
          const out = []; for(let i=0;i<7;i++){ if(s[i] === '1') out.push((i+1)%7); } return out;
        }
        if(/[;,\s]/.test(s)){
          const parts = s.split(/[;,\s]+/).map(p=>p.trim()).filter(Boolean); return partsToJsLocal(parts);
        }
        if(/^[0-9]+$/.test(s)){
          // soit jour unique '1'..'7' soit bitmask entier
          if(/^[1-7]$/.test(s)){
            const n = Number(s); const js = (n===7)?0:n; return [js];
          }
          const asNum = Number(s); if(!Number.isNaN(asNum)) return maskToServiceDays(asNum, null);
        }
        // texte libre (noms de jours)
        const parts = s.split(/[;,\s]+/).map(p=>p.trim()).filter(Boolean); return partsToJsLocal(parts);
      }
      return null;
    };

    // local partsToJs (copie légère)
    const partsToJsLocal = (parts) => {
      const out = [];
      const map = { lun:1, mar:2, mer:3, jeu:4, ven:5, sam:6, dim:7, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, sun:7 };
      (parts || []).forEach(p => {
        if(p === null || p === undefined) return;
        const s = String(p).trim(); if(!s) return;
        if(/^[0-9]+$/.test(s)){
          let n = Number(s); if(n >= 0 && n <= 6) n = n + 1; if(n >=1 && n <=7){ const js = (n===7)?0:n; out.push(js); }
        } else {
          const key = s.slice(0,3).toLowerCase(); if(map[key]){ const n = map[key]; const js = (n===7)?0:n; out.push(js); }
        }
      });
      return Array.from(new Set(out)).sort((a,b)=>a-b);
    };

    // essayer de parser
    try{
      const parsed = parseCandidateToJs(ds);
      if(parsed === null) return true; // permissif
      if(parsed.length === 0) return true;
      return parsed.includes(wd);
    }catch(_){ return true; }
  }

  // Retourne le stop et l'index correspondant à la gare recherchée (comparison normalisée)
  function getStopForGare(d){
    const stops = d.stops || [];
    for(let i=0;i<stops.length;i++){
      const s = stops[i];
      const name = normStr(s && (s.station_name || s.station || ''));
      if(name && gareNormalized && name === gareNormalized) return {stop:s, index:i};
    }
    return {stop:null, index:-1};
  }

  // Obtenir une Date complète pour un time-like raw (sur refDate)
  function effectiveDateOn(raw, refDate){
    if(!raw) return null;
    const p = parseTimeValue(raw);
    if(!p) return null;
    // extraire hh:mm:ss
    const hh = p.getHours(); const mm = p.getMinutes(); const ss = p.getSeconds();
    const out = new Date(refDate);
    out.setHours(hh, mm, ss || 0, 0);
    return out;
  }

  useEffect(()=>{ const id=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(id); },[]);
  // alternance globale toutes les 2s pour les pastilles retardées
  useEffect(()=>{
    const id = setInterval(()=> setShowDelayAlt(s => !s), 2000);
    return ()=> clearInterval(id);
  },[]);
  const timeStr = useMemo(()=> now.toLocaleTimeString('fr-FR',{hour:'2-digit', minute:'2-digit'}),[now]);
  const secondsStr = useMemo(()=> String(now.getSeconds()).padStart(2,'0'),[now]);

  function parseTimeValue(t){
    if(!t) return null;
    if(t instanceof Date) return t;
    if(typeof t === 'number') return new Date(t);
    if(typeof t === 'string'){
      let s = t.trim();
      if(s === '') return null;
      if(/\d{4}-\d{2}-\d{2}/.test(s) || /T\d{2}:\d{2}/.test(s)){
        const d = new Date(s); return isNaN(d.getTime()) ? null : d;
      }
      s = s.replace(/\s+/g,'').replace(/h/i,':');
      if(/^\d{3,4}$/.test(s)){
        const mins = s.slice(-2); const hours = s.slice(0, s.length-2);
        const d = new Date(); d.setHours(parseInt(hours,10), parseInt(mins,10), 0, 0); return d;
      }
      const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if(m){ const hh = parseInt(m[1],10); const mm = parseInt(m[2],10); const ss = m[3]?parseInt(m[3],10):0; const d = new Date(); d.setHours(hh,mm,ss,0); return d; }
      const d2 = new Date(s); return isNaN(d2.getTime()) ? null : d2;
    }
    return null;
  }
  function fmtTime(t){ const d = parseTimeValue(t); return d ? d.toLocaleTimeString('fr-FR',{hour:'2-digit', minute:'2-digit'}) : ''; }

  useEffect(()=>{
    if(!gare) return;
    let abort=false; setLoading(true); setError('');
    async function load(){
      try{
        const r = await fetch(`/api/afficheurs/eva/arrivees?gare=${encodeURIComponent(gare)}`,{cache:'no-store'});
        const j = await r.json().catch(()=>null);
        if(!r.ok){ if(!abort) setError(j?.error||'Erreur'); return; }
        if(!abort) setData(j);
      }catch(e){ if(!abort) setError(e.message||'Erreur'); }
      finally{ if(!abort) setLoading(false); }
    }
    load();
    const id = setInterval(load,30000);
    return ()=>{ abort=true; clearInterval(id); };
  },[gare]);

  // --- charger les perturbations quotidiennes depuis l'API /api/perturbations/daily (polling) ---
  useEffect(()=>{
    let aborted = false;
    let timer = null;
    async function fetchPerturbations(){
      try{
        const url = '/api/perturbations/daily';
        const r = await fetch(url, { cache: 'no-store' });
        if(!r.ok){ if(!aborted) setPerturbations([]); return; }
        const j = await r.json().catch(()=>null);
        if(aborted) return;
        if(!j){ setPerturbations([]); return; }
        let list;
        if(Array.isArray(j)) list = j;
        else if(Array.isArray(j.items)) list = j.items;
        else if(Array.isArray(j.perturbations)) list = j.perturbations;
        else if(Array.isArray(j.data)) list = j.data;
        else if(Array.isArray(j.results)) list = j.results;
        else list = Array.isArray(j) ? j : [];
        setPerturbations(list || []);
      }catch(_){ if(!aborted) setPerturbations([]); }
    }
    fetchPerturbations();
    timer = setInterval(fetchPerturbations, 30000);
    return ()=>{ aborted = true; if(timer) clearInterval(timer); };
  },[]);

  // --- Synchronisation des attributions centralisées (API /api/quais) ---
  useEffect(()=>{
    if(!gare) return;
    let abort = false;
    async function loadAdminPlatforms(){
      try{
        const url = `/api/quais?stationName=${encodeURIComponent(gare)}&limit=2000`;
        const r = await fetch(url, { cache: 'no-store' });
        if(!r.ok){ if(!abort) setAdminPlatformsMap({}); return; }
        const j = await r.json().catch(()=>null);
        if(abort) return;
        const map = {};
        if(j && Array.isArray(j.items)){
          j.items.forEach(it => {
            if(!it) return;
            const sid = it.schedule_id !== undefined && it.schedule_id !== null ? String(it.schedule_id) : null;
            if(sid) map[sid] = (it.platform !== undefined && it.platform !== null) ? it.platform : '';
          });
        }
        setAdminPlatformsMap(map);
      }catch(_){ if(!abort) setAdminPlatformsMap({}); }
    }
    loadAdminPlatforms();
    const tid = setInterval(loadAdminPlatforms, 30000);
    return ()=>{ abort = true; clearInterval(tid); };
  },[gare]);

  // Utilitaires et mapping (repris de l'afficheur classique pour cohérence)
  function safeToStr(v){ if(v === undefined || v === null) return ''; try{ return String(v).trim(); }catch(e){ return ''; } }
  function normalizeIdNum(v){ if(v === undefined || v === null) return null; const n = Number(v); return Number.isNaN(n) ? null : n; }

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

  // Enrichir les arrivals avec les perturbations quotidiennes (si présentes)
  useEffect(()=>{
    if(!data || !Array.isArray(data.arrivals) || !data.arrivals.length) return;
    if(!Array.isArray(perturbations) || !perturbations.length) return;

    // visibleRefDate n'est pas toujours initialisé au moment du rendu :
    // on calcule donc la date visible à partir du paramètre `dateParam` s'il est fourni,
    // sinon on utilise la date courante locale (format ISO YYYY-MM-DD).
    const visibleDateStr = (dateParam ? String(dateParam).slice(0,10) : (new Date()).toISOString().slice(0,10));

    const enriched = data.arrivals.map((d)=>{
      try{
        // trouver le stop correspondant à la gare
        const { stop } = getStopForGare(d);
        // possible ids à comparer
        const candidates = [d.id, d.schedule_id, d.sillon_id, d.sillonId, (stop && (stop.id || stop.sillon_id || stop.schedule_id))];
        const sId = candidates.map(normalizeIdNum).find(x => x !== null);

        const perturbation = perturbations.find((p)=>{
          const pSid = normalizeIdNum(p.schedule_id ?? p.sillon_id ?? p.sillonId ?? p.sillonId);
          if(!pSid || !sId) return false;
          if(pSid !== sId) return false;
          if(p.date && String(p.date).slice(0,10) !== visibleDateStr) return false;
          return true;
        });

        if(perturbation){
          const mapped = mapPerturbToStatusLocal(perturbation);
          const isSupp = mapped.status_key === 'cancelled';
          const delayVal = mapped.delay != null ? Number(mapped.delay) : (perturbation.delay_minutes != null ? Number(perturbation.delay_minutes) : (d.delay_minutes != null ? Number(d.delay_minutes) : (d.delay_min != null ? Number(d.delay_min) : null)));

          return {
            ...d,
            cancelled: isSupp || !!d.cancelled,
            delay: delayVal != null ? delayVal : (d.delay != null ? d.delay : null),
            delay_minutes: delayVal != null ? delayVal : (d.delay_minutes != null ? Number(d.delay_minutes) : d.delay_min != null ? Number(d.delay_min) : 0),
            delay_min: delayVal != null ? delayVal : (d.delay_min != null ? Number(d.delay_min) : 0),
            delay_cause: perturbation.cause || perturbation.message || d.delay_cause || d.incident || null,
            cancel_message: perturbation.message || perturbation.cause || d.cancel_message || null,
            status_key: mapped.status_key,
            status: mapped.status,
          };
        }
      }catch(e){ /* ignore per item errors */ }
      return d;
    });

    try{
      if(JSON.stringify(enriched) !== JSON.stringify(data.arrivals)){
        setData(prev => ({ ...prev, arrivals: enriched }));
      }
    }catch(e){ /* ignore stringify errors */ }
  }, [perturbations, data?.arrivals, dateParam]);

  if(!gare) return (
    <div className="eva-root afficheur-root">
      <div className="eva-empty">
        <h1>Paramètre "gare" manquant</h1>
        <p>Ajouter ?gare=NomDeLaGare dans l'URL.</p>
      </div>
    </div>
  );

  const arrivals = data?.arrivals || [];
  const pageSize = 4;

  // Dates de référence pour le filtrage
  const baseRefDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const nextDate = new Date(baseRefDate.getTime() + 24*60*60*1000);

  // Fonction de filtrage par date
  function filterForDate(refDate){
    const startOfDay = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 0,0,0,0);
    const endOfDay = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 23,59,59,999);
    return arrivals.filter(d=>{
      // ne considérer que les trains qui ont un stop correspondant
      const {stop} = getStopForGare(d);
  // Filtrer les arrivées à venir uniquement (on utilise `visibleArrivals` basées sur today/tomorrow)
      // vérifier jours de service
      if(!matchesServiceDays(d, refDate)) return false;
      // heure effective: expected or planned
  // Dates de référence pour le filtrage (basées sur `now`)
      const plannedRaw = (stop && (stop.arrival_time_planned || stop.planned_time)) || d.planned_time || d.scheduled_time || null;
      const expectedRaw = (stop && (stop.arrival_time || stop.arrival_time_real)) || d.expected_time || d.arrival_time || null;
      const effective = effectiveDateOn(expectedRaw || plannedRaw, refDate);
      if(!effective) return false;
      // garder si dans la journée (entre 00:00 et 23:59:59)
      return effective.getTime() >= startOfDay.getTime() && effective.getTime() <= endOfDay.getTime();
    }).sort((a,b)=>{
      // trier par heure effective asc
      const sa = getStopForGare(a).stop; const sb = getStopForGare(b).stop;
      const ea = effectiveDateOn((sa && (sa.arrival_time || sa.planned_time)) || a.arrival_time || a.planned_time, refDate);
      const eb = effectiveDateOn((sb && (sb.arrival_time || sb.planned_time)) || b.arrival_time || b.planned_time, refDate);
      return (ea?ea.getTime():0) - (eb?eb.getTime():0);
    });
  }

  // Apply filter for base date, fallback to next day if empty
  let filteredToday = filterForDate(baseRefDate);
  // ne garder que ceux qui n'ont pas encore passé l'heure maintenant
  const nowTime = new Date(now);
  let filtered = filteredToday.filter(d=>{
    const {stop} = getStopForGare(d);
    const plannedRaw = stop.arrival_time_planned || stop.planned_time || d.planned_time || d.scheduled_time || null;
    const expectedRaw = stop.arrival_time || d.expected_time || d.arrival_time || null;
    const eff = effectiveDateOn(expectedRaw || plannedRaw, baseRefDate);
    return eff && eff.getTime() >= nowTime.getTime();
  });

  if ((filtered.length === 0) && shouldFallback) {
    // essayer de garder les trains restants aujourd'hui (heure >= now), sinon basculer sur demain
    const todayDate = baseRefDate;
    const tomorrowDate = nextDate;
    const nowTimeObj = new Date(now);
    const remainingToday = filterForDate(todayDate).filter(d => {
      const { stop } = getStopForGare(d);
      const plannedRaw = stop?.arrival_time_planned || stop?.planned_time || d.planned_time || d.scheduled_time || d.scheduled_arrival_time || null;
      const expectedRaw = stop?.arrival_time || d.expected_time || d.arrival_time || null;
      const eff = effectiveDateOn(expectedRaw || plannedRaw, todayDate);
      return eff && eff.getTime() >= nowTimeObj.getTime();
    });

    if (remainingToday.length > 0) {
      filtered = remainingToday;
    } else {
      filtered = filterForDate(tomorrowDate);
    }
  }

  const visibleArrivals = (filtered || []).slice(0, pageSize);

  // Affichage des horaires filtrés après tous les filtres
  // (heure, origine, numéro, voie, type, statut)
  return (
    <div className="eva-root afficheur-root">
      <header className="eva-topbar">
        <div className="eva-left">
          <div className="eva-icon"><FaTrain /></div>
          <div className="eva-title">
            <div className="main">ARRIVÉES</div>
            <div className="sub">/ ARRIVALS FROM / LLEGADAS DE</div>
          </div>
        </div>
        <div className="eva-clock" aria-hidden={false}>
          <div className="clock-box" aria-hidden>
            <div className="clock-hm">{timeStr}</div>
            <div className="clock-sec">{secondsStr}</div>
          </div>
        </div>
      </header>

      <main className="eva-board">
        {loading && <div className="eva-row message">Chargement…</div>}
        {error && !loading && <div className="eva-row message error">{error}</div>}
        {!loading && !error && arrivals.length===0 && <div className="eva-row message">Aucune arrivée prochaine</div>}

        {visibleArrivals.map((d,i)=>{
          const stops = d.stops || [];

          const currentStopIdx = d.stops ? d.stops.findIndex(s=> s.station_name === gare) : -1;

          const currentStop = currentStopIdx >= 0 ? stops[currentStopIdx] : null;
          const plannedRaw = currentStop?.arrival_time_planned || currentStop?.planned_time || d.planned_time || d.scheduled_time || d.scheduled_arrival_time || null;
          const expectedRaw = currentStop?.arrival_time || d.expected_time || d.arrival_time || d.departure_time || null;
          const plannedDate = parseTimeValue(plannedRaw);
          const expectedDate = parseTimeValue(expectedRaw);
          const timeDisplay = fmtTime(expectedRaw || plannedRaw || '');

          let origin;
          if (stops.length && stops[0].station_name) origin = stops[0].station_name;
          else if (d.origin_station) origin = d.origin_station;
          if (!origin) origin = 'Origine inconnue';

          // Déterminer la plateforme à afficher en priorisant les attributions admin/API
          const resolvedAdminPlatform = platformForStation(d, gare);
          let voieToShow = null;
           // Déterminer un possible schedule id pour chercher dans adminPlatformsMap
           const { stop } = getStopForGare(d);
           const candidatesForId = [d.id, d.schedule_id, d.sillon_id, d.sillonId, (stop && (stop.id || stop.sillon_id || stop.schedule_id))];
           const sId = candidatesForId.map(normalizeIdNum).find(x => x !== null);
           const adminAssignedRaw = (sId !== undefined && sId !== null && adminPlatformsMap && adminPlatformsMap[String(sId)] !== undefined) ? adminPlatformsMap[String(sId)] : undefined;

          if (adminAssignedRaw !== undefined) {
            // admin a explicitement défini un quai (même vide) -> si vide => pas d'affichage
            voieToShow = (adminAssignedRaw !== null && String(adminAssignedRaw).trim() !== '') ? String(adminAssignedRaw) : null;
          } else if (resolvedAdminPlatform !== null && resolvedAdminPlatform !== undefined && String(resolvedAdminPlatform).trim() !== '') {
            voieToShow = String(resolvedAdminPlatform);
          } else {
            const apiAssigned = (d.platform !== undefined && d.platform !== null) ? d.platform : (d.voie !== undefined && d.voie !== null ? d.voie : undefined);
            if (apiAssigned !== undefined && apiAssigned !== null && String(apiAssigned).trim() !== '') {
              voieToShow = String(apiAssigned);
            } else {
              // Aucun quai disponible -> ne pas afficher la colonne
              voieToShow = null;
            }
          }
          const typeLabel = d.type || 'TER';
          const number = d.number || d.train_number || '';

          // cause / message d'incident / retard
          const incident = d.delay_cause || d.incident || d.note || d.message || d.incident_message || '';

          let computedDelay = null;
          if(plannedDate && expectedDate){ const diff = Math.round((expectedDate.getTime() - plannedDate.getTime())/60000); if(!isNaN(diff)) computedDelay = diff; }

          // calculer le nombre de minutes de retard priorisant d.delay si présent
          const delayMinutes = (d.delay && !isNaN(Number(d.delay))) ? Number(d.delay) : (computedDelay && !isNaN(computedDelay) ? computedDelay : null);

          // statut affiché: supporte alternance pour les trains retardés
          let status = "à l'heure";
          if(d.cancelled) status = 'supprimé';
          else if(d.status && !/delay|retard/i.test(String(d.status))) status = d.status.toLowerCase();
          else if(delayMinutes && delayMinutes > 0) {
            // on mettra la valeur finale dans le rendu pour alterner
            status = 'retardé';
          }

          // Pastille orange si d.delay (from API) ou computedDelay > 0
          const isDelayed = (delayMinutes && delayMinutes > 0);
          const pillClass = d.cancelled ? 'red' : (isDelayed ? 'orange' : 'blue');
           const incidentClass = incident.toLowerCase().includes('panne') ? 'red' : 'orange';

          // Normaliser les noms de station pour l'affichage dans le Marquee
          const names = (stops||[]).map(s => (typeof s === 'string') ? s : (s && (s.station_name || s.station)) || '');

          const rowStateClass = d.cancelled ? 'cancelled' : (isDelayed ? 'delayed' : '');

           const noVoieClass = voieToShow ? '' : 'no-voie';
           return (
            <article className={`eva-row ${rowStateClass} ${noVoieClass}`} key={d.id || i}>
              <div className="timecol">
                <div className="time-inner">
                  <div className={`time-h ${d.cancelled ? 'cancelled':''}`}>{timeDisplay}</div>
                  <div className={`time-pill ${pillClass}`} role="status" aria-live="polite">
                    <span className="time-pill-icon">
                        {d.cancelled ? <MdCancel/> : <FaClock/>}
                    </span>
                    <span className="time-pill-text">{isDelayed ? (showDelayAlt ? 'retardé' : (delayMinutes ? `+ ${delayMinutes} min` : 'retardé')) : status}</span>
                  </div>
                </div>
              </div>

              <div className="destcol">
                <div className="dest-top">
                  <div className="dest-origin">{origin}</div>
                  {/* Box indiquant la cause du retard, positionnée à droite du nom d'origine */}
                  {isDelayed && incident && <div className="delay-cause">{incident}</div>}
                </div>
                <div className="dest-main">
                   {/* Autres infos si nécessaire */}
                </div>
                <div className="via-line">
                  <span className="via-prefix">via</span>
                  <Marquee className="via-marquee" speed={40}>
                    <>
                      {names.map((n, idx) => (
                        <span key={`via-${i}-${idx}`} className="via-item" style={{display:'inline-block', paddingRight:12}}>{n}</span>
                      ))}
                    </>
                  </Marquee>
                </div>
              </div>

              {/* Afficher la colonne voie uniquement si un quai est défini */}
              {voieToShow ? (
                <div className="voiecol">
                  <div className="voie-box-outer">
                      <>
                          <div className="voie-label">Voie</div>
                          <div className="voie-letter">{voieToShow}</div>
                      </>
                  </div>
                </div>
              ) : null}

              <div className="greencol">
                <div className="train-green">
                  <div className="train-type">{typeLabel}</div>
                  <div className="train-number">{number}</div>
                </div>
              </div>
            </article>
          );
        })}
      </main>

      <footer className="eva-footer">
        <div className="warning">
          <div className="wi"><FaCircleInfo /></div>
          <div className="wt">Le réseau TCL est perturbé en raison d'un mouvement social, merci d'anticiper votre venu en gare.</div>
        </div>
      </footer>
    </div>
  );
}
