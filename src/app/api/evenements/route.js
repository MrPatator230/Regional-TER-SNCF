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
  const duree = (body?.duree||'').toString().trim().slice(0,100) || null;
  const lienRaw = (body?.lien||'').toString().trim();
  let lien = lienRaw? lienRaw.slice(0,255): null;
  if(lien && !/^https?:\/\//i.test(lien)){ lien = 'https://' + lien; }
  const description = (body?.description||'').toString().trim();
  const highlight = body?.highlight? 1:0;
  return { titre, duree, lien, description, highlight };
}

export async function GET(){
  try {
    const err = await ensureAdmin(); if(err) return err;
    const rows = await query('SELECT * FROM evenements ORDER BY created_at DESC');
    return NextResponse.json({ items: rows });
  } catch(e){
    console.error('GET /api/evenements', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req){
  try {
    const err = await ensureAdmin(); if(err) return err;
    const body = await req.json().catch(()=>({}));
    const ev = normalize(body);
    if(!ev.titre) return NextResponse.json({ error: 'Titre requis' }, { status: 400 });
    await query('INSERT INTO evenements (titre,duree,lien,description,highlight) VALUES (?,?,?,?,?)',[ev.titre,ev.duree,ev.lien,ev.description,ev.highlight]);
    return NextResponse.json({ ok:true }, { status: 201 });
  } catch(e){
    console.error('POST /api/evenements', e);
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
    const ev = normalize(body);
    await query('UPDATE evenements SET titre=?, duree=?, lien=?, description=?, highlight=? WHERE id=?',[ev.titre,ev.duree,ev.lien,ev.description,ev.highlight,id]);
    return NextResponse.json({ ok:true });
  } catch(e){
    console.error('PUT /api/evenements', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req){
  try {
    const err = await ensureAdmin(); if(err) return err;
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if(!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 });
    await query('DELETE FROM evenements WHERE id=?',[id]);
    return NextResponse.json({ ok:true });
  } catch(e){
    console.error('DELETE /api/evenements', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
