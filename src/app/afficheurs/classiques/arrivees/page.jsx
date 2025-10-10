"use client";
import React, { useEffect, useState, useMemo, useRef } from 'react';
import Image from 'next/image';
import Marquee from '../../../../components/Marquee';
import { platformForStation } from '@/app/utils/platform';

export default function AfficheurClassiqueArrivees(){
    const [data,setData]=useState(null);
    const [error,setError]=useState('');
    const [loading,setLoading]=useState(true);
    const [now,setNow]=useState(new Date());
    const [serverNow,setServerNow]=useState(null);
    const [logosMap,setLogosMap]=useState(null);
    const [showStatus,setShowStatus]=useState(true);

    const search = typeof window!=='undefined'? new URLSearchParams(window.location.search): null;
    const gare = search? (search.get('gare')||'').trim(): '';

    // horloge
    useEffect(()=>{ const id=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(id); },[]);
    const timeStr = useMemo(()=> now.toLocaleTimeString('fr-FR',{hour:'2-digit', minute:'2-digit'}),[now]);
    const secondsStr = useMemo(()=> String(now.getSeconds()).padStart(2,'0'),[now]);

    // toggle affichage statut <-> type (global) toutes les 2s
    useEffect(()=>{ const tid = setInterval(()=> setShowStatus(s=>!s), 2000); return ()=>clearInterval(tid); },[]);

    // charge mapping type->image depuis public
    useEffect(()=>{
        let abort=false;
        async function load(){
            try{
                const r = await fetch('/img/type/data.json',{cache:'no-store'});
                if(!r.ok) return;
                const j = await r.json();
                if(abort) return;
                const map = {};
                (j.logos||[]).forEach(l=>{
                    if(!l || !l.slug) return;
                    const key = String(l.slug).toLowerCase();
                    map[key] = {
                        path: l.path || l.file || null,
                        name: l.name || l.label || l.title || l.slug
                    };
                });
                setLogosMap(map);
            }catch(e){ /* ignore */ }
        }
        load();
        return ()=>{ abort=true; };
    },[]);

    // --- charger les perturbations quotidiennes depuis l'API /api/perturbationsdaily (polling) ---
    const [perturbations, setPerturbations] = useState([]);
    useEffect(()=>{
        let aborted = false;
        let timer = null;
        async function fetchPerturbations(){
            try{
                const url = '/api/perturbations/daily';
                const r = await fetch(url, { cache: 'no-store' });
                if(!r.ok){ setPerturbations([]); return; }
                const j = await r.json().catch(()=>null);
                if(aborted) return;
                if(!j){ setPerturbations([]); return; }
                // normaliser plusieurs formats possibles
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

    // charge des départs
    useEffect(()=>{
        if(!gare) return;
        let abort=false;
        setLoading(true); setError('');
        async function load(){
            try{
                const debugFlag = (typeof window !== 'undefined') && new URLSearchParams(window.location.search).get('debug') === '1';
                const apiUrl = `/api/afficheurs/classiques/arrivees?gare=${encodeURIComponent(gare)}` + (debugFlag? '&debug=1':'');
                const r = await fetch(apiUrl,{cache:'no-store'});
                let j;
                try{ j = await r.json(); }catch(_){ j = null; }
                if(!r.ok){ if(!abort) setError((j && j.error) ? j.error : 'Erreur'); return; }
                if(!abort){ setData(j); if(j && j.server_timestamp){ try{ setServerNow(new Date(j.server_timestamp)); }catch(_){ /* ignore */ } } }
            }catch(e){ if(!abort) setError(e.message||'Erreur'); }
            finally{ if(!abort) setLoading(false); }
        }
        load();
        const id = setInterval(load,30000);
        return ()=>{ abort=true; clearInterval(id); };
    },[gare]);

    // utilitaires (normalisation / extraction de label / extraction d'heure)
    const normalizeLabel = (s)=>{
        if(!s) return '';
        try{
            let t = String(s).normalize('NFD').replace(/\p{Diacritic}/gu,'');
            t = t.replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase();
            return t.replace(/\s+/g,' ');
        }catch(_){
            let t = String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
            t = t.replace(/[^A-Za-z0-9\u00C0-\u017F]+/g,' ').trim().toLowerCase();
            return t.replace(/\s+/g,' ');
        }
    };

    const getStopLabel = (s)=>{
        if(!s) return '';
        if(typeof s === 'string'){
            let label = s.trim();
            label = label.replace(/\s*\(.*?\)\s*/g, ' ').trim();
            const parts = label.split(/\s+/);
            if(parts.length >= 2){
                const secondPart = parts.slice(1).join(' ');
                if(/ville/i.test(secondPart)) return parts[0];
            }
            return label;
        }
        const candidates = [
            s.station_name, s.name, s.station, s.label, s.stop_point_name, s.display_name, s.libelle, s.nom,
            s.stop && (s.stop.name || s.stop.station_name), s.stop_point && (s.stop_point.name || s.stop_point.label),
            s.location && s.location.name, s.stop_name, s.stopPointName, s.stop_point_label, s.stationName, s.title, s.station_label
        ];
        for(const c of candidates){
            if(c && typeof c === 'string' && c.trim()){
                let label = c.trim();
                label = label.replace(/\s*\(.*?\)\s*/g,' ').trim();
                const parts = label.split(/\s+/);
                if(parts.length >= 2){
                    const secondPart = parts.slice(1).join(' ');
                    if(/ville/i.test(secondPart)) return parts[0];
                }
                return label;
            }
        }
        try{ return String(JSON.stringify(s)); }catch(_){ return ''; }
    };

    const getStopTime = (stop) => {
        if(!stop) return '';
        if(typeof stop === 'string'){
            const m = stop.match(/(\d{1,2}:\d{2})/);
            return m ? m[1] : '';
        }
        // Prioriser les heures d'arrivée pour l'afficheur des arrivées
        // inclure aussi les variantes 'scheduled_arrival' / 'scheduled_arrival_time'
        const keys = ['arrival_time','arrival','scheduled_arrival_time','scheduled_arrival','departure_time','departure','scheduled_departure_time','scheduled_departure','time','scheduled_time','real_time','passing_time','stop_time','heure','heure_depart','horaire','arrivalTime','scheduledArrival','scheduledArrivalTime','arrival_time_display'];
        for(const k of keys){
            const v = stop[k];
            if(v) return String(v);
        }
        if(stop.time && typeof stop.time === 'object'){
            const t = stop.time.display || stop.time.base || stop.time.scheduled || stop.time.value;
            if(t) return String(t);
        }
        // fallback: recherche récursive limitée dans l'objet pour trouver un champ ressemblant à une heure
        const findTimeInObject = (obj, depth = 0) => {
            if(!obj || depth > 3) return null;
            if(typeof obj === 'string'){
                const m = obj.match(/(\d{1,2}[:h]\d{2})/);
                if(m) return m[1];
                const m2 = obj.match(/^(\d{4}-\d{2}-\d{2}T.*)/);
                if(m2) return m2[1];
                return null;
            }
            if(typeof obj !== 'object') return null;
            for(const key of Object.keys(obj)){
                try{
                    const v = obj[key];
                    if(v == null) continue;
                    // clé plausible
                    if(/arrival|arrival_time|arrivalTime|scheduled_arrival|scheduledArrival|horaire|time|horaire_afficheur|horaireAfficheur/i.test(key) && (typeof v === 'string' || v instanceof String)){
                        return String(v);
                    }
                    if(typeof v === 'string'){
                        const m = v.match(/(\d{1,2}[:h]\d{2})/);
                        if(m) return m[1];
                    }
                    if(typeof v === 'object'){
                        const rec = findTimeInObject(v, depth+1);
                        if(rec) return rec;
                    }
                }catch(_){/* ignore */}
            }
            return null;
        };
        const found = findTimeInObject(stop, 0);
        if(found) return String(found);
         return '';
     };

     // Formatter proprement une chaîne d'heure (ISO, HH:MM, HHhMM, '0830') en 'HHhMM'
     const formatTimeFromString = (timeStr, baseDate = new Date()) => {
        if(!timeStr) return '';
        // si c'est déjà un objet Date
        if(timeStr instanceof Date){
            const hh = String(timeStr.getHours()).padStart(2,'0');
            const mm = String(timeStr.getMinutes()).padStart(2,'0');
            return `${hh}h${mm}`;
        }
        const parsed = parseDepartureDate(String(timeStr), baseDate);
        if(parsed && !Number.isNaN(parsed.getTime())){
            const hh = String(parsed.getHours()).padStart(2,'0');
            const mm = String(parsed.getMinutes()).padStart(2,'0');
            return `${hh}h${mm}`;
        }
        // fallback sur extraction simple HH:MM
        const m = String(timeStr).match(/(\d{1,2})[:h](\d{2})/);
        if(m){
            const hh = String(m[1]).padStart(2,'0');
            const mm = String(m[2]).padStart(2,'0');
            return `${hh}h${mm}`;
        }
        // fallback sur chaîne numérique '0830'
        const m2 = String(timeStr).match(/^(\d{2})(\d{2})$/);
        if(m2){
            return `${m2[1]}h${m2[2]}`;
        }
        return '';
    };

    const parseDepartureDate = (timeStr, baseDate) => {
        if(!timeStr) return null;
        const s = String(timeStr).trim();
        // ISO datetime (utiliser Date.parse pour valider proprement)
        if(/\d{4}-\d{2}-\d{2}T/.test(s)){
            const ts = Date.parse(s);
            if(Number.isNaN(ts)) return null;
            return new Date(ts);
        }
        // heure au format HH:MM ou H:MM ou HHhMM
        const m = s.match(/(\d{1,2})[:h](\d{2})/);
        if(m){
            const hh = parseInt(m[1],10); const mm = parseInt(m[2],10);
            return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hh, mm, 0, 0);
        }
        // si la chaîne contient uniquement des chiffres comme '0830'
        const m2 = s.match(/^(\d{2})(\d{2})$/);
        if(m2){
            const hh = parseInt(m2[1],10); const mm = parseInt(m2[2],10);
            return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hh, mm, 0, 0);
        }
        return null;
    };

    const runsOnDate = (item, date) => {
        if(!item) return false;
        // Si des substitutions sont définies pour ce sillon, on *n'affiche* ce sillon
        // que si au moins une des substitutions circule à la date demandée.
        // Ceci rend les substitutions prioritaires : elles remplacent le calendrier normal.
        if(item.substitutions && Array.isArray(item.substitutions) && item.substitutions.length){
            for(const s of item.substitutions){
                try{ if(runsOnDate(s, date)) return true; }catch(_){/* ignore */}
            }
            return false; // aucune substitution ne circule à cette date => ne pas afficher
        }
        const iso = date.toISOString().slice(0,10); // YYYY-MM-DD
        const jsDay = date.getDay(); // JS: 0=Sunday, 1=Monday, ..., 6=Saturday
        // convert to index where 0 = Monday, 6 = Sunday (mask index)
        const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
        const dayNamesFr = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
        let hasDaySpec = false;

        // 1) correspondance date exacte
        if(item.date && String(item.date).startsWith(iso)) return true;
        if(item.service_date && String(item.service_date).startsWith(iso)) return true;

        // 2) plages de validité
        const parseIso = s=>{ if(!s) return null; const m = String(s).match(/(\d{4}-\d{2}-\d{2})/); return m?m[1]:null };
        const start = parseIso(item.start_date||item.valid_from||item.calendar?.start_date||item.from);
        const end = parseIso(item.end_date||item.valid_to||item.calendar?.end_date||item.to);
        if(start && iso < start) return false;
        if(end && iso > end) return false;

        // hasDaySpec indique qu'on a au moins une information explicite sur les jours
        // 2.5) prise en charge de days_mask (entier, chaîne binaire ou liste '1;2;3') — 1=Lundi ... 7=Dimanche
        try{
            // inclure ici les variantes de nommage utilisées par la BDD / API :
            // days_mask_list (nouveau format '1;2;3'), days_mask, daysMask, daysmask, daysMaskInt
            const maskCandidates = item.days_mask_list ?? item.daysMaskList ?? item.days_mask ?? item.daysMask ?? item.daysmask ?? item.daysMaskInt ?? null;
            if(maskCandidates !== null && maskCandidates !== undefined){
                hasDaySpec = true;
                const numForApi = dayIndex + 1; // 1=Monday ... 7=Sunday

                // helper: normaliser un tableau/chaîne de parties en nombres 1..7
                const partsToNums = (parts) => {
                  const out = [];
                  (parts || []).forEach(p => {
                    if(p === null || p === undefined) return;
                    const s = String(p).trim();
                    if(s === '') return;
                    if(/^[0-9]+$/.test(s)){
                      let n = Number(s);
                      // gérer format 0..6 => convertir en 1..7
                      if(n >= 0 && n <= 6) n = n + 1;
                      if(n >= 1 && n <= 7) out.push(n);
                    }else{
                      const key = s.slice(0,3).toLowerCase();
                      const map = { lun:1, mar:2, mer:3, jeu:4, ven:5, sam:6, dim:7, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, sun:7 };
                      if(map[key]) out.push(map[key]);
                    }
                  });
                  return Array.from(new Set(out)).sort((a,b)=>a-b);
                };

                // array
                if(Array.isArray(maskCandidates)){
                  const nums = partsToNums(maskCandidates);
                  if(nums.includes(numForApi)) return true;
                }else if(typeof maskCandidates === 'string'){
                  const sMask = maskCandidates.trim();
                  // a) chaîne binaire explicite '1010101' (ordre : lundi..dimanche)
                  if(/^[01]{7}$/.test(sMask)){
                    if(sMask[dayIndex] === '1') return true;
                  }else if(/[;,\s]/.test(sMask)){
                    // b) split sur ; , ou espaces
                    const parts = sMask.split(/[;,\s]+/).map(p=>p.trim()).filter(Boolean);
                    const nums = partsToNums(parts);
                    if(nums.includes(numForApi)) return true;
                  }else if(/^[0-9]+$/.test(sMask)){
                    // chaîne numérique pure (peut être bitmask ou jour unique)
                    // 1) jour unique '1'..'7'
                    if(/^[1-7]$/.test(sMask)){
                      if(sMask === String(numForApi)) return true;
                    }else{
                      // tenter interpréter comme bitmask entier (LSB = lundi)
                      const asNum = Number(sMask);
                      if(!Number.isNaN(asNum)){
                        if(((asNum >> dayIndex) & 1) === 1) return true;
                      }
                    }
                  }else{
                    // texte libre (ex: 'lun, mer') -> tenter par clé
                    const parts = sMask.split(/[;,\s]+/).map(p=>p.trim()).filter(Boolean);
                    const nums = partsToNums(parts);
                    if(nums.includes(numForApi)) return true;
                  }
                }else if(typeof maskCandidates === 'number'){
                  // entier bitmask
                  if(((maskCandidates >> dayIndex) & 1) === 1) return true;
                }
            }
        }catch(_){/* ignore mask parsing errors */}

        // 3) jours explicités (array, string, bitmask)
        const daysCandidates = item.days || item.days_of_week || item.operating_days || item.weekdays || item.running_days || item.running_days_str || item.calendar?.days || item.service_days;
        if(daysCandidates){
            hasDaySpec = true;
            if(Array.isArray(daysCandidates)){
                const normalized = daysCandidates.map(s=>String(s).toLowerCase());
                const numForApi = dayIndex + 1; // 1=Monday ... 7=Sunday
                if(normalized.includes(String(numForApi))) return true;
                if(normalized.some(s=>s.includes(dayNamesFr[dayIndex]) || dayNamesFr[dayIndex].includes(s) || s.startsWith(dayNamesFr[dayIndex].slice(0,3)))) return true;
            }else if(typeof daysCandidates === 'string'){
                const s = daysCandidates.toLowerCase();
                const bit = s.replace(/[^01]/g,'');
                if(/^[01]{7}$/.test(bit)){
                    // si c'est un masque binaire au format '1111100' (lundi..dimanche)
                    if(bit[dayIndex] === '1') return true;
                    // fallback : certains APIs fournissent le bitmask inversé/indexé différemment — essayer la conversion alternative
                    if(bit[dayIndex] === '1') return true;
                }
                if(s.includes(dayNamesFr[dayIndex]) || s.includes(dayNamesFr[dayIndex].slice(0,3))) return true;
                const numForApi = dayIndex + 1;
                if(s.includes(String(numForApi))) return true;
            }
        }

        // 4) exceptions
        if(item.exceptions){
            try{
                const ex = item.exceptions;
                if(Array.isArray(ex)){
                    if(ex.includes(iso)) return false;
                }else if(typeof ex === 'string'){
                    if(ex.includes(iso)) return false;
                }else if(ex && ex.except && Array.isArray(ex.except) && ex.except.includes(iso)){
                    return false;
                }
            }catch(_){/* ignore */}
        }

        // 5) substitutions: si item indique des substitutions (ex: autocars), considérer si une substitution circule aujourd'hui
        // (déjà géré en prioritaire plus haut)

        // 6) si on avait des spécifications de jours et aucune n'a matché, on ne doit pas afficher
        if(hasDaySpec) return false;

        // 7) cas par défaut
        return true;
    };

    // filtrer les départs : logique à deux étapes
    // 1) essayer de récupérer les départs restant aujourd'hui (heure >= now)
    // 2) si aucun départ restant aujourd'hui, afficher les départs valides pour demain (J+1)
    const departuresForDate = (date, onlyAfterNow = false) => {
        return (listItems || []).filter(d => {
             if(!runsOnDate(d, date)) return false;
             const stops = d.stops || [];
             const normGare = normalizeLabel(gare);
             const currentIdx = stops.findIndex(s => {
                 const lbl = normalizeLabel(getStopLabel(s));
                 return lbl === normGare || lbl.startsWith(normGare) || normGare.startsWith(lbl);
             });
             // Heures : priorité à l'heure de passage *au niveau du stop correspondant à la gare demandée*
             // On recherche d'abord dans le stop courant (départ), en prenant departure_time puis arrival_time.
             let stationTime = '';
             if(currentIdx >= 0){
                 const currentStop = stops[currentIdx];
                 // Pour l'afficheur d'arrivées : privilégier arrival_time puis fallback sur departure_time
                 stationTime = currentStop.arrival_time || currentStop.arrival || currentStop.departure_time || currentStop.departure || '';
             }
             // fallback : utiliser l'horaire affiché calculé côté API, puis la departure_time globale, puis autres heuristiques
             // Pour l'afficheur d'arrivées : préférer d.arrival_time / d.arrival avant d.departure_time
             const timeRaw = stationTime || d.horaire_afficheur || d.pass_time || d.arrival_time || d.arrival || d.departure_time || getStopTime(d) || getStopTime(stops[0]) || getStopTime(stops[stops.length-1]) || '';
             // timeFmt supprimé volontairement — non utilisé dans ce filtre
             const depDate = parseDepartureDate(timeRaw, date);
             if(!depDate) return true; // si pas d'heure, on affiche (conservateur)
             if(onlyAfterNow){
                 return depDate >= now;
             }
             return true;
         });
     };

    // Filtrer automatiquement par jour de circulation selon la date du serveur (fallback client)
    const referenceNow = serverNow || now;
    const targetDate = new Date(referenceNow);
    targetDate.setHours(0,0,0,0);

    // Normaliser le tableau d'items renvoyé par l'API (certaines routes renvoient 'departures', d'autres 'arrivals' ou 'items')
    const listItems = (data && typeof data === 'object') ? (
        data.departures ?? data.arrivals ?? data.items ?? data.data ?? data.results ?? []
    ) : [];

    // Helper: calcule stationTime, timeRaw, timeFmt et la Date parsée pour un item
    const getTimeForItem = (d, baseDate = referenceNow) => {
        const stops = (d && d.stops) || [];
        const normGare = normalizeLabel(gare);
        const currentIdx = stops.findIndex(s => {
            const lbl = normalizeLabel(getStopLabel(s));
            return lbl === normGare || lbl.startsWith(normGare) || normGare.startsWith(lbl);
        });
        const currentStop = currentIdx>=0 ? stops[currentIdx] : (stops.length?stops[0]:null);
        let stationTime = '';
        if(currentStop){
            stationTime = currentStop.arrival_time || currentStop.arrival || currentStop.departure_time || currentStop.departure || '';
        }
        let timeRaw = stationTime || d.horaire_afficheur || d.pass_time || d.arrival_time || d.arrival || d.departure_time || getStopTime(d) || getStopTime(stops[0]) || getStopTime(stops[stops.length-1]) || '';
        let parsed = parseDepartureDate(timeRaw, baseDate);
        // si pas d'heure parsée mais timeRaw vide, tenter de fouiller l'objet globalement
        if(!timeRaw){
            const deep = (obj)=>{
                if(!obj || typeof obj !== 'object' ) return null;
                for(const k of Object.keys(obj)){
                    try{
                        const v = obj[k];
                        if(!v) continue;
                        if(typeof v === 'string'){
                            const m = v.match(/(\d{1,2}[:h]\d{2})/);
                            if(m) return m[1];
                            if(/\d{4}-\d{2}-\d{2}T/.test(v)) return v;
                        }
                        if(typeof v === 'object'){
                            const r = deep(v);
                            if(r) return r;
                        }
                    }catch(_){/* ignore */}
                }
                return null;
            };
            const extra = deep(d);
            if(extra) {
                parsed = parseDepartureDate(extra, baseDate);
                if(!timeRaw) timeRaw = extra;
            }
        }
         const timeFmt = formatTimeFromString(timeRaw, baseDate);
         return { timeRaw, timeFmt, parsed, currentStop };
    };

    // Nouvelle logique :
    // 1. On récupère les départs restants aujourd'hui (heure >= maintenant)
    let departures = departuresForDate(referenceNow, true);
    // 2. Si aucun départ restant aujourd'hui, on affiche ceux de demain
    if((departures || []).length === 0){
        const tomorrow = new Date(referenceNow);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0,0,0,0);
        departures = departuresForDate(tomorrow, false);
    }

    // debug flag
    const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

    // refs & auto-scroll state
    const containerRef = useRef(null); // .rows container (overflow hidden)
    const contentRef = useRef(null);   // inner content to translate
    const translateRef = useRef(0);    // current translateY in px
    const rafRef = useRef(null);
    const cycleTimerRef = useRef(null);
    const startDelay = 10000; // 10s initial wait

    // animate helper: animate translateRef.current toward target px
    const animateTo = (targetPx, speedPxPerSec = 40) => {
        return new Promise(resolve => {
            if(!contentRef.current || !containerRef.current){ resolve(); return; }
            cancelAnimationFrame(rafRef.current);
            const start = performance.now();
            const from = translateRef.current;
            const distance = targetPx - from;
            if(distance === 0){ resolve(); return; }
            const direction = distance > 0 ? 1 : -1;
            const tick = (now) => {
                const elapsed = Math.max(0, now - start);
                const moved = (elapsed / 1000) * speedPxPerSec;
                let next = from + direction * moved;
                if((direction === 1 && next >= targetPx) || (direction === -1 && next <= targetPx)){
                    next = targetPx;
                }
                translateRef.current = next;
                contentRef.current.style.transform = `translateY(-${next}px)`;
                if(next === targetPx){
                    rafRef.current = null;
                    resolve();
                    return;
                }
                rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
        });
    };

    // start one full cycle: wait startDelay, scroll down until last item is hidden, jump to bottom, scroll up to top
    const startCycle = async () => {
        try{
            if(!containerRef.current || !contentRef.current) return;
            const containerH = containerRef.current.clientHeight;
            const contentH = contentRef.current.scrollHeight;
            if(contentH <= containerH) return; // nothing to scroll

            // compute last row bottom relative to content
            const lastRow = contentRef.current.querySelector('.row:last-child');
            if(!lastRow) return;
            const lastBottom = lastRow.offsetTop + lastRow.offsetHeight;

            // target to hide last row (translate >= lastBottom)
            const maxTranslate = Math.max(contentH - containerH, 0);
            const targetDown = Math.min(lastBottom, maxTranslate);

            // animate down from current (likely 0) to targetDown
            await animateTo(targetDown, 40);

            // once last row hidden, jump to extreme bottom (so bottom-most rows visible) then animate back to top
            // snap to bottom
            translateRef.current = maxTranslate;
            contentRef.current.style.transform = `translateY(-${maxTranslate}px)`;

            // animate back to top (0)
            await animateTo(0, 60);
        }catch(_){/* ignore */}
    };

    // manage lifecycle: reset and schedule cycles when departures change
    useEffect(()=>{
        // reset transform
        if(contentRef.current){ translateRef.current = 0; contentRef.current.style.transform = `translateY(0px)`; }
        // clear any timers/raf
        if(rafRef.current) cancelAnimationFrame(rafRef.current);
        if(cycleTimerRef.current) clearTimeout(cycleTimerRef.current);

        // schedule initial start
        cycleTimerRef.current = setTimeout(async function runCycle(){
            await startCycle();
            // after finishing a cycle, schedule next run after startDelay
            cycleTimerRef.current = setTimeout(runCycle, startDelay);
        }, startDelay);

        return ()=>{
            if(rafRef.current) cancelAnimationFrame(rafRef.current);
            if(cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
        };
    }, [departures]);

    // utilitaires de logo (fallback local si non fournis globalement)
    const getLogoFor = (type)=>{
        if(!type) return '/img/brand/sncf-logo.png';
        if(logosMap && logosMap[type] && logosMap[type].path) return logosMap[type].path;
        return `/img/type/logo-${type}.svg`;
    };
    const getTypeName = (type)=>{
        if(!type) return 'SNCF';
        if(logosMap && logosMap[type] && logosMap[type].name) return String(logosMap[type].name).toUpperCase();
        return String(type).toUpperCase();
    };

    if(!gare) return <div style={{fontFamily:'Achemine', padding:40}}><h1>Paramètre "gare" manquant</h1><p>Ajouter ?gare=NomDeLaGare dans l'URL.</p></div>;

    return (
        <div className="board-root">
            <div className="board-wrapper">
                <div className="watermark">arrivées</div>
                {debug && (
                    <div className="debug-metrics">
                        <div>API arrivées: {(listItems||[]).length}</div>
                        <div style={{marginTop:8, marginBottom:8, fontSize:14}}>
                            Aperçu des horaires calculés (premiers 8 items) :
                            <ul style={{maxHeight:220, overflow:'auto', paddingLeft:18}}>
                                {(listItems||[]).slice(0,8).map((it,idx)=>{
                                    const t = getTimeForItem(it, referenceNow);
                                    return (
                                        <li key={idx} style={{marginBottom:6,fontSize:13}}>
                                            <strong>#{idx}</strong>
                                            &nbsp; timeRaw: <code>{String(t.timeRaw)}</code>
                                            &nbsp; timeFmt: <code>{String(t.timeFmt)}</code>
                                            &nbsp; parsed: <code>{t.parsed ? t.parsed.toISOString() : 'null'}</code>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                        <pre style={{maxHeight:200, overflow:'auto'}}>{JSON.stringify(data, null, 2)}</pre>
                    </div>
                )}
                <div className="rows" ref={containerRef}>
                    <div className="rows-inner" ref={contentRef} style={{transform:'translateY(0px)'}}>
                        {loading && <div className="row loading">Chargement…</div>}
                        {error && !loading && <div className="row error">{error}</div>}
                        {!loading && !error && !departures.length && <div className="row empty">Aucune arrivée prévue</div>}

                        {departures.map((d,i)=>{
                            const tinfo = getTimeForItem(d, referenceNow);
                            const timeRaw = tinfo.timeRaw;
                            const stops = d.stops || [];
                             const lastStop = (stops && stops.length) ? stops[stops.length-1] : null;
                            // Calculer la gare d'origine : plusieurs champs API possibles
                            let originName = '';
                            if(d){
                                // variantes connues pour l'origine
                                originName = getStopLabel(d.origin_station) || getStopLabel(d.departure_station) || getStopLabel(d.start_station) || getStopLabel(d.from) || getStopLabel(d.origin) || '';
                                // fallback : chercher dans le premier stop de la liste
                                if(!originName && stops && stops.length){
                                    originName = getStopLabel(stops[0]);
                                }
                            } else if(stops && stops.length){
                                originName = getStopLabel(stops[0]);
                            }
                            originName = String(originName||'').trim();

                            const trainNumber = d.number || d.train_number || d.code || d.name || d.id || '';
                            // calculer aussi destinationName en fallback (utile pour le matching avec perturbations)
                            let destinationName = '';
                            if(d){
                                if(d.arrival_station) destinationName = getStopLabel(d.arrival_station) || String(d.arrival_station||'').trim();
                                else if(d.destination_station) destinationName = getStopLabel(d.destination_station) || String(d.destination_station||'').trim();
                                else if(d.destination) destinationName = (typeof d.destination === 'string') ? String(d.destination).trim() : getStopLabel(d.destination);
                            } else if(lastStop){
                                destinationName = getStopLabel(lastStop);
                            }
                            destinationName = String(destinationName||'').trim();
                            const served = (stops || []).map(s => getStopLabel(s)).filter(Boolean);
                            // valeurs initiales issues de l'API de départ
                            let cancelled = !!d.cancelled;
                            let delay = (typeof d.delay_min === 'number' && d.delay_min>0) ? d.delay_min : (d.delay || 0);

                            // fusionner avec les perturbations chargées depuis /api/perturbations/daily
                            if(Array.isArray(perturbations) && perturbations.length){
                                const match = perturbations.find(p=>{
                                    if(!p) return false;
                                    // id exact
                                    if(p.id && d.id && String(p.id) === String(d.id)) return true;
                                    // numéro ou code de train
                                    const pnum = p.train_number || p.number || p.code || p.train || p.id;
                                    if(pnum){
                                        if(String(pnum) === String(d.number) || String(pnum) === String(d.train_number) || String(pnum) === String(d.code)) return true;
                                        if(String(pnum) === String(d.number) || String(pnum) === String(d.train_number) || String(pnum) === String(d.code)) return true;
                                        // heure + destination approximative
                                        const ptime = p.time || p.departure_time || p.scheduled_departure_time || p.horaire_afficheur;
                                        if(ptime && timeRaw){
                                            const normTime = s=>String(s||'').replace(/[^0-9]/g,'');
                                            if(normTime(ptime) === normTime(timeRaw)){
                                                const pdest = p.destination || p.destination_name || p.arrival_station || p.stop || p.dest || p.to;
                                                if(!pdest) return true; // heure suffit
                                                const n = s=>String(s||'').toLowerCase().replace(/\s*\(.*?\)\s*/g,'').trim();
                                                if(n(pdest) && n(destinationName) && (n(pdest).includes(n(destinationName)) || n(destinationName).includes(n(pdest)))) return true;
                                            }
                                        }
                                    }
                                    return false;
                                });
                                if(match){
                                    const m = match;
                                    const mStatus = String(m.status || m.type || '').toLowerCase();
                                    if(m.cancelled === true || mStatus.includes('supprim') || mStatus.includes('cancel')){ cancelled = true; delay = 0; }
                                    else {
                                        const pd = m.delay_min ?? m.delay ?? m.delay_minutes ?? m.delayMin ?? null;
                                        const pdNum = pd != null ? Number(pd) : NaN;
                                        if(!Number.isNaN(pdNum) && pdNum > 0) delay = pdNum;
                                    }
                                }
                            }
                            const typeSlug = (d.type||'').toString().toLowerCase();
                            const bigLogo = getLogoFor(typeSlug);
                            const typeName = getTypeName(typeSlug);

                            // Modification de la logique d'affichage des quais pour les arrivées
                            // Prefer platform provided directly by the API (server attaches admin assignment as `platform` when present).
                            const apiAssigned = Object.prototype.hasOwnProperty.call(d, 'platform') ? d.platform : undefined;
                            let platformToShow = null;
                            if (apiAssigned !== undefined) {
                              if (String(apiAssigned).trim() !== '') platformToShow = apiAssigned;
                              else platformToShow = '—'; // Afficher "—" au lieu de masquer la box
                            } else {
                              const adminPlatform = platformForStation(d, gare);
                              if (adminPlatform !== null && adminPlatform !== undefined) {
                                if (String(adminPlatform).trim() !== '') platformToShow = adminPlatform;
                                else platformToShow = '—';
                              } else {
                                const fallbackPlatform = d.voie || d.platform || d.platform_code || d.track;
                                platformToShow = fallbackPlatform || '—'; // Toujours afficher une box, même vide avec "—"
                              }
                            }

                                    // status text inline rendering used in JSX; no separate variable to avoid unused warning
                                    return (
                                      <div className={`row ${i%2?'alt':''}`} key={d.id||i}>
                                        <div className="cell logo"><Image src={getLogoFor((d.type||'').toString().toLowerCase())} alt={d.type||'type'} width={135} height={54} /></div>
                                        <div className="cell status">
                                            <div className="meta-top">
                                                {showStatus ? (
                                                    cancelled ? (
                                                        // supprimé : ligne unique "supprimé"
                                                        <div className="status-stack cancelled">
                                                            <span className="status-primary">supprimé</span>
                                                        </div>
                                                    ) : (delay ? (
                                                        // retardé : deux lignes "retardé" + "+XX min"
                                                        <div className="status-stack delayed">
                                                            <span className="status-primary">retardé</span>
                                                            <span className="status-secondary">+{delay} min</span>
                                                        </div>
                                                    ) : (
                                                        // à l'heure
                                                        <span className={`status-text ontime`}>à l'heure</span>
                                                    ))
                                                ) : (
                                                    <div className="type-block"><div className="type-name">{typeName}</div><div className="train-number">{trainNumber}</div></div>
                                                )}
                                            </div>
                                        </div>
                                        {/* masquer l'heure uniquement lorsque le statut 'supprimé' est affiché (showStatus && cancelled) */}
                                        <div className="cell time"><span>{(!showStatus || !cancelled) ? timeRaw : ''}</span></div>
                                        <div className="cell destination">
                                            <div className="dest-main">{originName || '—'}</div>
                                            {served.length > 0 && i < 2 && (
                                              <div className="served-list" title={served.join(' • ')}>
                                                <span className="served-title">Via :</span>
                                                <div className="served-mask">
                                                  <Marquee className="served-inline">{served.join(' • ')}</Marquee>
                                                </div>
                                              </div>
                                            )}
                                        </div>
                                        {/* Modifier le rendu pour toujours afficher la box de quai */}
                                        <div className="cell voie"><div className="voie-box">{platformToShow}</div></div>
                                    </div>
                            );
                        })}

                    </div>
                </div>

                <div className="footer-bar">
                    <div className="footer-msg">Afficheur des arrivées – {gare}</div>
                    <div className="clock"><span className="hms">{timeStr}</span><span className="sec">{secondsStr}</span></div>
                </div>

            </div>

            <style jsx>{`
        /* Reset / layout */
        /* Cacher toutes les scrollbars globalement (WebKit, Firefox, IE/Edge) */
        :global(*::-webkit-scrollbar){ display: none; }
        :global(*){ -ms-overflow-style: none; /* IE and Edge */ scrollbar-width: none; /* Firefox */ }

        html,body,.board-root{height:100%;}
        /* hauteur du footer par défaut (modifiable) — utilisée pour réserver l'espace en bas */
        /* Valeurs explicites (96px) pour éviter les problèmes d'analyse statique avec les custom properties */
        html,body{overflow:hidden;}
        /* Fond principal: passer du bleu à un vert principal (comme sur l'image) */
        .board-root{background:#116938;min-height:100vh;margin:0;padding:0;color:#fff;display:flex;overflow:hidden;}
        .board-wrapper{position:relative;flex:1;display:flex;flex-direction:column;min-height:100vh;}
        .watermark{position:absolute;top:0;right:-10px;font-size:220px;line-height:.8;font-weight:700;color:rgba(255,255,255,.18);writing-mode:vertical-rl;text-orientation:mixed;pointer-events:none;user-select:none;z-index:5;letter-spacing:-0.05em;}

        /* Rows / grid : la dernière colonne correspond à la largeur de la boîte quai */
        .rows{padding-top:0;flex:1;position:relative;overflow:hidden;padding-bottom:calc(96px + 12px);} 
        .rows-inner{position:relative;will-change:transform;}
        /* Ajustement : colonne quai élargie à 120px pour correspondre à .voie-box */
        /* Hauteur pour les lignes à partir de la 3ème : plus compactes que les deux premières */
        /* Utiliser une alternance de verts (clair / foncé) au lieu du bleu */
        .row{display:grid;grid-template-columns:200px 200px 180px 1fr 200px;align-items:center;min-height:100px;background:#197a42;position:relative;border-bottom:2.5px solid rgba(0,0,0,0.12);}
        .rows .row:nth-child(-n+2){ min-height:198px; }
        /* alternate (darker) row */
        .row.alt{background:#0f5b33;}
        .row:nth-child(2){background:#156337;}
        .row.loading,.row.error,.row.empty{font-size:48px;font-weight:600;justify-content:center;grid-template-columns:1fr}

        /* Cells */
        .cell.logo{display:flex;align-items:center;justify-content:center;padding-left:10px}
        .cell.status{display:flex;flex-direction:column;align-items:center;justify-content:center;padding-left:0;padding-right:6px;text-align:center}
        .meta-top{height:48px;display:flex;align-items:center;gap:10px}

        .status-text{font-size:26px;font-weight:700;color:#fff;text-align:center}
        .status-text.ontime{color:#fff}
        .status-text.delayed{color:#ffe300}
        .status-text.cancelled{color:#ff6b6b}

        /* Nouvelle présentation du statut : pile pour Retardé (+XX min) ou ligne unique Supprimé */
        .status-stack{display:flex;flex-direction:column;align-items:center;gap:2px}
        .status-stack .status-primary{font-size:26px;font-weight:800;color:#ffe300}
        .status-stack.delayed .status-primary{color:#ffe300}
        .status-stack.delayed .status-secondary{font-size:20px;font-weight:700;color:#ffe300}
        .status-stack.cancelled .status-primary{font-size:28px;font-weight:900;color:#ff6b6b}
        /* Garantir que l'heure est masquée quand un sillon est supprimé et que le statut est affiché */
        .cell.time span{display:inline-block}

        .type-name{font-size:22px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;text-align:center}
        .type-block{display:flex;flex-direction:column;align-items:center;gap:6px}
        /* Le numéro de train doit être aligné à gauche (horizontalement) mais rester centré verticalement
           dans la colonne ; on force la largeur à 100% et on aligne le texte à gauche. */
        .train-number{font-size:22px;font-weight:700;color:#fff;align-self:flex-start;width:100%;text-align:left;padding-left:8px}

        .cell.time span{font-size:54px;font-weight:900;color:#ffe300;letter-spacing:0.01em;font-variant-numeric:tabular-nums;}
        .cell.destination{padding-left:18px;padding-right:110px;display:flex;flex-direction:column;justify-content:center;min-width:0}
        .dest-main{font-size:54px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;line-height:1.08;}

        /* Served list: compact chips, responsive, +N expansion */
        .served-list{font-size:20px;color:#c8d6e6;margin-top:6px;display:flex;align-items:center;gap:12px}
        .served-title{font-weight:700;color:#ffffff;flex:0 0 auto;margin-right:12px;font-size:22px}
        .served-mask{flex:1 1 auto;overflow:hidden;max-width:100%;display:block}
        /* Afficher toutes les gares sur UNE SEULE LIGNE sans changer la taille de la police */
        /* mêmes dimensions de police que la destination principale */
        .served-inline{display:inline-block;white-space:nowrap;color:#cfe7ff;font-weight:600;font-size:54px;padding-right:24px}

        /* Quai : boîte carrée bordée blanche */
        .cell.voie{display:flex;justify-content:flex-end;align-items:center;padding-right:18px}
        .voie-box{
          border:4px solid #fff;
          border-radius:12px;
          font-size:60px;
          font-weight:800;
          width:120px;
          height:120px;
          display:flex;
          align-items:center;
          justify-content:center;
          background: transparent; /* fond transparent demandé */
          color:#fff;
          box-sizing:border-box;
          text-align:center;
          line-height:1;
          box-shadow: inset 0 -6px 0 rgba(0,0,0,0.04);
        }
        /* Adapter la taille de la boîte quai pour les lignes à partir de la 3ème (min-height:100px) */
        .rows .row:nth-child(n+3) .voie-box{ width:80px; height:80px; font-size:40px; border-width:3px }

        /* Footer */
        /* Footer fixe en bas de la fenêtre */
        .footer-bar{background:#f4b85a;color:#073247;display:flex;align-items:center;font-weight:600;font-size:36px;padding:8px 24px;gap:24px;margin-top:0;position:fixed;left:0;right:0;bottom:0;height:96px;box-sizing:border-box;z-index:9999}
        .footer-msg{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .clock{background:#083b6b;color:#fff;padding:6px 22px;border-radius:8px;display:flex;align-items:center;gap:10px;font-size:38px;font-weight:700}
        .clock .sec{font-size:28px;color:#ffe300;font-weight:700;margin-left:6px}

        /* Responsive adjustments */
        @media (max-width:1600px){
          /* réduire la hauteur du footer sur écrans plus petits */
          /* Small footer height = 72px */
          .rows{padding-bottom:calc(72px + 12px);} 
          /* responsive : conserver 100px pour les lignes 3+ sur petits écrans */
          .row{grid-template-columns:105px 100px 120px 1fr 176px;min-height:100px}
           .rows .row:nth-child(-n+2){ min-height:260px; }
          .cell.time span{font-size:32px}
          /* Ajustements responsive pour les lignes 3+ */
          .rows .row:nth-child(n+3) .cell.time span{ font-size:28px }
          .rows .row:nth-child(n+3) .dest-main{ font-size:28px }
          .rows .row:nth-child(n+3) .served-inline{ font-size:28px }
          .rows .row:nth-child(n+3) .meta-top{ height:34px }
          .rows .row:nth-child(n+3) .status-text{ font-size:18px }
          .rows .row:nth-child(n+3) .train-number{ font-size:14px }
          /* forcer taille de la voie sur lignes 3+ en responsive (également 40px de moins) */
          .rows .row:nth-child(n+3) .voie-box{ width:80px; height:80px; font-size:32px; border-width:3px }
        }
      `}</style>
        </div>
    );
}
