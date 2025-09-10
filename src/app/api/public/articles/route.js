import { NextResponse } from 'next/server';
import { query } from '@/js/db';
import { ensureDefaultArticles } from '@/app/lib/seedArticles';
export const runtime='nodejs';
export async function GET(req){
  try {
    await ensureDefaultArticles();
    const { searchParams } = new URL(req.url);
    const homepage = searchParams.get('homepage');
    const page = Math.max(1, parseInt(searchParams.get('page')||'1',10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit')||'9',10)));
    if(homepage==='1'){
      let rows = await query('SELECT slug,titre,resume,image_path,homepage,updated_at FROM articles WHERE homepage=1 ORDER BY updated_at DESC');
      if(!rows.length){
        await query('INSERT INTO articles (slug,titre,resume,contenu,image_path,homepage) VALUES (?,?,?,?,?,1)',[
          'festival-golden-coast',
          'Festival Golden Coast',
          'Dijon: billets TRAIN Mobigo dès 6€ (2€ enfants).',
          '<p>Profitez du <strong>Festival Golden Coast</strong> à Dijon. Offres spéciales TRAIN Mobigo : A/R dès 6€ et 2€ pour les enfants.</p>',
          '/img/golden-coast.svg'
        ]);
        await query('INSERT INTO articles (slug,titre,resume,contenu,image_path,homepage) VALUES (?,?,?,?,?,1)',[
          'festival-des-momes',
          'Festival des mômes',
          'Montbéliard: TRAIN Mobigo A/R dès 6€, 2€ enfants.',
          '<p>Direction <strong>Montbéliard</strong> pour le Festival des mômes ! Animations familiales et tarif TRAIN Mobigo avantageux.</p>',
          '/img/festival-momes.svg'
        ]);
        rows = await query('SELECT slug,titre,resume,image_path,homepage,updated_at FROM articles WHERE homepage=1 ORDER BY updated_at DESC');
      }
      return NextResponse.json({ items: rows, page:1, pageCount:1, total: rows.length });
    }
    const [{ total }] = await query('SELECT COUNT(*) total FROM articles');
    const offset = (page-1)*limit;
    const safeLimit = Number(limit) || 9;
    const safeOffset = Number(offset) || 0;
    const rows = await query(`SELECT slug,titre,resume,image_path,homepage,updated_at FROM articles ORDER BY updated_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
    const pageCount = Math.max(1, Math.ceil(total/limit));
    return NextResponse.json({ items: rows, page, pageCount, total, limit });
  } catch(e){
    console.error('GET /api/public/articles', e);
    return NextResponse.json({ items: [] , page:1, pageCount:1, total:0}, { status:200 });
  }
}
