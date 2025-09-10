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

function normalize(body){
  const ligne_id = Number(body?.ligne_id||0);
  const titre = (body?.titre||'').toString().trim().slice(0,190) || null;
  const message = (body?.message||'').toString().trim();
  const priority = ['low','normal','high'].includes(body?.priority)? body.priority : 'normal';
  const date_debut = body?.date_debut ? new Date(body.date_debut) : null;
  const date_fin = body?.date_fin ? new Date(body.date_fin) : null;
  let data = body?.data; if(typeof data !== 'object' || data === null) data = {};
  return {
    ligne_id,
    titre,
    message,
    priority,
    date_debut: date_debut? date_debut.toISOString().slice(0,19).replace('T',' ') : null,
    date_fin: date_fin? date_fin.toISOString().slice(0,19).replace('T',' ') : null,
    data
  };
}

export async function GET(request){
  try {
    const err = await ensureAdmin(); if (err) return err;
    const { searchParams } = new URL(request.url);
    const ligneId = Number(searchParams.get('ligne_id')||0);
    const where = [];
    const params = [];
    if(ligneId){ where.push('ligne_id = ?'); params.push(ligneId); }
    const whereSql = where.length? 'WHERE '+where.join(' AND ') : '';
    const rows = await query(`SELECT * FROM station_display_infos ${whereSql} ORDER BY created_at DESC`, params);
    const infos = rows.map(r=> ({
      id: r.id,
      ligne_id: r.ligne_id,
      titre: r.titre,
      message: r.message,
      priority: r.priority,
      date_debut: r.date_debut,
      date_fin: r.date_fin,
      data: typeof r.data === 'string'? JSON.parse(r.data): r.data,
      created_at: r.created_at,
      updated_at: r.updated_at
    }));
    return NextResponse.json({ infos });
  } catch(e){
    console.error('GET /api/display-infos', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request){
  try {
    const err = await ensureAdmin(); if (err) return err;
    const body = await request.json().catch(()=>({}));
    const i = normalize(body);
    if(!i.ligne_id || !i.message) return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    await query(`INSERT INTO station_display_infos (ligne_id,titre,message,priority,date_debut,date_fin,data) VALUES (?,?,?,?,?,?,?)`, [i.ligne_id,i.titre,i.message,i.priority,i.date_debut,i.date_fin,JSON.stringify(i.data)]);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch(e){
    console.error('POST /api/display-infos', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

