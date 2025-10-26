import { NextResponse } from 'next/server';
import { scheduleQuery } from '@/js/db-schedule';

export async function GET(request, { params }) {
  try {
    const { numero } = await params;
    const trainNumber = numero;

    if (!trainNumber) {
      return NextResponse.json({ error: 'Numéro de train requis' }, { status: 400 });
    }

    // Récupérer les paramètres de recherche pour la date
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // Format: YYYY-MM-DD

    // Construire la requête pour trouver le sillon correspondant
    let sqlQuery = `
      SELECT 
        s.id as sillon_id,
        s.train_number,
        s.train_type,
        s.rolling_stock,
        s.ligne_id,
        s.departure_station_id,
        s.arrival_station_id,
        s.departure_time,
        s.arrival_time,
        s.stops_json,
        s.days_mask,
        s.days_mask_list,
        l.code as line_code,
        l.name as line_name,
        l.color as line_color,
        dep.name as departure_station_name,
        dep.latitude as departure_lat,
        dep.longitude as departure_lon,
        arr.name as arrival_station_name,
        arr.latitude as arrival_lat,
        arr.longitude as arrival_lon
      FROM sillons s
      LEFT JOIN \`lines\` l ON s.ligne_id = l.id
      LEFT JOIN stations dep ON s.departure_station_id = dep.id
      LEFT JOIN stations arr ON s.arrival_station_id = arr.id
      WHERE s.train_number = ?
    `;

    const queryParams = [trainNumber];

    sqlQuery += ` LIMIT 10`; // Au cas où il y aurait plusieurs variantes

    const sillons = await scheduleQuery(sqlQuery, queryParams);

    if (sillons.length === 0) {
      return NextResponse.json({
        error: 'Sillon non trouvé pour ce numéro de train',
        train_number: trainNumber
      }, { status: 404 });
    }

    // Si une date est fournie, filtrer par jour de semaine
    let targetSillon = sillons[0];
    if (dateParam && sillons.length > 1) {
      const targetDate = new Date(dateParam);
      if (!isNaN(targetDate.getTime())) {
        const dayOfWeek = targetDate.getDay(); // 0 = Dimanche, 1 = Lundi, etc.

        // Filtrer par days_mask si disponible
        const matchingSillon = sillons.find(s => {
          if (!s.days_mask) return false;
          // days_mask est un bitmap : bit 0 = lundi, bit 6 = dimanche
          // Convertir dayOfWeek (0=dimanche) en index days_mask
          const maskIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          return (s.days_mask & (1 << maskIndex)) !== 0;
        });

        if (matchingSillon) {
          targetSillon = matchingSillon;
        }
      }
    }

    // Parser les arrêts depuis stops_json
    let stops = [];
    if (targetSillon.stops_json) {
      try {
        const stopsData = typeof targetSillon.stops_json === 'string'
          ? JSON.parse(targetSillon.stops_json)
          : targetSillon.stops_json;

        stops = Array.isArray(stopsData) ? stopsData.map(stop => ({
          name: stop.station_name || stop.name || 'Gare inconnue',
          arrival_time: stop.arrival_time || stop.arrival || null,
          departure_time: stop.departure_time || stop.departure || null,
          platform: stop.platform || stop.track || null,
          dwell_minutes: stop.dwell_minutes || null
        })) : [];
      } catch (e) {
        console.error('Erreur parsing stops_json:', e);
      }
    }

    // Si pas d'arrêts, créer au moins le départ et l'arrivée
    if (stops.length === 0) {
      stops = [
        {
          name: targetSillon.departure_station_name || 'Départ',
          departure_time: targetSillon.departure_time,
          arrival_time: null
        },
        {
          name: targetSillon.arrival_station_name || 'Arrivée',
          arrival_time: targetSillon.arrival_time,
          departure_time: null
        }
      ];
    }

    return NextResponse.json({
      sillon_id: targetSillon.sillon_id,
      train_number: targetSillon.train_number,
      train_type: targetSillon.train_type,
      rolling_stock: targetSillon.rolling_stock,
      line_id: targetSillon.ligne_id,
      line_code: targetSillon.line_code,
      line_name: targetSillon.line_name,
      line_color: targetSillon.line_color,
      departure_station: targetSillon.departure_station_name,
      arrival_station: targetSillon.arrival_station_name,
      departure_time: targetSillon.departure_time,
      arrival_time: targetSillon.arrival_time,
      stops: stops,
      total_variants: sillons.length > 1 ? sillons.length : null
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du sillon:', error);
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        message: error.message
      },
      { status: 500 }
    );
  }
}

