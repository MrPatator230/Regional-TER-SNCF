import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { getSessionUser } from '@/app/lib/auth';

export const runtime = 'nodejs';

function toMinutesForType(station_type) {
  // Mapping demandé: 12h pour "urbaine" et 30min pour "ville" (d'après l'énoncé)
  return station_type === 'urbaine' ? 12 * 60 : 30; // défaut: 30 min
}

function normalizeStation(body) {
  const name = String(body?.name || '').trim();
  const station_type = (String(body?.station_type || '').trim().toLowerCase());
  const validTypes = ['urbaine', 'ville'];
  const type = validTypes.includes(station_type) ? station_type : null;

  // services: tableau parmi TER, TGV, Intercités, Fret
  let services = Array.isArray(body?.services) ? body.services : [];
  const validServices = ['TER', 'TGV', 'Intercités', 'Fret'];
  services = services.filter(s => validServices.includes(s));

  // platforms: [{ name, distance_m }]
  let platforms = Array.isArray(body?.platforms) ? body.platforms : [];
  platforms = platforms
    .map(p => ({
      name: String(p?.name || '').trim(),
      distance_m: Number(p?.distance_m || 0)
    }))
    .filter(p => p.name && p.distance_m >= 0);

  // transports: tableau parmi bus, train, tramway, métro, tram-train
  const validTransports = ['bus', 'train', 'tramway', 'métro', 'tram-train'];
  let transports = Array.isArray(body?.transports) ? body.transports : [];
  transports = transports
    .map(t => String(t || '').trim().toLowerCase())
    .filter(t => validTransports.includes(t));

  return { name, station_type: type, services, platforms, transports };
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

    const rows = await query('SELECT id, name, station_type, services, platforms, transports, created_at, updated_at FROM stations ORDER BY name ASC', []);
    const data = rows.map(r => ({
      id: r.id,
      name: r.name,
      station_type: r.station_type,
      services: typeof r.services === 'string' ? JSON.parse(r.services) : r.services,
      platforms: typeof r.platforms === 'string' ? JSON.parse(r.platforms) : r.platforms,
      transports: typeof r.transports === 'string' ? JSON.parse(r.transports) : r.transports,
      display_window_minutes: toMinutesForType(r.station_type),
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    return NextResponse.json({ stations: data });
  } catch (e) {
    console.error('GET /api/stations error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const err = await ensureAdmin();
    if (err) return err;

    const body = await request.json().catch(() => ({}));
    const st = normalizeStation(body);

    if (!st.name || !st.station_type || st.services.length === 0) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO stations (name, station_type, services, platforms, transports)
       VALUES (?, ?, ?, ?, ?)`,
      [
        st.name,
        st.station_type,
        JSON.stringify(st.services),
        JSON.stringify(st.platforms),
        JSON.stringify(st.transports),
      ]
    );

    const [row] = await query('SELECT id, name, station_type, services, platforms, transports, created_at, updated_at FROM stations WHERE id = ?', [result.insertId]);
    const data = {
      ...row,
      services: typeof row.services === 'string' ? JSON.parse(row.services) : row.services,
      platforms: typeof row.platforms === 'string' ? JSON.parse(row.platforms) : row.platforms,
      transports: typeof row.transports === 'string' ? JSON.parse(row.transports) : row.transports,
      display_window_minutes: toMinutesForType(row.station_type),
    };

    return NextResponse.json({ station: data }, { status: 201 });
  } catch (e) {
    console.error('POST /api/stations error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

