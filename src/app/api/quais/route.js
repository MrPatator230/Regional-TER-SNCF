// API admin: Attribution des quais (base "horaires")
// GET /api/quais?stationId=... | stationName=...
// POST /api/quais  { scheduleId, stationId|stationName, platform }
// DELETE /api/quais?id=<scheduleId>&stationId=... | stationName=...

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/app/lib/auth';
import { getSchedulesDb } from '@/js/db-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ensureAdmin(){
  const user = await getSessionUser();
  if(!user) return NextResponse.json({ error:'Non authentifié' }, { status:401 });
  if(user.role!=="admin") return NextResponse.json({ error:'Accès refusé' }, { status:403 });
  return null;
}

async function resolveStationId(conn, { stationId, stationName }){
  if(stationId){
    const id = Number(stationId);
    if(Number.isFinite(id) && id>0) return id;
  }
  if(stationName){
    const name = String(stationName||'').trim();
    if(!name) return null;
    const [rows] = await conn.execute('SELECT id FROM stations WHERE name=? LIMIT 1',[name]);
    if(rows.length) return rows[0].id;
    return null;
  }
  return null;
}

export async function GET(request){
  const err = await ensureAdmin(); if(err) return err;
  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get('stationId');
  const stationName = searchParams.get('stationName');
  const limit = Math.min(Number(searchParams.get('limit')||500), 2000);
  const conn = await getSchedulesDb().getConnection();
  try {
    // Résolution station
    let stId = await resolveStationId(conn, { stationId, stationName });
    let stationInfo = null;
    if(stId){
      const [st] = await conn.execute('SELECT id,name FROM stations WHERE id=? LIMIT 1',[stId]);
      if(st.length) stationInfo = st[0];
    } else if(stationName){
      stationInfo = { id: null, name: stationName };
    }
    if(!stationInfo){
      return NextResponse.json({ station:null, items: [] });
    }

    const sql = `
      SELECT * FROM (
        SELECT s.id, s.train_number,
               TIME_FORMAT(s.departure_time,'%H:%i') AS schedule_departure_time,
               TIME_FORMAT(s.arrival_time,'%H:%i')   AS schedule_arrival_time,
               ds.name AS departure_station,
               as2.name AS arrival_station,
               st.stop_order,
               TIME_FORMAT(st.arrival_time,'%H:%i')   AS stop_arrival_time,
               TIME_FORMAT(st.departure_time,'%H:%i') AS stop_departure_time,
               mx.max_order,
               r.route_str,
               sp.platform
          FROM schedules s
          JOIN schedule_stops st ON st.schedule_id = s.id
          JOIN stations si ON si.id = st.station_id
          JOIN stations ds ON ds.id = s.departure_station_id
          JOIN stations as2 ON as2.id = s.arrival_station_id
     LEFT JOIN (
               SELECT schedule_id, MAX(stop_order) AS max_order
                 FROM schedule_stops
             GROUP BY schedule_id
              ) mx ON mx.schedule_id = s.id
     LEFT JOIN (
               SELECT ss.schedule_id, GROUP_CONCAT(sn.name ORDER BY ss.stop_order SEPARATOR ' • ') AS route_str
                 FROM schedule_stops ss
                 JOIN stations sn ON sn.id = ss.station_id
             GROUP BY ss.schedule_id
              ) r ON r.schedule_id = s.id
     LEFT JOIN schedule_platforms sp ON sp.schedule_id = s.id AND sp.station_id = st.station_id
         WHERE st.station_id = ?
        UNION ALL
        -- Branche ORIGINE: inclure le sillon si la gare est l’origine mais absente de schedule_stops
        SELECT s.id, s.train_number,
               TIME_FORMAT(s.departure_time,'%H:%i') AS schedule_departure_time,
               TIME_FORMAT(s.arrival_time,'%H:%i')   AS schedule_arrival_time,
               ds.name AS departure_station,
               as2.name AS arrival_station,
               0 AS stop_order,
               NULL AS stop_arrival_time,
               TIME_FORMAT(s.departure_time,'%H:%i') AS stop_departure_time,
               mx.max_order,
               r.route_str,
               sp.platform
          FROM schedules s
          JOIN stations ds ON ds.id = s.departure_station_id
          JOIN stations as2 ON as2.id = s.arrival_station_id
     LEFT JOIN (
               SELECT schedule_id, MAX(stop_order) AS max_order
                 FROM schedule_stops
             GROUP BY schedule_id
              ) mx ON mx.schedule_id = s.id
     LEFT JOIN (
               SELECT ss.schedule_id, GROUP_CONCAT(sn.name ORDER BY ss.stop_order SEPARATOR ' • ') AS route_str
                 FROM schedule_stops ss
                 JOIN stations sn ON sn.id = ss.station_id
             GROUP BY ss.schedule_id
              ) r ON r.schedule_id = s.id
     LEFT JOIN schedule_platforms sp ON sp.schedule_id = s.id AND sp.station_id = s.departure_station_id
         WHERE s.departure_station_id = ?
           AND NOT EXISTS (
                 SELECT 1 FROM schedule_stops ss
                  WHERE ss.schedule_id = s.id AND ss.station_id = s.departure_station_id
               )
        UNION ALL
        -- Branche TERMINUS: inclure le sillon si la gare est le terminus mais absente de schedule_stops
        SELECT s.id, s.train_number,
               TIME_FORMAT(s.departure_time,'%H:%i') AS schedule_departure_time,
               TIME_FORMAT(s.arrival_time,'%H:%i')   AS schedule_arrival_time,
               ds.name AS departure_station,
               as2.name AS arrival_station,
               COALESCE(mx.max_order, 0) AS stop_order,
               TIME_FORMAT(s.arrival_time,'%H:%i') AS stop_arrival_time,
               NULL AS stop_departure_time,
               mx.max_order,
               r.route_str,
               sp.platform
          FROM schedules s
          JOIN stations ds ON ds.id = s.departure_station_id
          JOIN stations as2 ON as2.id = s.arrival_station_id
     LEFT JOIN (
               SELECT schedule_id, MAX(stop_order) AS max_order
                 FROM schedule_stops
             GROUP BY schedule_id
              ) mx ON mx.schedule_id = s.id
     LEFT JOIN (
               SELECT ss.schedule_id, GROUP_CONCAT(sn.name ORDER BY ss.stop_order SEPARATOR ' • ') AS route_str
                 FROM schedule_stops ss
                 JOIN stations sn ON sn.id = ss.station_id
             GROUP BY ss.schedule_id
              ) r ON r.schedule_id = s.id
     LEFT JOIN schedule_platforms sp ON sp.schedule_id = s.id AND sp.station_id = s.arrival_station_id
         WHERE s.arrival_station_id = ?
           AND NOT EXISTS (
                 SELECT 1 FROM schedule_stops ss
                  WHERE ss.schedule_id = s.id AND ss.station_id = s.arrival_station_id
               )
      ) t
      ORDER BY t.schedule_departure_time ASC, t.id ASC
      LIMIT ${limit}`;
    const [rows] = await conn.execute(sql, [stationInfo.id, stationInfo.id, stationInfo.id]);
    const items = rows.map(r=> ({
      schedule_id: r.id,
      train_number: r.train_number,
      relation: `${r.departure_station} ➜ ${r.arrival_station}`,
      schedule_departure_time: r.schedule_departure_time,
      schedule_arrival_time: r.schedule_arrival_time,
      stop_order: r.stop_order,
      max_order: r.max_order,
      stop_arrival_time: r.stop_arrival_time||'',
      stop_departure_time: r.stop_departure_time||'',
      route: r.route_str||'',
      platform: r.platform||''
    }));
    return NextResponse.json({ station: stationInfo, items });
  } catch(e){
    console.error('GET /api/quais', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  } finally { conn.release(); }
}

export async function POST(request){
  const err = await ensureAdmin(); if(err) return err;
  const body = await request.json().catch(()=>({}));
  const scheduleId = Number(body?.scheduleId||0);
  const platform = String(body?.platform||'').trim();
  const stationId = body?.stationId;
  const stationName = body?.stationName;
  if(!scheduleId) return NextResponse.json({ error:'scheduleId requis' }, { status:400 });
  const conn = await getSchedulesDb().getConnection();
  try {
    const stId = await resolveStationId(conn, { stationId, stationName });
    if(!stId) return NextResponse.json({ error:'station invalide' }, { status:400 });

    // Vérifie que le sillon dessert cette gare (arrêt) OU qu'il s'agit de l'origine/terminus
    const [chk] = await conn.execute(
      `SELECT 1 FROM schedules s
        WHERE s.id = ? AND (
              EXISTS(SELECT 1 FROM schedule_stops ss WHERE ss.schedule_id = s.id AND ss.station_id = ?)
           OR s.departure_station_id = ?
           OR s.arrival_station_id   = ?
        ) LIMIT 1`,
      [scheduleId, stId, stId, stId]
    );
    if(!chk.length) return NextResponse.json({ error:'Le sillon ne dessert pas cette gare' }, { status:400 });

    if(!platform){
      // plateforme vide => suppression
      const [res] = await conn.execute('DELETE FROM schedule_platforms WHERE schedule_id=? AND station_id=?',[scheduleId, stId]);
      return NextResponse.json({ ok:true, deleted: res.affectedRows>0 });
    }
    await conn.execute(
      `INSERT INTO schedule_platforms(schedule_id, station_id, platform)
       VALUES(?,?,?)
       ON DUPLICATE KEY UPDATE platform=VALUES(platform), updated_at=CURRENT_TIMESTAMP`,
      [scheduleId, stId, platform]
    );
    return NextResponse.json({ ok:true });
  } catch(e){
    console.error('POST /api/quais', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  } finally { conn.release(); }
}

export async function DELETE(request){
  const err = await ensureAdmin(); if(err) return err;
  const { searchParams } = new URL(request.url);
  const scheduleId = Number(searchParams.get('id')||0);
  const stationId = searchParams.get('stationId');
  const stationName = searchParams.get('stationName');
  if(!scheduleId) return NextResponse.json({ error:'id requis' }, { status:400 });
  const conn = await getSchedulesDb().getConnection();
  try {
    const stId = await resolveStationId(conn, { stationId, stationName });
    if(!stId) return NextResponse.json({ error:'station invalide' }, { status:400 });

    // Vérifie que le sillon dessert cette gare (arrêt) OU qu'il s'agit de l'origine/terminus
    const [chk] = await conn.execute(
      `SELECT 1 FROM schedules s
        WHERE s.id = ? AND (
              EXISTS(SELECT 1 FROM schedule_stops ss WHERE ss.schedule_id = s.id AND ss.station_id = ?)
           OR s.departure_station_id = ?
           OR s.arrival_station_id   = ?
        ) LIMIT 1`,
      [scheduleId, stId, stId, stId]
    );
    if(!chk.length) return NextResponse.json({ error:'Le sillon ne dessert pas cette gare' }, { status:400 });

    const [res] = await conn.execute('DELETE FROM schedule_platforms WHERE schedule_id=? AND station_id=?',[scheduleId, stId]);
    if(res.affectedRows===0) return NextResponse.json({ error:'Introuvable' }, { status:404 });
    return NextResponse.json({ ok:true });
  } catch(e){
    console.error('DELETE /api/quais', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  } finally { conn.release(); }
}
