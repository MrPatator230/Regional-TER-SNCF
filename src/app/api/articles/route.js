import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { getSessionUser } from '@/app/lib/auth';
import { sanitizeHtml } from '@/app/lib/sanitize';

export const runtime='nodejs';

async function ensureAdmin(){
  const user = await getSessionUser();
  if(!user) return NextResponse.json({ error:'Non authentifié'},{status:401});
  if(user.role!=='admin') return NextResponse.json({ error:'Accès refusé'},{status:403});
  return null;
}
function slugify(str){ return (str||'').toString().toLowerCase().normalize('NFD').replace(/[^\w\s-]/g,'').replace(/[\s_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,190)||'article'; }
function normalize(body, existingId){
  const titre=(body?.titre||'').toString().trim().slice(0,190);
  let slug=(body?.slug||'').toString().trim().toLowerCase();
  if(!slug && titre) slug=slugify(titre);
  slug=slugify(slug);
  const resume=(body?.resume||'').toString().trim().slice(0,255) || null;
  const rawContenu=(body?.contenu||'').toString();
  const contenu = sanitizeHtml(rawContenu.trim());
  const image_path=(body?.image_path||'').toString().trim().slice(0,255)||null;
  const homepage= body?.homepage?1:0;
  return { slug, titre, resume, contenu, image_path, homepage };
}

export async function GET(){
  try {
    const err=await ensureAdmin(); if(err) return err;
    const rows=await query('SELECT * FROM articles ORDER BY created_at DESC');
    return NextResponse.json({ items: rows });
  } catch(e){
    console.error('GET /api/articles',e); return NextResponse.json({ error:'Erreur serveur'},{status:500});
  }
}
export async function POST(req){
  try { const err=await ensureAdmin(); if(err) return err; const body= await req.json().catch(()=>({})); const a=normalize(body); if(!a.titre) return NextResponse.json({ error:'Titre requis'},{status:400});
    // Vérifie unicité slug
    const dup=await query('SELECT id FROM articles WHERE slug=? LIMIT 1',[a.slug]);
    if(dup.length) return NextResponse.json({ error:'Slug déjà utilisé'},{status:400});
    await query('INSERT INTO articles (slug,titre,resume,contenu,image_path,homepage) VALUES (?,?,?,?,?,?)',[a.slug,a.titre,a.resume,a.contenu,a.image_path,a.homepage]);
    return NextResponse.json({ ok:true },{status:201});
  } catch(e){ console.error('POST /api/articles',e); return NextResponse.json({ error:'Erreur serveur'},{status:500}); }
}
export async function PUT(req){
  try { const err=await ensureAdmin(); if(err) return err; const { searchParams }= new URL(req.url); const id=Number(searchParams.get('id')); if(!id) return NextResponse.json({ error:'ID manquant'},{status:400}); const body= await req.json().catch(()=>({})); const a=normalize(body); if(!a.titre) return NextResponse.json({ error:'Titre requis'},{status:400});
    const dup=await query('SELECT id FROM articles WHERE slug=? AND id<>? LIMIT 1',[a.slug,id]); if(dup.length) return NextResponse.json({ error:'Slug déjà utilisé'},{status:400});
    await query('UPDATE articles SET slug=?, titre=?, resume=?, contenu=?, image_path=?, homepage=? WHERE id=?',[a.slug,a.titre,a.resume,a.contenu,a.image_path,a.homepage,id]);
    return NextResponse.json({ ok:true });
  } catch(e){ console.error('PUT /api/articles',e); return NextResponse.json({ error:'Erreur serveur'},{status:500}); }
}
export async function DELETE(req){
  try { const err=await ensureAdmin(); if(err) return err; const { searchParams }= new URL(req.url); const id=Number(searchParams.get('id')); if(!id) return NextResponse.json({ error:'ID manquant'},{status:400}); await query('DELETE FROM articles WHERE id=?',[id]); return NextResponse.json({ ok:true }); }
  catch(e){ console.error('DELETE /api/articles',e); return NextResponse.json({ error:'Erreur serveur'},{status:500}); }
}
