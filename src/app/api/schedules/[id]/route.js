import { NextResponse } from 'next/server';
import { query } from '@/js/db';

export async function GET(request, { params }) {
  try {
    // Await params avant d'utiliser ses propriétés (Next.js 15+)
    const { id } = await params;
    const trainNumber = id;

    if (!trainNumber) {
      return NextResponse.json({ error: 'Numéro de train requis' }, { status: 400 });
    }

    // Récupérer les informations du train et ses arrêts
    // Note: 'lines' est un mot réservé MySQL, il faut l'échapper avec des backticks
    // schedules est une vue sur sillons, les colonnes sont ligne_id et stops_json
    const schedules = await query(
      `SELECT 
        s.id,
        s.train_number,
        s.ligne_id,
        s.stops_json,
        l.code as line_code,
        l.name as line_name
       FROM schedules s
       LEFT JOIN \`lines\` l ON s.ligne_id = l.id
       WHERE s.train_number = ?
       LIMIT 1`,
      [trainNumber]
    );

    if (schedules.length === 0) {
      return NextResponse.json({ error: 'Train non trouvé' }, { status: 404 });
    }

    const schedule = schedules[0];
    let stops = [];

    // Parser les arrêts depuis stops_json (JSON)
    if (schedule.stops_json) {
      try {
        const stopsData = typeof schedule.stops_json === 'string'
          ? JSON.parse(schedule.stops_json)
          : schedule.stops_json;

        stops = stopsData.map(stop => ({
          name: stop.station_name || stop.name,
          arrival_time: stop.arrival_time || stop.arrival,
          departure_time: stop.departure_time || stop.departure,
          platform: stop.platform || stop.track,
          lat: stop.lat || stop.latitude,
          lon: stop.lon || stop.longitude
        }));
      } catch (e) {
        console.error('Erreur parsing stops_json:', e);
      }
    }

    // Si pas de coordonnées, essayer de les récupérer depuis la table stations
    if (stops.some(s => !s.lat || !s.lon)) {
      const stationNames = stops.map(s => s.name).filter(Boolean);
      if (stationNames.length > 0) {
        const stations = await query(
          `SELECT name, latitude as lat, longitude as lon 
           FROM stations 
           WHERE name IN (${stationNames.map(() => '?').join(',')})`,
          stationNames
        );

        const stationsMap = new Map(
          stations.map(row => [row.name, { lat: row.lat, lon: row.lon }])
        );

        stops = stops.map(stop => ({
          ...stop,
          lat: stop.lat || stationsMap.get(stop.name)?.lat,
          lon: stop.lon || stationsMap.get(stop.name)?.lon
        }));
      }
    }

    return NextResponse.json({
      train_number: schedule.train_number,
      line_id: schedule.ligne_id,
      line_code: schedule.line_code,
      line_name: schedule.line_name,
      stops: stops
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du train:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
