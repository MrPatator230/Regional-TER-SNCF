"use client";
import { useEffect, useState, useMemo, useRef, useLayoutEffect } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';

function useTrainTypeNames(){ const [map,setMap]=useState({}); useEffect(()=>{ let abort=false; (async()=>{ try{ const r=await fetch('/img/type/data.json'); if(!r.ok) return; const j=await r.json(); const m={}; (j.logos||[]).forEach(l=>{ if(l.slug&&l.name) m[l.slug.toLowerCase()]=l.name; }); if(!abort) setMap(m);} catch{} })(); return ()=>{ abort=true; }; },[]); return map; }

function validDate(d){ return /^\d{4}-\d{2}-\d{2}$/.test(d); }
function parseHM(str){ if(!/^\d{2}:\d{2}$/.test(str||'')) return null; const [h,m]=str.split(':').map(Number); return h*60+m; }
function toHM(min){ if(min==null) return ''; const h=Math.floor(min/60)%24; const m=min%60; return String(h).padStart(2,'0')+":"+String(m).padStart(2,'0'); }
function formatDateFR(d){ if(!d) return ''; const [Y,M,D]=d.split('-'); return `${D}/${M}/${Y}`; }
// Remplacement: date/heure Paris indépendantes du fuseau local machine
function parisTodayStr(){
  const dtf = new Intl.DateTimeFormat('en-CA',{ timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'});
  return dtf.format(new Date()); // YYYY-MM-DD
}
function nowParisMinutes(){
  const dtf = new Intl.DateTimeFormat('fr-FR',{ timeZone:'Europe/Paris', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
  const parts = dtf.formatToParts(new Date());
  const h = +parts.find(p=>p.type==='hour').value;
  const m = +parts.find(p=>p.type==='minute').value;
  const s = +parts.find(p=>p.type==='second').value;
  return h*60 + m + s/60;
}

export default function TrainPage() {
  // Références timeline
  const timelineRef = useRef(null);
  const nodeRefs = useRef([]);
  function setNodeRef(idx){ return el=>{ if(el) nodeRefs.current[idx]=el; }; }
  // Etats (réintégration du marqueur animé)
  const [stopStatuses,setStopStatuses] = useState([]); // past | current | future
  const [timePoints,setTimePoints] = useState([]); // {minute, stationIndex}
  const [barTop,setBarTop] = useState(0);
  const [barHeight,setBarHeight] = useState(0);
  const [markerTop,setMarkerTop] = useState(null); // position verticale du marqueur
  const [progressHeight,setProgressHeight] = useState(0); // hauteur remplissage barre progression
  // const autoScrollMetaRef = useRef({ last:0, lastTop:null }); // supprimé: plus d'auto-centrage
  const [isDwelling,setIsDwelling] = useState(false);
  const params = useParams();
  const numberRaw = params?.number;
  // Parsing avancé: "891811 du Jeudi 28 Aout (2025)"
  function parseTrainAndDate(raw){
    if(!raw || typeof raw !== 'string') return { train: raw, date: '' };
    const txt = decodeURIComponent(raw).replace(/\+/g,' ').trim();
    // regex: numero du Jour JJ Mois (AAAA) parenthèses optionnelles
    const re = /^(\d{3,6})\s+du\s+([A-Za-zéèêùûôàîïçÉÈÊÙÛÔÀÎÏÇ]+)\s+(\d{1,2})\s+([A-Za-zéèêùûôàîïçÉÈÊÙÛÔÀÎÏÇ]+)\s*\(?\s*(\d{4})\s*\)?$/i;
    // tolérer format avec nom du jour complet
    // Exemple: 891811 du Jeudi 28 Aout (2025)
    let m = re.exec(txt);
    if(!m){
      // Variante avec jour de semaine explicite: numero du JourDeSemaine JJ Mois (AAAA)
      const re2 = /^(\d{3,6})\s+du\s+(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\s+(\d{1,2})\s+([A-Za-zéèêùûôàîïçÉÈÊÙÛÔÀÎÏÇ]+)\s*\(?\s*(\d{4})\s*\)?$/i;
      const m2 = re2.exec(txt);
      if(m2){
        // réagencer indices pour ressembler à m: numero, jourSemaine, JJ, Mois, AAAA
        m = [m2[0], m2[1], m2[2], m2[3], m2[4], m2[5]];
      }
    }
    if(m){
      const train = m[1];
      // indices selon la version capturée
      let dayIdx, monthIdx, yearIdx;
      if(m.length === 6){ // version avec jour semaine
        dayIdx = 3; monthIdx = 4; yearIdx = 5;
      } else { // version simple
        dayIdx = 3; monthIdx = 4; yearIdx = 5;
      }
      const day = String(parseInt(m[dayIdx],10)).padStart(2,'0');
      const moisTxt = (m[monthIdx]||'').toLowerCase();
      const mapMois = {
        'janvier':'01','fevrier':'02','février':'02','mars':'03','avril':'04','mai':'05','juin':'06','juillet':'07','aout':'08','août':'08','septembre':'09','octobre':'10','novembre':'11','decembre':'12','décembre':'12'
      };
      const month = mapMois[moisTxt];
      const year = m[yearIdx];
      if(month){
        return { train, date: `${year}-${month}-${day}` };
      }
      return { train, date: '' };
    }
    return { train: txt, date: '' };
  }
  const parsed = useMemo(()=> parseTrainAndDate(numberRaw), [numberRaw]);
  const trainNumber = parsed.train;
  const search = useSearchParams();
  const queryDateParam = useMemo(()=>{ const d = search?.get('date'); return d && validDate(d)? d : ''; }, [search]);
  // date effective = paramètre de requête prioritaire sinon date extraite du segment
  const dateParam = queryDateParam || parsed.date;
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const typeNames = useTrainTypeNames();
  const router = useRouter();

  // Données API

  // (ligne absTimes alias supprimée)


  useEffect(()=>{
    let abort=false; setLoading(true); setError(''); setData(null);
    (async()=>{
      try {
        const url = `/api/public/train?number=${encodeURIComponent(trainNumber)}${dateParam?`&date=${dateParam}`:''}`;
        const r = await fetch(url, { cache:'no-store' });
        if(r.status===410){ if(!abort){ setError('Sillons en refonte — horaires indisponibles'); setData(null); } return; }
        if(!r.ok){ const j = await r.json().catch(()=>null); throw new Error(j?.error||'Introuvable'); }
        const j = await r.json(); if(!abort) setData(j);
      } catch(e){ if(!abort) setError(e.message||'Erreur chargement'); }
      finally { if(!abort) setLoading(false); }
    })();
    return ()=>{ abort=true; };
  }, [trainNumber, dateParam]);

  const firstSchedule = useMemo(()=> data?.schedules?.[0] || null, [data]);

  const effective = useMemo(()=>{
    if(!firstSchedule) return null;
    // Déterminer original vs effectif
    const originalAll = firstSchedule.original_allStops || [];
    const originalInternal = originalAll.slice(1, originalAll.length-1);
    const effectiveInternal = firstSchedule.stops || [];
    function originalTimesFor(index, stop){
      if(originalInternal.length === effectiveInternal.length){
        const o=originalInternal[index];
        return { original_arrival_time: o?.arrival||null, original_departure_time: o?.departure||null };
      }
      const byName = originalInternal.find(os=> os.station===stop.station_name || os.station===stop.station);
      return { original_arrival_time: byName?.arrival||null, original_departure_time: byName?.departure||null };
    }
    const mappedStops = effectiveInternal.map((s,i)=>{
      const arr = s.arrival || s.arrival_time || '';
      const dep = s.departure || s.departure_time || '';
      const base = { station_name: s.station_name || s.station, arrival_time: arr, departure_time: dep, display_time: arr||dep };
      return { ...base, ...originalTimesFor(i, base) };
    });
    const departureEffective = firstSchedule.departure_time;
    const arrivalEffective = firstSchedule.arrival_time;
    return {
      departure_station: firstSchedule.departure_station,
      arrival_station: firstSchedule.arrival_station,
      departure_time: departureEffective,
      arrival_time: arrivalEffective,
      original_departure_time: firstSchedule.original_departure_time || departureEffective,
      original_arrival_time: firstSchedule.original_arrival_time || arrivalEffective,
      stops: mappedStops,
      delayed: !!firstSchedule.delay_min,
      delay_minutes: firstSchedule.delay_min || 0,
      cancelled: !!firstSchedule.cancelled,
      rerouted: !!firstSchedule.rerouted
    };
  }, [firstSchedule]);

  // Déplacement de displayStops avant son utilisation
  const displayStops = useMemo(()=>{
    if(!effective || !firstSchedule) return [];
    // Utiliser allStops annotés pour badges (removed, new_departure, new_arrival)
    const all = firstSchedule.allStops || [];
    if(!all.length) return [];
    return all.map((s,idx)=>{
      const isOrigin = idx===0;
      const isDest = idx===all.length-1;
      const stName = s.station || s.station_name || s.name || '';
      const arr = s.arrival || s.arrival_time || null;
      const dep = s.departure || s.departure_time || null;
      return {
        origin: isOrigin,
        dest: isDest,
        station_name: stName,
        arrival_time: arr,
        departure_time: dep,
        display_time: arr || dep,
        platform: s.platform || null,
        removed: !!s.removed,
        new_departure: !!s.new_departure,
        new_arrival: !!s.new_arrival,
        original_arrival_time: effective.original_departure_time && isOrigin ? effective.original_departure_time : (effective.original_arrival_time && isDest ? effective.original_arrival_time : null),
        original_departure_time: effective.original_departure_time && isOrigin ? effective.original_departure_time : (effective.original_arrival_time && isDest ? effective.original_arrival_time : null)
      };
    });
  }, [effective, firstSchedule]);

  // Durée d'arrêt dynamique (gère passage de minuit)
  function dwellMinutes(arr, dep){
    const a=parseHM(arr); const d=parseHM(dep);
    if(a==null||d==null) return null;
    let diff = d - a;
    if(diff < 0) diff += 1440; // passage minuit
    return diff; // peut être 0
  }

  const displayDate = dateParam? formatDateFR(dateParam): '';

  const rolling = firstSchedule?.rolling_stock || '';
  // Image unique attribuée au sillon (fallback générique si absente)
  const primaryRollingSrc = firstSchedule?.rolling_stock_image || null;
  const [rollingSrc,setRollingSrc] = useState(null);
  // Réfs et état pour défilement horizontal de l'image
  const rollingContainerRef = useRef(null);
  const rollingImgRef = useRef(null);
  const [offset,setOffset] = useState(0);
  const [canScrollLeft,setCanScrollLeft] = useState(false);
  const [canScrollRight,setCanScrollRight] = useState(false);

  useEffect(()=>{
    // Réinitialiser la source (attribuée au sillon si dispo) et l'offset à chaque changement de train/date
    setRollingSrc(primaryRollingSrc || '/img/m-r/45097.png');
    setOffset(0);
  }, [primaryRollingSrc, trainNumber, dateParam]);

  function clampOffset(off, contW, imgW){
    const min = Math.min(0, contW - imgW); // négatif ou 0
    return Math.max(min, Math.min(0, off));
  }
  function updateArrows(off, contW, imgW){
    const min = Math.min(0, contW - imgW);
    setCanScrollLeft(off < 0);
    setCanScrollRight(imgW > contW && off > min);
  }
  const measureScroll = ()=>{
    const cont = rollingContainerRef.current;
    const img = rollingImgRef.current;
    if(!cont || !img) return;
    const contW = cont.clientWidth || 0;
    const imgW = img.getBoundingClientRect().width || 0;
    const newOff = clampOffset(offset, contW, imgW);
    if(newOff !== offset) setOffset(newOff);
    updateArrows(newOff, contW, imgW);
  };
  useLayoutEffect(()=>{
    measureScroll();
    if(typeof ResizeObserver !== 'undefined'){
      const ro = new ResizeObserver(()=>measureScroll());
      if(rollingContainerRef.current) ro.observe(rollingContainerRef.current);
      if(rollingImgRef.current) ro.observe(rollingImgRef.current);
      window.addEventListener('resize', measureScroll);
      return ()=>{ ro.disconnect(); window.removeEventListener('resize', measureScroll); };
    } else {
      window.addEventListener('resize', measureScroll);
      return ()=> window.removeEventListener('resize', measureScroll);
    }
  }, [rollingSrc]);
  function onRollingLoad(){ measureScroll(); }
  function onRollingError(){
    // Fallback unique si l'image attribuée au sillon est indisponible
    if(rollingSrc !== '/img/m-r/45097.png'){
      setRollingSrc('/img/m-r/45097.png');
      setOffset(0);
      // la mesure sera recalculée au onLoad
    }
  }
  function scrollStep(){
    const contW = rollingContainerRef.current?.clientWidth || 0;
    return Math.max(60, Math.round(contW * 0.8));
  }
  function prevRolling(){
    const contW = rollingContainerRef.current?.clientWidth || 0;
    const imgW = rollingImgRef.current?.getBoundingClientRect().width || 0;
    setOffset(o=>{
      const step = scrollStep();
      const off = clampOffset(o + step, contW, imgW);
      updateArrows(off, contW, imgW);
      return off;
    });
  }
  function nextRolling(){
    const contW = rollingContainerRef.current?.clientWidth || 0;
    const imgW = rollingImgRef.current?.getBoundingClientRect().width || 0;
    setOffset(o=>{
      const step = scrollStep();
      const off = clampOffset(o - step, contW, imgW);
      updateArrows(off, contW, imgW);
      return off;
    });
  }

  // Construction dynamique des points temporels (minutes absolues)
  useEffect(()=>{
    if(!effective || effective.cancelled){ setTimePoints([]); return; }
    function toMin(hm){ return parseHM(hm); }
    const timelineStops = [
      { origin:true, station_name:effective.departure_station, arrival_time:effective.departure_time, departure_time:effective.departure_time },
      ...(effective.stops||[]).map(s=> ({ station_name:s.station_name, arrival_time:s.arrival_time, departure_time:s.departure_time })),
      { dest:true, station_name:effective.arrival_station, arrival_time:effective.arrival_time, departure_time:effective.arrival_time }
    ];
    const tp=[]; let last=null;
    timelineStops.forEach((st,idx)=>{
      const arrM = toMin(st.arrival_time||st.departure_time);
      const depM = toMin(st.departure_time||st.arrival_time);
      if(arrM!=null){ let m=arrM; if(last!=null && m<last) m+=1440; tp.push({ minute:m, stationIndex:idx }); last=m; }
      if(depM!=null && arrM!=null){ let dwell = depM - arrM; if(dwell<0) dwell+=1440; if(dwell>0){ let m=depM; if(m<last) m+=1440; tp.push({ minute:m, stationIndex:idx }); last=m; } }
      else if(depM!=null && arrM==null){ let m=depM; if(last!=null && m<last) m+=1440; tp.push({ minute:m, stationIndex:idx }); last=m; }
    });
    setTimePoints(tp);
  }, [effective, dateParam]);

  // Mesure barre verticale (position + hauteur + centres) => useLayoutEffect + ResizeObserver
  useLayoutEffect(()=>{
    function measure(){
      if(!timelineRef.current) return;
      const rows = nodeRefs.current.filter(Boolean);
      if(rows.length<2){
        if(rows.length===1){
          const rect = rows[0].querySelector('.stop-node')?.getBoundingClientRect() || rows[0].getBoundingClientRect();
          const containerRect = timelineRef.current.getBoundingClientRect();
            const center = (rect.top - containerRect.top) + rect.height/2;
          setBarTop(center);
          setBarHeight(0);
        }
        return;
      }
      const containerRect = timelineRef.current.getBoundingClientRect();
      const firstRect = (rows[0].querySelector('.stop-node')||rows[0]).getBoundingClientRect();
      const lastRect = (rows[rows.length-1].querySelector('.stop-node')||rows[rows.length-1]).getBoundingClientRect();
      const firstCenter = (firstRect.top - containerRect.top) + firstRect.height/2;
      const lastCenter = (lastRect.top - containerRect.top) + lastRect.height/2;
      setBarTop(firstCenter);
      setBarHeight(lastCenter - firstCenter);
    }
    measure();
    if(typeof ResizeObserver!=='undefined'){
      const ro=new ResizeObserver(()=>measure());
      if(timelineRef.current) ro.observe(timelineRef.current);
      nodeRefs.current.forEach(n=> n && ro.observe(n));
      window.addEventListener('resize', measure);
      return ()=>{ ro.disconnect(); window.removeEventListener('resize', measure); };
    } else {
      window.addEventListener('resize', measure);
      return ()=> window.removeEventListener('resize', measure);
    }
  }, [displayStops.length]);

  // absTimes (modèle absolu) pour progression
  const absTimes = useMemo(()=>{
    if(!displayStops.length) return [];
    let prev=null; const model=[];
    displayStops.forEach(st=>{
      let a=parseHM(st.arrival_time||st.departure_time||'');
      let d=parseHM(st.departure_time||st.arrival_time||'');
      if(a==null && d!=null) a=d; if(d==null && a!=null) d=a; if(a==null && d==null){ a=prev==null?0:prev; d=a; }
      if(prev!=null && a<prev) a+=1440; if(d<a) d=a; if(prev!=null && d<prev) d=prev; prev=d;
      model.push({ arrAbs:a, depAbs:d });
    });
    return model;
  }, [displayStops]);

  const isTodaySchedule = useMemo(()=>{
    const today = parisTodayStr();
    return !dateParam || dateParam === today;
  }, [dateParam]);

  // Statuts past/future: si pas aujourd'hui => tous future
  useEffect(()=>{
    if(!isTodaySchedule){
      if(displayStops.length) setStopStatuses(displayStops.map(()=> 'future'));
      return;
    }
    if(!timePoints.length){ setStopStatuses([]); return; }
    function update(){
      let nowAbs = nowParisMinutes();
      const first = timePoints[0].minute; const last = timePoints[timePoints.length-1].minute;
      if(nowAbs < first && (nowAbs+1440)<=last) nowAbs+=1440;
      const reach={}; const leave={};
      timePoints.forEach(tp=>{ if(reach[tp.stationIndex]==null) reach[tp.stationIndex]=tp.minute; leave[tp.stationIndex]=tp.minute; });
      const statuses = Object.keys(reach).map(k=>{ const i=+k; if(nowAbs < reach[i]) return 'future'; if(nowAbs >= leave[i]) return 'past'; return 'current'; });
      setStopStatuses(statuses);
    }
    update();
    const id=setInterval(update,15000); // rafraîchit plus souvent pour statut courant
    return ()=> clearInterval(id);
  }, [timePoints, isTodaySchedule, displayStops]);

  // Rafraîchissement périodique des données pour suivi temps réel (retards, suppressions, etc.)
  useEffect(()=>{
    if(!isTodaySchedule) return; // inutile hors jour courant
    let abort=false;
    const interval = setInterval(async()=>{
      try {
        const url = `/api/public/train?number=${encodeURIComponent(trainNumber)}${dateParam?`&date=${dateParam}`:''}`;
        const r = await fetch(url, { cache:'no-store' });
        if(r.status===410){ // en refonte: arrêter le polling
          clearInterval(interval);
          return;
        }
        if(!r.ok) return; // ignore erreurs transitoires
        const j = await r.json();
        if(!abort) setData(j);
      } catch(e){ /* ignore silent */ }
    }, 60000); // toutes les 60s
    return ()=>{ abort=true; clearInterval(interval); };
  }, [trainNumber, dateParam, isTodaySchedule]);

  // Animation précise avec synchronisation exacte sur les horaires de sillon (avec pauses dwell)
  useEffect(()=>{
    if(!isTodaySchedule) return; // pas d'animation hors jour courant
    if(!absTimes.length || !barHeight) return;

    let rafId; let lastDwelling = null;
    const scheduleDate = dateParam || parisTodayStr();
    const today = parisTodayStr();
    const simulate = scheduleDate !== today; // conserve la simulation si autre jour

    const first = absTimes[0];
    const last = absTimes[absTimes.length-1];
    const tripStart = first.depAbs ?? first.arrAbs;
    const tripEnd = last.arrAbs ?? last.depAbs;

    // Préparation des segments voyage (hors dwells)
    // stopsCount = displayStops length => positions uniformes (0..N-1)
    const N = absTimes.length; // correspond à displayStops length

    function adjustedNow(){
      let now = nowParisMinutes();
      if(now < tripStart && (now+1440) <= tripEnd) now += 1440; // gestion passage minuit
      return now;
    }

    function computeProgress(now){
      // Retourne progress [0,1] et bool dwell
      if(now <= tripStart) return { p:0, dwell:false };
      if(now >= tripEnd) return { p:1, dwell:false };
      for(let i=0;i<N;i++){
        const a = absTimes[i].arrAbs;
        const d = absTimes[i].depAbs;
        const hasDwell = d!=null && a!=null && d>a;
        if(hasDwell && now>=a && now<d){
          // En gare
          return { p: (N===1?0: i/(N-1)), dwell:true };
        }
        // Segment vers arrêt suivant
        if(i < N-1){
          const depRef = (hasDwell? d : a); // instant réel de départ
          const nextArr = absTimes[i+1].arrAbs;
          if(depRef!=null && nextArr!=null && now>=depRef && now<nextArr){
            const segDur = nextArr - depRef;
            const segProg = segDur>0? (now-depRef)/segDur : 0;
            const base = i/(N-1);
            const p = base + segProg/(N-1);
            return { p, dwell:false };
          }
        }
      }
      // fallback
      return { p:0, dwell:false };
    }

    function frame(){
      let now;
      if(simulate){
        const dayNow = nowParisMinutes();
        let logicalNow = dayNow;
        if(logicalNow < tripStart) logicalNow += 1440; // wrap
        const tripSpan = tripEnd - tripStart;
        const loopOffset = ((logicalNow - tripStart) % tripSpan + tripSpan) % tripSpan;
        now = tripStart + loopOffset;
      } else {
        now = adjustedNow();
      }
      const { p, dwell } = computeProgress(now);
      if(dwell !== lastDwelling){ lastDwelling = dwell; setIsDwelling(dwell); }
      const y = barTop + barHeight * p;
      setMarkerTop(y);
      setProgressHeight(Math.max(0, y - barTop));
      rafId = requestAnimationFrame(frame);
    }
    frame();
    return ()=>{ if(rafId) cancelAnimationFrame(rafId); };
  }, [absTimes, barHeight, barTop, dateParam, isTodaySchedule]);

  const trainTypeName = useMemo(()=>{ const raw=firstSchedule?.train_type||''; return typeNames[raw?.toLowerCase?.()] || (raw? raw.toUpperCase(): 'TER'); },[firstSchedule?.train_type,typeNames]);
  const delayBanner = useMemo(()=>{
    if(!effective?.delayed) return null;
    const dep = effective.departure_delay_minutes ?? effective.delay_minutes;
    const arr = effective.arrival_delay_minutes ?? effective.delay_minutes;
    let txt;
    if(dep!=null && arr!=null && dep!==arr) txt = `Retard estimé à ${dep} min au départ et ${arr} min à l'arrivée`;
    else if(dep!=null) txt = `Retard estimé de ${dep} min`;
    else txt = 'Retard estimé';
    return <div className="delay-banner"><div className="delay-icon"><wcs-mat-icon icon="schedule" /></div><div className="delay-text">{txt}<div className="delay-train-ref">Train {firstSchedule?.train_type? trainTypeName: 'Train'} {firstSchedule?.train_number}</div></div><div className="delay-meta">{effective.stops?.length||0} <wcs-mat-icon icon="chevron_right" /></div></div>;
  }, [effective, firstSchedule, trainTypeName]);

  const perturbationBanners = useMemo(()=>{
    if(!effective) return null;
    const banners = [];
    if(effective.cancelled){
      banners.push(<div key="cancel" className="delay-banner cancel"><div className="delay-icon"><wcs-mat-icon icon="error" /></div><div className="delay-text">Train supprimé{effective.cancel_cause?` — ${effective.cancel_cause}`:''}<div className="delay-train-ref">Train {firstSchedule?.train_type? trainTypeName: 'Train'} {firstSchedule?.train_number}</div></div></div>);
    }
    if(effective.rerouted){
      banners.push(<div key="reroute" className="delay-banner reroute"><div className="delay-icon"><wcs-mat-icon icon="alt_route" /></div><div className="delay-text">Itinéraire modifié<div className="delay-train-ref">Train {firstSchedule?.train_type? trainTypeName: 'Train'} {firstSchedule?.train_number}</div></div></div>);
    }
    if(effective.delayed){ banners.push(delayBanner); }
    return banners.length? banners: null;
  }, [effective, delayBanner, firstSchedule, trainTypeName]);

  function onDateChange(e){
    const val = e.target.value;
    if(validDate(val)){
      const params = new URLSearchParams(window.location.search);
      params.set('date', val);
      router.replace(`?${params.toString()}`);
    }
  }

  return (
    <div className={"train-page-root" + (effective?.delayed? ' is-delayed':'') + (effective?.cancelled? ' is-cancelled':'') + (effective?.rerouted? ' is-rerouted':'')}>
      {!effective?.cancelled && (
        <div className="train-hero-bar">
          <div className="train-hero-title">Train {firstSchedule? (trainTypeName? trainTypeName: (firstSchedule.train_type? firstSchedule.train_type.toUpperCase(): 'TER')) : 'TER'} {trainNumber}{displayDate?`, ${displayDate}`:''}</div>
        </div>
      )}
      <div className="train-main container-train">
        {effective?.cancelled && firstSchedule && (
          <div className="cancelled-hero">
            <div className="cancelled-hero-icon"><wcs-mat-icon icon="error" /></div>
            <div className="cancelled-hero-text">
              <div className="cancelled-hero-title">Supprimé</div>
              <div className="cancelled-hero-sub">Train {firstSchedule.train_type? trainTypeName: 'Train'} {firstSchedule.train_number}</div>
            </div>
            <div className="cancelled-hero-meta">2 <wcs-mat-icon icon="chevron_right" /></div>
          </div>
        )}
        <div className="date-selector-line">
          <label className="date-label">Date: <input type="date" value={dateParam || parisTodayStr()} onChange={onDateChange} /></label>
          {!isTodaySchedule && <span className="not-today-note">Affichage historique (pas de suivi temps réel)</span>}
        </div>
        {firstSchedule && !effective?.cancelled && (
          <div className="rolling-card rolling-card-inline">
            <div className="rolling-body rolling-carousel" role="group" aria-label="Matériel roulant" ref={rollingContainerRef}>
              <div className="rolling-track">
                <img ref={rollingImgRef} src={rollingSrc} onLoad={onRollingLoad} onError={onRollingError} alt={rolling?`Matériel ${rolling}`:'Matériel roulant'} />
              </div>
            </div>
            <div className="rolling-footer small-text">
              {firstSchedule?.rolling_stock_name || rolling ? '1 train'+(firstSchedule?.rolling_stock_name? ' '+firstSchedule.rolling_stock_name: (rolling? ' '+rolling: '')) : '1 train'}
              {typeof firstSchedule?.rolling_stock_capacity === 'number' && firstSchedule.rolling_stock_capacity>0 ? ` • ${firstSchedule.rolling_stock_capacity} places` : ''}
            </div>
          </div>
        )}
        {perturbationBanners}
        {firstSchedule && (
          <div className="destination-block">
            <div className="dest-line">Destination {effective?.arrival_station}</div>
            <div className="dest-sub">Opéré par SNCF Voyageurs — {firstSchedule.train_number}</div>
          </div>
        )}
        {loading && <p>Chargement…</p>}
        {error && !loading && <wcs-alert mode="error" open>{error}</wcs-alert>}
        {!loading && !error && !firstSchedule && <wcs-alert mode="error" open>Aucun horaire trouvé.</wcs-alert>}
        {firstSchedule && (
          <div className="train-layout">
            {/* Suppression de la seconde carte matériel pour éviter duplication */}
            {!effective?.cancelled && (
              <>
                <div className="services-line">
                  <span title="Vélos"><wcs-mat-icon icon="directions_bike" /></span>
                  <span title="Accessibilité"><wcs-mat-icon icon="accessible" /></span>
                  <span title="Vélo pliant"><wcs-mat-icon icon="pedal_bike" /></span>
                </div>
                <div className="separator"></div>
                <div className="train-pill-row">
                  <div className="train-pill">
                    <wcs-mat-icon icon="error" class="pill-icon" />
                    <span>{firstSchedule.train_type? `Train ${trainTypeName}`: 'Train'} {firstSchedule.train_number}</span>
                  </div>
                  <div className="train-pill-meta">2 <wcs-mat-icon icon="chevron_right" /></div>
                </div>
              </>
            )}
            {/* Bar timeline unique */}
            <div className="stops-timeline" ref={timelineRef}>
              <div className="timeline-bar" aria-hidden="true" style={{ top:barTop, height: barHeight }}>
                <div className="timeline-progress" style={{ height: progressHeight }} />
              </div>
              {markerTop!=null && isTodaySchedule && !effective?.cancelled && (
                <div className="train-marker" style={{ top: markerTop }} aria-label="Position actuelle du train">
                  <wcs-mat-icon icon="train" class="train-marker-icon" />
                </div>
              )}
              {displayStops.map((st,i)=>{
                const isOrigin = !!st.origin; const isDest = !!st.dest;
                const currentTime = st.display_time || st.arrival_time || st.departure_time || '';// temps potentiellement retardé
                const originalTime = (st.original_arrival_time || st.original_departure_time || '');
                const isDelayedStop = effective?.delayed && originalTime && originalTime!==currentTime;
                const dwell = (!isOrigin && !isDest)? dwellMinutes(st.arrival_time, st.departure_time): null;
                const status = stopStatuses[i] || 'future';
                const badgeClasses = ["time-badge", status];
                if(isDelayedStop) badgeClasses.push('delayed-orig');
                const badgeDisplay = isDelayedStop? originalTime : currentTime;
                return (
                  <div className="stop-row" key={i} ref={setNodeRef(i)}>
                    <div className="stop-time">
                      {badgeDisplay && <span className={badgeClasses.join(' ')}>{badgeDisplay}</span>}
                      {isDelayedStop && <div className="time-new-delay" aria-label="Horaire retardé">{currentTime}</div>}
                    </div>
                    <div className="stop-line-col"><div className={"stop-node"+ (isOrigin? ' origin':'') + (isDest? ' dest':'') + ' '+status}></div></div>
                    <div className="stop-info">
                      <div className="stop-station">{st.station_name}</div>
                      {st.new_departure && <div className="stop-meta variant"><wcs-mat-icon icon="flag" /> Nouvelle gare de départ</div>}
                      {st.new_arrival && <div className="stop-meta variant"><wcs-mat-icon icon="flag" /> Nouvelle gare de terminus</div>}
                      {st.removed && !effective?.cancelled && <div className="stop-meta removed"><wcs-mat-icon icon="close" /> Arrêt supprimé</div>}
                      {!st.removed && !effective?.cancelled && !!st.platform && <div className="stop-meta">Voie {st.platform}</div>}
                      {effective?.cancelled && <div className="stop-meta removed"><wcs-mat-icon icon="close" /> Arrêt supprimé</div>}
                      {dwell>0 && <div className="stop-meta alt">{dwell} min d'arrêt</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <style jsx global>{`
        /* Design retard: neutraliser styles passés + unifier barre */
        .is-delayed .time-badge.past{ background:#5d2bd8; }
        .is-delayed .time-badge.past:after{ background:#5d2bd8; }
        .is-delayed .stop-node.past{ border-color:#5d2bd8; }
        .is-delayed .timeline-bar .timeline-progress{ background:#5d2bd8; }
        .is-delayed .rolling-card, .is-delayed .services-line, .is-delayed .separator, .is-delayed .train-pill-row{ display:unset; }
        .time-badge.delayed-orig{ text-decoration:line-through; }
        .rolling-card-inline{ width:fit-content; max-width:100%; margin:0 auto 20px; }
        .destination-block{ margin:0 0 18px; font-size:14px; line-height:1.25; }
        .destination-block .dest-line{ font-weight:600; font-size:18px; color:#0b111c; }
        .destination-block .dest-sub{ color:#5e6570; margin-top:4px; font-size:13px; }
        /* Fin design retard */
        .is-cancelled .train-marker{ display:none; }
        .is-cancelled .timeline-bar{ background:#6d7077; }
        .is-cancelled .timeline-bar .timeline-progress{ background:#6d7077; }
        .is-cancelled .time-badge{ background:#6d7077; }
        .is-cancelled .time-badge:after{ background:#6d7077; }
        .is-cancelled .stop-node{ border-color:#6d7077; background:#f4f4f5; }
        .is-cancelled .stop-station{ text-decoration:none; color:#0b111c; }
        .stop-meta.removed{ color:#c60018; display:flex; align-items:center; gap:4px; font-weight:600; }
        .cancelled-hero{ background:#a81832; color:#fff; display:flex; align-items:center; gap:16px; padding:16px 22px; border-radius:18px; margin:0 0 28px; }
        .cancelled-hero-icon{ width:38px; height:38px; border-radius:50%; background:rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; font-size:24px; }
        .cancelled-hero-title{ font-size:18px; font-weight:600; }
        .cancelled-hero-sub{ font-size:12px; opacity:.85; margin-top:2px; }
        .cancelled-hero-text{ flex:1; line-height:1.2; }
        .cancelled-hero-meta{ background:rgba(255,255,255,0.18); padding:6px 12px; border-radius:16px; font-size:13px; display:flex; align-items:center; gap:4px; font-weight:600; }
        .train-page-root{ background:#f4f3f7; min-height:100%; }
        .train-hero-bar{ background:#0b111c; color:#fff; text-align:center; font-weight:600; padding:12px 8px; font-size:18px; }
        /* Reste des styles existants inchangés */
        .delay-banner.cancel{ border:1px solid #f7d4d8; }
        .delay-banner.reroute{ border:1px solid #e2d9f9; }
        .delay-banner{ background:#fff; display:flex; align-items:center; gap:12px; padding:14px 20px; border-radius:12px; box-shadow:0 2px 4px -2px rgba(0,0,0,.08),0 1px 3px rgba(0,0,0,.12); font-size:14px; font-weight:500; margin-bottom:24px; position:relative; }
        .delay-icon{ background:#f8e9d8; color:#b55e00; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; }
        .delay-text{ flex:1; line-height:1.25; color:#2d333d; }
        .delay-train-ref{ font-size:12px; color:#5e6570; margin-top:2px; }
        .delay-meta{ background:#f1f2f4; color:#2d333d; padding:6px 12px; border-radius:16px; font-size:13px; display:flex; align-items:center; gap:4px; }
        .container-train{ max-width:920px; margin:0 auto; padding:40px 24px 120px; }
        .rolling-card{ background:#fff; border-radius:8px; padding:0; max-width:520px; box-shadow:0 1px 2px rgba(0,0,0,.08); }
        .rolling-body{ position:relative; padding:8px 16px; display:flex; align-items:center; justify-content:center; min-height:44px; }
        .rolling-body img{ height:30px; width:auto; max-height:30px; object-fit:contain; max-width:100%; }
        .rolling-carousel{ overflow:visible; }
        .rolling-track{ display:inline-block; }
        .rolling-arrow{ display:none; }
        .rolling-footer{ border-top:1px solid #eee; padding:8px 16px 14px; color:#555; }
        .services-line{ margin:24px 0 8px; display:flex; gap:20px; font-size:22px; color:#222; }
        .separator{ height:4px; background:#e9e7ec; border-radius:2px; margin:8px 0 18px; max-width:520px; }
        .train-pill-row{ display:flex; align-items:center; gap:12px; margin:4px 0 12px; }
        .train-pill{ background:#fff; border:1px solid #f0d4d6; display:flex; align-items:center; gap:8px; padding:6px 14px; border-radius:12px; font-weight:600; color:#c60018; font-size:14px; box-shadow:0 1px 2px rgba(0,0,0,.06); }
        .train-pill-meta{ background:#fff; border:1px solid #d0dde4; padding:6px 10px; border-radius:12px; font-size:14px; display:flex; align-items:center; gap:4px; color:#0b4f7d; }
        .stops-timeline{ position:relative; padding-left:0; }
        .timeline-bar{ position:absolute; left:calc(80px + 18px); width:16px; background:#5d2bd8; border-radius:8px; z-index:0; transform:translateX(-50%); overflow:hidden; top:0; bottom:auto; }
        .timeline-bar .timeline-progress{ position:absolute; left:0; top:0; width:100%; background:#5e6570; }
        .train-marker{ position:absolute; left:calc(80px + 18px); transform:translate(-50%, -50%); width:34px; height:34px; background:#2d333d; color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; z-index:5; box-shadow:0 2px 8px -1px rgba(0,0,0,.45); pointer-events:none; transition: top 0.15s linear; }
        .stop-row{ display:flex; align-items:flex-start; position:relative; min-height:58px; }
        .stop-time{ width:80px; text-align:right; padding-top:10px; position:relative; z-index:2; }
        .time-badge{ background:#5d2bd8; color:#fff; font-size:12px; font-weight:600; padding:6px 12px; border-radius:20px; display:inline-block; min-width:56px; text-align:center; position:relative; line-height:1; transition:background .25s; }
        .time-badge:after{ content:""; position:absolute; right:-14px; top:50%; transform:translateY(-50%); width:18px; height:4px; background:#5d2bd8; border-radius:2px; transition:background .25s; }
        .time-badge.past{ background:#5e6570; }
        .time-badge.past:after{ background:#5e6570; }
        .time-badge.current{ box-shadow:0 0 0 2px #fff, 0 0 0 4px #5d2bd8; }
        .time-new-delay{ font-size:10px; color:#d26b00; font-weight:600; margin-top:4px; text-align:center; }
        .stop-line-col{ width:36px; position:relative; display:flex; flex-direction:column; align-items:center; z-index:2; }
        .stop-node{ width:20px; height:20px; background:#fff; border:2px solid #5d2bd8; border-radius:50%; position:relative; margin-top:6px; transition:border-color .25s, background .25s; }
        .stop-node.past{ border-color:#5e6570; }
        .stop-node.current{ border-color:#5d2bd8; background:#fff; }
        .stop-node.future{ border-color:#5d2bd8; }
        .stop-info{ padding:6px 0 14px 4px; flex:1; position:relative; z-index:2; }
        .stop-station{ font-weight:600; font-size:20px; line-height:1.2; color:#0b111c; }
        .stop-meta{ font-size:12px; color:#5d2bd8; margin-top:4px; }
        .stop-meta.alt{ color:#555; }
        .stop-meta + .stop-meta{ color:#555; margin-top:2px; }
        @media (max-width:860px){ .stop-station{ font-size:16px; } }
        @media (max-width:680px){
          .container-train{ padding:24px 16px 80px; }
          .stop-station{ font-size:15px; }
          .stop-time{ width:72px; }
        }
        /* Overrides état supprimé pour uniformiser l'aspect */
        .is-cancelled .timeline-bar .timeline-progress{ height:100% !important; }
        .is-cancelled .time-badge,
        .is-cancelled .time-badge.past,
        .is-cancelled .time-badge.future,
        .is-cancelled .time-badge.current{ background:#6d7077 !important; box-shadow:none !important; }
        .is-cancelled .time-badge.current{ box-shadow:none !important; }
        .is-cancelled .time-badge:after{ background:#6d7077 !important; }
        .stop-meta.variant{ color:#0b4f7d; display:flex; align-items:center; gap:4px; font-weight:600; }
        /* Override spécifique pour la carte inline pour ne pas limiter la largeur */
        .rolling-card.rolling-card-inline{ max-width:none; width:fit-content; margin-left:auto; margin-right:auto; }
      `}</style>
    </div>
  );
}
