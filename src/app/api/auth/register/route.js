import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  try {
    const body = await request.json();
    const firstName = (body?.firstName || '').trim();
    const lastName = (body?.lastName || '').trim();
    const birthDate = (body?.birthDate || '').trim() || null;
    const email = (body?.email || '').trim().toLowerCase();
    const password = body?.password || '';

    if (!firstName || !lastName || !email || !password || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Champs manquants ou e-mail invalide' }, { status: 400 });
    }

    const rows = await query('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
    if (rows && rows[0]) {
      return NextResponse.json({ error: 'Un compte existe déjà avec cet e-mail' }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(password, 10);

    await query(
      'INSERT INTO users (first_name, last_name, birth_date, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [firstName, lastName, birthDate, email, password_hash, 'client']
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Register error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
