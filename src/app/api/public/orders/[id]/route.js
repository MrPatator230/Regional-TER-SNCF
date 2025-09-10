import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { getSessionUser } from '@/app/lib/auth';

export const runtime = 'nodejs';

async function ensureTables(){
  // Tables déjà créées ailleurs mais on sécurise
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
  // Migration douce
  try { await query('ALTER TABLE tickets ADD COLUMN user_id INT UNSIGNED NULL AFTER order_id'); } catch {}
  try { await query('ALTER TABLE tickets ADD KEY k_user (user_id)'); } catch {}
  try { await query('ALTER TABLE tickets ADD UNIQUE KEY uniq_ticket (order_id, passenger_index)'); } catch {}
  try { await query('UPDATE tickets t JOIN orders o ON t.order_id=o.id SET t.user_id=o.user_id WHERE t.user_id IS NULL'); } catch {}
}

// GET /api/public/orders/:id => { order:{...}, tickets:[...] }
export async function GET(req, context){
  try {
    const user = await getSessionUser();
    if(!user || user.role !== 'client') return NextResponse.json({ error:'Non autorisé' }, { status:401 });
    const { id: rawId } = await context.params; // Next 15 params thenable
    const id = Number(rawId);
    if(!id) return NextResponse.json({ error:'ID invalide' }, { status:400 });
    await ensureTables();
    const rows = await query('SELECT * FROM orders WHERE id=? AND user_id=? LIMIT 1',[id, user.id]);
    if(!rows.length) return NextResponse.json({ error:'Introuvable' }, { status:404 });
    const o = rows[0];
    const trows = await query('SELECT id, passenger_index, qr_data FROM tickets WHERE order_id=? AND user_id=? ORDER BY passenger_index ASC',[id, user.id]);
    const order = {
      id: o.id,
      reference: 'C'+String(o.id).padStart(8,'0'),
      schedule_id: o.schedule_id,
      origin: o.origin,
      destination: o.destination,
      passengers: o.passengers,
      card: o.card,
      price_cents: o.price_cents,
      status: o.status,
      created_at: o.created_at
    };
    const tickets = trows.map(t=> ({ id: t.id, passenger_index: t.passenger_index, qr_data: t.qr_data }));
    return NextResponse.json({ order, tickets });
  } catch(e){
    console.error('GET /api/public/orders/[id]', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}
