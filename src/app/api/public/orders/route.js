import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { getSessionUser } from '@/app/lib/auth';

export const runtime = 'nodejs';

// POST /api/public/orders
// Body: { schedule_id, origin, destination, passengers, card }
// Returns { order: { id, reference } }
export async function POST(request) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'client') return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const body = await request.json().catch(()=>({}));
    const schedule_id = Number(body.schedule_id);
    const origin = String(body.origin||'').trim();
    const destination = String(body.destination||'').trim();
    const passengers = Math.min(9, Math.max(1, Number(body.passengers||1)));
    const card = String(body.card||'none');
    if(!schedule_id || !origin || !destination) return NextResponse.json({ error:'Champs manquants' }, { status:400 });

    // Auto-provision tables si absentes (simplification dev)
    await query(`CREATE TABLE IF NOT EXISTS orders (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL,
      schedule_id INT UNSIGNED NOT NULL,
      origin VARCHAR(190) NOT NULL,
      destination VARCHAR(190) NOT NULL,
      passengers TINYINT UNSIGNED NOT NULL,
      card VARCHAR(50) NULL,
      price_cents INT UNSIGNED NOT NULL DEFAULT 0,
      status ENUM('pending','confirmed','failed') NOT NULL DEFAULT 'confirmed',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), KEY k_user (user_id), KEY k_sched (schedule_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` , []);

    // Pricing fictif: base 1500 + 500*(passengers-1)
    const price_cents = 1500 + 500*(passengers-1);
    const result = await query(`INSERT INTO orders (user_id, schedule_id, origin, destination, passengers, card, price_cents) VALUES (?,?,?,?,?,?,?)`, [user.id, schedule_id, origin, destination, passengers, card, price_cents]);
    const reference = 'C' + String(result.insertId).padStart(8,'0');
    return NextResponse.json({ order: { id: result.insertId, reference, price_cents } }, { status:201 });
  } catch(e) {
    console.error('POST /api/public/orders error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status:500 });
  }
}

// GET /api/public/orders
// Returns { orders: [{ id, reference, schedule_id, origin, destination, passengers, card, price_cents, status, created_at }, ...] }
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'client') return NextResponse.json({ orders: [] });
    await query(`CREATE TABLE IF NOT EXISTS orders (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL,
      schedule_id INT UNSIGNED NOT NULL,
      origin VARCHAR(190) NOT NULL,
      destination VARCHAR(190) NOT NULL,
      passengers TINYINT UNSIGNED NOT NULL,
      card VARCHAR(50) NULL,
      price_cents INT UNSIGNED NOT NULL DEFAULT 0,
      status ENUM('pending','confirmed','failed') NOT NULL DEFAULT 'confirmed',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), KEY k_user (user_id), KEY k_sched (schedule_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []);
    await query(`CREATE TABLE IF NOT EXISTS tickets (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_id INT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NULL,
      schedule_id INT UNSIGNED NOT NULL,
      origin VARCHAR(190) NOT NULL,
      destination VARCHAR(190) NOT NULL,
      passenger_index TINYINT UNSIGNED NOT NULL,
      qr_data MEDIUMTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), KEY k_order (order_id), KEY k_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []);
    const rows = await query('SELECT o.id, o.schedule_id, o.origin, o.destination, o.passengers, o.card, o.price_cents, o.status, o.created_at, COUNT(t.id) AS tickets_count FROM orders o LEFT JOIN tickets t ON t.order_id=o.id WHERE o.user_id = ? GROUP BY o.id ORDER BY o.id DESC', [user.id]);
    const orders = rows.map(r => ({
      id: r.id,
      reference: 'C'+String(r.id).padStart(8,'0'),
      schedule_id: r.schedule_id,
      origin: r.origin,
      destination: r.destination,
      passengers: r.passengers,
      card: r.card,
      price_cents: r.price_cents,
      status: r.status,
      created_at: r.created_at,
      tickets_count: r.tickets_count || 0
    }));
    return NextResponse.json({ orders });
  } catch (e) {
    return NextResponse.json({ orders: [] });
  }
}
