import { NextResponse } from 'next/server';
import { scheduleQuery } from '@/js/db-schedule';
import { query } from '@/js/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getTrainTypesFromRegionData() {
  try {
    const rows = await query('SELECT data FROM `région_data` WHERE id = 1', []);
    if (!rows?.length) return {};

    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    const types = data.types || [];

    // Créer un mapping type -> logo path
    const typeLogoMap = {};
    types.forEach(type => {
      if (type.slug && type.icon) {
        typeLogoMap[type.slug.toUpperCase()] = type.icon;
      }
    });

    return typeLogoMap;
  } catch (error) {
    console.error('Erreur récupération types trains:', error);
    return {};
  }
}

function parseStopsJson(raw){ if(!raw) return []; try { const arr = typeof raw==='string'? JSON.parse(raw): raw; if(!Array.isArray(arr)) return []; return arr.map(s=>({ station_name: s.station_name||s.station, arrival_time:(s.arrival_time||s.arrival||'')?.slice(0,5)||null, departure_time:(s.departure_time||s.departure||'')?.slice(0,5)||null })); } catch { return []; } }

export async function GET(req){
  try {
    const { searchParams } = new URL(req.url);
    const gareName = (searchParams.get('gare')||'').trim();
    if(!gareName) return NextResponse.json({ error:'Paramètre gare requis' }, { status:400 });

    // Récupérer les logos des types de trains
    const typeLogoMap = await getTrainTypesFromRegionData();

    const now = new Date();
    const nowHM = now.toLocaleTimeString('fr-FR',{hour:'2-digit', minute:'2-digit', hour12:false});
    // Récupère l'id de la gare puis les sillons au départ
    const [st] = await query('SELECT id, name FROM stations WHERE name=? LIMIT 1',[gareName]);
    if(!st) return NextResponse.json({ error:'Gare inconnue' }, { status:404 });

    const rows = await scheduleQuery(`SELECT s.id, s.train_number, s.train_type,
        ds.name AS departure_station, as2.name AS arrival_station,
        DATE_FORMAT(s.departure_time, "%H:%i") AS departure_time,
        DATE_FORMAT(s.arrival_time, "%H:%i") AS arrival_time,
        s.rolling_stock, s.stops_json
      FROM schedules s
      JOIN stations ds  ON ds.id  = s.departure_station_id
      JOIN stations as2 ON as2.id = s.arrival_station_id
      WHERE s.departure_station_id=?
      ORDER BY s.departure_time ASC`, [st.id]);

    // Filtre futurs (>= now) en gardant un wrap si peu de résultats
    const future = rows.filter(r=> r.departure_time >= nowHM);
    const list = (future.length? future : rows).slice(0,10).map(r=>{
      const stops = parseStopsJson(r.stops_json).filter(s=> (s.station_name!==r.departure_station));
      // Trouver voie (non stockée) -> placeholder '1' ou '2' aléatoire stable
      const voie = (parseInt(r.train_number,10)||0)%2? '1':'2';
      const trainType = r.train_type || 'TER';
      const logoPath = typeLogoMap[trainType.toUpperCase()] || '/img/type/ter.svg'; // fallback vers TER

      return {
        id: r.id,
        number: r.train_number,
        type: trainType,
        logo: logoPath,
        departure_time: r.departure_time,
        arrival_station: r.arrival_station,
        stops: stops.map(s=> s.station_name).filter(Boolean),
        voie,
        status: 'A L\'HEURE'
      };
    });
    return NextResponse.json({ gare: gareName, departures: list });
  } catch(e){
    console.error('GET /api/afficheurs/classiques/departs', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}
