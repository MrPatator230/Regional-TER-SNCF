import { NextResponse } from 'next/server';
import { query } from '@/js/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/public/infos-trafics?page=1&limit=3
export async function GET(request){
  try {
    const { searchParams } = new URL(request.url);
    let page = parseInt(searchParams.get('page')||'1',10); if(isNaN(page)||page<1) page=1;
    let limit = parseInt(searchParams.get('limit')||'3',10); if(isNaN(limit)||limit<1) limit=3; if(limit>50) limit=50;
    const offset = (page-1)*limit;

    // Compte total (plus fiable que SQL_CALC_FOUND_ROWS, et évite l’erreur avec placeholders LIMIT)
    const totalRows = await query('SELECT COUNT(*) as total FROM infos_trafics');
    const total = totalRows[0]?.total || 0;
    const pageCount = Math.max(1, Math.ceil(total/limit));
    if(page>pageCount) page = pageCount; // ajuste page si dépasse

    // Interpolation sûre (valeurs numériques validées) pour éviter erreur "Incorrect arguments"
    const rows = await query(`SELECT id,type,titre,contenu,created_at,updated_at FROM infos_trafics ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`);

    return NextResponse.json({ items: rows, page, pageCount, total, limit });
  } catch(e){
    console.error('GET /api/public/infos-trafics', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
