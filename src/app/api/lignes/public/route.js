import { NextResponse } from 'next/server';
import { query } from '@/js/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const rows = await query(
      `SELECT l.id, l.depart_station_id, l.arrivee_station_id, l.exploitation_type, l.desservies,
              sd.name AS depart_name, sa.name AS arrivee_name
       FROM lignes l
       LEFT JOIN stations sd ON sd.id = l.depart_station_id
       LEFT JOIN stations sa ON sa.id = l.arrivee_station_id
       ORDER BY l.id DESC`,
      []
    );

    const data = rows.map(r => ({
      id: r.id,
      depart_station_id: r.depart_station_id,
      arrivee_station_id: r.arrivee_station_id,
      exploitation_type: r.exploitation_type,
      desservies: typeof r.desservies === 'string' ? JSON.parse(r.desservies) : r.desservies,
      depart_name: r.depart_name || null,
      arrivee_name: r.arrivee_name || null
    }));
    return NextResponse.json({ lignes: data });
  } catch (e) {
    console.error('GET /api/lignes/public error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

