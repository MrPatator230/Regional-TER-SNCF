// filepath: /Users/mgrillot/Documents/développement WEB/sncf/src/app/api/schedules/daily-perturbations/route.js
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/app/lib/auth';
import { getSchedulesDb } from '@/js/db-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isIsoDate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(String(s||'')); }

async function ensureAdmin(){
  const user = await getSessionUser();
  if(!user) return NextResponse.json({ error:'Non authentifié' }, { status:401 });
  if(user.role!=="admin") return NextResponse.json({ error:'Accès refusé' }, { status:403 });
  return null;
}

export async function GET(request){
  const err = await ensureAdmin(); if(err) return err;
  try {
    const { searchParams } = new URL(request.url);
    const date = (searchParams.get('date')||'').trim();
    const from = (searchParams.get('from')||'').trim();
    const to = (searchParams.get('to')||'').trim();

    let fromDate, toDate;
    if(isIsoDate(date)){
      fromDate = date; toDate = date;
    } else if(isIsoDate(from) && isIsoDate(to)){
      fromDate = from; toDate = to;
    } else {
      // défaut: aujourd'hui en Europe/Paris
      const fmt = new Intl.DateTimeFormat('en-CA',{ timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'});
      const today = fmt.format(new Date());
      fromDate = today; toDate = today;
    }

    const conn = await getSchedulesDb().getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT v.id, v.schedule_id,
                DATE_FORMAT(v.date, '%Y-%m-%d') AS date, v.type,
                v.delay_minutes, v.delay_from_station_id, dfs.name AS delay_from_station,
                v.cause,
                v.mod_departure_station_id, mds.name AS mod_departure_station,
                v.mod_arrival_station_id, mas.name AS mod_arrival_station,
                TIME_FORMAT(v.mod_departure_time,'%H:%i') AS mod_departure_time,
                TIME_FORMAT(v.mod_arrival_time,'%H:%i') AS mod_arrival_time,
                v.removed_stops,
                DATE_FORMAT(v.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
                s.train_number, s.train_type, s.rolling_stock,
                ds.name AS departure_station, as2.name AS arrival_station,
                TIME_FORMAT(s.departure_time,'%H:%i') AS departure_time,
                TIME_FORMAT(s.arrival_time,'%H:%i') AS arrival_time
           FROM schedule_daily_variants v
           JOIN sillons s ON s.id=v.schedule_id
           JOIN stations ds ON ds.id=s.departure_station_id
           JOIN stations as2 ON as2.id=s.arrival_station_id
           LEFT JOIN stations dfs ON dfs.id=v.delay_from_station_id
           LEFT JOIN stations mds ON mds.id=v.mod_departure_station_id
           LEFT JOIN stations mas ON mas.id=v.mod_arrival_station_id
          WHERE v.date BETWEEN ? AND ?
          ORDER BY v.updated_at DESC, v.date DESC, v.id DESC`,
        [fromDate, toDate]
      );

      // Normalisation JSON removed_stops
      const items = rows.map(r=> ({
        id: r.id,
        schedule_id: r.schedule_id,
        date: r.date,
        type: r.type,
        delay_minutes: r.delay_minutes,
        delay_from_station: r.delay_from_station || null,
        cause: r.cause || null,
        mod_departure_station: r.mod_departure_station || null,
        mod_arrival_station: r.mod_arrival_station || null,
        mod_departure_time: r.mod_departure_time || null,
        mod_arrival_time: r.mod_arrival_time || null,
        removed_stops: (()=>{ try{ return r.removed_stops? JSON.parse(r.removed_stops): []; }catch{ return []; } })(),
        updated_at: r.updated_at,
        schedule: {
          train_number: r.train_number,
          train_type: r.train_type,
          rolling_stock: r.rolling_stock,
          departure_station: r.departure_station,
          arrival_station: r.arrival_station,
          departure_time: r.departure_time,
          arrival_time: r.arrival_time
        }
      }));

      return NextResponse.json({ items, from: fromDate, to: toDate });
    } finally {
      conn.release();
    }
  } catch(e){
    console.error('GET /api/schedules/daily-perturbations', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}
