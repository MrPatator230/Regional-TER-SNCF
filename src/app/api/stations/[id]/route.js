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

function isValidType(t) {
  return ['urbaine', 'ville'].includes(String(t || '').toLowerCase());
}

function sanitizeArrays(body) {
  const validServices = ['TER', 'TGV', 'Intercités', 'Fret'];
  const validTransports = ['bus', 'train', 'tramway', 'métro', 'tram-train'];

  let services = Array.isArray(body?.services) ? body.services : undefined;
  if (services) services = services.filter(s => validServices.includes(s));

  let platforms = Array.isArray(body?.platforms) ? body.platforms : undefined;
  if (platforms) {
    platforms = platforms
      .map(p => ({ name: String(p?.name || '').trim(), distance_m: Number(p?.distance_m || 0) }))
      .filter(p => p.name && p.distance_m >= 0);
  }

  let transports = Array.isArray(body?.transports) ? body.transports : undefined;
  if (transports) {
    transports = transports.map(t => String(t || '').trim().toLowerCase()).filter(t => validTransports.includes(t));
  }

  return { services, platforms, transports };
}

export async function PATCH(request, ctx) {
  try {
    const err = await ensureAdmin();
    if (err) return err;

    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: 'ID invalide' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const updates = [];
    const values = [];

    if (typeof body.name === 'string' && body.name.trim()) {
      updates.push('name = ?');
      values.push(body.name.trim());
    }

    if (body.station_type && isValidType(body.station_type)) {
      updates.push('station_type = ?');
      values.push(String(body.station_type).toLowerCase());
    }

    const arrs = sanitizeArrays(body);
    if (arrs.services) {
      updates.push('services = ?');
      values.push(JSON.stringify(arrs.services));
    }
    if (arrs.platforms) {
      updates.push('platforms = ?');
      values.push(JSON.stringify(arrs.platforms));
    }
    if (arrs.transports) {
      updates.push('transports = ?');
      values.push(JSON.stringify(arrs.transports));
    }

    if (!updates.length) return NextResponse.json({ error: 'Aucune modification' }, { status: 400 });

    values.push(id);
    await query(`UPDATE stations SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);

    const [row] = await query('SELECT id, name, station_type, services, platforms, transports, created_at, updated_at FROM stations WHERE id = ?', [id]);
    if (!row) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });

    const data = {
      ...row,
      services: typeof row.services === 'string' ? JSON.parse(row.services) : row.services,
      platforms: typeof row.platforms === 'string' ? JSON.parse(row.platforms) : row.platforms,
      transports: typeof row.transports === 'string' ? JSON.parse(row.transports) : row.transports,
    };

    return NextResponse.json({ station: data });
  } catch (e) {
    console.error('PATCH /api/stations/[id] error', e);
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

    const res = await query('DELETE FROM stations WHERE id = ?', [id]);
    if (res.affectedRows === 0) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/stations/[id] error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
