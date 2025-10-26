import { NextResponse } from 'next/server';
import { scheduleQuery } from '@/js/db-schedule';

export async function GET(request, { params }) {
  try {
    // Await params avant d'utiliser ses propriétés (Next.js 15+)
    const { numero } = await params;
    const trainNumber = numero;

    if (!trainNumber) {
      return NextResponse.json({ error: 'Numéro de train requis' }, { status: 400 });
    }

    // Récupérer les paramètres de recherche pour la date
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // Format: YYYY-MM-DD

    // Si une date est fournie, on essaie de récupérer l'horaire spécifique à ce jour
    let targetDate = null;
    let dayOfWeek = null;

    if (dateParam) {
      targetDate = new Date(dateParam);
      if (!isNaN(targetDate.getTime())) {
        dayOfWeek = targetDate.getDay(); // 0 = Dimanche, 1 = Lundi, etc.
      }
    }

    // Récupérer les informations du train et ses arrêts depuis la table sillons
    let sqlQuery = `SELECT 
        s.id,
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
       WHERE s.train_number = ?`;

    const queryParams = [trainNumber];

    sqlQuery += ` LIMIT 10`; // Au cas où il y aurait plusieurs variantes

    const trains = await scheduleQuery(sqlQuery, queryParams);

    if (trains.length === 0) {
      return NextResponse.json({
        error: 'Train non trouvé',
        train_number: trainNumber,
        stops: []
      }, { status: 404 });
    }

    // Si plusieurs variantes et un jour est spécifié, filtrer par days_mask
    let train = trains[0];
    if (trains.length > 1 && dayOfWeek !== null) {
      const matchingTrain = trains.find(t => {
        if (!t.days_mask) return false;
        // days_mask est un bitmap : bit 0 = lundi, bit 6 = dimanche
        // Convertir dayOfWeek (0=dimanche) en index days_mask
        const maskIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        return (t.days_mask & (1 << maskIndex)) !== 0;
      });

      if (matchingTrain) {
        train = matchingTrain;
      }
    }

    let stops = [];

    // Parser les arrêts depuis stops_json (JSON)
    if (train.stops_json) {
      try {
        const stopsData = typeof train.stops_json === 'string'
          ? JSON.parse(train.stops_json)
          : train.stops_json;

        stops = Array.isArray(stopsData) ? stopsData.map(stop => ({
          name: stop.station_name || stop.name || 'Gare inconnue',
          arrival_time: stop.arrival_time || stop.arrival || null,
          departure_time: stop.departure_time || stop.departure || null,
          platform: stop.platform || stop.track || null,
          dwell_minutes: stop.dwell_minutes || null,
          lat: stop.lat || stop.latitude || null,
          lon: stop.lon || stop.longitude || null,
          departed: false // Par défaut, on considère qu'aucun arrêt n'est passé
        })) : [];
      } catch (e) {
        console.error('Erreur parsing stops_json:', e);
        // En cas d'erreur, créer au moins les arrêts de départ et d'arrivée
        stops = [
          {
            name: train.departure_station_name || 'Départ',
            departure_time: train.departure_time,
            arrival_time: null,
            platform: null,
            lat: train.departure_lat || null,
            lon: train.departure_lon || null,
            departed: false
          },
          {
            name: train.arrival_station_name || 'Arrivée',
            arrival_time: train.arrival_time,
            departure_time: null,
            platform: null,
            lat: train.arrival_lat || null,
            lon: train.arrival_lon || null,
            departed: false
          }
        ];
      }
    } else {
      // Si pas de stops_json, créer les arrêts de base
      stops = [
        {
          name: train.departure_station_name || 'Départ',
          departure_time: train.departure_time,
          arrival_time: null,
          platform: null,
          lat: train.departure_lat || null,
          lon: train.departure_lon || null,
          departed: false
        },
        {
          name: train.arrival_station_name || 'Arrivée',
          arrival_time: train.arrival_time,
          departure_time: null,
          platform: null,
          lat: train.arrival_lat || null,
          lon: train.arrival_lon || null,
          departed: false
        }
      ];
    }

    // Si pas de coordonnées GPS, essayer de les récupérer depuis la table stations
    if (stops.length > 0 && stops.some(s => !s.lat || !s.lon)) {
      const stationNames = stops.map(s => s.name).filter(Boolean);
      if (stationNames.length > 0) {
        try {
          const stations = await scheduleQuery(
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
            lat: stop.lat || stationsMap.get(stop.name)?.lat || null,
            lon: stop.lon || stationsMap.get(stop.name)?.lon || null
          }));
        } catch (err) {
          console.error('Erreur récupération coordonnées:', err);
        }
      }
    }

    // Parser days_mask pour l'affichage
    let circulation = null;
    if (train.days_mask !== null && train.days_mask !== undefined) {
      try {
        // days_mask est un bitmap : bit 0 = lundi, bit 6 = dimanche
        const daysNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
        const daysMaskArray = daysNames.map((_, idx) => ((train.days_mask & (1 << idx)) !== 0 ? 1 : 0));

        circulation = {
          mask: daysMaskArray,
          days: daysNames.map((day, idx) => ({
            day,
            active: (train.days_mask & (1 << idx)) !== 0
          })),
          circulates_today: dayOfWeek !== null ? ((train.days_mask & (1 << (dayOfWeek === 0 ? 6 : dayOfWeek - 1))) !== 0) : null
        };
      } catch (e) {
        console.error('Erreur parsing days_mask:', e);
      }
    }

    return NextResponse.json({
      train_number: train.train_number,
      train_type: train.train_type,
      rolling_stock: train.rolling_stock,
      line_id: train.ligne_id,
      line_code: train.line_code,
      line_name: train.line_name,
      line_color: train.line_color,
      departure_station: train.departure_station_name,
      arrival_station: train.arrival_station_name,
      departure_time: train.departure_time,
      arrival_time: train.arrival_time,
      circulation: circulation,
      stops: stops,
      total_variants: trains.length > 1 ? trains.length : null
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du train:', error);
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        message: error.message,
        stops: []
      },
      { status: 500 }
    );
  }
}
