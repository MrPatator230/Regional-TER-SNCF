import { scheduleQuery } from '@/js/db-schedule';

export async function POST(req) {
  try {
    const { sql, params } = await req.json();
    const rows = await scheduleQuery(sql, params);
    return new Response(JSON.stringify({ success: true, data: rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
