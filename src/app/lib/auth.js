import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { query } from '@/js/db';

export async function getSessionUser() {
  const cookieStore = await cookies(); // API asynchrone
  const sid = cookieStore.get('session')?.value;
  if (!sid) return null;
  const rows = await query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
        AND s.expires_at > UTC_TIMESTAMP()
      LIMIT 1`,
    [sid]
  );
  return rows?.[0] || null;
}

export async function requireRole(roles = []) {
  const user = await getSessionUser();
  if (!user) redirect('/se-connecter');
  if (roles.length && !roles.includes(user.role)) {
    redirect(`/espace/${user.role}`);
  }
  return user;
}
