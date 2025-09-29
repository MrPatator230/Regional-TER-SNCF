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
              ds.name AS origin_name, as2.name AS dest_name,
              s.departure_station_id AS origin_id, s.arrival_station_id AS dest_id,
              TIME_FORMAT(s.departure_time,'%H:%i') AS schedule_departure_time,
              TIME_FORMAT(s.arrival_time,'%H:%i')   AS schedule_arrival_time
         FROM schedules s
         JOIN stations ds  ON ds.id  = s.departure_station_id
         JOIN stations as2 ON as2.id = s.arrival_station_id
        WHERE s.id = ?
        LIMIT 1`,
      [id]
    );
    if(!headerRows.length) return NextResponse.json({ error:'Sillon introuvable' }, { status:404 });
    const head = headerRows[0];

    // Arrêts + quais (inclut station_id pour correspondance fiable)
    const stopRows = await scheduleQuery(
      `SELECT st.stop_order, st.station_id,
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
      station_id: r.station_id,
      station_name: r.station_name,
      arrival_time: r.arrival_time || null,
      departure_time: r.departure_time || null,
      time: r.departure_time || r.arrival_time || null,
      platform: r.platform || null
    }));

    // --- Récupérer aussi les plateformes définies manuellement dans schedule_platforms pour ce sillon
    // et les fusionner (en priorité par station_id, fallback par nom)
    try {
      const platRows = await scheduleQuery(
        `SELECT sp.station_id, sp.platform, st.name AS station_name
           FROM schedule_platforms sp
           JOIN stations st ON st.id = sp.station_id
          WHERE sp.schedule_id = ?`,
        [id]
      );
      const platById = new Map();
      const platByName = new Map();
      for(const p of platRows){ if(p){ platById.set(Number(p.station_id), p.platform); if(p.station_name) platByName.set(String(p.station_name).trim(), p.platform); } }

      // Fusionner avec les stops existants (priorité id)
      for(const s of stops){
        if(s.platform == null || s.platform === ''){
          const byId = platById.get(Number(s.station_id));
          if(byId !== undefined) { s.platform = byId || null; continue; }
          const byName = platByName.get(String(s.station_name).trim());
          if(byName !== undefined) { s.platform = byName || null; }
        }
      }

      // S'il manque l'origine dans la liste des stops, l'ajouter (avec quai si présent)
      const originPresent = stops.some(s=> Number(s.station_id) === Number(head.origin_id));
      if(!originPresent){
        const originPlatform = platById.get(Number(head.origin_id)) ?? platByName.get(String(head.origin_name).trim()) ?? null;
        stops.unshift({ station_id: head.origin_id, station_name: head.origin_name, arrival_time: null, departure_time: head.schedule_departure_time || null, time: head.schedule_departure_time || null, platform: originPlatform });
      }
      // S'il manque le terminus dans la liste des stops, l'ajouter
      const destPresent = stops.some(s=> Number(s.station_id) === Number(head.dest_id));
      if(!destPresent){
        const destPlatform = platById.get(Number(head.dest_id)) ?? platByName.get(String(head.dest_name).trim()) ?? null;
        stops.push({ station_id: head.dest_id, station_name: head.dest_name, arrival_time: head.schedule_arrival_time || null, departure_time: null, time: head.schedule_arrival_time || null, platform: destPlatform });
      }
    } catch(e){ /* si erreur ici, on ignore pour ne pas casser l'API publique */ console.error('Merge platforms error', e); }

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
