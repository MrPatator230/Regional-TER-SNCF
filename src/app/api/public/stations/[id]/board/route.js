import { NextResponse } from 'next/server';
import { scheduleQuery } from '@/js/db-schedule';
import { query as mainQuery } from '@/js/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function pad2(n){ return String(n).padStart(2,'0'); }
function formatISODate(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function timeToMin(t){ const m=String(t||'').match(/^([0-1]\d|2[0-3]):([0-5]\d)$/); if(!m) return null; return (+m[1])*60+(+m[2]); }

function isPerturbationActiveFor(dateISO, timeHHMM, p){
  if(!p) return false;
  const date = dateISO? new Date(dateISO+'T12:00:00'): new Date(); // milieu de journée pour éviter fuseaux
  const jourIdx = date.getDay(); // 0=Dim..6=Sam
  const jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  if(Array.isArray(p.data?.jours) && p.data.jours.length>0){ if(!p.data.jours.includes(jours[jourIdx])) return false; }
  const start = p.date_debut? new Date(p.date_debut): null;
  const end   = p.date_fin? new Date(p.date_fin): null;
  if(start && date < new Date(start.toISOString().slice(0,10)+'T00:00:00')) return false;
  if(end && date > new Date(end.toISOString().slice(0,10)+'T23:59:59')) return false;
  // Heure
  if(p.data?.horaire_interruption){
    const t = timeToMin(timeHHMM); if(t==null) return true;
    const s = timeToMin(p.data.horaire_interruption.debut||'00:00') ?? 0;
    const e = timeToMin(p.data.horaire_interruption.fin||'23:59') ?? 1439;
    if(s<=e){ if(!(t>=s && t<=e)) return false; } else { // couvre minuit
      if(!(t>=s || t<=e)) return false;
    }
  }
  return true;
}

function shouldShowBannerFor(dateISO, p){
  if(!p?.data?.banner_all) return false;
  // bannière visible pendant la période + X jours avant
  const daysBefore = Math.max(0, Number(p.data.banner_days_before)||0);
  const start = p.date_debut? new Date(p.date_debut): null;
  const end   = p.date_fin? new Date(p.date_fin): null;
  if(!start) return false;
  const d = new Date(dateISO+'T12:00:00');
  const preStart = new Date(start); preStart.setDate(preStart.getDate()-daysBefore);
  const endOfEnd = end? new Date(end): null;
  return d >= new Date(preStart.toISOString().slice(0,10)+'T00:00:00') && (!endOfEnd || d <= new Date(endOfEnd.toISOString().slice(0,10)+'T23:59:59'));
}

function bitRuns(days_mask, dateISO){
  if(!dateISO) return true; // fallback
  if(days_mask==null) return true;
  const d = new Date(dateISO+"T00:00:00");
  if(isNaN(d)) return true;
  const jsDay = d.getDay(); // 0=Dim..6=Sam
  // mapping bit0=Lun..bit6=Dim => index = (jsDay+6)%7
  const idx = (jsDay+6)%7;
  return (days_mask & (1<<idx)) !== 0;
}

export async function GET(req, ctx){
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type')||'departures').toLowerCase()==='arrivals' ? 'arrivals':'departures';
    const daysParam = Math.max(1, Math.min(3, parseInt(searchParams.get('days')||'2',10)||2));
    const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit')||'60',10)||60));
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if(!id) return NextResponse.json({ error:'ID invalide' }, { status:400 });

    // Récupère la gare (base principale)
    const stRows = await mainQuery('SELECT id,name FROM stations WHERE id=? LIMIT 1',[id]);
    if(!stRows.length) return NextResponse.json({ error:'Gare inconnue' }, { status:404 });
    const station = stRows[0];

    // Récupère l'id de la gare côté base horaires
    const horairesStations = await scheduleQuery('SELECT id FROM stations WHERE name=? LIMIT 1',[station.name]);
    if(!horairesStations.length) return NextResponse.json({ station: { id: station.id, name: station.name }, days: [] });
    const horairesStationId = horairesStations[0].id;

    // Construit la liste en incluant les extrémités + arrêts intermédiaires (avec IDs extrémités et gare courante)
    let rows;
    const safeLimit = Number(limit) || 60;
    if(type==='departures'){
      rows = await scheduleQuery(
        `(
          SELECT s.id, s.ligne_id,
                 s.train_number, UPPER(IFNULL(s.train_type,'')) AS train_type,
                 ds.id AS origin_id, ds.name AS origin_name,
                 as2.id AS dest_id,  as2.name AS dest_name,
                 DATE_FORMAT(s.departure_time,'%H:%i') AS time,
                 TIME_FORMAT(s.departure_time,'%H:%i') AS schedule_departure_time,
                 TIME_FORMAT(s.arrival_time,'%H:%i') AS schedule_arrival_time,
                 sp.platform AS platform,
                 s.departure_station_id AS current_station_id,
                 s.days_mask, s.flag_custom
            FROM sillons s
            JOIN stations ds  ON ds.id  = s.departure_station_id
            JOIN stations as2 ON as2.id = s.arrival_station_id
       LEFT JOIN schedule_platforms sp ON sp.schedule_id = s.id AND sp.station_id = s.departure_station_id
           WHERE s.departure_station_id = ?
        )
        UNION
        (
          SELECT s.id, s.ligne_id,
                 s.train_number, UPPER(IFNULL(s.train_type,'')) AS train_type,
                 ds.id AS origin_id, ds.name AS origin_name,
                 as2.id AS dest_id,  as2.name AS dest_name,
                 DATE_FORMAT(st.departure_time,'%H:%i') AS time,
                 TIME_FORMAT(s.departure_time,'%H:%i') AS schedule_departure_time,
                 TIME_FORMAT(s.arrival_time,'%H:%i') AS schedule_arrival_time,
                 sp.platform AS platform,
                 st.station_id AS current_station_id,
                 s.days_mask, s.flag_custom
            FROM sillons s
            JOIN stations ds  ON ds.id  = s.departure_station_id
            JOIN stations as2 ON as2.id = s.arrival_station_id
            JOIN schedule_stops st ON st.schedule_id = s.id AND st.station_id = ?
       LEFT JOIN schedule_platforms sp ON sp.schedule_id = s.id AND sp.station_id = st.station_id
           WHERE st.departure_time IS NOT NULL
        )
        ORDER BY time ASC, id ASC
        LIMIT ${safeLimit}`,
        [horairesStationId, horairesStationId]
      );
    } else {
      rows = await scheduleQuery(
        `(
          SELECT s.id, s.ligne_id,
                 s.train_number, UPPER(IFNULL(s.train_type,'')) AS train_type,
                 ds.id AS origin_id, ds.name AS origin_name,
                 as2.id AS dest_id,  as2.name AS dest_name,
                 DATE_FORMAT(s.arrival_time,'%H:%i') AS time,
                 TIME_FORMAT(s.departure_time,'%H:%i') AS schedule_departure_time,
                 TIME_FORMAT(s.arrival_time,'%H:%i') AS schedule_arrival_time,
                 sp.platform AS platform,
                 s.arrival_station_id AS current_station_id,
                 s.days_mask, s.flag_custom
            FROM sillons s
            JOIN stations ds  ON ds.id  = s.departure_station_id
            JOIN stations as2 ON as2.id = s.arrival_station_id
       LEFT JOIN schedule_platforms sp ON sp.schedule_id = s.id AND sp.station_id = s.arrival_station_id
           WHERE s.arrival_station_id = ?
        )
        UNION
        (
          SELECT s.id, s.ligne_id,
                 s.train_number, UPPER(IFNULL(s.train_type,'')) AS train_type,
                 ds.id AS origin_id, ds.name AS origin_name,
                 as2.id AS dest_id,  as2.name AS dest_name,
                 DATE_FORMAT(st.arrival_time,'%H:%i') AS time,
                 TIME_FORMAT(s.departure_time,'%H:%i') AS schedule_departure_time,
                 TIME_FORMAT(s.arrival_time,'%H:%i') AS schedule_arrival_time,
                 sp.platform AS platform,
                 st.station_id AS current_station_id,
                 s.days_mask, s.flag_custom
            FROM sillons s
            JOIN stations ds  ON ds.id  = s.departure_station_id
            JOIN stations as2 ON as2.id = s.arrival_station_id
            JOIN schedule_stops st ON st.schedule_id = s.id AND st.station_id = ?
       LEFT JOIN schedule_platforms sp ON sp.schedule_id = s.id AND sp.station_id = st.station_id
           WHERE st.arrival_time IS NOT NULL
        )
        ORDER BY time ASC, id ASC
        LIMIT ${safeLimit}`,
        [horairesStationId, horairesStationId]
      );
    }

    // Index des arrêts pour déterminer l'application des retards et modifs
    const scheduleIds = Array.from(new Set(rows.map(r=> r.id)));
    // Pré-chargement inclusions / exclusions custom sur la plage demandée
    const includesMap = new Map(); // scheduleId -> Set(dateISO)
    const excludesMap = new Map(); // scheduleId -> Set(dateISO)
    if(scheduleIds.length){
      const nowRef = new Date();
      const wantedDates = [];
      for(let i=0;i<daysParam;i++){ const d=new Date(nowRef); d.setDate(nowRef.getDate()+i); wantedDates.push(formatISODate(d)); }
      if(wantedDates.length){
        const idPh = scheduleIds.map(()=>'?').join(',');
        const datePh = wantedDates.map(()=>'?').join(',');
        const incRows = await scheduleQuery(`SELECT schedule_id, DATE_FORMAT(date,'%Y-%m-%d') AS date FROM schedule_custom_include WHERE schedule_id IN (${idPh}) AND date IN (${datePh})`, [...scheduleIds, ...wantedDates]);
        for(const r of incRows){ if(!includesMap.has(r.schedule_id)) includesMap.set(r.schedule_id, new Set()); includesMap.get(r.schedule_id).add(r.date); }
        const excRows = await scheduleQuery(`SELECT schedule_id, DATE_FORMAT(date,'%Y-%m-%d') AS date FROM schedule_custom_exclude WHERE schedule_id IN (${idPh}) AND date IN (${datePh})`, [...scheduleIds, ...wantedDates]);
        for(const r of excRows){ if(!excludesMap.has(r.schedule_id)) excludesMap.set(r.schedule_id, new Set()); excludesMap.get(r.schedule_id).add(r.date); }
      }
    }
    function runsOnDay(r, date){
      if(!r) return false;
      const inc = includesMap.get(r.id);
      if(inc && inc.has(date)) return true; // inclusion explicite
      const exc = excludesMap.get(r.id);
      if(exc && exc.has(date)) return false; // exclusion explicite
      if(r.flag_custom){ return inc? inc.has(date): false; } // mode custom: uniquement dates incluses
      return bitRuns(r.days_mask, date);
    }

    const stopsRows = scheduleIds.length? await scheduleQuery(
      `SELECT st.schedule_id, st.stop_order, st.station_id FROM schedule_stops st WHERE st.schedule_id IN (${scheduleIds.map(()=>'?').join(',')}) ORDER BY st.schedule_id, st.stop_order`,
      scheduleIds
    ): [];
    const indexMap = new Map(); // scheduleId -> stationId -> index
    const lastIndexMap = new Map(); // scheduleId -> last index
    for(const sid of scheduleIds){ indexMap.set(sid, new Map()); }
    for(const sid of scheduleIds){ indexMap.get(sid).set(rows.find(r=> r.id===sid)?.origin_id, 0); }
    for(const row of stopsRows){ const m=indexMap.get(row.schedule_id); if(m) m.set(row.station_id, (m.has(row.station_id)? m.get(row.station_id): (m.size)) ); }
    // Ajoute terminus comme dernier index
    for(const sid of scheduleIds){ const m=indexMap.get(sid); const baseRow = rows.find(r=> r.id===sid); if(m && baseRow){ const last = Math.max(...Array.from(m.values()), 0)+1; m.set(baseRow.dest_id, last); lastIndexMap.set(sid, last); } }

    // Charger le flag is_substitution pour les sillons présents
    const isSubMap = new Map();
    if(scheduleIds.length){
      const subRows = await scheduleQuery(
        `SELECT id, is_substitution AS isSub FROM schedules WHERE id IN (${scheduleIds.map(()=>'?').join(',')})`,
        scheduleIds
      );
      for(const r of subRows){ isSubMap.set(r.id, !!(r.isSub)); }
    }

    // Récupérer les perturbations publiques liées aux lignes présentes (optimisé)
    const ligneIds = Array.from(new Set(rows.map(r=> r.ligne_id).filter(Boolean)));
    let pertsByLine = new Map();
    if(ligneIds.length){
      const nowIso = new Date().toISOString();
      const placeholders = ligneIds.map(()=>'?').join(',');
      const perts = await mainQuery(
        `SELECT p.* FROM perturbations p WHERE (p.date_fin > ? OR p.date_fin IS NULL) AND p.ligne_id IN (${placeholders}) ORDER BY p.date_debut ASC`,
        [nowIso, ...ligneIds]
      );
      // Parse JSON data
      for(const p of perts){ try{ p.data = p.data? (typeof p.data==='string'? JSON.parse(p.data): p.data): {}; } catch{ p.data={}; }
        const list = pertsByLine.get(p.ligne_id) || []; list.push(p); pertsByLine.set(p.ligne_id, list);
      }
    }

    // Génère les jours avec application des variantes quotidiennes
    const now = new Date();
    const days = [];
    for(let i=0;i<daysParam;i++){
      const d = new Date(now); d.setDate(now.getDate()+i);
      const date = formatISODate(d);
      // Variantes du jour pour les schedules présents
      let variants = [];
      if(scheduleIds.length){
        variants = await scheduleQuery(
          `SELECT v.schedule_id, v.type, v.delay_from_station_id, v.delay_minutes, v.cause,
                  v.mod_departure_station_id, v.mod_arrival_station_id,
                  TIME_FORMAT(v.mod_departure_time,'%H:%i') AS mod_departure_time,
                  TIME_FORMAT(v.mod_arrival_time,'%H:%i') AS mod_arrival_time,
                  v.removed_stops
             FROM schedule_daily_variants v
            WHERE v.date=? AND v.schedule_id IN (${scheduleIds.map(()=>'?').join(',')})`,
          [date, ...scheduleIds]
        );
      }
      const varMap = new Map(); variants.forEach(v=> varMap.set(v.schedule_id, v));
      // Résoudre les noms des gares modifiées si présents
      const stationIdsToResolve = Array.from(new Set(variants.flatMap(v=> [v.mod_departure_station_id, v.mod_arrival_station_id].filter(Boolean))));
      const stationNameById = new Map();
      if(stationIdsToResolve.length){
        const nameRows = await scheduleQuery(
          `SELECT id,name FROM stations WHERE id IN (${stationIdsToResolve.map(()=>'?').join(',')})`,
          stationIdsToResolve
        );
        nameRows.forEach(r=> stationNameById.set(r.id, r.name));
      }

      // Préparer filtres perturbations par ligne pour la date
      const bannerByLine = new Map();
      for(const lid of new Set(rows.map(r=> r.ligne_id).filter(Boolean))){
        const lst = pertsByLine.get(lid)||[];
        const forDate = lst.filter(p=> isPerturbationActiveFor(date, null, p) || shouldShowBannerFor(date, p));
        if(forDate.length){
          // Garder la perturbation la plus proche en priorité pour le bandeau (affichage simplifié)
          bannerByLine.set(lid, forDate);
        }
      }

      let list = rows
        .map(r=>{
          if(!runsOnDay(r, date)) return null; // filtrage jours de circulation
          // inclure origin_id/dest_id pour permettre résolution par ID plus tard
          const base = { id:r.id, ligne_id: r.ligne_id, time:r.time, origin:r.origin_name, origin_id: r.origin_id, destination:r.dest_name, dest_id: r.dest_id, train_type:r.train_type, train_number:r.train_number||'', platform:r.platform||null, delay_min:null, delay_minutes:null, delay_cause:null, cancelled:false, rerouted:false, days_mask: r.days_mask, schedule_departure_time: r.schedule_departure_time || null, schedule_arrival_time: r.schedule_arrival_time || null };

          // Filtrage perturbations: exclusion de sillons sélectionnés
          const perts = pertsByLine.get(r.ligne_id)||[];
          const excludedByPert = perts.some(p=> {
            if(!isPerturbationActiveFor(date, r.time, p)) return false;
            const ex = Array.isArray(p.data?.exclude_schedules)? p.data.exclude_schedules: [];
            return ex.includes(r.id);
          });
          if(excludedByPert){
            return null; // filtre sillon
          }

          // Filtrage des sillons de substitution: n'afficher que si une perturbation avec substitution est active et que le sillon est sélectionné
          const isSub = !!isSubMap.get(r.id);
          if(isSub){
            const hasActiveSubPert = perts.some(p=> {
              if(p?.data?.substitution_autocar!==true) return false;
              if(!isPerturbationActiveFor(date, r.time, p)) return false;
              const sel = Array.isArray(p.data?.substitution_sillons)? p.data.substitution_sillons: [];
              return sel.includes(r.id);
            });
            if(!hasActiveSubPert){
              return null; // substitution masquée hors période / non sélectionnée
            }
          }

          const v = varMap.get(r.id);
          if(!v) return base;
          if(v.type==='suppression'){
            return { ...base, cancelled:true, info: v.cause? `Supprimé – ${v.cause}`: 'Supprimé' };
          }
          if(v.type==='retard'){
            const m = Number(v.delay_minutes)||0;
            if(m>0){
              const im = indexMap.get(r.id)||new Map();
              const fromIdx = v.delay_from_station_id? (im.get(v.delay_from_station_id) ?? 0) : 0;
              const curIdx = im.get(r.current_station_id) ?? 0;
              if(curIdx>=fromIdx){
                // set both delay_min and delay_minutes for frontend compatibility
                return { ...base, delay_min: m, delay_minutes: m, delay_cause: v.cause||null /* time conservée */ };
              }
            }
            return base;
          }
          if(v.type==='modification'){
            let removedList;
            try{
              removedList = v.removed_stops ? (Array.isArray(v.removed_stops) ? v.removed_stops : JSON.parse(v.removed_stops)) : [];
            } catch(e){ removedList = []; }
            // Exclure si la gare courante est supprimée
            if(removedList.some(name=> String(name||'').trim().toLowerCase() === String(station.name||'').trim().toLowerCase())){
              return null; // filtré
            }
            const im = indexMap.get(r.id)||new Map();
            const curIdx = im.get(r.current_station_id) ?? 0;
            const newDepIdx = v.mod_departure_station_id? (im.get(v.mod_departure_station_id) ?? null): null;
            const newArrIdx = v.mod_arrival_station_id? (im.get(v.mod_arrival_station_id) ?? null): null;
            // Exclusion si nouveau départ est après la gare courante (en départs)
            if(type==='departures' && newDepIdx!=null && curIdx<newDepIdx){ return null; }
            // Exclusion si nouveau terminus est avant la gare courante (en arrivées)
            if(type==='arrivals' && newArrIdx!=null && curIdx>newArrIdx){ return null; }
            let time = base.time;
            if(type==='departures' && v.mod_departure_station_id && r.current_station_id===v.mod_departure_station_id && v.mod_departure_time){ time = v.mod_departure_time; }
            if(type==='arrivals' && v.mod_arrival_station_id && r.current_station_id===v.mod_arrival_station_id && v.mod_arrival_time){ time = v.mod_arrival_time; }
            const newOriginName = v.mod_departure_station_id? (stationNameById.get(v.mod_departure_station_id) || base.origin): base.origin;
            const newDestName   = v.mod_arrival_station_id?   (stationNameById.get(v.mod_arrival_station_id)   || base.destination): base.destination;
            return { ...base, time, rerouted:true, original_origin: base.origin, original_destination: base.destination,
                     origin: newOriginName, destination: newDestName };
          }
          return base;
        })
        .filter(Boolean)
        .filter(s=> !!s.time)
        .sort((a,b)=> a.time.localeCompare(b.time))
        .map(s=>{
          // Ajout d'un champ infoBanner pour affichage client si banner_all actif
          const candidates = pertsByLine.get(s.ligne_id)||[];
          const show = candidates.some(p=> shouldShowBannerFor(date, p));
          if(show){
            return { ...s, infoBanner: true };
          }
          return s;
        });

      // --- new: pour chaque jour, récupérer les arrêts détaillés (origine, arrêts intermédiaires, terminus)
      const schedIdsForDate = list.map(s=>s.id);
      if(schedIdsForDate.length){
        const stopRows = await scheduleQuery(
          `SELECT st.schedule_id, st.stop_order, st.station_id, TIME_FORMAT(st.arrival_time,'%H:%i') AS arrival_time, TIME_FORMAT(st.departure_time,'%H:%i') AS departure_time, ss.name AS station_name
             FROM schedule_stops st
             JOIN stations ss ON ss.id = st.station_id
            WHERE st.schedule_id IN (${schedIdsForDate.map(()=>'?').join(',')})
            ORDER BY st.schedule_id, st.stop_order`,
          schedIdsForDate
        );
        const platRows = await scheduleQuery(
          `SELECT schedule_id, station_id, platform FROM schedule_platforms WHERE schedule_id IN (${schedIdsForDate.map(()=>'?').join(',')})`,
          schedIdsForDate
        );
        // Résoudre les noms des gares origine/terminus via leurs IDs dans la base 'horaires'
        const stationIdsSet = new Set();
        for(const r of stopRows){ stationIdsSet.add(r.station_id); }
        for(const s of list){ if(s.origin_id) stationIdsSet.add(s.origin_id); if(s.dest_id) stationIdsSet.add(s.dest_id); }
        const stationIds = Array.from(stationIdsSet);
        const stationNameById = new Map();
        if(stationIds.length){
          const nameRows = await scheduleQuery(
            `SELECT id, name FROM stations WHERE id IN (${stationIds.map(()=>'?').join(',')})`,
            stationIds
          );
          nameRows.forEach(r=> stationNameById.set(r.id, r.name));
        }
        const stopsMap = new Map();
        for(const r of stopRows){ if(!stopsMap.has(r.schedule_id)) stopsMap.set(r.schedule_id, []); stopsMap.get(r.schedule_id).push({ station_id: r.station_id, station_name: r.station_name, arrival_time: r.arrival_time, departure_time: r.departure_time }); }
        const platMap = new Map();
        for(const p of platRows){ platMap.set(p.schedule_id+"_"+p.station_id, p.platform); }

        // Attacher les stops à chaque schedule (inclut origine/terminus)
        list = list.map(s=>{
          // récupérer la variante journalière si présente
          const v = varMap.get(s.id);
          const stops = [];
          // origine
          if(s.origin_id){
            const originPlatform = platMap.get(s.id+"_"+s.origin_id) || null;
            const originName = stationNameById.get(s.origin_id) || s.origin || null;
            stops.push({ station_id: s.origin_id, station_name: originName, arrival_time: null, departure_time: s.schedule_departure_time || null, platform: originPlatform, origin: true, time: s.schedule_departure_time || null });
          }
          const mid = stopsMap.get(s.id) || [];
          for(const m of mid){
            const pf = platMap.get(s.id+"_"+m.station_id) || null;
            // mid.station_name provient déjà de la table stations de la base 'horaires'
            stops.push({ station_id: m.station_id, station_name: m.station_name, arrival_time: m.arrival_time, departure_time: m.departure_time, platform: pf, origin: false, time: (m.arrival_time||m.departure_time||null) });
          }
          // terminus
          if(s.dest_id){
            const destPlatform = platMap.get(s.id+"_"+s.dest_id) || null;
            const destName = stationNameById.get(s.dest_id) || s.destination || null;
            stops.push({ station_id: s.dest_id, station_name: destName, arrival_time: s.schedule_arrival_time || null, departure_time: null, platform: destPlatform, dest: true, time: s.schedule_arrival_time || null });
          }

          // --- appliquer variantes quotidiennes si présentes (modification.removed_stops, mod_departure_station_id, mod_arrival_station_id, mod_*_time)
          if(v && v.type === 'modification'){
            // removed_stops peut être JSON ou chaîne ; normaliser en tableau de noms
            let removedList;
            try{
              removedList = v.removed_stops ? (Array.isArray(v.removed_stops) ? v.removed_stops : JSON.parse(v.removed_stops)) : [];
            } catch(e){ removedList = []; }
            const removedNorm = removedList.map(x=> String(x||'').trim().toLowerCase());
            if(removedNorm.length){
              // filtrer les stops dont le nom figure dans removedList
              for(let i = stops.length-1; i>=0; i--){ const name = String(stops[i].station_name||'').trim().toLowerCase(); if(removedNorm.includes(name)){ stops.splice(i,1); } }
            }

            // Si modification du départ
            if(v.mod_departure_station_id){
              const newDepId = v.mod_departure_station_id;
              const idx = stops.findIndex(st=> st.station_id === newDepId);
              if(idx > 0){
                // on supprime tout avant cet index et marque le 1er comme origine
                stops.splice(0, idx);
                stops[0].origin = true;
              } else if(idx === -1){
                // station non présente: insérer au début
                const nm = stationNameById.get(newDepId) || null;
                stops.unshift({ station_id: newDepId, station_name: nm, arrival_time: null, departure_time: v.mod_departure_time || null, platform: platMap.get(s.id+"_"+newDepId)||null, origin: true, time: v.mod_departure_time || null });
              } else if(idx === 0){
                stops[0].origin = true;
                if(v.mod_departure_time){
                  stops[0].departure_time = v.mod_departure_time;
                  stops[0].time = v.mod_departure_time;
                }
              }
            }

            // Si modification du terminus
            if(v.mod_arrival_station_id){
              const newArrId = v.mod_arrival_station_id;
              const idxA = stops.findIndex(st=> st.station_id === newArrId);
              if(idxA >= 0 && idxA < stops.length-1){
                // tronquer après cet index
                stops.splice(idxA+1);
                stops[stops.length-1].dest = true;
              } else if(idxA === -1){
                const nm = stationNameById.get(newArrId) || null;
                stops.push({ station_id: newArrId, station_name: nm, arrival_time: v.mod_arrival_time || null, departure_time: null, platform: platMap.get(s.id+"_"+newArrId)||null, dest: true, time: v.mod_arrival_time || null });
              } else if(idxA === stops.length-1){
                stops[stops.length-1].dest = true;
                if(v.mod_arrival_time){
                  stops[stops.length-1].arrival_time = v.mod_arrival_time;
                  stops[stops.length-1].time = v.mod_arrival_time;
                }
              }
            }

            // Appliquer modifications d'horaires ponctuelles sur les stops si présentées
            if(v.mod_departure_station_id && v.mod_departure_time){
              const st = stops.find(x=> x.station_id === v.mod_departure_station_id);
              if(st){ st.departure_time = v.mod_departure_time; st.time = v.mod_departure_time; }
            }
            if(v.mod_arrival_station_id && v.mod_arrival_time){
              const st = stops.find(x=> x.station_id === v.mod_arrival_station_id);
              if(st){ st.arrival_time = v.mod_arrival_time; st.time = v.mod_arrival_time; }
            }
          }

          // normaliser: n'avoir qu'un seul flag origin/dest correct
          if(stops.length){ stops.forEach((t,ii)=>{ t.origin = !!(ii===0 && t.origin); t.dest = !!(ii===stops.length-1 && t.dest); }); }

           return { ...s, stops };
         });
       }

      // pousser la journée construite dans le tableau days
      days.push({ date, schedules: list });
    }

    return NextResponse.json({ station: { id: station.id, name: station.name }, days });
  } catch(e){
    console.error('GET /api/public/stations/[id]/board error', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}
