// Service unifié de gestion des sillons (horaires)
// Objectif: centraliser normalisation, validation, mapping DB <-> DTO

import { scheduleQuery, getSchedulesDb } from '@/js/db-schedule';
import { query as mainQuery } from '@/js/db'; // résolution inter-base stations

function normStr(v, max){ if(v==null) return ''; return String(v).trim().slice(0,max); }
function cleanTime(v){ if(!v) return null; const s=String(v).trim(); const m = s.match(/^([0-1]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/); if(!m) return null; return `${m[1]}:${m[2]}:00`; }

// Nouvelle compat: accepter un payload soit { general:{...}, stops:[], days:{...} }
// soit un legacy flat { ligneId, departureStation, arrivalStation, departureTime, arrivalTime, trainNumber, ... }
function extractGeneral(payload){
  if(payload && payload.general) return payload.general;
  if(!payload) return {};
  return {
    ligneId: payload.ligneId ?? payload.ligne_id,
    departureStation: payload.departureStation ?? payload.departure_station,
    arrivalStation: payload.arrivalStation ?? payload.arrival_station,
    departureTime: payload.departureTime ?? payload.departure_time,
    arrivalTime: payload.arrivalTime ?? payload.arrival_time,
    trainNumber: payload.trainNumber ?? payload.train_number,
    trainType: payload.trainType ?? payload.train_type,
    rollingStock: payload.rollingStock ?? payload.rolling_stock
  };
}

export function normalizeStops(raw){ if(!Array.isArray(raw)) return []; return raw.map(r=>({ station: normStr(r.station||r.station_name,190), arrival: (r.arrival||r.arrival_time||'').slice(0,5), departure:(r.departure||r.departure_time||'').slice(0,5) })).filter(s=>s.station); }
export function serializeStops(stops){ return JSON.stringify(stops.map(s=>({ station_name:s.station, arrival_time: s.arrival? cleanTime(s.arrival): null, departure_time: s.departure? cleanTime(s.departure): null }))); }
export function parseStopsJson(raw){
  if(!raw) return [];
  try {
    const data = typeof raw==='string'? JSON.parse(raw): raw;
    if(Array.isArray(data)) {
      // Ancien format : simple tableau
      return data.filter(s=>s && (s.station_name||s.station)).map(s=>({
        station: s.station_name||s.station,
        arrival: (s.arrival_time||s.arrival||'')?.slice(0,5),
        departure:(s.departure_time||s.departure||'')?.slice(0,5)
      }));
    } else if(data && typeof data==='object' && ('Origine' in data || 'Terminus' in data)) {
      // Nouveau format hiérarchique
      const stops = [];
      if(data.Origine) stops.push({
        station: data.Origine.station_name||data.Origine.station,
        arrival: (data.Origine.arrival_time||data.Origine.arrival||'')?.slice(0,5),
        departure: (data.Origine.departure_time||data.Origine.departure||'')?.slice(0,5)
      });
      if(Array.isArray(data.Desservies)) {
        for(const s of data.Desservies) {
          stops.push({
            station: s.station_name||s.station,
            arrival: (s.arrival_time||s.arrival||'')?.slice(0,5),
            departure: (s.departure_time||s.departure||'')?.slice(0,5)
          });
        }
      }
      if(data.Terminus && (!stops.length || (stops[stops.length-1].station !== (data.Terminus.station_name||data.Terminus.station)))) {
        stops.push({
          station: data.Terminus.station_name||data.Terminus.station,
          arrival: (data.Terminus.arrival_time||data.Terminus.arrival||'')?.slice(0,5),
          departure: (data.Terminus.departure_time||data.Terminus.departure||'')?.slice(0,5)
        });
      }
      return stops;
    }
    return [];
  } catch { return []; }
}

export function parseDaysPayload(daysRaw, customRaw){ let daysObj=null; try { daysObj = typeof daysRaw==='string'? JSON.parse(daysRaw): daysRaw; } catch { daysObj=null; }
  const customDates = Array.isArray(customRaw)? customRaw: ( ()=>{ try { return typeof customRaw==='string'? JSON.parse(customRaw): []; } catch { return []; } })();
  return { days: daysObj||{selected:[],holidays:false,sundays:false,custom:false}, customDates };
}

// Nouvelle utils bitmask jours
function dayIndicesToMask(indices){ let m=0; (indices||[]).forEach(i=>{ if(i>=0 && i<7) m |= (1<<i); }); return m; }
function maskToDayIndices(mask){ const out=[]; for(let i=0;i<7;i++){ if(mask & (1<<i)) out.push(i); } return out; }

async function resolveStationsByNames(conn, names){
  if(!names.length) return {}; const unique = Array.from(new Set(names.filter(Boolean)));
  if(!unique.length) return {};
  // 1. Stations déjà présentes dans la base horaires
  const placeholders = unique.map(()=>'?').join(',');
  const [rows] = await conn.execute(`SELECT id,name FROM stations WHERE name IN (${placeholders})`, unique);
  const map = {}; rows.forEach(r=> { map[r.name]=r.id; });
  // 2. Noms manquants -> chercher dans base principale
  const missing = unique.filter(n=> !map[n]);
  if(missing.length){
    const mainPlace = missing.map(()=>'?').join(',');
    const mainRows = await mainQuery(`SELECT id,name FROM stations WHERE name IN (${mainPlace})`, missing);
    if(mainRows.length){
      // 3. Insérer dans horaires avec les mêmes IDs (IGNORE pour collisions)
      const insertValues = mainRows.map(()=> '(?,?)').join(',');
      const insertParams = [];
      mainRows.forEach(r=> { insertParams.push(r.id, r.name); });
      await conn.execute(`INSERT IGNORE INTO stations(id,name) VALUES ${insertValues}`, insertParams);
      // 4. Relire (ou compléter map directement)
      mainRows.forEach(r=> { if(!map[r.name]) map[r.name]=r.id; });
    }
  }
  return map;
}

function buildStopsJsonForProc(stops, nameToId){ return JSON.stringify((stops||[]).map((s)=> ({ station_id: nameToId[s.station]||0, arrival_time: s.arrival||'', departure_time: s.departure||'' }))); }

function buildDaysColumns(days){ const selected = days?.selected||[]; const mask = dayIndicesToMask(selected); return { days_mask: mask, flag_holidays: days?.holidays?1:0, flag_sundays: days?.sundays?1:0, flag_custom: days?.custom?1:0 }; }

function decodeDaysFromRow(row){ if(row.days){ // fallback ancien format JSON
  try { return JSON.parse(row.days); } catch { /* ignore */ }
 }
 return { selected: maskToDayIndices(row.days_mask||0), holidays: !!row.flag_holidays, sundays: !!row.flag_sundays, custom: !!row.flag_custom };
}

function parseCustomDatesJson(raw){ if(!raw) return []; try { return JSON.parse(raw)||[]; } catch { return []; } }

export function scheduleRowToDto(row){ const days = decodeDaysFromRow(row); const customDates = parseCustomDatesJson(row.custom_dates); const stops = parseStopsJson(row.stops_json); return {
  id: row.id,
  ligneId: row.ligne_id,
  ligne_id: row.ligne_id,
  trainNumber: row.train_number||'',
  train_number: row.train_number||'',
  trainType: row.train_type||'',
  train_type: row.train_type||'',
  departureStation: row.departure_station,
  departure_station: row.departure_station,
  arrivalStation: row.arrival_station,
  arrival_station: row.arrival_station,
  departureTime: row.departure_time?.slice(0,5),
  departure_time: row.departure_time?.slice(0,5),
  arrivalTime: row.arrival_time?.slice(0,5),
  arrival_time: row.arrival_time?.slice(0,5),
  rollingStock: row.rolling_stock||'',
  rolling_stock: row.rolling_stock||'',
  days,
  customDates,
  custom_dates: customDates,
  stops
}; }

let _schemaMode = 'new';
async function getSchemaMode(){ return 'new'; }

export async function fetchSchedule(id){
  const rows = await scheduleQuery(`SELECT s.id, s.ligne_id, s.train_number, s.train_type, s.rolling_stock,
      ds.name AS departure_station, as2.name AS arrival_station,
      DATE_FORMAT(s.departure_time,'%H:%i') AS departure_time,
      DATE_FORMAT(s.arrival_time,'%H:%i') AS arrival_time,
      s.days_mask, s.flag_holidays, s.flag_sundays, s.flag_custom,
      (
        SELECT COALESCE(CONCAT('[', GROUP_CONCAT(JSON_QUOTE(DATE_FORMAT(ci.date,'%Y-%m-%d'))), ']'), '[]')
        FROM schedule_custom_include ci WHERE ci.schedule_id=s.id
      ) AS custom_dates,
      s.stops_json AS stops_json
    FROM schedules s
    JOIN stations ds ON ds.id=s.departure_station_id
    JOIN stations as2 ON as2.id=s.arrival_station_id
    WHERE s.id=? LIMIT 1`,[id]);
  if(!rows.length) return null; return scheduleRowToDto(rows[0]);
}

export function validateScheduleInput(input){ const g=extractGeneral(input); const errors=[]; if(!g.ligneId) errors.push('ligneId requis'); if(!g.departureStation) errors.push('departureStation requis'); if(!g.arrivalStation) errors.push('arrivalStation requis'); if(!g.departureTime) errors.push('departureTime requis'); if(!g.arrivalTime) errors.push('arrivalTime requis'); return errors; }

// Helper: synchronisation d'une ligne depuis la base principale vers la base horaires
async function ensureLineSynced(conn, ligneId){ if(!ligneId) return null; const mainLineRows = await mainQuery('SELECT id, depart_station_id, arrivee_station_id, desservies FROM lignes WHERE id=? LIMIT 1',[ligneId]); if(!mainLineRows.length) return { error:'Ligne inconnue' }; const line = mainLineRows[0]; let dess=[]; try { dess = Array.isArray(line.desservies)? line.desservies: JSON.parse(line.desservies||'[]'); } catch { dess=[]; } dess = dess.filter(x=> Number.isFinite(Number(x))).map(x=> Number(x)); const sequenceIds = [line.depart_station_id, ...dess, line.arrivee_station_id].filter((v,i,a)=> a.indexOf(v)===i);
  // Récupération noms des stations sur la ligne dans la base principale
  if(!sequenceIds.length) return { error:'Ligne sans stations' };
  const placeholders = sequenceIds.map(()=>'?').join(',');
  const mainStations = await mainQuery(`SELECT id,name FROM stations WHERE id IN (${placeholders})`, sequenceIds);
  const nameById={}; mainStations.forEach(r=> { nameById[r.id]=r.name; });
  // Insérer toutes les stations manquantes dans la base horaires
  if(mainStations.length){ const values=mainStations.map(()=> '(?,?)').join(','); const params=[]; mainStations.forEach(s=> { params.push(s.id, s.name); }); await conn.execute(`INSERT IGNORE INTO stations(id,name) VALUES ${values}`, params); }
  // Insérer la ligne si absente
  await conn.execute('INSERT IGNORE INTO `lines`(id, depart_station_id, arrivee_station_id) VALUES (?,?,?)',[ line.id, line.depart_station_id, line.arrivee_station_id ]);
  const sequenceNames = sequenceIds.map(id=> nameById[id]).filter(Boolean);
  return { id: line.id, depart_station_id: line.depart_station_id, arrivee_station_id: line.arrivee_station_id, departName: nameById[line.depart_station_id]||'', arriveeName: nameById[line.arrivee_station_id]||'', sequenceIds, sequenceNames, nameById };
}

export async function createSchedule(payload){ const errs=validateScheduleInput(payload); if(errs.length) return { error: errs.join(', ') };
  const conn = await getSchedulesDb().getConnection(); try {
    const g=extractGeneral(payload); const stopsNorm = normalizeStops(payload.stops); const daysObj = payload.days || {selected:[],holidays:false,sundays:false,custom:false}; const customDates = (daysObj.custom ? (daysObj.customDates||daysObj.custom_dates||'').split?.(',').map(s=>s.trim()).filter(Boolean) : []);
    await conn.beginTransaction();
    let syncedLine=null; if(g.ligneId){ syncedLine = await ensureLineSynced(conn, Number(g.ligneId)); if(syncedLine?.error) throw new Error(syncedLine.error); }
    // Cohérence ligne si fournie (accepte gares intermédiaires, impose ordre) – assoupli si gares non trouvées dans la séquence
    if(syncedLine){ const seqLower = syncedLine.sequenceNames.map(n=> n.toLowerCase()); const depLower = g.departureStation?.toLowerCase(); const arrLower = g.arrivalStation?.toLowerCase();
      const depIdx = depLower? seqLower.indexOf(depLower): -1; const arrIdx = arrLower? seqLower.indexOf(arrLower): -1;
      if(depIdx>=0 && arrIdx>=0){
        if(depIdx === arrIdx) throw new Error('Incohérence ligne: départ et arrivée identiques');
        if(depIdx > arrIdx) throw new Error(`Incohérence ligne: ordre invalide ("${g.departureStation}" après "${g.arrivalStation}")`);
        // Canonicaliser casse
        g.departureStation = syncedLine.sequenceNames[depIdx];
        g.arrivalStation = syncedLine.sequenceNames[arrIdx];
      } else {
        // Si l'une des gares n'est pas trouvée dans la ligne officielle, on n'empêche pas l'import
        if(!depLower) g.departureStation = syncedLine.departName;
        if(!arrLower) g.arrivalStation = syncedLine.arriveeName;
      }
    }
    // Résolution stations
    const stationNames = [g.departureStation, g.arrivalStation, ...stopsNorm.map(s=>s.station)].filter(Boolean);
    const nameToId = await resolveStationsByNames(conn, Array.from(new Set(stationNames)));
    const unknown = stationNames.filter(n=> !nameToId[n]); if(unknown.length){ throw new Error('Stations inconnues: '+unknown.join(', ')); }
    const depId = nameToId[g.departureStation]; const arrId = nameToId[g.arrivalStation];
    const daysCols = buildDaysColumns(daysObj);
    const insertSql = `INSERT INTO schedules (ligne_id, train_number, train_type, rolling_stock, departure_station_id, arrival_station_id, departure_time, arrival_time, days_mask, flag_holidays, flag_sundays, flag_custom)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
    const params=[ g.ligneId? Number(g.ligneId): null, g.trainNumber||null, g.trainType||null, g.rollingStock||payload.rollingStock||null, depId, arrId, cleanTime(g.departureTime), cleanTime(g.arrivalTime), daysCols.days_mask, daysCols.flag_holidays, daysCols.flag_sundays, (customDates.length?1:daysCols.flag_custom) ];
    const [r] = await conn.execute(insertSql, params); const newId=r.insertId;
    if(customDates.length){ const values = customDates.map(d=> '(?,?)').join(','); const vals=[]; customDates.forEach(d=> vals.push(newId, d)); await conn.execute(`INSERT INTO schedule_custom_include (schedule_id,date) VALUES ${values}`, vals); }
    if(stopsNorm.length){
      const stopsJson = buildStopsJsonForProc(stopsNorm, nameToId);
      // Eviter troncature JSON dans rebuild (GROUP_CONCAT)
      await conn.query('SET SESSION group_concat_max_len = 1000000');
      await conn.query('CALL set_schedule_stops(?, ?)', [newId, stopsJson]);
    }
    await conn.commit();
    const sched = await fetchSchedule(newId); return { schedule: sched };
  } catch(e){ try { await conn.rollback(); } catch{} return { error: e.message }; } finally { conn.release(); }
}

export async function updateSchedule(id, payload){ const errs=validateScheduleInput(payload); if(errs.length) return { error: errs.join(', ') };
  const conn = await getSchedulesDb().getConnection(); try {
    const g=extractGeneral(payload); const stopsNorm = normalizeStops(payload.stops); const daysObj = payload.days || {selected:[],holidays:false,sundays:false,custom:false}; const customDates = (daysObj.custom ? (daysObj.customDates||daysObj.custom_dates||'').split?.(',').map(s=>s.trim()).filter(Boolean) : []);
    await conn.beginTransaction();
    let syncedLine=null; if(g.ligneId){ syncedLine = await ensureLineSynced(conn, Number(g.ligneId)); if(syncedLine?.error) throw new Error(syncedLine.error); }
    if(syncedLine){ const seqLower = syncedLine.sequenceNames.map(n=> n.toLowerCase()); const depLower = g.departureStation?.toLowerCase(); const arrLower = g.arrivalStation?.toLowerCase();
      const depIdx = depLower? seqLower.indexOf(depLower): -1; const arrIdx = arrLower? seqLower.indexOf(arrLower): -1;
      if(depIdx>=0 && arrIdx>=0){
        if(depIdx === arrIdx) throw new Error('Incohérence ligne: départ et arrivée identiques');
        if(depIdx > arrIdx) throw new Error(`Incohérence ligne: ordre invalide ("${g.departureStation}" après "${g.arrivalStation}")`);
        g.departureStation = syncedLine.sequenceNames[depIdx];
        g.arrivalStation = syncedLine.sequenceNames[arrIdx];
      } else {
        if(!depLower) g.departureStation = syncedLine.departName;
        if(!arrLower) g.arrivalStation = syncedLine.arriveeName;
      }
    }
    const stationNames = [g.departureStation, g.arrivalStation, ...stopsNorm.map(s=>s.station)].filter(Boolean);
    const nameToId = await resolveStationsByNames(conn, Array.from(new Set(stationNames)));
    const unknown = stationNames.filter(n=> !nameToId[n]); if(unknown.length){ throw new Error('Stations inconnues: '+unknown.join(', ')); }
    const depId = nameToId[g.departureStation]; const arrId = nameToId[g.arrivalStation];
    const daysCols = buildDaysColumns(daysObj);
    const updSql = `UPDATE schedules SET ligne_id=?, train_number=?, train_type=?, rolling_stock=?, departure_station_id=?, arrival_station_id=?, departure_time=?, arrival_time=?, days_mask=?, flag_holidays=?, flag_sundays=?, flag_custom=? WHERE id=?`;
    const params=[ g.ligneId? Number(g.ligneId): null, g.trainNumber||null, g.trainType||null, g.rollingStock||payload.rollingStock||null, depId, arrId, cleanTime(g.departureTime), cleanTime(g.arrivalTime), daysCols.days_mask, daysCols.flag_holidays, daysCols.flag_sundays, (customDates.length?1:daysCols.flag_custom), id ];
    const [r] = await conn.execute(updSql, params); if(!r.affectedRows) throw new Error('Aucune ligne mise à jour');
    await conn.execute('DELETE FROM schedule_custom_include WHERE schedule_id=?',[id]);
    if(customDates.length){ const values=customDates.map(()=> '(?,?)').join(','); const vals=[]; customDates.forEach(d=> vals.push(id,d)); await conn.execute(`INSERT INTO schedule_custom_include (schedule_id,date) VALUES ${values}`, vals); }
    await conn.query('SET SESSION group_concat_max_len = 1000000');
    await conn.query('CALL set_schedule_stops(?, ?)', [id, buildStopsJsonForProc(stopsNorm, nameToId)]);
    await conn.commit();
    const sched = await fetchSchedule(id); return { schedule: sched };
  } catch(e){ try { await conn.rollback(); } catch{} return { error: e.message }; } finally { conn.release(); }
}

export async function listSchedules(includeStops=false, ligneId=null){
  let sql=`SELECT s.id, s.ligne_id, s.train_number, s.train_type, s.rolling_stock,
      ds.name AS departure_station, as2.name AS arrival_station,
      DATE_FORMAT(s.departure_time,'%H:%i') AS departure_time,
      DATE_FORMAT(s.arrival_time,'%H:%i') AS arrival_time,
      s.days_mask, s.flag_holidays, s.flag_sundays, s.flag_custom,
      (
        SELECT COALESCE(CONCAT('[', GROUP_CONCAT(JSON_QUOTE(DATE_FORMAT(ci.date,'%Y-%m-%d'))), ']'), '[]')
        FROM schedule_custom_include ci WHERE ci.schedule_id=s.id
      ) AS custom_dates,
      s.stops_json AS stops_json
    FROM schedules s
    JOIN stations ds ON ds.id=s.departure_station_id
    JOIN stations as2 ON as2.id=s.arrival_station_id`;
  const params=[]; if(ligneId){ sql+=' WHERE s.ligne_id=?'; params.push(ligneId); } sql+=' ORDER BY s.departure_time';
  const rows = await scheduleQuery(sql,params);
  return rows.map(r=>{
    if(!includeStops){ // Optionnel: éviter parsing arrêts pour liste
      const dto = scheduleRowToDto({...r, stops_json:'[]'}); // on vide stops
      return { ...dto, stops: [] };
    }
    return scheduleRowToDto(r);
  });
}
