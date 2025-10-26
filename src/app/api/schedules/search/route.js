import { NextResponse } from 'next/server';
import { query } from '@/js/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const trainQuery = searchParams.get('train');

    if (!trainQuery) {
      return NextResponse.json({ trains: [] });
    }

    // Rechercher les trains correspondant au numéro
    const result = await query(
      `SELECT DISTINCT train_number 
       FROM schedules 
       WHERE train_number LIKE ? 
       ORDER BY train_number 
       LIMIT 20`,
      [`%${trainQuery}%`]
    );

    const trains = result.map(row => row.train_number);

    return NextResponse.json({ trains });
  } catch (error) {
    console.error('Erreur lors de la recherche de trains:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la recherche', trains: [] },
      { status: 500 }
    );
  }
}
