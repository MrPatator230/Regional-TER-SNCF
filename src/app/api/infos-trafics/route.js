import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { getSessionUser } from '@/app/lib/auth';

export const runtime = 'nodejs';

async function ensureAdmin(){
  const user = await getSessionUser();
  if(!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if(user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  return null;
}

function normalize(body){
  const titre = (body?.titre||'').toString().trim().slice(0,190);
  const contenu = (body?.contenu||'').toString().trim();
  const typeAllowed = ['information','annulation','attention','travaux'];
  const type = typeAllowed.includes(body?.type)? body.type : 'information';
  return { titre, contenu, type };
}

export async function GET(){
  try {
    const err = await ensureAdmin(); if(err) return err;
    const rows = await query('SELECT * FROM infos_trafics ORDER BY created_at DESC');
    return NextResponse.json({ items: rows });
  } catch(e){
    console.error('GET /api/infos-trafics', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req){
  try {
    const err = await ensureAdmin(); if(err) return err;
    const body = await req.json().catch(()=>({}));
    const i = normalize(body);
    if(!i.titre || !i.contenu) return NextResponse.json({ error: 'Champs requis' }, { status: 400 });
    await query('INSERT INTO infos_trafics (type,titre,contenu) VALUES (?,?,?)',[i.type,i.titre,i.contenu]);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch(e){
    console.error('POST /api/infos-trafics', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(req){
  try {
    const err = await ensureAdmin(); if(err) return err;
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if(!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 });
    const body = await req.json().catch(()=>({}));
    const i = normalize(body);
    await query('UPDATE infos_trafics SET type=?, titre=?, contenu=? WHERE id=?',[i.type,i.titre,i.contenu,id]);
    return NextResponse.json({ ok:true });
  } catch(e){
    console.error('PUT /api/infos-trafics', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req){
  try {
    const err = await ensureAdmin(); if(err) return err;
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if(!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 });
    await query('DELETE FROM infos_trafics WHERE id=?',[id]);
    return NextResponse.json({ ok:true });
  } catch(e){
    console.error('DELETE /api/infos-trafics', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

