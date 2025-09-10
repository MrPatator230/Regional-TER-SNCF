import { NextResponse } from 'next/server';
import { getSessionUser } from '@/app/lib/auth';
import { getSchedulesDb } from '@/js/db-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ensureAdmin(){
  const user = await getSessionUser();
  if(!user) return NextResponse.json({ error:'Non authentifié' }, { status:401 });
  if(user.role!=="admin") return NextResponse.json({ error:'Accès refusé' }, { status:403 });
  return null;
}

export async function GET(request){
  const err = await ensureAdmin(); if(err) return err;
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q')||'').trim();
  const limit = Math.min(Number(searchParams.get('limit')||200), 1000);
  const conn = await getSchedulesDb().getConnection();
  try {
    let rows;
    if(q.length>=1){
      const sql = `SELECT id,name FROM stations WHERE name LIKE ? ORDER BY name ASC LIMIT ${limit}`;
      [rows] = await conn.execute(sql, [q+'%']);
    } else {
      const sql = `SELECT id,name FROM stations ORDER BY name ASC LIMIT ${limit}`;
      [rows] = await conn.execute(sql);
    }
    return NextResponse.json({ items: rows });
  } catch(e){
    console.error('GET /api/quais/stations', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  } finally { conn.release(); }
}

