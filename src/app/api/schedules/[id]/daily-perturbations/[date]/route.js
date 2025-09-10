// filepath: /Users/mgrillot/Documents/développement WEB/sncf/src/app/api/schedules/[id]/daily-perturbations/[date]/route.js
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/app/lib/auth';
import { getSchedulesDb } from '@/js/db-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ensureAdmin(){
  const user = await getSessionUser();
  if(!user) return NextResponse.json({ error:'Non authentifié' }, { status:401 });
  if(user.role!=='admin') return NextResponse.json({ error:'Accès refusé' }, { status:403 });
  return null;
}

function isIsoDate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(String(s||'')); }
function normTime(s){ if(!s) return null; const m=String(s).trim().match(/^([0-1]\d|2[0-3]):([0-5]\d)$/); return m? `${m[1]}:${m[2]}`: null; }
function normalizeDateOnly(d){ const s=String(d||''); const d10=s.slice(0,10); return isIsoDate(d10)? d10: null; }

async function ensureStationByName(conn, name){
  const n = String(name||'').trim();
  if(!n) throw new Error('Gare invalide');
  const [rows] = await conn.execute('SELECT id FROM stations WHERE name=? LIMIT 1',[n]);
  if(rows.length) return rows[0].id;
  const [ins] = await conn.execute('INSERT INTO stations(name) VALUES(?)',[n]);
  return ins.insertId;
}

export async function PUT(_request, ctx){
  const err = await ensureAdmin(); if(err) return err;
  const { id: idParam, date } = await ctx.params;
  const id = Number(idParam||0);
  const dateOnly = normalizeDateOnly(date);
  if(!id || !dateOnly) return NextResponse.json({ error:'Paramètres invalides' }, { status:400 });

  let body={};
  try { body = await _request.json(); } catch {}
  const type = String(body?.type||'');
  if(!['retard','suppression','modification'].includes(type)){
    return NextResponse.json({ error:'Type invalide' }, { status:400 });
  }

  const conn = await getSchedulesDb().getConnection();
  try {
    let fields = { schedule_id:id, date: dateOnly, type };
    if(type==='retard'){
      const minutes = Number(body?.delayMinutes||0);
      if(!Number.isFinite(minutes) || minutes<=0 || minutes>1440) return NextResponse.json({ error:'Minutes invalides' }, { status:400 });
      const fromStation = String(body?.fromStation||'').trim();
      const cause = body?.cause? String(body.cause).slice(0,2000) : null;
      const fromId = await ensureStationByName(conn, fromStation);
      fields = { ...fields, delay_from_station_id: fromId, delay_minutes: minutes, cause };
    } else if(type==='suppression'){
      const cause = body?.cause? String(body.cause).slice(0,2000) : null;
      fields = { ...fields, cause };
    } else if(type==='modification'){
      const depSt = String(body?.departureStation||'').trim();
      const arrSt = String(body?.arrivalStation||'').trim();
      const depT = normTime(body?.departureTime);
      const arrT = normTime(body?.arrivalTime);
      if(!depSt || !arrSt || !depT || !arrT) return NextResponse.json({ error:'Champs modification invalides' }, { status:400 });
      const depId = await ensureStationByName(conn, depSt);
      const arrId = await ensureStationByName(conn, arrSt);
      const removedStops = Array.isArray(body?.removedStops)? body.removedStops.map(s=> String(s||'').trim()).filter(Boolean): [];
      fields = { ...fields, mod_departure_station_id: depId, mod_arrival_station_id: arrId, mod_departure_time: depT, mod_arrival_time: arrT, removed_stops: JSON.stringify(removedStops) };
    }

    const cols = Object.keys(fields);
    const placeholders = cols.map(()=> '?').join(',');
    const updates = cols.filter(c=> !['schedule_id','date'].includes(c)).map(c=> `${c}=VALUES(${c})`).join(',');
    const values = cols.map(k=> fields[k]);
    await conn.execute(
      `INSERT INTO schedule_daily_variants(${cols.join(',')}) VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${updates}, updated_at=CURRENT_TIMESTAMP`,
      values
    );

    return NextResponse.json({ ok:true });
  } catch(e){
    console.error('PUT /api/schedules/:id/daily-perturbations/:date', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  } finally { conn.release(); }
}

export async function DELETE(_request, ctx){
  const err = await ensureAdmin(); if(err) return err;
  const { id: idParam, date } = await ctx.params;
  const id = Number(idParam||0);
  const dateOnly = normalizeDateOnly(date);
  if(!id || !dateOnly) return NextResponse.json({ error:'Paramètres invalides' }, { status:400 });
  const conn = await getSchedulesDb().getConnection();
  try {
    const [res] = await conn.execute('DELETE FROM schedule_daily_variants WHERE schedule_id=? AND date=?',[id,dateOnly]);
    return NextResponse.json({ ok:true, deleted: res?.affectedRows||0 });
  } catch(e){
    console.error('DELETE /api/schedules/:id/daily-perturbations/:date', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  } finally { conn.release(); }
}
