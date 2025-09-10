import { NextResponse } from 'next/server';
import { getSessionUser } from '@/app/lib/auth';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ensureAdmin(){
  const user = await getSessionUser();
  if(!user) return NextResponse.json({ error:'Non authentifié' }, { status:401 });
  if(user.role !== 'admin') return NextResponse.json({ error:'Accès refusé' }, { status:403 });
  return null;
}

function normStr(v){ return String(v||'').trim(); }
function normTime(v){
  if(v==null) return '';
  // Si Excel renvoie une valeur numérique (fraction de jour), convertir en HH:MM
  if(typeof v==='number' && isFinite(v)){
    let totalSec = Math.round((v%1) * 24 * 60 * 60);
    if(totalSec < 0) totalSec = 0;
    const hh = Math.floor(totalSec/3600)%24;
    const mm = Math.floor((totalSec%3600)/60);
    const pad=(n)=> (n<10? '0'+n: String(n));
    return `${pad(hh)}:${pad(mm)}`;
  }
  const s=String(v).trim();
  if(!s) return '';
  // Accepter formats: H:MM, HH:MM, HhMM, HHhMM, HH:MM:SS, 7:5 (normalisé en 07:05)
  const cleaned = s.replace(/[hH]/g, ':');
  const m = cleaned.match(/^\s*([0-1]?\d|2[0-3])\s*:\s*([0-5]?\d)(?::([0-5]\d))?\s*$/);
  if(!m) return '';
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const pad=(n)=> (n<10? '0'+n: String(n));
  return `${pad(h)}:${pad(mi)}`;
}
function parseBool(v){ const s=String(v||'').toLowerCase().trim(); if(['1','true','oui','yes','y','o'].includes(s)) return true; if(['0','false','non','no','n'].includes(s)) return false; return false; }
const WEEK_MAP={ '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6, lun:0, mar:1, mer:2, jeu:3, ven:4, sam:5, dim:6, lundi:0, mardi:1, mercredi:2, jeudi:3, vendredi:4, samedi:5, dimanche:6 };
function parseDays(raw){ const out=new Set(); const s=String(raw||''); if(!s) return []; const parts=s.split(/[;,\s]+/).map(x=> x.trim()).filter(Boolean); for(const p of parts){ const k=p.toLowerCase(); if(k in WEEK_MAP){ out.add(WEEK_MAP[k]); } }
  return Array.from(out).sort(); }
function parseCustomDates(v){ if(!v) return ''; const arr=String(v).split(/[,;]+/).map(x=> x.trim()).filter(x=> /^\d{4}-\d{2}-\d{2}$/.test(x)); return arr.join(','); }
function splitStopsString(stopsStr){ const s=String(stopsStr||'').trim(); if(!s) return []; const parts=s.split(/\s*[|\u2013;]\s*/).filter(Boolean); const out=[]; for(const seg of parts){ // formats: "Station@HH:MM" ou "Station HH:MM-HH:MM" ou juste "Station"
    const m1=seg.match(/^(.+?)\s*@\s*([0-2]?\d[:hH][0-5]?\d)?\s*(?:[>\-]\s*([0-2]?\d[:hH][0-5]?\d))?$/); // Station@A>D
    const m2=seg.match(/^(.+?)\s*([0-2]?\d[:hH][0-5]?\d)?\s*[-→>]\s*([0-2]?\d[:hH][0-5]?\d)?$/); // Station A-D (sans parenthèses)
    if(m1){ out.push({ station:normStr(m1[1]), arrival:normTime(m1[2]||''), departure:normTime(m1[3]||'') }); continue; }
    if(m2){ out.push({ station:normStr(m2[1]), arrival:normTime(m2[2]||''), departure:normTime(m2[3]||'') }); continue; }
    out.push({ station:normStr(seg), arrival:'', departure:'' });
  } return out; }
function parseStops(row){ // try JSON first
  const jsonField=row['stops_json']||row['Stops JSON']||row['stopsJson']||row['StopsJson'];
  if(jsonField){ try { const arr=typeof jsonField==='string'? JSON.parse(jsonField): jsonField; if(Array.isArray(arr)) return arr.map(s=> ({ station: normStr(s.station||s.station_name), arrival: normTime(s.arrival||s.arrival_time), departure: normTime(s.departure||s.departure_time) })).filter(s=> s.station); } catch(_){ /* ignore */ } }
  // stops packed string
  const stopStr=row['stops']||row['Stops']||row['Arrets']||row['Arrêts']; if(stopStr){ return splitStopsString(stopStr); }
  // Stop1/Stop1Arrival/Stop1Departure pattern
  const out=[]; for(let i=1;i<=50;i++){ const name=row[`Stop${i}`]||row[`Arret${i}`]||row[`Arrêt${i}`]; const arr=row[`Stop${i}Arrival`]||row[`Stop${i}Arrivee`]||row[`Stop${i}Arrivée`]; const dep=row[`Stop${i}Departure`]||row[`Stop${i}Depart`]||row[`Stop${i}Départ`]; if(!name) break; out.push({ station:normStr(name), arrival:normTime(arr), departure:normTime(dep) }); }
  return out;
}

function mapRow(r, idx){ const errors=[]; const g={ ligneId: normStr(r['ligneId']||r['ligne_id']||r['Ligne']||r['ligne']||r['Line']||''), departureStation: normStr(r['departureStation']||r['departure_station']||r['Départ']||r['Depart']||''), arrivalStation: normStr(r['arrivalStation']||r['arrival_station']||r['Arrivée']||r['Arrivee']||''), departureTime: normTime(r['departureTime']||r['departure_time']||r['HeureDépart']||r['HeureDepart']||r['DépartHeure']||r['DepartHeure']||''), arrivalTime: normTime(r['arrivalTime']||r['arrival_time']||r['HeureArrivée']||r['HeureArrivee']||''), trainNumber: normStr(r['trainNumber']||r['train_number']||r['NuméroTrain']||r['NumeroTrain']||''), trainType: normStr(r['trainType']||r['train_type']||r['TypeTrain']||''), rollingStock: normStr(r['rollingStock']||r['Matériel']||r['Materiel']||'') };
  const stops=parseStops(r);
  // Fallback depuis les arrêts si champs généraux manquants
  const stopsValid = (stops||[]).filter(s=> s && s.station);
  if(!g.departureStation && stopsValid.length){ g.departureStation = stopsValid[0].station; }
  if(!g.arrivalStation && stopsValid.length){ g.arrivalStation = stopsValid[stopsValid.length-1].station; }
  if(!g.departureTime && stopsValid.length){ const firstWithDep = stopsValid.find(s=> s.departure); const firstWithAny = stopsValid.find(s=> s.departure || s.arrival); g.departureTime = normTime(firstWithDep?.departure || firstWithAny?.departure || firstWithAny?.arrival || ''); }
  if(!g.arrivalTime && stopsValid.length){ const rev = [...stopsValid].reverse(); const lastWithArr = rev.find(s=> s.arrival); const lastWithAny = rev.find(s=> s.arrival || s.departure); g.arrivalTime = normTime(lastWithArr?.arrival || lastWithAny?.arrival || lastWithAny?.departure || ''); }
  const daysRaw = r['days']||r['daysSelected']||r['Jours']||''; const selected=parseDays(daysRaw);
  const holidays=parseBool(r['holidays']||r['Fériés']||r['Feries']); const sundays=parseBool(r['sundays']||r['Dimanches']);
  const customDates=parseCustomDates(r['customDates']||r['Dates']||'');
  if(!g.ligneId) errors.push('ligneId manquant');
  if(!g.departureStation) errors.push('gare départ manquante');
  if(!g.arrivalStation) errors.push('gare arrivée manquante');
  if(!g.departureTime) errors.push('heure départ manquante/invalide');
  if(!g.arrivalTime) errors.push('heure arrivée manquante/invalide');
  return { index: idx, general: g, days: { selected, holidays, sundays, custom: !!customDates, customDates }, stops, rollingStock: g.rollingStock, errors };
}

export async function POST(request){
  const err = await ensureAdmin(); if(err) return err;
  try {
    const form = await request.formData();
    const file = form.get('file');
    if(!file) return NextResponse.json({ error:'Fichier manquant' }, { status:400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type:'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval:'', raw:false });
    const items = rows.map((r,idx)=> mapRow(r, idx));
    const stationsSet = new Set();
    items.forEach(it=> { if(it.general?.departureStation) stationsSet.add(it.general.departureStation); if(it.general?.arrivalStation) stationsSet.add(it.general.arrivalStation); (it.stops||[]).forEach(s=> { if(s.station) stationsSet.add(s.station); }); });
    const stations = Array.from(stationsSet);
    const warnings = [];
    return NextResponse.json({ items, stations, warnings });
  } catch(e){
    console.error('parse excel error', e);
    return NextResponse.json({ error:'Erreur lors de la lecture du fichier' }, { status:400 });
  }
}
