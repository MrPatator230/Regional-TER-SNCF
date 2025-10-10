import { NextResponse } from 'next/server';
import { scheduleQuery } from '@/js/db-schedule';
import { query } from '@/js/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ...helpers (parseStopsJson, maskToServiceDays, bitRuns, format helpers)...
function parseStopsJson(raw){
    if(!raw) return [];
    try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if(Array.isArray(data)) return data.map(s=>({
            station_name: s.station_name || s.station,
            arrival_time: (s.arrival_time||s.arrival||'')?.slice(0,5) || null,
            departure_time: (s.departure_time||s.departure||'')?.slice(0,5) || null
        }));
        if(data && typeof data === 'object' && ('Origine' in data || 'Terminus' in data)){
            const stops = [];
            if(data.Origine) stops.push({ station_name: data.Origine.station_name||data.Origine.station, arrival_time:(data.Origine.arrival_time||'')?.slice(0,5)||null, departure_time:(data.Origine.departure_time||'')?.slice(0,5)||null });
            if(Array.isArray(data.Desservies)) for(const s of data.Desservies) stops.push({ station_name: s.station_name||s.station, arrival_time:(s.arrival_time||'')?.slice(0,5)||null, departure_time:(s.departure_time||'')?.slice(0,5)||null });
            if(data.Terminus) stops.push({ station_name: data.Terminus.station_name||data.Terminus.station, arrival_time:(data.Terminus.arrival_time||'')?.slice(0,5)||null, departure_time:(data.Terminus.departure_time||'')?.slice(0,5)||null });
            return stops;
        }
        return [];
    } catch { return []; }
}

function pad2(n){ return String(n).padStart(2,'0'); }
function formatISODate(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function timeToMin(t){ const m = String(t||'').match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/); if(!m) return null; return Number(m[1])*60 + Number(m[2]); }

function bitRuns(days_mask, dateISO){
    if(!dateISO) return true;
    if(days_mask == null) return true;
    const d = new Date(dateISO + 'T00:00:00'); if(isNaN(d)) return true;
    const jsDay = d.getDay(); // 0=Sun..6=Sat
    const idx = (jsDay + 6) % 7; // bit0 = Mon
    return (Number(days_mask) & (1<<idx)) !== 0;
}

function maskToServiceDays(mask, listStr){
    const partsToJs = (parts)=>{
        const out=[]; const map={lun:1,mar:2,mer:3,jeu:4,ven:5,sam:6,dim:7,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6,sun:7};
        (parts||[]).forEach(p=>{ if(p==null) return; const s=String(p).trim(); if(!s) return; if(/^[0-9]+$/.test(s)){ let n=Number(s); if(n>=0&&n<=6) n=n+1; if(n>=1&&n<=7){ const js=(n===7)?0:n; out.push(js);} } else { const key=s.slice(0,3).toLowerCase(); if(map[key]){ const n=map[key]; out.push((n===7)?0:n);} } });
        return Array.from(new Set(out)).sort((a,b)=>a-b);
    };
    if(listStr){ try{ const s=String(listStr||'').trim(); if(/^[01]{7}$/.test(s)){ const out=[]; for(let i=0;i<7;i++) if(s[i]==='1') out.push((i+1)%7); return out; } const parts=s.split(/[;,\s]+/).map(x=>x.trim()).filter(Boolean); const nums=partsToJs(parts); if(nums&&nums.length) return nums;}catch(e){}
    }
    if(mask===null||mask===undefined) return null; const m=Number(mask); if(Number.isNaN(m)) return null; const days=[]; for(let bit=0;bit<7;bit++) if((m>>bit)&1) days.push((bit+1)%7); return Array.from(new Set(days)).sort((a,b)=>a-b);
}

async function getTrainTypesFromRegionData(){
    try{
        const rows = await query('SELECT data FROM `région_data` WHERE id = 1', []);
        if(!rows?.length) return {};
        const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
        const types = data.types || [];
        const map = {};
        types.forEach(t=>{ if(t.slug && t.icon) map[String(t.slug).toUpperCase()] = t.icon; });
        return map;
    } catch(e){ console.error('getTrainTypesFromRegionData', e); return {}; }
}

export async function GET(req){
    try{
        const { searchParams } = new URL(req.url);
        const gare = (searchParams.get('gare')||'').trim();
        const stationParam = (searchParams.get('station')||'').trim();
        if(!gare && !stationParam) return NextResponse.json({ error: 'Paramètre gare requis' }, { status: 400 });

        // trouver la station en base : égalité d'abord, puis LIKE plus permissif
        let st = null;
        if(gare){
            const rows = await query('SELECT id, name FROM stations WHERE name = ? LIMIT 1', [gare]);
            st = rows && rows[0];
            if(!st){
                const likeRows = await query('SELECT id, name FROM stations WHERE name LIKE ? LIMIT 1', [`%${gare}%`]);
                st = likeRows && likeRows[0];
            }
        }
        if(!st && stationParam){
            const rows = await query('SELECT id, name FROM stations WHERE eva_id=? OR id=? OR external_id=? LIMIT 1',[stationParam, stationParam, stationParam]);
            st = rows && rows[0];
        }
        if(!st) return NextResponse.json({ error: 'Gare inconnue' }, { status: 404 });

        const typeLogoMap = await getTrainTypesFromRegionData();
        const gareName = st.name;

        const now = new Date();
        const todayISO = formatISODate(now);

        // rechercher sillons où la gare est origine ou est listée dans stops_json
        const likeParam = `"${gareName}"`;
        const sql = `SELECT s.id, s.train_number, s.train_type, s.days_mask, s.days_mask_list, s.flag_custom,
            s.departure_station_id, s.arrival_station_id,
            ds.name AS departure_station, as2.name AS arrival_station,
            DATE_FORMAT(s.departure_time, "%H:%i") AS departure_time,
            DATE_FORMAT(s.arrival_time, "%H:%i") AS arrival_time,
            s.stops_json
          FROM schedules s
          JOIN stations ds ON ds.id = s.departure_station_id
          JOIN stations as2 ON as2.id = s.arrival_station_id
          WHERE (s.departure_station_id = ? OR s.stops_json LIKE ?)
          ORDER BY s.departure_time ASC`;
        const rows = await scheduleQuery(sql, [st.id, `%${likeParam}%`]);

        // récupérer perturbations du jour (facultatif)
        let perturbations = [];
        try{
            const pRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/perturbations/daily?date=${todayISO}`);
            if(pRes.ok){ const pj = await pRes.json(); perturbations = Array.isArray(pj.perturbations)?pj.perturbations:[]; }
        }catch(_){ }

        // construire les départs
        const computed = rows.map(r=>{
            const stops = parseStopsJson(r.stops_json);
            // horaire d'afficheur : priorité au departure_time STRICTEMENT
            let time = null;
            if(r.departure_station === gareName) {
                // gare origine -> departure_time
                time = r.departure_time;
            } else {
                // desservie -> utiliser uniquement departure_time au niveau du stop
                const stop = stops.find(s=> s.station_name === gareName);
                time = stop?.departure_time || null;
            }
            if(!time) return null;

            const names = stops.map(s=>s.station_name).filter(Boolean);
            const idx = names.indexOf(gareName);
            const next = idx >= 0 ? names.slice(idx+1) : names.slice(1);
            const origin = r.departure_station || '';
            // terminus info directly from arrival_station_id join
            const terminus_id = r.arrival_station_id || null;
            const terminus_name = r.arrival_station || '';
            const destination = terminus_name || '';

            // perturbation matching by schedule_id
            const pert = perturbations.find(p=> String(p.schedule_id) === String(r.id));
            let cancelled = false; let delay_min = 0; let status = "à l'heure";
            if(pert){ const t = String(pert.type||'').toLowerCase(); if(t.includes('supprim')||t.includes('cancel')){ cancelled=true; status='supprimé'; } else if(t.includes('retard')||t.includes('delay')){ delay_min = Number(pert.delay_min||pert.delay||0); if(delay_min>0) status = `+${delay_min}`; } }

            return {
                id: r.id,
                time,
                origin,
                destination,
                terminus_id,
                terminus_name,
                next,
                stops,
                type: r.train_type || 'TER',
                number: r.train_number,
                logo: typeLogoMap[(r.train_type||'').toUpperCase()] || '/img/type/ter.svg',
                voie: ((parseInt(r.train_number,10)||0)%2)?'1':'2',
                cancelled,
                delay_min,
                status,
                days_mask: r.days_mask == null ? null : Number(r.days_mask),
                service_days: maskToServiceDays(r.days_mask, r.days_mask_list)
            };
        }).filter(Boolean);

        // filtrer par jours de service et par heure passée
        let filtered = computed.filter(item => bitRuns(item.days_mask, todayISO));
        const nowMin = now.getHours()*60 + now.getMinutes();
        filtered = filtered.filter(item => { const t = timeToMin(item.time); if(t==null) return false; return !(nowMin > (t + 1)); });
        filtered.sort((a,b)=>{ const ta=timeToMin(a.time)||0; const tb=timeToMin(b.time)||0; return ta-tb; });

        // fallback sur lendemain si vide
        let isNextDay = false;
        let list = filtered.slice(0,10);
        if(list.length === 0){
            const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate()+1);
            const tomorrowISO = formatISODate(tomorrow);
            const tomorrowFiltered = computed.filter(item => bitRuns(item.days_mask, tomorrowISO));
            tomorrowFiltered.sort((a,b)=>{ const ta=timeToMin(a.time)||0; const tb=timeToMin(b.time)||0; return ta-tb; });
            list = tomorrowFiltered.slice(0,10);
            isNextDay = true;
        }

        return NextResponse.json({ station: stationParam||null, gare: gareName, departures: list, isNextDay });
    } catch(e){
        console.error('GET /api/afficheurs/eva/departs', e);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
