import { NextResponse } from 'next/server';
import { getSessionUser } from '@/app/lib/auth';
import { createSchedule } from '@/app/lib/schedules-service';

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
  const items = Array.isArray(body?.items)? body.items: [];
  if(!items.length) return NextResponse.json({ error:'Aucun élément à importer' }, { status:400 });
  const results=[];
  for(let i=0;i<items.length;i++){
    const it = items[i];
    try{
      const payload = { general: it.general||{}, stops: Array.isArray(it.stops)? it.stops: [], days: it.days||{selected:[],holidays:false,sundays:false,custom:false}, rollingStock: it.rollingStock||null };
      const r = await createSchedule(payload);
      if(r?.error){ results.push({ index: it.index ?? i, ok:false, error: r.error }); }
      else { results.push({ index: it.index ?? i, ok:true, schedule: r.schedule }); }
    } catch(e){ results.push({ index: it.index ?? i, ok:false, error: e.message||'Erreur' }); }
  }
  const created = results.filter(r=> r.ok).length;
  const failed = results.length - created;
  return NextResponse.json({ created, failed, results });
}

