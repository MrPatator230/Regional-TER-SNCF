import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(){ return NextResponse.json({ error:'Sillons en refonte' }, { status:410 }); }

