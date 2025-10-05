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

// Convertit le bitmask (bit0 = Lundi ... bit6 = Dimanche)
// en tableau JS de jours [0=Dimanche,1=Lundi,...6=Samedi]
function maskToServiceDays(mask, listStr){
    // helper: convertir parts (strings) en jours JS (0..6)
    const partsToJs = (parts) => {
        const out = [];
        const map = { lun:1, mar:2, mer:3, jeu:4, ven:5, sam:6, dim:7, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, sun:7 };
        (parts || []).forEach(p => {
            if(p === null || p === undefined) return;
            const s = String(p).trim();
            if(!s) return;
            if(/^[0-9]+$/.test(s)){
                let n = Number(s);
                // accepter format 0..6 -> convertir en 1..7
                if(n >= 0 && n <= 6) n = n + 1;
                if(n >= 1 && n <= 7){
                    const js = (n === 7) ? 0 : n; // 7 -> 0 (Dimanche), 1..6 -> same
                    out.push(js);
                }
            }else{
                const key = s.slice(0,3).toLowerCase();
                if(map[key]){
                    const n = map[key];
                    const js = (n === 7) ? 0 : n;
                    out.push(js);
                }
            }
        });
        return Array.from(new Set(out)).sort((a,b)=>a-b);
    };

    // 1) si une liste explicite est fournie (format '1;2;3' ou 'lun;mer')
    if(listStr){
        try{
            const s = String(listStr || '').trim();
            if(/^[01]{7}$/.test(s)){
                // binaire '1010101' où index 0 = lundi
                const out = [];
                for(let i=0;i<7;i++){ if(s[i] === '1') out.push((i+1)%7); }
                return Array.from(new Set(out)).sort((a,b)=>a-b);
            }
            const parts = s.split(/[;,\s]+/).map(p=>p.trim()).filter(Boolean);
            const nums = partsToJs(parts);
            if(nums && nums.length) return nums;
        }catch(e){ /* fallback to mask */ }
    }

    // 2) si mask non défini => aucune info
    if(mask === null || mask === undefined) return null;

    // 3) essayer d'interpréter mask comme entier bitmask
    const m = Number(mask);
    if(Number.isNaN(m)) return null;
    const days = [];
    for(let bit=0; bit<7; bit++){
        if((m >> bit) & 1){
            const jsDay = (bit + 1) % 7; // bit0 = lundi -> js 1, bit6 = dimanche -> js 0
            days.push(jsDay);
        }
    }
    return Array.from(new Set(days)).sort((a,b)=>a-b);
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
        const rows = await scheduleQuery(`SELECT s.id, s.train_number, s.train_type, s.days_mask, s.days_mask_list, s.flag_holidays, s.flag_sundays,
        ds.name AS departure_station, as2.name AS arrival_station,
        DATE_FORMAT(s.departure_time, "%H:%i") AS departure_time,
        DATE_FORMAT(s.arrival_time, "%H:%i") AS arrival_time,
        s.rolling_stock, s.stops_json
      FROM schedules s
      JOIN stations ds  ON ds.id  = s.departure_station_id
      JOIN stations as2 ON as2.id = s.arrival_station_id
      WHERE (s.arrival_station_id=? OR s.stops_json LIKE ?)
      ORDER BY s.arrival_time ASC`, [st.id, `%${likeParam}%`]);

        // Pour chaque sillon, déterminer l'heure pertinente pour la gare demandée
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
            const voie = (parseInt(r.train_number,10)||0)%2? '1':'2';
            const trainType = r.train_type || 'TER';
            const logoPath = typeLogoMap[trainType.toUpperCase()] || '/img/type/ter.svg';

            // Calcul du tableau service_days à partir du days_mask (si présent)
            const serviceDays = maskToServiceDays(r.days_mask, r.days_mask_list);

            return {
                id: r.id,
                number: r.train_number,
                type: trainType,
                logo: logoPath,
                arrival_time: r.arrival_time,
                origin_station: r.departure_station,
                // Fournir les objets d'arrêts complets pour que le front-end puisse lire
                // station_name, arrival_time, departure_time et autres champs planifiés.
                stops: stops,
                horaire_afficheur,
                voie,
                status: 'A L\'HEURE',
                // Exposer le bitmask brut et un tableau JS-friendly pour filtrage côté client
                days_mask: r.days_mask === undefined ? null : Number(r.days_mask),
                service_days: serviceDays
            };
        }).filter(r => r.horaire_afficheur).slice(0,10);
        return NextResponse.json({ gare: gareName, arrivals: list });
    } catch(e){
        console.error('GET /api/afficheurs/classiques/arrivees', e);
        return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
    }
}
