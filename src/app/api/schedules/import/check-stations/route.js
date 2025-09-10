import { NextResponse } from 'next/server';
import { getSessionUser } from '@/app/lib/auth';
import { getSchedulesDb } from '@/js/db-schedule';
import { query as mainQuery } from '@/js/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ensureAdmin(){
  const user = await getSessionUser();
  if(!user) return NextResponse.json({ error:'Non authentifié' }, { status:401 });
  if(user.role !== 'admin') return NextResponse.json({ error:'Accès refusé' }, { status:403 });
  return null;
}

export async function POST(request){
  const err = await ensureAdmin(); if(err) return err;
  const body = await request.json().catch(()=>({}));
  const names = Array.isArray(body?.names)? body.names: [];
  const uniq = Array.from(new Set(names.map(n=> String(n||'').trim()).filter(Boolean)));
  if(!uniq.length) return NextResponse.json({ stations: [] });
  const conn = await getSchedulesDb().getConnection();
  try {
    const placeholders = uniq.map(()=>'?').join(',');
    const [schedRows] = await conn.execute(`SELECT name FROM stations WHERE name IN (${placeholders})`, uniq);
    const schedSet = new Set(schedRows.map(r=> r.name));
    const mainRows = await mainQuery(`SELECT id,name FROM stations WHERE name IN (${placeholders})`, uniq);
    const mainMap = new Map(mainRows.map(r=> [r.name, r.id]));

    const out = uniq.map(n=> ({
      name: n,
      existsMain: mainMap.has(n),
      mainId: mainMap.get(n) || null,
      existsSchedules: schedSet.has(n)
    }));
    return NextResponse.json({ stations: out });
  } catch(e){
    console.error('POST /api/schedules/import/check-stations', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  } finally {
    conn.release();
  }
}

