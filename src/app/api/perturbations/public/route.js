import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { scheduleQuery } from '@/js/db-schedule';

export const runtime = 'nodejs';

async function readDailyPerturbationsFromDB(days = 3){
  // construit la liste des dates (YYYY-MM-DD) pour aujourd'hui + (days-1)
  const dates = [];
  const now = new Date();
  for(let i=0;i<days;i++){ const d = new Date(now); d.setDate(now.getDate()+i); dates.push(d.toISOString().slice(0,10)); }
  if(!dates.length) return [];
  const ph = dates.map(()=>'?').join(',');
  const rows = await scheduleQuery(`SELECT * FROM schedule_daily_variants WHERE date IN (${ph}) ORDER BY date ASC, schedule_id ASC`, dates);
  return (rows || []).map(r => ({
    // normalisation minimale utilisée côté client : sillon_id + date + type + delay_minutes/message/data
    id: `daily-${r.id}`,
    sillon_id: r.schedule_id,
    date: r.date,
    type: r.type || (r.removed_stops ? 'suppression' : (r.delay_minutes ? 'retard' : 'modification')),
    delay_minutes: r.delay_minutes != null ? Number(r.delay_minutes) : 0,
    message: r.cause || r.message || null,
    data: { raw: r },
    created_at: r.created_at ?? null,
    updated_at: r.updated_at ?? null,
  }));
}

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

    // Lire les perturbations quotidiennes de sillon depuis la table schedule_daily_variants et les inclure
    const daily = await readDailyPerturbationsFromDB(3);

    // Fusionner : on ajoute les perturbations quotidiennes à la liste retournée
    const merged = perturbations.concat(daily);

    return NextResponse.json({ perturbations: merged });
  } catch (e) {
    console.error('GET /api/perturbations/public', e);
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 });
  }
}
