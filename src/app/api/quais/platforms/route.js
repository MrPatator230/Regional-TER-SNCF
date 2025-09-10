import { NextResponse } from 'next/server';
import { getSessionUser } from '@/app/lib/auth';
import { query } from '@/js/db';

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
  const name = (searchParams.get('stationName')||'').trim();
  if(!name) return NextResponse.json({ items: [] });
  try {
    const rows = await query('SELECT platforms FROM stations WHERE name=? LIMIT 1',[name]);
    if(!rows.length) return NextResponse.json({ items: [] });
    let platforms = rows[0].platforms;
    if(typeof platforms === 'string'){
      try { platforms = JSON.parse(platforms); } catch { platforms = []; }
    }
    const items = Array.isArray(platforms)? platforms.map(p=> ({ name: String(p?.name||'').trim() })).filter(p=> p.name): [];
    return NextResponse.json({ items });
  } catch(e){
    console.error('GET /api/quais/platforms', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}

