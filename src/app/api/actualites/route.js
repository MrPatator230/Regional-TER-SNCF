import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { getSessionUser } from '@/app/lib/auth';
import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

async function ensureAdmin(){
  const user = await getSessionUser();
  if(!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if(user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  return null;
}

function sanitizeName(name){
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
}

async function saveFile(file, targetDir){
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const original = sanitizeName(file.name || 'fichier');
  const ext = path.extname(original);
  const base = path.basename(original, ext).slice(0,60);
  const finalName = base + '-' + Date.now() + ext;
  const fullDir = path.join(process.cwd(), 'public', targetDir);
  await fs.mkdir(fullDir, { recursive: true });
  const fullPath = path.join(fullDir, finalName);
  await fs.writeFile(fullPath, buffer);
  return '/' + path.join(targetDir, finalName).replace(/\\/g,'/');
}

function parseDate(str){
  if(!str) return null;
  const d = new Date(str);
  if(isNaN(d.getTime())) return null;
  return d.toISOString().slice(0,19).replace('T',' ');
}

export async function GET(){
  try {
    const err = await ensureAdmin(); if(err) return err;
    const rows = await query('SELECT * FROM actualites ORDER BY publication_date DESC, created_at DESC');
    return NextResponse.json({ items: rows });
  } catch(e){
    console.error('GET /api/actualites', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req){
  try {
    const err = await ensureAdmin(); if(err) return err;
    const form = await req.formData();
    const titre = (form.get('titre')||'').toString().trim().slice(0,190);
    const contenu = (form.get('contenu')||'').toString().trim();
    const publication_date = parseDate(form.get('publication_date'));
    if(!titre) return NextResponse.json({ error: 'Titre requis' }, { status: 400 });

    let image_path = null;
    const imageFile = form.get('image');
    if(imageFile && typeof imageFile === 'object' && imageFile.size > 0){
      image_path = await saveFile(imageFile, 'img/actualites');
    }

    const attachments = [];
    for(const entry of form.getAll('attachments')){
      const f = entry;
      if(f && typeof f === 'object' && f.size>0){
        const p = await saveFile(f, 'files');
        attachments.push(p);
      }
    }

    await query('INSERT INTO actualites (titre, publication_date, contenu, image_path, attachments) VALUES (?,?,?,?,?)', [titre, publication_date, contenu, image_path, JSON.stringify(attachments)]);
    return NextResponse.json({ ok:true }, { status: 201 });
  } catch(e){
    console.error('POST /api/actualites', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(req){
  try {
    const err = await ensureAdmin(); if(err) return err;
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if(!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 });
    const form = await req.formData();
    const titre = (form.get('titre')||'').toString().trim().slice(0,190);
    const contenu = (form.get('contenu')||'').toString().trim();
    const publication_date = parseDate(form.get('publication_date'));

    // Récupération actuelle
    const rows = await query('SELECT image_path, attachments FROM actualites WHERE id=? LIMIT 1',[id]);
    if(!rows.length) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
    let { image_path, attachments } = rows[0];
    if(typeof attachments === 'string'){ try { attachments = JSON.parse(attachments); } catch { attachments = []; } }
    if(!Array.isArray(attachments)) attachments = [];

    const imageFile = form.get('image');
    if(imageFile && typeof imageFile === 'object' && imageFile.size>0){
      image_path = await saveFile(imageFile, 'img/actualites');
    }
    for(const entry of form.getAll('attachments')){
      const f = entry;
      if(f && typeof f === 'object' && f.size>0){
        const p = await saveFile(f, 'files');
        attachments.push(p);
      }
    }

    await query('UPDATE actualites SET titre=?, publication_date=?, contenu=?, image_path=?, attachments=? WHERE id=?', [titre, publication_date, contenu, image_path, JSON.stringify(attachments), id]);
    return NextResponse.json({ ok:true });
  } catch(e){
    console.error('PUT /api/actualites', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req){
  try {
    const err = await ensureAdmin(); if(err) return err;
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if(!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 });
    await query('DELETE FROM actualites WHERE id=?',[id]);
    return NextResponse.json({ ok:true });
  } catch(e){
    console.error('DELETE /api/actualites', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

