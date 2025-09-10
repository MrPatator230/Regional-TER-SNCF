import { NextResponse } from 'next/server';
import { scheduleQuery } from '@/js/db-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req, ctx){
  try {
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if(!id) return NextResponse.json({ error:'ID invalide' }, { status:400 });

    // En-tête sillon
    const headerRows = await scheduleQuery(
      `SELECT s.id, UPPER(IFNULL(s.train_type,'')) AS train_type, s.train_number,
              ds.name AS origin_name, as2.name AS dest_name
         FROM schedules s
         JOIN stations ds  ON ds.id  = s.departure_station_id
         JOIN stations as2 ON as2.id = s.arrival_station_id
        WHERE s.id = ?
        LIMIT 1`,
      [id]
    );
    if(!headerRows.length) return NextResponse.json({ error:'Sillon introuvable' }, { status:404 });
    const head = headerRows[0];

    // Arrêts + quais
    const stopRows = await scheduleQuery(
      `SELECT st.stop_order,
              DATE_FORMAT(st.arrival_time,'%H:%i')   AS arrival_time,
              DATE_FORMAT(st.departure_time,'%H:%i') AS departure_time,
              stn.name AS station_name,
              sp.platform AS platform
         FROM schedule_stops st
         JOIN stations stn ON stn.id = st.station_id
    LEFT JOIN schedule_platforms sp ON sp.schedule_id = st.schedule_id AND sp.station_id = st.station_id
        WHERE st.schedule_id = ?
     ORDER BY st.stop_order ASC`,
      [id]
    );

    const stops = stopRows.map(r=> ({
      station_name: r.station_name,
      arrival_time: r.arrival_time || null,
      departure_time: r.departure_time || null,
      time: r.departure_time || r.arrival_time || null,
      platform: r.platform || null
    }));

    return NextResponse.json({
      id: head.id,
      train_type: head.train_type,
      train_number: head.train_number || '',
      origin: head.origin_name,
      destination: head.dest_name,
      stops
    });
  } catch(e){
    console.error('GET /api/public/schedules/[id] error', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}
