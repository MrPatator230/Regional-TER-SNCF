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

export async function GET() {
  const user = await getSessionUser();
  if(!user || user.role !== 'client') return NextResponse.json({ items: [], count:0 });
  await ensureTable();
  const rows = await query('SELECT id, schedule_id, origin, destination, passengers, card, price_cents, created_at FROM cart_items WHERE user_id = ? ORDER BY id DESC', [user.id]);
  return NextResponse.json({ items: rows, count: rows.length });
}

export async function POST(request) {
  try {
    const user = await getSessionUser();
    if(!user || user.role !== 'client') return NextResponse.json({ error:'Non autorisé' }, { status:401 });
    await ensureTable();
    const body = await request.json().catch(()=>({}));
    const schedule_id = Number(body.schedule_id);
    const origin = String(body.origin||'').trim();
    const destination = String(body.destination||'').trim();
    const passengers = Math.min(9, Math.max(1, Number(body.passengers||1)));
    const card = String(body.card||'none');
    if(!schedule_id || !origin || !destination) return NextResponse.json({ error:'Champs manquants' }, { status:400 });
    const price_cents = 1500 + 500 * (passengers - 1);
    await query('INSERT INTO cart_items (user_id, schedule_id, origin, destination, passengers, card, price_cents) VALUES (?,?,?,?,?,?,?)', [user.id, schedule_id, origin, destination, passengers, card, price_cents]);
    return NextResponse.json({ success:true });
  } catch(e) {
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}

export async function DELETE(request){
  try {
    const user = await getSessionUser();
    if(!user || user.role!=='client') return NextResponse.json({ error:'Non autorisé' }, { status:401 });
    await ensureTable();
    const body = await request.json().catch(()=>({}));
    const id = Number(body.id);
    if(!id) return NextResponse.json({ error:'id requis' }, { status:400 });
    await query('DELETE FROM cart_items WHERE id = ? AND user_id = ? LIMIT 1',[id,user.id]);
    return NextResponse.json({ success:true });
  } catch(e) {
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}

export async function PATCH(request){
  try {
    const user = await getSessionUser();
    if(!user || user.role!=='client') return NextResponse.json({ error:'Non autorisé' }, { status:401 });
    await ensureTable();
    const body = await request.json().catch(()=>({}));
    const id = Number(body.id);
    const passengers = body.passengers!=null? Math.min(9, Math.max(1, Number(body.passengers)||1)) : null;
    const card = typeof body.card === 'string' ? String(body.card) : null;
    if(!id) return NextResponse.json({ error:'id requis' }, { status:400 });
    if(passengers===null && card===null) return NextResponse.json({ error:'Aucun changement' }, { status:400 });
    // Récup item
    const rows = await query('SELECT * FROM cart_items WHERE id=? AND user_id=? LIMIT 1',[id,user.id]);
    if(!rows.length) return NextResponse.json({ error:'Introuvable' }, { status:404 });
    const item = rows[0];
    const newPassengers = passengers!=null? passengers : item.passengers;
    const newCard = card!=null? card : item.card;
    const newPrice = 1500 + 500*(newPassengers-1);
    await query('UPDATE cart_items SET passengers=?, card=?, price_cents=? WHERE id=? AND user_id=? LIMIT 1',[newPassengers,newCard,newPrice,id,user.id]);
    return NextResponse.json({ item:{ id, schedule_id:item.schedule_id, origin:item.origin, destination:item.destination, passengers:newPassengers, card:newCard, price_cents:newPrice } });
  } catch(e){
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  }
}
