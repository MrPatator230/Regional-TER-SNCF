import { NextResponse } from 'next/server';
import { scheduleQuery } from '@/js/db-schedule';
import { query } from '@/js/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getTrainTypesFromRegionData(){
  try{
    const rows = await query('SELECT data FROM `région_data` WHERE id = 1', []);
    if(!rows || !rows.length) return {};
    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    const types = data?.types || [];
    const map = {};
    types.forEach(t => { if(t && t.slug){ map[String(t.slug).toUpperCase()] = t.icon || null; } });
    return map;
  }catch(e){ console.error('getTrainTypesFromRegionData error', e); return {}; }
}

function parseStopsJson(raw){
  if(!raw) return [];
  try{
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if(Array.isArray(data)){
      return data.map(s=>({
        station_name: s?.station_name || s?.station || '',
        arrival_time: (s?.arrival_time || s?.arrival || '') ? String(s?.arrival_time || s?.arrival || '').slice(0,5) : null,
        departure_time: (s?.departure_time || s?.departure || '') ? String(s?.departure_time || s?.departure || '').slice(0,5) : null
      }));
    }
    if(data && typeof data === 'object'){
      const out = [];
      const pushStop = (s)=>{ if(!s) return; out.push({ station_name: s.station_name||s.station||'', arrival_time:(s.arrival_time||s.arrival||'')?.slice(0,5)||null, departure_time:(s.departure_time||s.departure||'')?.slice(0,5)||null }); };
      if(data.Origine) pushStop(data.Origine);
      if(Array.isArray(data.Desservies)) data.Desservies.forEach(pushStop);
      if(data.Terminus) pushStop(data.Terminus);
      return out;
    }
    return [];
  }catch(_){ return []; }
}

function normalizeTimeHM(t){
  if(!t) return null;
  try{
    const s = String(t).trim();
    const m = s.match(/(\d{1,2}):?(\d{2})/);
    if(!m) return null;
    const hh = String(m[1]).padStart(2,'0');
    const mm = m[2];
    return `${hh}:${mm}`;
  }catch(_){ return null; }
}

function runsOnDateServer(item, date){
  if(!item) return false;
  const iso = date.toISOString().slice(0,10);
  const jsDay = date.getDay(); // 0=Sunday
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1; // 0=Monday
  const numForApi = dayIndex + 1;
  try{ if(item.service_date && String(item.service_date).startsWith(iso)) return true; if(item.date && String(item.date).startsWith(iso)) return true; }catch(_){ }
  try{
    const start = item.start_date || item.valid_from || item.calendar?.start_date || null;
    const end = item.end_date || item.valid_to || item.calendar?.end_date || null;
    if(start && iso < String(start).slice(0,10)) return false;
    if(end && iso > String(end).slice(0,10)) return false;
  }catch(_){ }

  let hasDaySpec = false;
  try{
    const maskCandidates = item.days_mask_list ?? item.daysMaskList ?? item.days_mask ?? item.daysMask ?? item.daysmask ?? item.daysMaskInt ?? item.running_days_str ?? item.running_days ?? item.days ?? null;
    if(maskCandidates !== null && maskCandidates !== undefined){
      hasDaySpec = true;
      const partsToNums = (parts) => {
        const out = [];
        (parts||[]).forEach(p=>{ if(p==null) return; const s = String(p).trim(); if(!s) return; if(/^[0-9]+$/.test(s)){ let n = Number(s); if(n>=0 && n<=6) n = n+1; if(n>=1 && n<=7) out.push(n);} else { const key = s.slice(0,3).toLowerCase(); const map = { lun:1, mar:2, mer:3, jeu:4, ven:5, sam:6, dim:7, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, sun:7 }; if(map[key]) out.push(map[key]); } });
        return Array.from(new Set(out)).sort((a,b)=>a-b);
      };
      if(Array.isArray(maskCandidates)){
        const nums = partsToNums(maskCandidates); if(nums.includes(numForApi)) return true;
      }else if(typeof maskCandidates === 'string'){
        const sMask = maskCandidates.trim();
        if(/^[01]{7}$/.test(sMask)){ if(sMask[dayIndex] === '1') return true; }
        else if(/[;,\s]/.test(sMask)){ const parts = sMask.split(/[;,\s]+/).map(p=>p.trim()).filter(Boolean); const nums = partsToNums(parts); if(nums.includes(numForApi)) return true; }
        else if(/^[0-9]+$/.test(sMask)){
          if(/^[1-7]$/.test(sMask)){ if(sMask === String(numForApi)) return true; }
          else { const asNum = Number(sMask); if(!Number.isNaN(asNum) && (((asNum>>dayIndex)&1) === 1)) return true; }
        }else{ const parts = sMask.split(/[;,\s]+/).map(p=>p.trim()).filter(Boolean); const nums = partsToNums(parts); if(nums.includes(numForApi)) return true; }
      }else if(typeof maskCandidates === 'number'){
        if(((maskCandidates>>dayIndex)&1) === 1) return true;
      }
    }
  }catch(_){ }

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
        const s = daysCandidates.toLowerCase(); const bit = s.replace(/[^01]/g,'');
        if(/^[01]{7}$/.test(bit)){ if(bit[dayIndex] === '1') return true; }
        const dayNamesFr = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
        if(s.includes(dayNamesFr[dayIndex]) || s.includes(dayNamesFr[dayIndex].slice(0,3))) return true;
        if(s.includes(String(numForApi))) return true;
      }
    }
  }catch(_){ }

  try{
    const ex = item.exceptions || item.exceptions_json || item.exceptions_list || item.exception;
    if(ex){ if(Array.isArray(ex)){ if(ex.includes(iso)) return false; } else if(typeof ex === 'string'){ if(ex.includes(iso)) return false; } else if(ex && ex.except && Array.isArray(ex.except) && ex.except.includes(iso)) return false; }
  }catch(_){ }

  if(hasDaySpec) return false;
  return true;
}

export async function GET(req){
  try{
    const { searchParams } = new URL(req.url);
    const gareName = (searchParams.get('gare')||'').trim();
    const debug = (searchParams.get('debug')||'0') === '1';
    if(!gareName) return NextResponse.json({ error: 'Paramètre gare requis' }, { status: 400 });

    const typeLogoMap = await getTrainTypesFromRegionData();

    let stRow = (await query('SELECT id, name FROM stations WHERE name = ? LIMIT 1', [gareName]))[0];
    if(!stRow){ const likeTry = (await query('SELECT id, name FROM stations WHERE name LIKE ? LIMIT 1', [`%${gareName}%`]))[0]; if(likeTry) stRow = likeTry; }
    if(!stRow){ const allStations = await query('SELECT id, name FROM stations WHERE name IS NOT NULL'); const match = (allStations||[]).find(s => { if(!s || !s.name) return false; return s.name === gareName || s.name.startsWith(gareName) || gareName.startsWith(s.name) || s.name.includes(gareName) || gareName.includes(s.name); }); if(match) stRow = match; }
    if(!stRow) return NextResponse.json({ error:'Gare inconnue' }, { status:404 });
    const st = stRow;

    let extraSelectCols = [];
    try{
      const cols = await scheduleQuery('SHOW COLUMNS FROM schedules', []);
      const colNames = (cols||[]).map(c=>String(c.Field));
      const candidates = ['days_mask_list','days_mask','days','running_days_str','service_date','start_date','end_date','exceptions'];
      for(const c of candidates) if(colNames.includes(c)) extraSelectCols.push(`s.${c}`);
    }catch(_){ }
    const extraSelect = extraSelectCols.length ? (', ' + extraSelectCols.join(', ')) : '';

    const likeParam = `%"${st.name}"%`;
    const rows = await scheduleQuery(`SELECT s.id, s.train_number, s.train_type,
        ds.name AS departure_station, as2.name AS arrival_station,
        DATE_FORMAT(s.departure_time, "%H:%i") AS departure_time,
        DATE_FORMAT(s.arrival_time, "%H:%i") AS arrival_time,
        s.rolling_stock, s.stops_json${extraSelect}
      FROM schedules s
      JOIN stations ds ON ds.id = s.departure_station_id
      JOIN stations as2 ON as2.id = s.arrival_station_id
      WHERE (s.departure_station_id = ? OR s.stops_json LIKE ?)
      ORDER BY s.departure_time ASC`, [st.id, likeParam]);

    // Supporter un paramètre date (ISO yyyy-mm-dd) comme dans l'afficheur AFL
    const dateParam = searchParams.get('date') || null;
    const refDate = dateParam ? new Date(dateParam + 'T00:00:00') : new Date();
    const todayISO = refDate.toISOString().slice(0, 10);
    let rowsFiltered = (rows||[]).filter(r => runsOnDateServer(r, refDate));

    // Si aucun résultat pour la date demandée, tenter le lendemain en fallback
    if(!rowsFiltered.length){
      const tomorrow = new Date(refDate.getTime() + 24*60*60*1000);
      rowsFiltered = (rows||[]).filter(r => runsOnDateServer(r, tomorrow));
    }

    const normalize = s => String(s||'').normalize ? String(s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase() : String(s||'').toLowerCase();
    const gareNorm = normalize(st.name);
    const annotated = rowsFiltered.map(r => {
      const stops = parseStopsJson(r.stops_json || '[]');
      const stopForStation = stops.find(s => normalize(s.station_name) === gareNorm) || null;
      let rawPass = null;
      if(r.departure_station === st.name) rawPass = r.departure_time;
      else if(stopForStation && stopForStation.departure_time) rawPass = stopForStation.departure_time;
      else rawPass = null;
      const passTime = normalizeTimeHM(rawPass);
      return { raw: r, stops, passTime, stopForStationName: stopForStation?.station_name || null };
    });

    const now = new Date();
    const nowHM = normalizeTimeHM(now.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }));
    const futureAnnotated = nowHM ? annotated.filter(a => a.passTime && a.passTime >= nowHM) : annotated;
    let chosenAnnotated = futureAnnotated.slice(0, 10);

    if(!chosenAnnotated.length){
      const tomorrow = new Date(now.getTime() + 24*60*60*1000);
      const tomorrowDate = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
      const rowsTomorrow = (rows||[]).filter(r => runsOnDateServer(r, tomorrowDate));
      const annotatedTomorrow = rowsTomorrow.map(r=>{
        const stops = parseStopsJson(r.stops_json || '[]');
        const stopForStation = stops.find(s => normalize(s.station_name) === gareNorm || s.station_name === st.name || s.station_name?.startsWith(st.name)) || null;
        let rawPass = null;
        if(r.departure_station === st.name) rawPass = r.departure_time;
        else if(stopForStation && stopForStation.departure_time) rawPass = stopForStation.departure_time;
        const passTime = normalizeTimeHM(rawPass);
        return { raw: r, stops, passTime };
      });
      chosenAnnotated = annotatedTomorrow.slice(0,10);
    }

    const scheduleIds = (chosenAnnotated||[]).map(a => a.raw.id).filter(Boolean);

    // Récupérer les perturbations quotidiennes pour aujourd'hui
    const perturbationsMap = {};
    if(scheduleIds.length){
      try{
        const placeholders = scheduleIds.map(()=>'?').join(',');
        const perturbRows = await scheduleQuery(
          `SELECT * FROM schedule_daily_variants WHERE date = ? AND schedule_id IN (${placeholders})`,
          [todayISO, ...scheduleIds]
        );
        if(Array.isArray(perturbRows)){
          perturbRows.forEach(p => {
            perturbationsMap[p.schedule_id] = p;
          });
        }
      }catch(err){
        console.error('Erreur récupération perturbations:', err);
      }
    }

    const assignedMap = {};
    if(scheduleIds.length){
      try{
        const origin = new URL(req.url).origin;
        const url = `${origin}/api/quais?stationName=${encodeURIComponent(st.name)}&limit=2000`;
        const res = await fetch(url, { cache: 'no-store' });
        const j = await res.json().catch(()=>null);
        if(res.ok && j && Array.isArray(j.items)) j.items.forEach(it => { if(it && it.schedule_id) assignedMap[it.schedule_id] = it.platform ?? '' });
      }catch(_){ }

      if(Object.keys(assignedMap).length === 0){
        try{
          const placeholders = scheduleIds.map(()=>'?').join(',');
          const sql = `SELECT schedule_id, platform FROM schedule_platforms WHERE station_id = ? AND schedule_id IN (${placeholders})`;
          const platRows = await scheduleQuery(sql, [st.id, ...scheduleIds]);
          if(Array.isArray(platRows)) platRows.forEach(pr => { assignedMap[pr.schedule_id] = pr.platform || null; });
        }catch(_){ }
      }
    }

    const list = (chosenAnnotated||[]).map(a => {
      const r = a.raw;
      const parsedStops = parseStopsJson(r.stops_json || '[]');
      const allStops = [ { station_name: r.departure_station, arrival_time: null, departure_time: r.departure_time }, ...parsedStops.filter(s => s.station_name !== r.departure_station) ];
      const adminPlatform = assignedMap[r.id];
      const platformToShow = (adminPlatform !== undefined) ? (adminPlatform && String(adminPlatform).trim() !== '' ? String(adminPlatform) : '') : '';
      const trainType = r.train_type || 'TER';
      const logoPath = typeLogoMap[String(trainType).toUpperCase()] || '/img/type/ter.svg';

      // Appliquer les perturbations quotidiennes
      let status = 'A L\'HEURE';
      let delayMinutes = null;
      const perturbation = perturbationsMap[r.id];

      if(perturbation){
        const pType = String(perturbation.type || '').toLowerCase();
        if(pType === 'suppression'){
          status = 'SUPPRIMÉ';
        } else if(pType === 'retard' && perturbation.delay_minutes){
          status = 'RETARDÉ';
          delayMinutes = perturbation.delay_minutes;
        }
      }

      return {
        id: r.id,
        number: r.train_number,
        type: trainType,
        logo: logoPath,
        departure_time: r.departure_time,
        arrival_station: r.arrival_station,
        stops: allStops.map(s=>({ station_name: s.station_name, arrival_time: s.arrival_time, departure_time: s.departure_time })),
        horaire_afficheur: a.passTime || null,
        voie: platformToShow || '',
        platform: platformToShow || '',
        status: status,
        delay_minutes: delayMinutes,
        perturbation: perturbation || null
      };
    }).slice(0,10);

    if(debug){
      return NextResponse.json({ gare: gareName, departures: list, debug: { nowHM, chosenCount: list.length, availableCols: extraSelectCols, perturbationsCount: Object.keys(perturbationsMap).length } });
    }

    return NextResponse.json({ gare: gareName, departures: list });

  }catch(e){
    console.error('GET /api/afficheurs/classiques/departs error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
