import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }
    const adminHeader = request.headers.get('x-admin-token') || '';
    const adminToken = process.env.DEV_ADMIN_TOKEN || '';
    if (!adminToken || adminHeader !== adminToken) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const rawEmail = String(body?.email || '').trim();
    const email = rawEmail.toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password || !EMAIL_RE.test(rawEmail)) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
    }

    const users = await query('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
    const user = users && users[0];
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    const password_hash = await bcrypt.hash(password, 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, user.id]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Dev set password error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

