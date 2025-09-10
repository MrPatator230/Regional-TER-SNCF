import { NextResponse } from 'next/server';
import { query } from '@/js/db';

export const runtime = 'nodejs';

// GET /api/public/stations/:id -> { station: { id, name } }
export async function GET(_req, ctx) {
  try {
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    const rows = await query('SELECT id, name FROM stations WHERE id = ?', [id]);
    if (!rows.length) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
    return NextResponse.json({ station: rows[0] });
  } catch (e) {
    console.error('GET /api/public/stations/[id] error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
