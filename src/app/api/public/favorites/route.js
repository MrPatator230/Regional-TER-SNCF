import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { getSessionUser } from '@/app/lib/auth';

export const runtime = 'nodejs';

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS user_favorites (
    user_id INT UNSIGNED NOT NULL,
    schedule_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, schedule_id),
    KEY k_sched (schedule_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== 'client') return NextResponse.json({ favorites: [] });
  await ensureTable();
  const rows = await query('SELECT schedule_id FROM user_favorites WHERE user_id = ?', [user.id]);
  return NextResponse.json({ favorites: rows.map(r=>r.schedule_id) });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'client') return NextResponse.json({ error: 'Non autorisé' }, { status:401 });
  await ensureTable();
  const body = await request.json().catch(()=>({}));
  const schedule_id = Number(body.schedule_id);
  if(!schedule_id) return NextResponse.json({ error:'schedule_id requis' }, { status:400 });
  await query('INSERT IGNORE INTO user_favorites (user_id, schedule_id) VALUES (?,?)', [user.id, schedule_id]);
  return NextResponse.json({ success:true });
}

export async function DELETE(request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'client') return NextResponse.json({ error: 'Non autorisé' }, { status:401 });
  await ensureTable();
  const body = await request.json().catch(()=>({}));
  const schedule_id = Number(body.schedule_id);
  if(!schedule_id) return NextResponse.json({ error:'schedule_id requis' }, { status:400 });
  await query('DELETE FROM user_favorites WHERE user_id = ? AND schedule_id = ? LIMIT 1', [user.id, schedule_id]);
  return NextResponse.json({ success:true });
}

