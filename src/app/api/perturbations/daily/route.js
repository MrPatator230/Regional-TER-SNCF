import { NextResponse } from 'next/server';
import { scheduleQuery } from '@/js/db-schedule';

export const runtime = 'nodejs';

// GET /api/perturbations/daily - lister les perturbations quotidiennes (optionnel: schedule_id, date)
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const schedule_id = url.searchParams.get('schedule_id');
    const date = url.searchParams.get('date');
    const daysParam = url.searchParams.get('days');

    let sql = 'SELECT * FROM schedule_daily_variants';
    const params = [];
    const where = [];

    if (date) {
      where.push('date = ?'); params.push(date);
    } else if (daysParam) {
      // construire liste de dates YYYY-MM-DD pour aujourd'hui + (days-1)
      const days = Math.max(1, Math.min(30, parseInt(daysParam, 10) || 3));
      const dates = [];
      const now = new Date();
      for (let i=0;i<days;i++){ const d = new Date(now); d.setDate(now.getDate()+i); dates.push(d.toISOString().slice(0,10)); }
      if(dates.length){ where.push(`date IN (${dates.map(()=>'?').join(',')})`); params.push(...dates); }
    }

    if (schedule_id) { where.push('schedule_id = ?'); params.push(Number(schedule_id)); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY date ASC, schedule_id ASC, id ASC';

    const rows = await scheduleQuery(sql, params);
    return NextResponse.json({ perturbations: rows });
  } catch (e) {
    console.error('GET /api/perturbations/daily', e);
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/perturbations/daily - créer une perturbation quotidienne dans la table schedule_daily_variants
export async function POST(request) {
  try {
    const payload = await request.json();
    if (!payload.schedule_id && !payload.sillon_id) return NextResponse.json({ error: 'schedule_id requis' }, { status: 400 });
    const scheduleId = Number(payload.schedule_id ?? payload.sillon_id);
    if (!scheduleId) return NextResponse.json({ error: 'schedule_id invalide' }, { status: 400 });
    if (!payload.date) return NextResponse.json({ error: 'date (YYYY-MM-DD) requise' }, { status: 400 });
    if (!payload.type) return NextResponse.json({ error: 'type requis' }, { status: 400 });

    const fields = [ 'schedule_id', 'date', 'type', 'delay_from_station_id', 'delay_minutes', 'cause', 'mod_departure_station_id', 'mod_arrival_station_id', 'mod_departure_time', 'mod_arrival_time', 'removed_stops' ];
    const values = [ scheduleId, payload.date, payload.type, payload.delay_from_station_id ?? null, payload.delay_minutes ?? null, payload.cause ?? payload.message ?? null, payload.mod_departure_station_id ?? null, payload.mod_arrival_station_id ?? null, payload.mod_departure_time ?? null, payload.mod_arrival_time ?? null, payload.removed_stops ? (typeof payload.removed_stops === 'string' ? payload.removed_stops : JSON.stringify(payload.removed_stops)) : null ];

    const placeholders = fields.map(()=>'?').join(',');
    const res = await scheduleQuery(`INSERT INTO schedule_daily_variants (${fields.join(',')}) VALUES (${placeholders})`, values);
    return NextResponse.json({ id: res.insertId, success: true });
  } catch (e) {
    console.error('POST /api/perturbations/daily', e);
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH /api/perturbations/daily - mettre à jour une perturbation quotidienne (body: id + champs à mettre à jour)
export async function PATCH(request) {
  try {
    const payload = await request.json();
    const id = Number(payload.id || payload._id || payload.ID);
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const allowed = ['schedule_id','date','type','delay_from_station_id','delay_minutes','cause','mod_departure_station_id','mod_arrival_station_id','mod_departure_time','mod_arrival_time','removed_stops'];
    const sets = [];
    const params = [];
    for(const k of allowed){ if(Object.prototype.hasOwnProperty.call(payload,k)) { sets.push(`${k} = ?`); params.push(k==='removed_stops' && payload[k] && typeof payload[k] !== 'string' ? JSON.stringify(payload[k]) : payload[k]); } }
    if(!sets.length) return NextResponse.json({ error: 'Rien à mettre à jour' }, { status: 400 });
    params.push(id);
    const sql = `UPDATE schedule_daily_variants SET ${sets.join(', ')} WHERE id = ?`;
    const res = await scheduleQuery(sql, params);
    return NextResponse.json({ success: true, affectedRows: res.affectedRows ?? null });
  } catch (e) {
    console.error('PATCH /api/perturbations/daily', e);
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE /api/perturbations/daily - supprimer une perturbation quotidienne (body: id)
export async function DELETE(request) {
  try {
    const payload = await request.json();
    const id = Number(payload.id || payload._id || payload.ID);
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
    const res = await scheduleQuery('DELETE FROM schedule_daily_variants WHERE id = ?', [id]);
    return NextResponse.json({ success: true, affectedRows: res.affectedRows ?? null });
  } catch (e) {
    console.error('DELETE /api/perturbations/daily', e);
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 });
  }
}
