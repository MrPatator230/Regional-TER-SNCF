import { NextResponse } from 'next/server';
import { query } from '@/js/db';

export const runtime = 'nodejs';

export async function GET(){
  try {
    const rows = await query('SELECT id, titre, duree, lien, description, updated_at FROM evenements WHERE highlight=1 ORDER BY updated_at DESC LIMIT 1');
    const item = rows && rows.length? rows[0]: null;
    return NextResponse.json({ item });
  } catch(e){
    console.error('GET /api/public/evenements/highlight', e);
    return NextResponse.json({ item:null });
  }
}
