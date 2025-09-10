import { NextResponse } from 'next/server';
import { query } from '@/js/db';
export const runtime='nodejs';
export async function GET(_req, context){
  try {
    // Attendre params (Next.js requiert await si params est une Promise)
    const { slug } = await context.params;
    if(!slug) return NextResponse.json({ error:'Slug manquant'},{status:400});
    const rows = await query('SELECT slug,titre,resume,contenu,image_path,homepage,created_at,updated_at FROM articles WHERE slug=? LIMIT 1',[slug]);
    if(!rows.length) return NextResponse.json({ error:'Introuvable'},{status:404});
    return NextResponse.json({ item: rows[0] });
  } catch(e){
    console.error('GET /api/public/articles/[slug]', e);
    return NextResponse.json({ error:'Erreur serveur'},{status:500});
  }
}
