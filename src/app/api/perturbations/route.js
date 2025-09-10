import { NextResponse } from 'next/server';
import { query } from '@/js/db';

export const runtime = 'nodejs';

// GET /api/perturbations - Liste les perturbations (avec filtre optionnel par ligne)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const ligne_id = searchParams.get('ligne_id');

    let sql = 'SELECT * FROM perturbations ORDER BY id DESC';
    let params = [];

    if (ligne_id) {
      sql = 'SELECT * FROM perturbations WHERE ligne_id = ? ORDER BY id DESC';
      params = [ligne_id];
    }

    const perturbations = await query(sql, params);

    return NextResponse.json({ perturbations });
  } catch (e) {
    console.error('GET /api/perturbations', e);
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/perturbations - Crée une nouvelle perturbation
export async function POST(request) {
  try {
    const payload = await request.json();

    // Vérification des champs obligatoires
    if (!payload.ligne_id) {
      return NextResponse.json({ error: 'Ligne requise' }, { status: 400 });
    }
    if (!payload.type) {
      return NextResponse.json({ error: 'Type de perturbation requis' }, { status: 400 });
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const result = await query(
      `INSERT INTO perturbations 
       (ligne_id, type, titre, description, date_debut, date_fin, data, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.ligne_id,
        payload.type,
        payload.titre || 'Perturbation',
        payload.description || '',
        payload.date_debut || null,
        payload.date_fin || null,
        JSON.stringify(payload.data || {}),
        now,
        now
      ]
    );

    return NextResponse.json({ id: result.insertId, success: true });
  } catch (e) {
    console.error('POST /api/perturbations', e);
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 });
  }
}
