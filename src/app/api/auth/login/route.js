import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 7);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawEmail = String(body?.email || '').trim();
    const email = rawEmail.toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password || !EMAIL_RE.test(rawEmail)) {
      return NextResponse.json({ error: 'Identifiants manquants ou invalides' }, { status: 400 });
    }

    let rows = await query(
      `SELECT id, first_name, last_name, email, password_hash, COALESCE(role, 'client') AS role
         FROM users
        WHERE LOWER(email) = ?
        LIMIT 1`,
      [email]
    );

    let user = rows && rows[0];

    // Provisionnement automatique: créer l’utilisateur s’il n’existe pas
    if (!user) {
      const password_hash = await bcrypt.hash(password, 10);
      const localPart = email.split('@')[0] || 'utilisateur';
      await query(
        'INSERT INTO users (first_name, last_name, birth_date, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
        [localPart, '', null, email, password_hash, 'client']
      );
      rows = await query(
        `SELECT id, first_name, last_name, email, password_hash, COALESCE(role, 'client') AS role FROM users WHERE LOWER(email) = ? LIMIT 1`,
        [email]
      );
      user = rows && rows[0];
    }

    if (!user?.password_hash) {
      return NextResponse.json({ error: 'E-mail ou mot de passe invalide' }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, String(user.password_hash));
    if (!ok) {
      return NextResponse.json({ error: 'E-mail ou mot de passe invalide' }, { status: 401 });
    }

    // Création de la session
    const sessionId = crypto.randomBytes(32).toString('hex');
    const ipHeader = request.headers.get('x-forwarded-for') || '';
    const ip = ipHeader.split(',')[0].trim() || null;
    const ua = request.headers.get('user-agent') || null;

    await query(
      'INSERT INTO sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY), ?, ?)',
      [sessionId, user.id, SESSION_TTL_DAYS, ip, ua]
    );

    const res = NextResponse.json({ success: true, role: user.role || 'client' });
    res.cookies.set('session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
    });
    return res;
  } catch (e) {
    console.error('Login error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
