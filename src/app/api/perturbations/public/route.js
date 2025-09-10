import { NextResponse } from 'next/server';
import { query } from '@/js/db';

export const runtime = 'nodejs';

// GET /api/perturbations/public - Récupère les perturbations visibles par le public
export async function GET(request) {
  try {
    // Récupère toutes les perturbations actives ou à venir
    const now = new Date().toISOString();

    // 1. Perturbations dont la date de fin est dans le futur ou n'a pas été définie
    // 2. Ou perturbations dont la date de début n'a pas été définie
    const rows = await query(
      `SELECT p.*, 
             sd.name AS depart_name, 
             sa.name AS arrivee_name 
       FROM perturbations p
       LEFT JOIN lignes l ON p.ligne_id = l.id
       LEFT JOIN stations sd ON l.depart_station_id = sd.id
       LEFT JOIN stations sa ON l.arrivee_station_id = sa.id
       WHERE p.date_fin > ? OR p.date_fin IS NULL
       ORDER BY p.date_debut ASC`,
      [now]
    );

    // Parse JSON data
    const perturbations = rows.map(r => {
      let data = {};
      try { data = r.data ? (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) : {}; } catch { data = {}; }
      return { ...r, data };
    });

    return NextResponse.json({ perturbations });
  } catch (e) {
    console.error('GET /api/perturbations/public', e);
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 });
  }
}
