import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(){
  // Génère un modèle Excel avec les colonnes attendues et quelques lignes d'exemple
  const headers = [
    'ligneId',
    'departureStation',
    'arrivalStation',
    'departureTime',
    'arrivalTime',
    'trainNumber',
    'trainType',
    'rollingStock',
    'days',
    'holidays',
    'sundays',
    'customDates',
    'stops'
  ];

  const examples = [
    {
      ligneId: 12,
      departureStation: 'Dijon',
      arrivalStation: 'Besançon',
      departureTime: '08:30',
      arrivalTime: '10:02',
      trainNumber: 'TER8401',
      trainType: 'TER',
      rollingStock: 'Z 27500',
      days: 'Lun, Mar, Mer, Jeu, Ven',
      holidays: 'non',
      sundays: 'non',
      customDates: '',
      stops: 'Auxonne@09:02>09:04 | Dole@09:20>09:22'
    },
    {
      ligneId: 12,
      departureStation: 'Besançon',
      arrivalStation: 'Dijon',
      departureTime: '17:18',
      arrivalTime: '18:47',
      trainNumber: 'TER8418',
      trainType: 'TER',
      rollingStock: 'Z 27500',
      days: 'Lun, Mar, Mer, Jeu, Ven',
      holidays: 'non',
      sundays: 'non',
      customDates: '',
      stops: 'Dole@17:54>17:56 | Auxonne@18:12>18:14'
    },
    {
      ligneId: 34,
      departureStation: 'Mâcon',
      arrivalStation: 'Chalon-sur-Saône',
      departureTime: '09:05',
      arrivalTime: '09:58',
      trainNumber: 'TER7621',
      trainType: 'TER',
      rollingStock: 'AGC',
      days: 'Sam, Dim',
      holidays: 'oui',
      sundays: 'oui',
      customDates: '2025-12-24,2025-12-31',
      stops: 'Tournus@09:30>09:32'
    }
  ];

  const data = [headers, ...examples.map(e=> headers.map(h=> e[h] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sillons');

  const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modele-import-sillons.xlsx"',
      'Cache-Control': 'no-store'
    }
  });
}

