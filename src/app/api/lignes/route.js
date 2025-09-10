import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { getSessionUser } from '@/app/lib/auth';

export const runtime = 'nodejs';

function normalizeLigne(body) {
  const depart_station_id = Number(body?.depart_station_id || 0);
  const arrivee_station_id = Number(body?.arrivee_station_id || 0);
  const type = String(body?.exploitation_type || '').trim().toLowerCase();
  const validTypes = ['voyageur', 'fret', 'exploitation'];
  const exploitation_type = validTypes.includes(type) ? type : null;

  let desservies = Array.isArray(body?.desservies) ? body.desservies : [];
  desservies = desservies
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  return { depart_station_id, arrivee_station_id, exploitation_type, desservies };
}

async function ensureAdmin() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  return null;
}

export async function GET() {
  try {
    const err = await ensureAdmin();
    if (err) return err;

    const rows = await query(
      `SELECT l.id, l.depart_station_id, l.arrivee_station_id, l.exploitation_type, l.desservies, l.created_at, l.updated_at,
              sd.name AS depart_name, sa.name AS arrivee_name
       FROM lignes l
       LEFT JOIN stations sd ON sd.id = l.depart_station_id
       LEFT JOIN stations sa ON sa.id = l.arrivee_station_id
       ORDER BY l.id DESC`,
      []
    );

    const data = rows.map((r) => ({
      id: r.id,
      depart_station_id: r.depart_station_id,
      arrivee_station_id: r.arrivee_station_id,
      exploitation_type: r.exploitation_type,
      desservies: typeof r.desservies === 'string' ? JSON.parse(r.desservies) : r.desservies,
      depart_name: r.depart_name || null,
      arrivee_name: r.arrivee_name || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return NextResponse.json({ lignes: data });
  } catch (e) {
    console.error('GET /api/lignes error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const err = await ensureAdmin();
    if (err) return err;

    const body = await request.json().catch(() => ({}));
    const l = normalizeLigne(body);

    if (!l.depart_station_id || !l.arrivee_station_id || !l.exploitation_type) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO lignes (depart_station_id, arrivee_station_id, exploitation_type, desservies)
       VALUES (?, ?, ?, ?)`,
      [l.depart_station_id, l.arrivee_station_id, l.exploitation_type, JSON.stringify(l.desservies)]
    );

    const [row] = await query(
      `SELECT l.id, l.depart_station_id, l.arrivee_station_id, l.exploitation_type, l.desservies, l.created_at, l.updated_at,
              sd.name AS depart_name, sa.name AS arrivee_name
       FROM lignes l
       LEFT JOIN stations sd ON sd.id = l.depart_station_id
       LEFT JOIN stations sa ON sa.id = l.arrivee_station_id
       WHERE l.id = ?`,
      [result.insertId]
    );

    const data = {
      id: row.id,
      depart_station_id: row.depart_station_id,
      arrivee_station_id: row.arrivee_station_id,
      exploitation_type: row.exploitation_type,
      desservies: typeof row.desservies === 'string' ? JSON.parse(row.desservies) : row.desservies,
      depart_name: row.depart_name || null,
      arrivee_name: row.arrivee_name || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    return NextResponse.json({ ligne: data }, { status: 201 });
  } catch (e) {
    console.error('POST /api/lignes error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

