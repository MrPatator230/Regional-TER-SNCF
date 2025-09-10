import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { getSessionUser } from '@/app/lib/auth';
import QRCode from 'qrcode';
import crypto from 'crypto';

export const runtime = 'nodejs';

async function ensureTables() {
  await query(`CREATE TABLE IF NOT EXISTS cart_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    schedule_id INT UNSIGNED NOT NULL,
    origin VARCHAR(190) NOT NULL,
    destination VARCHAR(190) NOT NULL,
    passengers TINYINT UNSIGNED NOT NULL,
    card VARCHAR(50) NULL,
    price_cents INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY k_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` , []);
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
  // Migration douce: ajouter colonnes / contraintes si manquantes
  try { await query('ALTER TABLE tickets ADD COLUMN user_id INT UNSIGNED NULL AFTER order_id'); } catch {}
  try { await query('ALTER TABLE tickets ADD KEY k_user (user_id)'); } catch {}
  try { await query('ALTER TABLE tickets ADD UNIQUE KEY uniq_ticket (order_id, passenger_index)'); } catch {}
  // Renseigner user_id manquant via orders
  try { await query('UPDATE tickets t JOIN orders o ON t.order_id=o.id SET t.user_id=o.user_id WHERE t.user_id IS NULL'); } catch {}
}

export async function POST() {
  try {
    const user = await getSessionUser();
    if(!user || user.role !== 'client') return NextResponse.json({ error:'Non autorisé' }, { status:401 });
    await ensureTables();
    const items = await query('SELECT * FROM cart_items WHERE user_id = ? ORDER BY id ASC',[user.id]);
    if(!items.length) return NextResponse.json({ error:'Panier vide' }, { status:400 });
    const ordersOut = [];
    for(const it of items) {
      const res = await query('INSERT INTO orders (user_id, schedule_id, origin, destination, passengers, card, price_cents) VALUES (?,?,?,?,?,?,?)', [user.id, it.schedule_id, it.origin, it.destination, it.passengers, it.card, it.price_cents]);
      const orderId = res.insertId;
      const reference = 'C'+String(orderId).padStart(8,'0');
      const tickets = [];
      for(let p=0; p<it.passengers; p++) {
        const basePayload = { t:'BILLET', order:reference, o:it.origin, d:it.destination, s:it.schedule_id, p:p+1, u:user.id, ts:Date.now() };
        const secret = process.env.TICKET_QR_SECRET || 'dev-ticket-secret';
        const canonical = `${basePayload.order}|${basePayload.s}|${basePayload.p}|${basePayload.u}|${basePayload.ts}`;
        const sig = crypto.createHmac('sha256', secret).update(canonical).digest('base64url');
        const payload = { ...basePayload, sig };
        const text = JSON.stringify(payload);
        const qr_data = await QRCode.toDataURL(text, { errorCorrectionLevel:'M', margin:1, scale:4 });
        // Insertion avec user_id et unicité (order_id, passenger_index)
        const tr = await query('INSERT INTO tickets (order_id, user_id, schedule_id, origin, destination, passenger_index, qr_data) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE qr_data=VALUES(qr_data)', [orderId, user.id, it.schedule_id, it.origin, it.destination, p+1, qr_data]);
        tickets.push({ id: tr.insertId || null, passenger_index: p+1, qr_data });
      }
      ordersOut.push({ order: { id: orderId, reference, schedule_id: it.schedule_id, price_cents: it.price_cents, passengers: it.passengers, origin: it.origin, destination: it.destination }, tickets });
    }
    await query('DELETE FROM cart_items WHERE user_id = ?', [user.id]);
    return NextResponse.json({ orders: ordersOut });
  } catch(e) {
    console.error('POST /api/public/cart/checkout', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}
