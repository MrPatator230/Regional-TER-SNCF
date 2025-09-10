import { NextResponse } from 'next/server';
import { query } from '@/js/db';

export async function POST(request) {
  const sid = request.headers.get('cookie')?.match(/(?:^|; )session=([^;]+)/)?.[1] || null;
  if (sid) {
    try {
      await query('DELETE FROM sessions WHERE id = ?', [sid]);
    } catch (_) {
      // on ignore les erreurs de nettoyage
    }
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set('session', '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
