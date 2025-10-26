import { NextResponse } from 'next/server';
import { query } from '@/js/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req){
  try{
    const rows = await query('SELECT data FROM `région_data` WHERE id = 1', []);
    if(!rows || !rows.length) return NextResponse.json({ types: [] });
    const raw = rows[0].data;
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const types = Array.isArray(data?.types) ? data.types.map(t => ({ slug: t.slug || t.name || '', name: t.name || t.label || t.slug || '' })) : [];
    return NextResponse.json({ types });
  }catch(e){
    console.error('GET /api/region/types', e);
    return NextResponse.json({ types: [] });
  }
}

