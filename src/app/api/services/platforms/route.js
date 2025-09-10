// filepath: /Users/mgrillot/Documents/développement WEB/sncf/src/app/api/services/platforms/route.js
import { NextResponse } from 'next/server';
import { scheduleQuery } from '@/js/db-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/services/platforms?schedule_id=...&station_id=... | &station_name=...
export async function GET(req){
  try {
    const { searchParams } = new URL(req.url);
    const scheduleId = Number(searchParams.get('schedule_id')||'');
    if(!scheduleId) return NextResponse.json({ error:'schedule_id requis' }, { status:400 });
    let stationId = Number(searchParams.get('station_id')||'');
    const stationName = (searchParams.get('station_name')||'').trim();

    if(!stationId && stationName){
      const st = await scheduleQuery('SELECT id FROM stations WHERE name=? LIMIT 1', [stationName]);
      if(st.length) stationId = st[0].id;
    }
    if(!stationId) return NextResponse.json({ error:'station_id ou station_name requis' }, { status:400 });

    const rows = await scheduleQuery('SELECT platform FROM schedule_platforms WHERE schedule_id=? AND station_id=? LIMIT 1', [scheduleId, stationId]);
    const platform = rows.length ? (rows[0].platform || null) : null;
    return NextResponse.json({ schedule_id: scheduleId, station_id: stationId, platform });
  } catch(e){
    console.error('GET /api/services/platforms error', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}

// POST /api/services/platforms  { schedule_id, station_id? | station_name?, platform }
// Effet: persiste (UPSERT) la voie pour ce sillon et cette gare, sans expiration
export async function POST(req){
  try {
    const body = await req.json().catch(()=>null);
    if(!body || typeof body !== 'object') return NextResponse.json({ error:'Body JSON invalide' }, { status:400 });
    const scheduleId = Number(body.schedule_id||'');
    if(!scheduleId) return NextResponse.json({ error:'schedule_id requis' }, { status:400 });

    let stationId = Number(body.station_id||'');
    const stationName = (body.station_name||'').trim();
    const platform = (body.platform==null? null : String(body.platform).trim());
    if(!platform) return NextResponse.json({ error:'platform requis' }, { status:400 });

    if(!stationId && stationName){
      const st = await scheduleQuery('SELECT id FROM stations WHERE name=? LIMIT 1', [stationName]);
      if(st.length) stationId = st[0].id;
    }
    if(!stationId) return NextResponse.json({ error:'station_id ou station_name requis' }, { status:400 });

    // UPSERT sans date: persiste jusqu'à modification explicite
    await scheduleQuery(
      'INSERT INTO schedule_platforms (schedule_id, station_id, platform) VALUES (?,?,?) ON DUPLICATE KEY UPDATE platform=VALUES(platform)',
      [scheduleId, stationId, platform]
    );

    return NextResponse.json({ ok:true, schedule_id: scheduleId, station_id: stationId, platform });
  } catch(e){
    console.error('POST /api/services/platforms error', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}

