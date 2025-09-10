import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { getSessionUser } from '@/app/lib/auth';
import crypto from 'crypto';

export const runtime = 'nodejs';

async function ensureTables(){
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
  try { await query('ALTER TABLE tickets ADD COLUMN user_id INT UNSIGNED NULL AFTER order_id'); } catch {}
  try { await query('ALTER TABLE tickets ADD KEY k_user (user_id)'); } catch {}
  try { await query('ALTER TABLE tickets ADD UNIQUE KEY uniq_ticket (order_id, passenger_index)'); } catch {}
  try { await query('UPDATE tickets t JOIN orders o ON t.order_id=o.id SET t.user_id=o.user_id WHERE t.user_id IS NULL'); } catch {}
}

function verifySignature(payload){
  const secret = process.env.TICKET_QR_SECRET || 'dev-ticket-secret';
  if(!payload || !payload.sig) return false;
  const canonical = `${payload.order}|${payload.s}|${payload.p}|${payload.u}|${payload.ts}`;
  const sig = crypto.createHmac('sha256', secret).update(canonical).digest('base64url');
  return sig === payload.sig;
}

// GET /api/public/tickets => { tickets:[{ id, order_id, reference, passenger_index, origin, destination, schedule_id, created_at }...] }
export async function GET(){
  try {
    const user = await getSessionUser();
    if(!user || user.role !== 'client') return NextResponse.json({ tickets: [] });
    await ensureTables();
    const rows = await query('SELECT t.id, t.order_id, t.schedule_id, t.origin, t.destination, t.passenger_index, t.created_at FROM tickets t JOIN orders o ON t.order_id=o.id WHERE t.user_id=? ORDER BY t.id DESC', [user.id]);
    const tickets = rows.map(r => ({
      id: r.id,
      order_id: r.order_id,
      reference: 'C'+String(r.order_id).padStart(8,'0'),
      passenger_index: r.passenger_index,
      origin: r.origin,
      destination: r.destination,
      schedule_id: r.schedule_id,
      created_at: r.created_at
    }));
    return NextResponse.json({ tickets });
  } catch(e){
    console.error('GET /api/public/tickets', e);
    return NextResponse.json({ tickets: [] });
  }
}

