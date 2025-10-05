import { NextResponse } from 'next/server';
import { scheduleQuery } from '@/js/db-schedule';
import { query } from '@/js/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getTrainTypesFromRegionData() {
  try {
    const rows = await query('SELECT data FROM `région_data` WHERE id = 1', []);
    if (!rows?.length) return {};

    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    const types = data.types || [];

    // Créer un mapping type -> logo path
    const typeLogoMap = {};
    types.forEach(type => {
      if (type.slug && type.icon) {
        typeLogoMap[type.slug.toUpperCase()] = type.icon;
      }
    });

    return typeLogoMap;
  } catch (error) {
    console.error('Erreur récupération types trains:', error);
    return {};
  }
}

function parseStopsJson(raw){
  if(!raw) return [];
  try {
    const data = typeof raw==='string'? JSON.parse(raw): raw;
    if(Array.isArray(data)) {
      // Ancien format : simple tableau
      return data.map(s=>({
        station_name: s.station_name||s.station,
        arrival_time:(s.arrival_time||s.arrival||'')?.slice(0,5)||null,
        departure_time:(s.departure_time||s.departure||'')?.slice(0,5)||null
      }));
    } else if(data && typeof data==='object' && ('Origine' in data || 'Terminus' in data)) {
      // Nouveau format hiérarchique
      const stops = [];
      if(data.Origine) stops.push({
        station_name: data.Origine.station_name||data.Origine.station,
        arrival_time: (data.Origine.arrival_time||data.Origine.arrival||'')?.slice(0,5)||null,
        departure_time: (data.Origine.departure_time||data.Origine.departure||'')?.slice(0,5)||null
      });
      if(Array.isArray(data.Desservies)) {
        for(const s of data.Desservies) {
          stops.push({
            station_name: s.station_name||s.station,
            arrival_time:(s.arrival_time||s.arrival||'')?.slice(0,5)||null,
            departure_time:(s.departure_time||s.departure||'')?.slice(0,5)||null
          });
        }
      }
      if(data.Terminus && (!stops.length || (stops[stops.length-1].station_name !== (data.Terminus.station_name||data.Terminus.station)))) {
        stops.push({
          station_name: data.Terminus.station_name||data.Terminus.station,
          arrival_time: (data.Terminus.arrival_time||data.Terminus.arrival||'')?.slice(0,5)||null,
          departure_time: (data.Terminus.departure_time||data.Terminus.departure||'')?.slice(0,5)||null
        });
      }
      return stops;
    }
    return [];
  } catch { return []; }
}

// normaliser les heures au format HH:MM (pad à deux chiffres)
function normalizeTimeHM(t){ if(!t) return null; try{ const m = String(t).match(/(\d{1,2}):(\d{2})/); if(!m) return null; const hh = String(m[1]).padStart(2,'0'); const mm = m[2]; return `${hh}:${mm}`; }catch(e){ return null; } }

export async function GET(req){
  try {
    const { searchParams } = new URL(req.url);
    const gareName = (searchParams.get('gare')||'').trim();
    const debug = (searchParams.get('debug')||'0') === '1';
    if(!gareName) return NextResponse.json({ error:'Paramètre gare requis' }, { status:400 });

    // Récupérer les logos des types de trains
    const typeLogoMap = await getTrainTypesFromRegionData();

    const now = new Date();
    const nowHM = normalizeTimeHM(now.toLocaleTimeString('fr-FR',{hour:'2-digit', minute:'2-digit', hour12:false}));
    // Récupère l'id de la gare puis les sillons au départ
    // Tentative progressive : exact → LIKE → comparaison directe sur la liste
    let stRow = (await query('SELECT id, name FROM stations WHERE name=? LIMIT 1',[gareName]))[0];
    if(!stRow){
      // 1) recherche par LIKE
      const likeTry = (await query('SELECT id, name FROM stations WHERE name LIKE ? LIMIT 1', [`%${gareName}%`]))[0];
      if(likeTry) stRow = likeTry;
    }
    if(!stRow){
      // 2) fallback : récupérer une liste et comparer directement
      const allStations = await query('SELECT id, name FROM stations WHERE name IS NOT NULL');
      const match = (allStations||[]).find(s=>{
        if(!s || !s.name) return false;
        return s.name === gareName || s.name.startsWith(gareName) || gareName.startsWith(s.name) || s.name.includes(gareName) || gareName.includes(s.name);
      });
      if(match) stRow = match;
    }
    if(!stRow) return NextResponse.json({ error:'Gare inconnue' }, { status:404 });
    const st = stRow;

    // Cherche les trains qui partent de la gare OU qui la desservent (dans stops_json)
    // On utilise LIKE sur le JSON pour retrouver le nom de la gare dans stops_json
    const likeParam = `%"${st.name}"%`;

    // Vérifier dynamiquement quelles colonnes liées aux jours existent pour éviter ER_BAD_FIELD_ERROR
    let extraSelectCols = [];
    try{
      const cols = await scheduleQuery(`SHOW COLUMNS FROM schedules`, []);
      const colNames = (cols||[]).map(c=>String(c.Field));
      const candidates = ['days_mask_list','days_mask','days','running_days_str','service_date','start_date','end_date','exceptions'];
      for(const c of candidates){ if(colNames.includes(c)) extraSelectCols.push(`s.${c}`); }
    }catch(_){ /* si SHOW COLUMNS échoue, continuer sans colonnes additionnelles */ }

    const extraSelect = extraSelectCols.length ? (', ' + extraSelectCols.join(', ')) : '';

    const rows = await scheduleQuery(`SELECT s.id, s.train_number, s.train_type,
        ds.name AS departure_station, as2.name AS arrival_station,
        DATE_FORMAT(s.departure_time, "%H:%i") AS departure_time,
        DATE_FORMAT(s.arrival_time, "%H:%i") AS arrival_time,
        s.rolling_stock, s.stops_json${extraSelect}
      FROM schedules s
      JOIN stations ds  ON ds.id  = s.departure_station_id
      JOIN stations as2 ON as2.id = s.arrival_station_id
      WHERE (s.departure_station_id=? OR s.stops_json LIKE ?)
      ORDER BY s.departure_time ASC`, [st.id, likeParam]);

    // Filtrer les sillons selon la date du serveur (aujourd'hui)
    const today = new Date();

    function runsOnDateServer(item, date){
      if(!item) return false;
      const iso = date.toISOString().slice(0,10);
      const jsDay = date.getDay(); // 0=Sunday .. 6=Saturday
      const dayIndex = jsDay === 0 ? 6 : jsDay - 1; // 0=Monday..6=Sunday
      const numForApi = dayIndex + 1;

      // 1) date exacte/service_date
      try{
        if(item.service_date && String(item.service_date).startsWith(iso)) return true;
        if(item.date && String(item.date).startsWith(iso)) return true;
      }catch(_){/* ignore */}

      // 2) plages de validité
      try{
        const start = item.start_date || item.valid_from || null;
        const end = item.end_date || item.valid_to || null;
        if(start && iso < String(start).slice(0,10)) return false;
        if(end && iso > String(end).slice(0,10)) return false;
      }catch(_){/* ignore */}

      let hasDaySpec = false;
      // 3) days mask candidates (plusieurs noms possibles)
      try{
        const maskCandidates = item.days_mask_list ?? item.daysMaskList ?? item.days_mask ?? item.daysMask ?? item.daysmask ?? item.daysMaskInt ?? item.running_days_str ?? item.running_days ?? item.days ?? null;
        if(maskCandidates !== null && maskCandidates !== undefined){
          hasDaySpec = true;
          // helper: convertir un tableau/parts en nombres 1..7
          const partsToNums = (parts) => {
            const out = [];
            (parts || []).forEach(p => {
              if(p === null || p === undefined) return;
              const s = String(p).trim();
              if(s === '') return;
              if(/^[0-9]+$/.test(s)){
                let n = Number(s);
                if(n >= 0 && n <= 6) n = n + 1; // accepter 0..6 index
                if(n >= 1 && n <= 7) out.push(n);
              }else{
                const key = s.slice(0,3).toLowerCase();
                const map = { lun:1, mar:2, mer:3, jeu:4, ven:5, sam:6, dim:7, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, sun:7 };
                if(map[key]) out.push(map[key]);
              }
            });
            return Array.from(new Set(out)).sort((a,b)=>a-b);
          };

          const numForApi = dayIndex + 1;

          if(Array.isArray(maskCandidates)){
            const nums = partsToNums(maskCandidates);
            if(nums.includes(numForApi)) return true;
          }else if(typeof maskCandidates === 'string'){
            const sMask = maskCandidates.trim();
            if(/^[01]{7}$/.test(sMask)){
              if(sMask[dayIndex] === '1') return true;
            }else if(/[;,\s]/.test(sMask)){
              const parts = sMask.split(/[;,\s]+/).map(p=>p.trim()).filter(Boolean);
              const nums = partsToNums(parts);
              if(nums.includes(numForApi)) return true;
            }else if(/^[0-9]+$/.test(sMask)){
              // chiffre unique (1..7) ou entier bitmask
              if(/^[1-7]$/.test(sMask)){
                if(sMask === String(numForApi)) return true;
              }else{
                const asNum = Number(sMask);
                if(!Number.isNaN(asNum)){
                  if(((asNum >> dayIndex) & 1) === 1) return true;
                }
              }
            }else{
              // texte libre -> split et tenter mapping
              const parts = sMask.split(/[;,\s]+/).map(p=>p.trim()).filter(Boolean);
              const nums = partsToNums(parts);
              if(nums.includes(numForApi)) return true;
            }
          }else if(typeof maskCandidates === 'number'){
            if(((maskCandidates >> dayIndex) & 1) === 1) return true;
          }
        }
      }catch(_){/* ignore */}

      // 4) jours explicités ailleurs (daysCandidates)
      try{
        const daysCandidates = item.days || item.days_of_week || item.operating_days || item.weekdays || item.running_days || item.running_days_str || item.calendar?.days || item.service_days;
        if(daysCandidates){
          hasDaySpec = true;
          if(Array.isArray(daysCandidates)){
            const normalized = daysCandidates.map(s=>String(s).toLowerCase());
            if(normalized.includes(String(numForApi))) return true;
            const dayNamesFr = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
            if(normalized.some(s=>s.includes(dayNamesFr[dayIndex]) || dayNamesFr[dayIndex].includes(s) || s.startsWith(dayNamesFr[dayIndex].slice(0,3)))) return true;
          }else if(typeof daysCandidates === 'string'){
            const s = daysCandidates.toLowerCase();
            const bit = s.replace(/[^01]/g,'');
            if(/^[01]{7}$/.test(bit)){
              if(bit[dayIndex] === '1') return true;
            }
            const dayNamesFr = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
            if(s.includes(dayNamesFr[dayIndex]) || s.includes(dayNamesFr[dayIndex].slice(0,3))) return true;
            if(s.includes(String(numForApi))) return true;
          }
        }
      }catch(_){/* ignore */}

      // 5) exceptions
      try{
        const ex = item.exceptions || item.exceptions_json || item.exceptions_list || item.exception;
        if(ex){
          if(Array.isArray(ex)){
            if(ex.includes(iso)) return false;
          }else if(typeof ex === 'string'){
            if(ex.includes(iso)) return false;
          }else if(ex && ex.except && Array.isArray(ex.except) && ex.except.includes(iso)){
            return false;
          }
        }
      }catch(_){/* ignore */}

      if(hasDaySpec) return false;
      return true;
    }

    // appliquer le filtre aux rows (aujourd'hui)
    const rowsFiltered = (rows || []).filter(r => runsOnDateServer(r, today));

    // debug info initiale
    const debugInfo = {
      matched_station: st.name,
      rows_count: (rows || []).length,
      rows_filtered_count: rowsFiltered.length,
      availableCols: extraSelectCols
    };

    // Pour chaque sillon, déterminer l'heure pertinente pour la gare demandée (heure de passage)
    const normalize = s => s && String(s).normalize('NFD').replace(/[\u0000-\u007F]/g, '').toLowerCase();
    const gareNorm = normalize(st.name);
    const annotated = rowsFiltered.map(r=>{
      const stops = parseStopsJson(r.stops_json || '[]');
      // Recherche robuste de la gare dans les arrêts (insensible à la casse et aux accents)
      const stopForStation = stops.find(s => {
        if(!s || !s.station_name) return false;
        return normalize(s.station_name) === gareNorm;
      }) || null;
      let rawPass = null;
      if (r.departure_station === st.name) {
        // Origine
        rawPass = r.departure_time;
      } else if (stopForStation) {
        // Desservie : priorité à l'heure de départ à la gare, sinon arrivée
        rawPass = stopForStation.departure_time || stopForStation.arrival_time || null;
      } else if (r.arrival_station === st.name) {
        // Terminus
        rawPass = r.arrival_time;
      }
      const passTime = normalizeTimeHM(rawPass);
      if(debug){
        return { raw: r, stops, passTime, stopForStationName: stopForStation && stopForStation.station_name || null };
      }
      return { raw: r, stops, passTime };
    });

    // Filtre futurs en utilisant l'heure de passage à la gare (passTime)
    const futureAnnotated = (nowHM ? annotated.filter(a => a.passTime && a.passTime >= nowHM) : annotated);
    let chosenAnnotated = futureAnnotated.slice(0,10);

    // Si aucun départ restant aujourd'hui, chercher les sillons valides pour demain
    if (chosenAnnotated.length === 0) {
      const tomorrow = new Date(now.getTime() + 24*60*60*1000);
      const tomorrowDate = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
      // réutiliser `rows` et filtrer par rules de circulation (runsOnDateServer) pour la date de demain
      const rowsTomorrowFiltered = (rows || []).filter(r => runsOnDateServer(r, tomorrowDate));

      const annotatedTomorrow = rowsTomorrowFiltered.map(r=>{
         const stops = parseStopsJson(r.stops_json || '[]');
         const stopForStation = stops.find(s => {
           if(!s || !s.station_name) return false;
           return s.station_name === st.name || s.station_name.startsWith(st.name) || st.name.startsenteurs(s.station_name) || s.station_name.includes(st.name) || st.name.includes(s.station_name);
         }) || null;
         const rawPass = stopForStation?.departure_time || stopForStation?.arrival_time || r.departure_time || null;
         const passTime = normalizeTimeHM(rawPass);
         return { raw: r, stops, passTime };
       });
      chosenAnnotated = annotatedTomorrow.slice(0,10);
    }

    // construire la liste finale en incluant la time de passage (pass_time) et les stops complets
    const scheduleIds = (chosenAnnotated || []).map(a => a.raw.id).filter(Boolean);
    // Amélioration de la logique de récupération des quais assignés
    const assignedMap = {}; // schedule_id -> platform
    if(scheduleIds.length > 0){
      // Prioriser la récupération directe depuis la base de données pour garantir la cohérence
      try{
        const placeholders = scheduleIds.map(()=>'?').join(',');
        const sql = `SELECT schedule_id, platform FROM schedule_platforms WHERE station_id = ? AND schedule_id IN (${placeholders})`;
        const [platRows] = await scheduleQuery(sql, [st.id, ...scheduleIds]);
        if(Array.isArray(platRows)){
          platRows.forEach(pr => {
            assignedMap[pr.schedule_id] = pr.platform || null;
          });
        }
      }catch(e){
        console.warn('Erreur récupération quais assignés:', e);
      }
    }

    const list = (chosenAnnotated || []).map(a=>{
      const r = a.raw;
      // Inclure la gare d'origine (départ) en tête de stops
      const allStops = [
        { station_name: r.departure_station, arrival_time: null, departure_time: r.departure_time },
        ...parseStopsJson(r.stops_json).filter(s=> (s.station_name!==r.departure_station))
      ];

      // Logique améliorée pour l'attribution des quais
      // Vérifier s'il y a un quai assigné par l'admin pour ce sillon à cette gare
      const adminPlatform = assignedMap[r.id];

      // Nouvelle logique : respecter strictement les attributions administratives
      let platformToShow = null;
      if (adminPlatform !== undefined) {
        // Si une attribution existe (même vide), la respecter
        platformToShow = adminPlatform && String(adminPlatform).trim() !== '' ? String(adminPlatform) : null;
      } else {
        // Si aucune attribution admin, ne pas inventer de quai par défaut
        platformToShow = null;
      }

      const trainType = r.train_type || 'TER';
      const logoPath = typeLogoMap[trainType.toUpperCase()] || '/img/type/ter.svg';

      return {
        id: r.id,
        number: r.train_number,
        type: trainType,
        logo: logoPath,
        departure_time: r.departure_time,
        arrival_station: r.arrival_station,
        stops: allStops.map(s=> ({ station_name: s.station_name, arrival_time: s.arrival_time, departure_time: s.departure_time })),
        horaire_afficheur: a.passTime || null, // horaire pertinent pour la gare demandée
        voie: platformToShow || '',
        platform: platformToShow,
        status: 'A L\'HEURE'
      };
    }).slice(0,10);

    if(debug){
      return NextResponse.json({ gare: gareName, departures: list, debug: { nowHM, debugInfo, annotated, assignedMap } });
    }
    return NextResponse.json({ gare: gareName, departures: list });
  } catch(e){
    console.error('GET /api/afficheurs/classiques/departs', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}
