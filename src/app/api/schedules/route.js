import { NextResponse } from 'next/server';
import { getSessionUser } from '@/app/lib/auth';
import { getSchedulesDb } from '@/js/db-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toMask(selected){
  if(!Array.isArray(selected)) return 0;
  return selected.reduce((m,i)=> m | (1<<Number(i)), 0);
}
function fromMask(mask){
  const out=[]; for(let i=0;i<7;i++){ if(mask & (1<<i)) out.push(i); } return out; // renvoie indices 0..6
}
function normTime(s){ if(!s) return null; const m=String(s).trim().match(/^([0-1]\d|2[0-3]):([0-5]\d)$/); return m? `${m[1]}:${m[2]}`: null; }
function splitDatesStr(s){ if(!s) return []; return String(s).split(',').map(x=> x.trim()).filter(x=> /^\d{4}-\d{2}-\d{2}$/.test(x)); }

async function ensureAdmin(){
  const user = await getSessionUser();
  if(!user) return NextResponse.json({ error:'Non authentifié' }, { status:401 });
  if(user.role!=='admin') return NextResponse.json({ error:'Accès refusé' }, { status:403 });
  return null;
}

async function ensureStationByName(conn, name){
  const n = String(name||'').trim();
  if(!n) throw new Error('Gare invalide');
  const [rows] = await conn.execute('SELECT id FROM stations WHERE name=? LIMIT 1',[n]);
  if(rows.length) return rows[0].id;
  try {
    const [ins] = await conn.execute('INSERT INTO stations(name) VALUES(?)',[n]);
    return ins.insertId;
  } catch(e){
    const [r2] = await conn.execute('SELECT id FROM stations WHERE name=? LIMIT 1',[n]);
    if(r2.length) return r2[0].id;
    throw e;
  }
}

async function ensureLine(conn, ligneId, depName, arrName){
  if(!ligneId) return null;
  const depId = await ensureStationByName(conn, depName);
  const arrId = await ensureStationByName(conn, arrName);
  // Tente de refléter l'id de la ligne de l'appli principale pour conserver le filtrage
  await conn.execute(
    'INSERT INTO `lines` (id, code, depart_station_id, arrivee_station_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE depart_station_id=VALUES(depart_station_id), arrivee_station_id=VALUES(arrivee_station_id), code=VALUES(code)',
    [Number(ligneId), null, depId, arrId]
  );
  return Number(ligneId);
}

function normalizeToDayNums(selected){
  const map = {lun:1,mar:2,mer:3,jeu:4,ven:5,sam:6,dim:7,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6,sun:7};
  const out = [];
  (selected||[]).forEach(v=>{
    if(v == null) return;
    if(typeof v === 'number'){ const n = Number(v); if(Number.isFinite(n)){
      // Accept both server format (1..7) and client UI format (0..6 where 0 = Lundi)
      if(n>=1 && n<=7) out.push(n);
      else if(n>=0 && n<=6) out.push(n + 1); // convert UI 0->1 (Lun), 1->2 (Mar), ..., 6->7 (Dim)
    } return; }
    const s = String(v).trim().toLowerCase();
    if(/^-?\d+$/.test(s)){
      const n=Number(s);
      if(n>=1 && n<=7) out.push(n);
      else if(n>=0 && n<=6) out.push(n + 1);
      return;
    }
    const key = s.slice(0,3); if(map[key]) out.push(map[key]);
  });
  return Array.from(new Set(out)).sort((a,b)=>a-b);
}
function toMaskAndList(selected){ const nums = normalizeToDayNums(selected); let mask=0; nums.forEach(d=>{ if(d>=1 && d<=7) mask |= (1 << (d-1)); }); const list = nums.length ? nums.join(';') : null; return { mask, list }; }

function mapScheduleRow(r){
  // Prefer days_mask_list if present (stocke 1..7)
  let selected = [];
  if(r.days_mask_list){
    try{
      // parse values and normalize to 1..7
      selected = String(r.days_mask_list||'').split(/[;,\s]+/)
        .map(x=>Number(x))
        .map(n=> {
          if(!Number.isFinite(n)) return null;
          if(n >= 1 && n <= 7) return n;       // already 1..7
          if(n >= 0 && n <= 6) return n + 1;   // convert 0..6 -> 1..7
          return null;
        })
        .filter(n=> n !== null);
    }
    catch(e){
      // fallback to mask -> convert indices 0..6 to 1..7
      selected = fromMask(r.days_mask||0).map(n => Number(n) + 1);
    }
  } else {
    // fromMask returns indices 0..6 => convert to 1..7
    selected = fromMask(r.days_mask||0).map(n => Number(n) + 1);
  }
  const days = { selected, holidays: !!r.flag_holidays, sundays: !!r.flag_sundays, custom: !!r.flag_custom };
  return {
    id: r.id,
    ligne_id: r.ligne_id,
    train_number: r.train_number,
    train_type: r.train_type,
    rolling_stock: r.rolling_stock,
    departure_station: r.departure_station,
    arrival_station: r.arrival_station,
    departure_time: r.departure_time?.slice?.(0,5) || r.departure_time,
    arrival_time: r.arrival_time?.slice?.(0,5) || r.arrival_time,
    days,
    // Ajout du mapping de la colonne is_substitution (alias ou nom brut)
    isSubstitution: !!(r.isSubstitution ?? r.is_substitution),
    stops: undefined, // rempli si demandé withStops
  };
}

async function readOne(conn, id, withStops){
  const [rows] = await conn.execute(
    `SELECT s.id, s.ligne_id, s.train_number, s.train_type, s.rolling_stock,
            ds.name AS departure_station, as2.name AS arrival_station,
            TIME_FORMAT(s.departure_time,'%H:%i') AS departure_time,
            TIME_FORMAT(s.arrival_time,'%H:%i') AS arrival_time,
            s.days_mask, s.flag_holidays, s.flag_sundays, s.flag_custom,
            s.is_substitution AS isSubstitution
       FROM schedules s
       JOIN stations ds ON ds.id = s.departure_station_id
       JOIN stations as2 ON as2.id = s.arrival_station_id
      WHERE s.id=?
      LIMIT 1`,
    [id]
  );
  if(!rows.length) return null;
  const base = mapScheduleRow(rows[0]);
  let customDates = [];
  const [inc] = await conn.execute('SELECT `date` FROM schedule_custom_include WHERE schedule_id=? ORDER BY `date` ASC',[id]);
  customDates = inc.map(r=> r.date instanceof Date? r.date.toISOString().slice(0,10) : String(r.date));
  const out = { ...base, custom_dates: customDates };
  if(withStops){
    const [st] = await conn.execute(
      `SELECT st.stop_order, stn.name AS station_name,
              TIME_FORMAT(st.arrival_time,'%H:%i') AS arrival_time,
              TIME_FORMAT(st.departure_time,'%H:%i') AS departure_time
         FROM schedule_stops st
         JOIN stations stn ON stn.id = st.station_id
        WHERE st.schedule_id=?
        ORDER BY st.stop_order ASC`,
      [id]
    );
    out.stops = st.map(r=> ({ station: r.station_name, arrival: r.arrival_time||'', departure: r.departure_time||'' }));
  }
  return out;
}

export async function GET(request){
  const err = await ensureAdmin(); if(err) return err;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const withStops = searchParams.get('withStops')==='1';
  const isSubstitution = searchParams.get('is_substitution');
  const ligneId = searchParams.get('ligne_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const conn = await getSchedulesDb().getConnection();
  try {
    if(id){
      const one = await readOne(conn, Number(id), withStops);
      if(!one) return NextResponse.json({ error:'Introuvable' }, { status:404 });
      return NextResponse.json(one);
    }

    // Construction de la requête avec filtres optionnels
    let query = `SELECT s.id, s.ligne_id, s.train_number, s.train_type, s.rolling_stock,
              ds.name AS departure_station, as2.name AS arrival_station,
              TIME_FORMAT(s.departure_time,'%H:%i') AS departure_time,
              TIME_FORMAT(s.arrival_time,'%H:%i') AS arrival_time,
              s.days_mask, s.flag_holidays, s.flag_sundays, s.flag_custom,
              s.is_substitution AS isSubstitution
         FROM schedules s
         JOIN stations ds ON ds.id = s.departure_station_id
         JOIN stations as2 ON as2.id = s.arrival_station_id`;

    let conditions = [];
    let params = [];

    if(isSubstitution === '1') {
      conditions.push('s.is_substitution = 1');
    }

    if(ligneId) {
      conditions.push('s.ligne_id = ?');
      params.push(Number(ligneId));
    }

    // Ajouter des conditions de période (from/to) si fournies
    // Ces filtres sont simplifiés - un filtrage plus précis nécessiterait
    // une logique additionnelle pour les jours et dates spéciales

    if(conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY s.id DESC';

    const [rows] = await conn.execute(query, params);

    const list = rows.map(r => ({
      ...mapScheduleRow(r),
      isSubstitution: !!r.isSubstitution
    }));

    if(withStops){
      // Charge arrêts pour tous (peut être coûteux)
      const ids = rows.map(r=> r.id);
      if(ids.length){
        const [stops] = await conn.query(
          `SELECT st.schedule_id, st.stop_order, stn.name AS station_name,
                  TIME_FORMAT(st.arrival_time,'%H:%i') AS arrival_time,
                  TIME_FORMAT(st.departure_time,'%H:%i') AS departure_time
             FROM schedule_stops st
             JOIN stations stn ON stn.id = st.station_id
            WHERE st.schedule_id IN (${ids.map(()=>'?').join(',')})
            ORDER BY st.schedule_id ASC, st.stop_order ASC`, ids
        );
        const byId = new Map(); list.forEach(s=> byId.set(s.id, s));
        for(const r of stops){ const s = byId.get(r.schedule_id); if(!s) continue; if(!s.stops) s.stops=[]; s.stops.push({ station:r.station_name, arrival:r.arrival_time||'', departure:r.departure_time||'' }); }
      }
    }
    return NextResponse.json(list);
  } catch(e){
    console.error('GET /api/schedules', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  } finally {
    conn.release();
  }
}

export async function POST(request){
  const err = await ensureAdmin(); if(err) return err;
  const body = await request.json().catch(()=>({}));
  const g = body?.general||{};
  const stops = Array.isArray(body?.stops)? body.stops: [];
  const days = body?.days || { selected:[], holidays:false, sundays:false, custom:false, customDates:'' };
  const depT = normTime(g.departureTime);
  const arrT = normTime(g.arrivalTime);
  if(!g.ligneId || !g.departureStation || !g.arrivalStation || !depT || !arrT){
    return NextResponse.json({ error:'Champs requis manquants' }, { status:400 });
  }
  const conn = await getSchedulesDb().getConnection();
  try {
    await conn.beginTransaction();
    // Evite la troncature JSON dans rebuild_schedule_stops_json (GROUP_CONCAT)
    await conn.execute('SET SESSION group_concat_max_len = 1000000');
    const ligneId = await ensureLine(conn, g.ligneId, g.departureStation, g.arrivalStation);
    const depId = await ensureStationByName(conn, g.departureStation);
    const arrId = await ensureStationByName(conn, g.arrivalStation);

    const daysNormalized = toMaskAndList(days.selected);
    const [ins] = await conn.execute(
      `INSERT INTO schedules(ligne_id, train_number, train_type, rolling_stock,
                              departure_station_id, arrival_station_id,
                              departure_time, arrival_time,
                              days_mask, days_mask_list, flag_holidays, flag_sundays, flag_custom,
                              is_substitution)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [ligneId, g.trainNumber||null, g.trainType||null, body.rollingStock||null,
       depId, arrId, depT, arrT,
       daysNormalized.mask, daysNormalized.list, days.holidays?1:0, days.sundays?1:0, days.custom?1:0,
       body.isSubstitution ? 1 : 0]
    );
    const scheduleId = ins.insertId;

    if(stops.length){
      const values=[]; let order=0;
      for(const st of stops){
        const sid = await ensureStationByName(conn, st.station);
        const a = normTime(st.arrival);
        const d = normTime(st.departure);
        values.push(scheduleId, order++, sid, a, d);
      }
      const placeholders = stops.map(()=> '(?,?,?,?,?)').join(',');
      await conn.execute(
        `INSERT INTO schedule_stops(schedule_id, stop_order, station_id, arrival_time, departure_time)
         VALUES ${placeholders}`,
        values
      );
    }
    // Custom include dates
    await conn.execute('DELETE FROM schedule_custom_include WHERE schedule_id=?',[scheduleId]);
    if(days.custom){
      const dates = splitDatesStr(days.customDates);
      if(dates.length){
        const vals=[]; const ph=[]; for(const d of dates){ ph.push('(?,?)'); vals.push(scheduleId, d); }
        await conn.execute(`INSERT IGNORE INTO schedule_custom_include(schedule_id,\`date\`) VALUES ${ph.join(',')}`, vals);
      }
    }

    await conn.commit();
    const created = await readOne(conn, scheduleId, true);
    return NextResponse.json({ schedule: created }, { status:201 });
  } catch(e){
    try{ await conn.rollback(); }catch{}
    console.error('POST /api/schedules', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  } finally { conn.release(); }
}

export async function PUT(request){
  const err = await ensureAdmin(); if(err) return err;
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id')||0);
  if(!id) return NextResponse.json({ error:'id manquant' }, { status:400 });
  const body = await request.json().catch(()=>({}));
  const g = body?.general||{};
  const stops = Array.isArray(body?.stops)? body.stops: [];
  const days = body?.days || { selected:[], holidays:false, sundays:false, custom:false, customDates:'' };
  const depT = normTime(g.departureTime);
  const arrT = normTime(g.arrivalTime);
  if(!g.ligneId || !g.departureStation || !g.arrivalStation || !depT || !arrT){
    return NextResponse.json({ error:'Champs requis manquants' }, { status:400 });
  }
  const conn = await getSchedulesDb().getConnection();
  try {
    await conn.beginTransaction();
    // Evite la troncature JSON dans rebuild_schedule_stops_json (GROUP_CONCAT)
    await conn.execute('SET SESSION group_concat_max_len = 1000000');
    const ligneId = await ensureLine(conn, g.ligneId, g.departureStation, g.arrivalStation);
    const depId = await ensureStationByName(conn, g.departureStation);
    const arrId = await ensureStationByName(conn, g.arrivalStation);

    const daysNormalized = toMaskAndList(days.selected);
    await conn.execute(
      `UPDATE schedules SET ligne_id=?, train_number=?, train_type=?, rolling_stock=?, departure_station_id=?, arrival_station_id=?, departure_time=?, arrival_time=?, days_mask=?, days_mask_list=?, flag_holidays=?, flag_sundays=?, flag_custom=?, is_substitution=? WHERE id=?`,
      [ligneId, g.trainNumber||null, g.trainType||null, body.rollingStock||null, depId, arrId, depT, arrT, daysNormalized.mask, daysNormalized.list, days.holidays?1:0, days.sundays?1:0, days.custom?1:0, body.isSubstitution ? 1 : 0, id]
    );

    await conn.execute('DELETE FROM schedule_stops WHERE schedule_id=?',[id]);
    if(stops.length){
      const values=[]; let order=0;
      for(const st of stops){
        const sid = await ensureStationByName(conn, st.station);
        const a = normTime(st.arrival);
        const d = normTime(st.departure);
        values.push(id, order++, sid, a, d);
      }
      const placeholders = stops.map(()=> '(?,?,?,?,?)').join(',');
      await conn.execute(
        `INSERT INTO schedule_stops(schedule_id, stop_order, station_id, arrival_time, departure_time)
         VALUES ${placeholders}`,
        values
      );
    }

    await conn.execute('DELETE FROM schedule_custom_include WHERE schedule_id=?',[id]);
    if(days.custom){
      const dates = splitDatesStr(days.customDates);
      if(dates.length){
        const vals=[]; const ph=[]; for(const d of dates){ ph.push('(?,?)'); vals.push(id, d); }
        await conn.execute(`INSERT IGNORE INTO schedule_custom_include(schedule_id,\`date\`) VALUES ${ph.join(',')}`, vals);
      }
    }

    await conn.commit();
    const updated = await readOne(conn, id, true);
    return NextResponse.json({ schedule: updated });
  } catch(e){
    try{ await conn.rollback(); }catch{}
    console.error('PUT /api/schedules', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  } finally { conn.release(); }
}

export async function DELETE(request){
  const err = await ensureAdmin(); if(err) return err;
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id')||0);
  if(!id) return NextResponse.json({ error:'id manquant' }, { status:400 });
  const conn = await getSchedulesDb().getConnection();
  try {
    const [r] = await conn.execute('DELETE FROM schedules WHERE id=?',[id]);
    if(r.affectedRows===0) return NextResponse.json({ error:'Introuvable' }, { status:404 });
    return NextResponse.json({ ok:true });
  } catch(e){
    console.error('DELETE /api/schedules', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  } finally { conn.release(); }
}
