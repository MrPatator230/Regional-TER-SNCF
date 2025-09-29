import { NextResponse } from 'next/server';
import { getSchedulesDb } from '@/js/db-schedule';
import { query as mainQuery } from '@/js/db';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isIsoDate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(String(s||'')); }
function timeToMin(t){ if(!t) return null; const m=String(t).match(/^([0-1]\d|2[0-3]):([0-5]\d)$/); if(!m) return null; return (+m[1])*60+(+m[2]); }
function minToTime(m){ if(m==null) return null; m = ((m%1440)+1440)%1440; const h = Math.floor(m/60); const mm = m%60; return String(h).padStart(2,'0')+":"+String(mm).padStart(2,'0'); }
function addMinutes(hm, delta){ const base = timeToMin(hm); if(base==null) return hm; return minToTime(base + delta); }
function todayParis(){ const fmt = new Intl.DateTimeFormat('en-CA',{ timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'}); return fmt.format(new Date()); }

const TRY_EXTS = ['.png','.jpg','.jpeg','.webp','.gif','.svg'];
function rollingImageUrlForSerial(serial){
  try {
    if(!serial) return null;
    const baseDir = path.join(process.cwd(), 'public', 'img', 'm-r');
    for(const ext of TRY_EXTS){
      const p = path.join(baseDir, `${serial}${ext}`);
      if(fs.existsSync(p)) return `/img/m-r/${serial}${ext}`;
    }
  } catch {}
  return null;
}

async function fetchRollingMeta(serial){ if(!serial) return {}; try { const rows = await mainQuery('SELECT name AS rolling_stock_name, capacity AS rolling_stock_capacity FROM materiel_roulant WHERE serial_number=? LIMIT 1',[serial]); return rows?.[0]||{}; } catch { return {}; } }

function buildOriginalAllStops(row, stops, platformByStationId){ const arr = []; // origin
  arr.push({ station: row.departure_station, arrival: row.departure_time, departure: row.departure_time, platform: platformByStationId?.get(row.departure_station_id) || null });
  for(const s of stops){ arr.push({ station: s.station_name, arrival: s.arrival_time||'', departure: s.departure_time||'', platform: s.platform|| (platformByStationId?.get(s.station_id) || null) }); }
  arr.push({ station: row.arrival_station, arrival: row.arrival_time, departure: row.arrival_time, platform: platformByStationId?.get(row.arrival_station_id) || null });
  return arr; }

// --- Nouveau: helpers et chargement des perturbations publiques par ligne ---
function isPerturbationActiveFor(dateISO, timeHHMM, p){
  if(!p) return false;
  const date = dateISO? new Date(dateISO+'T12:00:00'): new Date();
  const jourIdx = date.getDay(); // 0=Dim..6=Sam
  const jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  if(Array.isArray(p.data?.jours) && p.data.jours.length>0){ if(!p.data.jours.includes(jours[jourIdx])) return false; }
  const start = p.date_debut? new Date(p.date_debut): null;
  const end   = p.date_fin? new Date(p.date_fin): null;
  if(start && date < new Date(start.toISOString().slice(0,10)+'T00:00:00')) return false;
  if(end && date > new Date(end.toISOString().slice(0,10)+'T23:59:59')) return false;
  // Heure
  if(p.data?.horaire_interruption){
    const t = timeToMin(timeHHMM); if(t==null) return true;
    const s = timeToMin(p.data.horaire_interruption.debut||'00:00') ?? 0;
    const e = timeToMin(p.data.horaire_interruption.fin||'23:59') ?? 1439;
    if(s<=e){ if(!(t>=s && t<=e)) return false; } else { // couvre minuit
      if(!(t>=s || t<=e)) return false;
    }
  }
  return true;
}

export async function GET(request){
  try {
    const { searchParams } = new URL(request.url);
    const number = (searchParams.get('number')||'').trim();
    const date = (searchParams.get('date')||'').trim();
    if(!number){ return NextResponse.json({ error:'Paramètre number requis' }, { status:400 }); }
    const targetDate = isIsoDate(date)? date: todayParis();

    const conn = await getSchedulesDb().getConnection();
    try {
      // Charge sillons correspondants au numéro
      const [rows] = await conn.execute(
        `SELECT s.id, s.train_number, s.train_type, s.rolling_stock,
                s.departure_station_id, s.arrival_station_id,
                ds.name AS departure_station, as2.name AS arrival_station,
                TIME_FORMAT(s.departure_time,'%H:%i') AS departure_time,
                TIME_FORMAT(s.arrival_time,'%H:%i') AS arrival_time
           FROM sillons s
           JOIN stations ds ON ds.id = s.departure_station_id
           JOIN stations as2 ON as2.id = s.arrival_station_id
          WHERE s.train_number = ?
          ORDER BY s.id ASC`,
        [number]
      );
      if(!rows.length){ return NextResponse.json({ error:'Aucun train' }, { status:404 }); }

      // Charger perturbations publiques pour les lignes concernées (si présentes)
      const ligneIds = Array.from(new Set(rows.map(r=> r.ligne_id).filter(Boolean)));
      let pertsByLine = new Map();
      if(ligneIds.length){
        const nowIso = new Date().toISOString();
        const placeholders = ligneIds.map(()=>'?').join(',');
        const perts = await mainQuery(
          `SELECT p.* FROM perturbations p WHERE (p.date_fin > ? OR p.date_fin IS NULL) AND p.ligne_id IN (${placeholders}) ORDER BY p.date_debut ASC`,
          [nowIso, ...ligneIds]
        );
        for(const p of perts){ try{ p.data = p.data? (typeof p.data==='string'? JSON.parse(p.data): p.data): {}; } catch{ p.data={}; }
          const list = pertsByLine.get(p.ligne_id) || []; list.push(p); pertsByLine.set(p.ligne_id, list);
        }
      }

      const schedules = [];
      for(const base of rows){
        const [stops] = await conn.execute(
          `SELECT st.stop_order, st.station_id, stn.name AS station_name,
                  TIME_FORMAT(st.arrival_time,'%H:%i') AS arrival_time,
                  TIME_FORMAT(st.departure_time,'%H:%i') AS departure_time,
                  sp.platform AS platform
             FROM schedule_stops st
             JOIN stations stn ON stn.id = st.station_id
        LEFT JOIN schedule_platforms sp ON sp.schedule_id = st.schedule_id AND sp.station_id = st.station_id
            WHERE st.schedule_id=?
            ORDER BY st.stop_order ASC`,
          [base.id]
        );
        // Récupère toutes les plateformes de ce sillon (pour extrémités notamment)
        const [plats] = await conn.execute(
          `SELECT station_id, platform FROM schedule_platforms WHERE schedule_id=?`,
          [base.id]
        );
        const platformByStationId = new Map(plats.map(p=> [p.station_id, p.platform]));

        const original_allStops = buildOriginalAllStops(base, stops, platformByStationId);
        // Par défaut: pas de perturbation => effective = original
        let departure_time = base.departure_time;
        let arrival_time = base.arrival_time;
        let allStops = original_allStops.map(s=> ({ ...s, removed:false, new_departure:false, new_arrival:false }));
        let internalStops = stops.map(s=> ({ station: s.station_name, arrival: s.arrival_time||'', departure: s.departure_time||'', platform: s.platform || platformByStationId.get(s.station_id) || null }));
        let cancelled = false; let cancel_cause = null; let delayed = false; let delay_min = 0; let rerouted = false;
        let departure_delay_minutes = null; let arrival_delay_minutes = null;
        let original_departure_time = base.departure_time;
        let original_arrival_time = base.arrival_time;

        // Variante quotidienne éventuelle
        const [vars] = await conn.execute(
          `SELECT * FROM schedule_daily_variants WHERE schedule_id=? AND date=? LIMIT 1`,
          [base.id, targetDate]
        );
        if(vars.length){
          const v = vars[0];
          if(v.type === 'suppression'){
            cancelled = true; cancel_cause = v.cause||null;
          } else if(v.type === 'retard'){
            const minutes = Number(v.delay_minutes||0);
            if(minutes>0){
              // Décale depuis la gare spécifiée (incluse)
              const fromNameRow = await conn.execute('SELECT name FROM stations WHERE id=? LIMIT 1',[v.delay_from_station_id]);
              const fromName = fromNameRow?.[0]?.[0]?.name || null;
              let startIdx = 0; if(fromName){ startIdx = allStops.findIndex(s=> s.station===fromName); if(startIdx<0) startIdx=0; }
              // Applique sur allStops
              allStops = allStops.map((s,idx)=> ({
                ...s,
                arrival: idx>=startIdx? addMinutes(s.arrival, minutes): s.arrival,
                departure: idx>=startIdx? addMinutes(s.departure, minutes): s.departure,
              }));
              // Met à jour times tête/queue + internal
              departure_time = allStops[0].departure;
              arrival_time = allStops[allStops.length-1].arrival;
              internalStops = allStops.slice(1,allStops.length-1).map(s=> ({ station:s.station, arrival:s.arrival||'', departure:s.departure||'', platform: s.platform||null }));
              delayed = true; delay_min = minutes;
              if(startIdx===0){ departure_delay_minutes = minutes; }
              arrival_delay_minutes = minutes;
            }
          } else if(v.type === 'modification'){
            // Nouvelles gares/times
            const depNameRow = v.mod_departure_station_id? await conn.execute('SELECT name FROM stations WHERE id=? LIMIT 1',[v.mod_departure_station_id]) : null;
            const arrNameRow = v.mod_arrival_station_id? await conn.execute('SELECT name FROM stations WHERE id=? LIMIT 1',[v.mod_arrival_station_id]) : null;
            const newDepName = depNameRow?.[0]?.[0]?.name || base.departure_station;
            const newArrName = arrNameRow?.[0]?.[0]?.name || base.arrival_station;
            const newDepTime = v.mod_departure_time? v.mod_departure_time.slice(0,5): base.departure_time;
            const newArrTime = v.mod_arrival_time? v.mod_arrival_time.slice(0,5): base.arrival_time;

            // Marquer arrêts supprimés
            let removedList = [];
            try { removedList = v.removed_stops? JSON.parse(v.removed_stops): []; } catch { removedList = []; }
            const removedSet = new Set(removedList);

            // Recalcule allStops sur base originale, marque removed
            allStops = original_allStops.map(s=> ({ ...s, removed: removedSet.has(s.station), new_departure:false, new_arrival:false }));

            // Applique nouvelles extrémités
            if(newDepName !== original_allStops[0].station || newDepTime !== original_allStops[0].departure){
              allStops[0] = { ...allStops[0], station:newDepName, arrival:newDepTime, departure:newDepTime, new_departure:true, platform: platformByStationId.get(v.mod_departure_station_id) || allStops[0].platform||null };
            }
            if(newArrName !== original_allStops[original_allStops.length-1].station || newArrTime !== original_allStops[original_allStops.length-1].arrival){
              const lastIdx = allStops.length-1;
              allStops[lastIdx] = { ...allStops[lastIdx], station:newArrName, arrival:newArrTime, departure:newArrTime, new_arrival:true, platform: platformByStationId.get(v.mod_arrival_station_id) || allStops[lastIdx].platform||null };
            }

            // Construit internalStops effectifs (exclut removed + extrémités)
            internalStops = allStops.slice(1, allStops.length-1)
              .filter(s=> !s.removed)
              .map(s=> ({ station:s.station, arrival:s.arrival||'', departure:s.departure||'', platform: s.platform||null }));

            // Met à jour times départ/arrivée effectifs
            departure_time = allStops[0].departure;
            arrival_time = allStops[allStops.length-1].arrival;

            rerouted = removedSet.size>0 || newDepName!==base.departure_station || newArrName!==base.arrival_station;
            original_departure_time = base.departure_time;
            original_arrival_time = base.arrival_time;
          }
        }

        // --- Nouveau: prendre en compte les perturbations publiques (si listent ce sillon en suppression) ---
        if(!cancelled){
          const perts = pertsByLine.get(base.ligne_id) || [];
          for(const p of perts){
            if(!isPerturbationActiveFor(targetDate, base.departure_time, p)) continue;
            // Listes possibles dans la data: exclude_schedules, suppression_sillons, sillons
            const rawSel = Array.isArray(p.data?.exclude_schedules) ? p.data.exclude_schedules : (Array.isArray(p.data?.suppression_sillons) ? p.data.suppression_sillons : (Array.isArray(p.data?.sillons) ? p.data.sillons : []));
            // Normaliser les valeurs pour éviter mismatch string/number
            const sel = Array.isArray(rawSel) ? rawSel.map(v => (typeof v === 'string' ? v.trim() : v)) : [];
            if(sel.length && sel.some(x => String(x) === String(base.id))){
              cancelled = true;
              cancel_cause = p.cause || p.titre || p.description || null;
              break;
            }
          }
        }

        const rollingMeta = await fetchRollingMeta(base.rolling_stock);
        const rollingImage = rollingImageUrlForSerial(base.rolling_stock);

        schedules.push({
          id: base.id,
          train_number: base.train_number,
          train_type: base.train_type,
          rolling_stock: base.rolling_stock,
          rolling_stock_image: rollingImage,
          ...rollingMeta,
          departure_station: allStops[0]?.station || base.departure_station,
          arrival_station: allStops[allStops.length-1]?.station || base.arrival_station,
          departure_time,
          arrival_time,
          original_departure_time,
          original_arrival_time,
          // allStops pour affichage enrichi (origin+dest inclus)
          allStops,
          original_allStops,
          // stops internes (sans extrémités)
          stops: internalStops,
          delayed,
          delay_min,
          departure_delay_minutes,
          arrival_delay_minutes,
          cancelled,
          cancel_cause,
          rerouted,
          date: targetDate
        });
      }

      return NextResponse.json({ schedules, date: targetDate });
    } finally {
      conn.release();
    }
  } catch(e){
    console.error('GET /api/public/train', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}
