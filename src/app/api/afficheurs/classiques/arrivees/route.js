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

function parseStopsJson(raw){
  if(!raw) return [];
  try {
    const data = typeof raw==='string'? JSON.parse(raw): raw;
    if(Array.isArray(data)) {
      // Ancien format : simple tableau
      return data.map(s=>({
        station_name: s.station_name||s.station,
        arrival_time:(s.arrival_time||s.arrival||'')?.slice(0,5)||null,
        departure_time:(s.departure_time||s.departure||'')?.slice(0,5)||null
      }));
    } else if(data && typeof data==='object' && ('Origine' in data || 'Terminus' in data)) {
      // Nouveau format hiérarchique
      const stops = [];
      if(data.Origine) stops.push({
        station_name: data.Origine.station_name||data.Origine.station,
        arrival_time: (data.Origine.arrival_time||data.Origine.arrival||'')?.slice(0,5)||null,
        departure_time: (data.Origine.departure_time||data.Origine.departure||'')?.slice(0,5)||null
      });
      if(Array.isArray(data.Desservies)) {
        for(const s of data.Desservies) {
          stops.push({
            station_name: s.station_name||s.station,
            arrival_time:(s.arrival_time||s.arrival||'')?.slice(0,5)||null,
            departure_time:(s.departure_time||s.departure||'')?.slice(0,5)||null
          });
        }
      }
      if(data.Terminus && (!stops.length || (stops[stops.length-1].station_name !== (data.Terminus.station_name||data.Terminus.station)))) {
        stops.push({
          station_name: data.Terminus.station_name||data.Terminus.station,
          arrival_time: (data.Terminus.arrival_time||data.Terminus.arrival||'')?.slice(0,5)||null,
          departure_time: (data.Terminus.departure_time||data.Terminus.departure||'')?.slice(0,5)||null
        });
      }
      return stops;
    }
    return [];
  } catch { return []; }
}

export async function GET(req){
  try {
    const { searchParams } = new URL(req.url);
    const gareName = (searchParams.get('gare')||'').trim();
    if(!gareName) return NextResponse.json({ error:'Paramètre gare requis' }, { status:400 });

    const typeLogoMap = await getTrainTypesFromRegionData();

    const now = new Date();
    const nowHM = now.toLocaleTimeString('fr-FR',{hour:'2-digit', minute:'2-digit', hour12:false});
    const [st] = await query('SELECT id, name FROM stations WHERE name=? LIMIT 1',[gareName]);
    if(!st) return NextResponse.json({ error:'Gare inconnue' }, { status:404 });

    // Nouvelle requête : inclure aussi les sillons où la gare est desservie
    const likeParam = `"${st.name}"`;
    const rows = await scheduleQuery(`SELECT s.id, s.train_number, s.train_type,
        ds.name AS departure_station, as2.name AS arrival_station,
        DATE_FORMAT(s.departure_time, "%H:%i") AS departure_time,
        DATE_FORMAT(s.arrival_time, "%H:%i") AS arrival_time,
        s.rolling_stock, s.stops_json
      FROM schedules s
      JOIN stations ds  ON ds.id  = s.departure_station_id
      JOIN stations as2 ON as2.id = s.arrival_station_id
      WHERE (s.arrival_station_id=? OR s.stops_json LIKE ?)
      ORDER BY s.arrival_time ASC`, [st.id, `%${likeParam}%`]);

    const scheduleIds = (rows || []).map(r => r.id).filter(Boolean);
    const assignedMap = {};
    if(scheduleIds.length){
      try{
        const origin = new URL(req.url).origin;
        const url = `${origin}/api/quais?stationName=${encodeURIComponent(st.name)}&limit=2000`;
        const r = await fetch(url, { cache: 'no-store' });
        const j = await r.json().catch(()=>null);
        if(r.ok && j && Array.isArray(j.items)){
          j.items.forEach(it => { if(it && it.schedule_id) assignedMap[it.schedule_id] = it.platform ?? ''; });
        }
      }catch(_){ /* ignore */ }

      // Amélioration de la logique de récupération des quais assignés pour les arrivées
      if(Object.keys(assignedMap).length === 0){
        try{
          const placeholders = scheduleIds.map(()=>'?').join(',');
          const [platRows] = await scheduleQuery(`SELECT schedule_id, platform FROM schedule_platforms WHERE station_id = ? AND schedule_id IN (${placeholders})`, [st.id, ...scheduleIds]);
          if(Array.isArray(platRows)){
            platRows.forEach(pr => {
              assignedMap[pr.schedule_id] = pr.platform || null;
            });
          }
        }catch(e){
          console.warn('Erreur récupération quais assignés pour arrivées:', e);
        }
      }
    }

    const list = rows.map(r => {
      const stops = parseStopsJson(r.stops_json);
      let horaire_afficheur = null;
      if (r.arrival_station === st.name) {
        // Terminus
        horaire_afficheur = r.arrival_time;
      } else if (r.departure_station === st.name) {
        // Origine
        horaire_afficheur = r.departure_time;
      } else {
        // Desservie
        const stop = stops.find(s => s.station_name === st.name);
        horaire_afficheur = stop?.arrival_time || stop?.departure_time || null;
      }

      // Logique améliorée pour l'attribution des quais dans les arrivées
      const adminPlatform = assignedMap[r.id];

      // Nouvelle logique : respecter strictement les attributions administratives
      let platformToShow = null;
      if (adminPlatform !== undefined) {
        // Si une attribution existe (même vide), la respecter
        platformToShow = adminPlatform && String(adminPlatform).trim() !== '' ? String(adminPlatform) : null;
      } else {
        // Si aucune attribution admin, ne pas inventer de quai par défaut
        platformToShow = null;
      }

      const trainType = r.train_type || 'TER';
      const logoPath = typeLogoMap[trainType.toUpperCase()] || '/img/type/ter.svg';

      return {
        id: r.id,
        number: r.train_number,
        type: trainType,
        logo: logoPath,
        arrival_time: r.arrival_time,
        origin_station: r.departure_station,
        stops: stops.map(s=>s.station_name),
        horaire_afficheur,
        voie: platformToShow || '',
        platform: platformToShow,
        status: 'A L\'HEURE'
      };
    }).filter(r => r.horaire_afficheur).slice(0,10);
    return NextResponse.json({ gare: gareName, arrivals: list });
  } catch(e){
    console.error('GET /api/afficheurs/classiques/arrivees', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}
