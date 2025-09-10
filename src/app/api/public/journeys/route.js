import { NextResponse } from 'next/server';
import { getSchedulesDb } from '@/js/db-schedule';
import { query as mainQuery } from '@/js/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isIsoDate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(String(s||'')); }
function isTime(s){ return /^([0-1]\d|2[0-3]):([0-5]\d)$/.test(String(s||'')); }
function toMin(t){ if(!isTime(t)) return null; const [h,m]=t.split(':').map(Number); return h*60+m; }
function timeToMin(t){ const m=String(t||'').match(/^([0-1]\d|2[0-3]):([0-5]\d)$/); if(!m) return null; return (+m[1])*60+(+m[2]); }
function isPertActive(dateISO, timeHHMM, p){
  if(!p) return false;
  const date = dateISO? new Date(dateISO+'T12:00:00'): new Date();
  const jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  if(Array.isArray(p.data?.jours) && p.data.jours.length>0){ if(!p.data.jours.includes(jours[date.getDay()])) return false; }
  const start = p.date_debut? new Date(p.date_debut): null;
  const end   = p.date_fin? new Date(p.date_fin): null;
  if(start && date < new Date(start.toISOString().slice(0,10)+'T00:00:00')) return false;
  if(end && date > new Date(end.toISOString().slice(0,10)+'T23:59:59')) return false;
  if(p.data?.horaire_interruption && !p.data.banner_all){
    const t = timeToMin(timeHHMM); if(t==null) return true;
    const s = timeToMin(p.data.horaire_interruption.debut||'00:00') ?? 0;
    const e = timeToMin(p.data.horaire_interruption.fin||'23:59') ?? 1439;
    if(s<=e){ if(!(t>=s && t<=e)) return false; } else { if(!(t>=s || t<=e)) return false; }
  }
  return true;
}
function shouldShowBanner(dateISO, p){
  if(!p?.data?.banner_all) return false;
  const daysBefore = Math.max(0, Number(p.data.banner_days_before)||0);
  const start = p.date_debut? new Date(p.date_debut): null;
  const end   = p.date_fin? new Date(p.date_fin): null;
  if(!start) return false;
  const d = new Date(dateISO+'T12:00:00');
  const preStart = new Date(start); preStart.setDate(preStart.getDate()-daysBefore);
  return d >= new Date(preStart.toISOString().slice(0,10)+'T00:00:00') && (!end || d <= new Date(end.toISOString().slice(0,10)+'T23:59:59'));
}

export async function GET(request){
  try {
    const { searchParams } = new URL(request.url);
    const fromName = (searchParams.get('from')||'').trim();
    const toName   = (searchParams.get('to')||'').trim();
    const date     = (searchParams.get('date')||'').trim();
    const time     = (searchParams.get('time')||'').trim();
    const limit    = Math.max(1, Math.min(100, parseInt(searchParams.get('limit')||'40',10)||40));
    const includeStops = (searchParams.get('includeStops')||'0')==='1';

    if(!fromName || !toName) return NextResponse.json({ error:'from/to requis' }, { status:400 });

    const conn = await getSchedulesDb().getConnection();
    try {
      // Résolution des ids de gare (base horaires) par nom
      const [fromRows] = await conn.execute('SELECT id,name FROM stations WHERE name=? LIMIT 1',[fromName]);
      const [toRows]   = await conn.execute('SELECT id,name FROM stations WHERE name=? LIMIT 1',[toName]);
      if(!fromRows.length || !toRows.length) return NextResponse.json({ items: [] });
      const fromId = fromRows[0].id; const toId = toRows[0].id;

      const timeMin = toMin(time)||0;
      const safeLimit = Number(limit) || 40;

      // Sillons directs contenant from puis to
      const [rows] = await conn.execute(
        `SELECT s.id, s.ligne_id, s.is_substitution AS isSubstitution,
                s.train_number, s.train_type, s.rolling_stock,
                ds.name AS departure_station, as2.name AS arrival_station,
                TIME_FORMAT(stF.departure_time,'%H:%i') AS dep_time,
                TIME_FORMAT(stT.arrival_time,'%H:%i')   AS arr_time,
                stF.stop_order AS from_order, stT.stop_order AS to_order,
                spF.platform AS dep_platform, spT.platform AS arr_platform
           FROM schedules s
           JOIN stations ds  ON ds.id  = s.departure_station_id
           JOIN stations as2 ON as2.id = s.arrival_station_id
           JOIN schedule_stops stF ON stF.schedule_id = s.id AND stF.station_id = ?
           JOIN schedule_stops stT ON stT.schedule_id = s.id AND stT.station_id = ?
      LEFT JOIN schedule_platforms spF ON spF.schedule_id = s.id AND spF.station_id = stF.station_id
      LEFT JOIN schedule_platforms spT ON spT.schedule_id = s.id AND spT.station_id = stT.station_id
          WHERE stF.stop_order < stT.stop_order
            AND TIME_TO_SEC(stF.departure_time) >= ?*60
       ORDER BY stF.departure_time ASC, s.id ASC
          LIMIT ${safeLimit}`,
        [fromId, toId, timeMin]
      );

      // Charger perturbations des lignes présentes
      const lineIds = Array.from(new Set(rows.map(r=> r.ligne_id).filter(Boolean)));
      const pertsByLine = new Map();
      if(lineIds.length){
        const nowIso = new Date().toISOString();
        const placeholders = lineIds.map(()=>'?').join(',');
        const perts = await mainQuery(
          `SELECT p.* FROM perturbations p WHERE (p.date_fin > ? OR p.date_fin IS NULL) AND p.ligne_id IN (${placeholders}) ORDER BY p.date_debut ASC`,
          [nowIso, ...lineIds]
        );
        for(const p of perts){ try{ p.data = p.data? (typeof p.data==='string'? JSON.parse(p.data): p.data): {}; } catch{ p.data={}; }
          const lst = pertsByLine.get(p.ligne_id)||[]; lst.push(p); pertsByLine.set(p.ligne_id, lst);
        }
      }

      const items = [];
      for(const r of rows){
        // Filtrage perturbations: exclusion et substitution
        const perts = pertsByLine.get(r.ligne_id)||[];
        const isExcluded = perts.some(p=> {
          if(!isPertActive(date, r.dep_time, p)) return false;
          const ex = Array.isArray(p.data?.exclude_schedules)? p.data.exclude_schedules: [];
          return ex.includes(r.id);
        });
        if(isExcluded) continue;
        // Substitution: n'afficher que si une perturbation active le sélectionne
        if(r.isSubstitution){
          const allowed = perts.some(p=> {
            if(p?.data?.substitution_autocar!==true) return false;
            if(!isPertActive(date, r.dep_time, p)) return false;
            const sel = Array.isArray(p.data?.substitution_sillons)? p.data.substitution_sillons: [];
            return sel.includes(r.id);
          });
          if(!allowed) continue;
        }

        // Durée simple en minutes
        const depM = toMin(r.dep_time)||0; const arrM = toMin(r.arr_time)||0; let dur = arrM - depM; if(dur<0) dur += 1440;
        // Prix fictif
        const price = (15 + dur*0.2).toFixed(2);
        const item = {
          id: r.id,
          ligne_id: r.ligne_id,
          trainNumber: r.train_number||'',
          trainType: r.train_type||'',
          departure: r.dep_time,
          arrival: r.arr_time,
          originalDeparture: r.dep_time,
          originalArrival: r.arr_time,
          from: fromName, to: toName,
          durationMin: dur,
          price,
          delayed: false, delayMinutes: 0, delayCause: null,
          cancelled: false, cancelCause: null,
          hasSegment: r.from_order>0 || r.to_order<999,
          depPlatform: r.dep_platform||null,
          arrPlatform: r.arr_platform||null,
          infoBanner: perts.some(p=> shouldShowBanner(date, p))
        };
        if(includeStops){
          const [stops] = await conn.execute(
            `SELECT ss.stop_order, stn.name AS station_name,
                    TIME_FORMAT(ss.arrival_time,'%H:%i') AS arrival_time,
                    TIME_FORMAT(ss.departure_time,'%H:%i') AS departure_time,
                    sp.platform AS platform
               FROM schedule_stops ss
               JOIN stations stn ON stn.id = ss.station_id
          LEFT JOIN schedule_platforms sp ON sp.schedule_id = ss.schedule_id AND sp.station_id = ss.station_id
              WHERE ss.schedule_id = ?
           ORDER BY ss.stop_order ASC`,
            [r.id]
          );
          item.stops = stops.map(s=> ({ station: s.station_name, arrival: s.arrival_time||'', departure: s.departure_time||'', platform: s.platform||null }));
          // allStops avec extrémités explicites
          const all = [];
          all.push({ station: r.departure_station, arrival: item.departure, departure: item.departure, platform: item.depPlatform||null });
          for(const s of stops){ all.push({ station: s.station_name, arrival: s.arrival_time||'', departure: s.departure_time||'', platform: s.platform||null }); }
          all.push({ station: r.arrival_station, arrival: item.arrival, departure: item.arrival, platform: item.arrPlatform||null });
          item.allStops = all;
        }
        items.push(item);
      }
      return NextResponse.json({ items, from: fromName, to: toName, date: isIsoDate(date)? date: null, time: isTime(time)? time: null });
    } finally {
      conn.release();
    }
  } catch(e){
    console.error('GET /api/public/journeys', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}
