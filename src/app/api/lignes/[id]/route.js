import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { getSessionUser } from '@/app/lib/auth';

export const runtime = 'nodejs';

async function ensureAdmin() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  return null;
}

function sanitize(body) {
  const out = {};
  if (body && typeof body === 'object') {
    if (body.depart_station_id != null) {
      const v = Number(body.depart_station_id);
      if (Number.isInteger(v) && v > 0) out.depart_station_id = v;
    }
    if (body.arrivee_station_id != null) {
      const v = Number(body.arrivee_station_id);
      if (Number.isInteger(v) && v > 0) out.arrivee_station_id = v;
    }
    if (body.exploitation_type != null) {
      const t = String(body.exploitation_type || '').trim().toLowerCase();
      if (['voyageur','fret','exploitation'].includes(t)) out.exploitation_type = t;
    }
    if (body.desservies != null) {
      let arr = Array.isArray(body.desservies) ? body.desservies : [];
      arr = arr.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
      out.desservies = arr;
    }
  }
  return out;
}

export async function PATCH(request, ctx) {
  try {
    const err = await ensureAdmin();
    if (err) return err;

    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: 'ID invalide' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const s = sanitize(body);

    const updates = [];
    const values = [];

    if (s.depart_station_id != null) { updates.push('depart_station_id = ?'); values.push(s.depart_station_id); }
    if (s.arrivee_station_id != null) { updates.push('arrivee_station_id = ?'); values.push(s.arrivee_station_id); }
    if (s.exploitation_type != null) { updates.push('exploitation_type = ?'); values.push(s.exploitation_type); }
    if (s.desservies != null) { updates.push('desservies = ?'); values.push(JSON.stringify(s.desservies)); }

    if (!updates.length) return NextResponse.json({ error: 'Aucune modification' }, { status: 400 });

    values.push(id);
    await query(`UPDATE lignes SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);

    const [row] = await query(
      `SELECT l.id, l.depart_station_id, l.arrivee_station_id, l.exploitation_type, l.desservies, l.created_at, l.updated_at,
              sd.name AS depart_name, sa.name AS arrivee_name
       FROM lignes l
       LEFT JOIN stations sd ON sd.id = l.depart_station_id
       LEFT JOIN stations sa ON sa.id = l.arrivee_station_id
       WHERE l.id = ?`,
      [id]
    );

    if (!row) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });

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

    return NextResponse.json({ ligne: data });
  } catch (e) {
    console.error('PATCH /api/lignes/[id] error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request, ctx) {
  try {
    const err = await ensureAdmin();
    if (err) return err;

    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: 'ID invalide' }, { status: 400 });

    const res = await query('DELETE FROM lignes WHERE id = ?', [id]);
    if (res.affectedRows === 0) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/lignes/[id] error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
