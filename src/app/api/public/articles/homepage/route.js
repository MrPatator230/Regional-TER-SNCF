import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { ensureDefaultArticles } from '@/app/lib/seedArticles';
export const runtime='nodejs';
export async function GET(){
  try {
    await ensureDefaultArticles();
    const rows = await query('SELECT slug,titre,resume,image_path FROM articles WHERE homepage=1 ORDER BY updated_at DESC');
    return NextResponse.json({ items: rows });
  } catch(e){
    console.error('GET /api/public/articles/homepage', e);
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
