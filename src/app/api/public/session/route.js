import { NextResponse } from 'next/server';
import { getSessionUser } from '@/app/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ user: null });
    return NextResponse.json({ user: { id: user.id, first_name: user.first_name, last_name: user.last_name, role: user.role } });
  } catch (e) {
    return NextResponse.json({ user: null });
  }
}

