import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { getSessionUser } from '@/app/lib/auth';

export const runtime = 'nodejs';

async function ensureTable() {
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
}

// POST /api/public/cart/merge  Body: { items:[{schedule_id,origin,destination,passengers,card}] }
export async function POST(request){
  try {
    const user = await getSessionUser();
    if(!user || user.role!=='client') return NextResponse.json({ error:'Non autorisé' }, { status:401 });
    await ensureTable();
    const body = await request.json().catch(()=>({}));
    const items = Array.isArray(body.items)? body.items: [];
    let inserted = 0;
    for(const it of items){
      const schedule_id = Number(it.schedule_id);
      const origin = String(it.origin||'').trim();
      const destination = String(it.destination||'').trim();
      const passengers = Math.min(9, Math.max(1, Number(it.passengers||1)));
      const card = String(it.card||'none');
      if(!schedule_id || !origin || !destination) continue;
      const price_cents = 1500 + 500*(passengers-1);
      await query('INSERT INTO cart_items (user_id, schedule_id, origin, destination, passengers, card, price_cents) VALUES (?,?,?,?,?,?,?)',[user.id,schedule_id,origin,destination,passengers,card,price_cents]);
      inserted++;
    }
    return NextResponse.json({ merged: inserted });
  } catch(e){
    console.error('POST /api/public/cart/merge', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}

