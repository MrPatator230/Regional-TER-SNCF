import { NextResponse } from 'next/server';
import { query } from '@/js/db';

export const runtime = 'nodejs';

// Recherche publique de gares (stations) par préfixe pour l'autocomplétion
// GET /api/public/stations/search?q=Di&limit=8
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const limitParam = Number(searchParams.get('limit') || 8);
    const limit = Math.min(50, Math.max(1, limitParam));
    if (q.length < 2) {
      return NextResponse.json({ items: [] });
    }
    // Interpolation directe du LIMIT (valeur bornée) pour éviter ER_WRONG_ARGUMENTS sur certains serveurs
    const sql = `SELECT id, name FROM stations WHERE name LIKE ? ORDER BY name ASC LIMIT ${limit}`;
    const rows = await query(sql, [q + '%']);
    return NextResponse.json({ items: rows });
  } catch (e) {
    console.error('GET /api/public/stations/search error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
