import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const gone = ()=> NextResponse.json({ error:'Sillons en refonte' }, { status:410 });
export async function GET(){ return gone(); }
export async function PUT(){ return gone(); }
export async function PATCH(){ return gone(); }
export async function DELETE(){ return gone(); }
