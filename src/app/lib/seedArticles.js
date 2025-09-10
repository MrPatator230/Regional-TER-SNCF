import { query } from '@/js/db';

let seeded = false;
export async function ensureDefaultArticles(){
  if(seeded) return; // évite répétitions dans le même process
  try {
    // Vérifie rapidement si au moins un des slugs existe
    const existing = await query('SELECT slug FROM articles WHERE slug IN (?,?) LIMIT 1',[ 'festival-golden-coast','festival-des-momes' ]);
    if(existing.length) { seeded = true; return; }
    // Insert IGNORE pour éviter collision si concurrent
    await query(`INSERT IGNORE INTO articles (slug,titre,resume,contenu,image_path,homepage) VALUES
      ('festival-golden-coast','Festival Golden Coast','Dijon: billets TRAIN Mobigo dès 6€ (2€ enfants).',
       '<p>Profitez du <strong>Festival Golden Coast</strong> à Dijon. Offres spéciales TRAIN Mobigo : A/R dès 6€ et 2€ pour les enfants.</p>', '/img/golden-coast.svg',1),
      ('festival-des-momes','Festival des mômes','Montbéliard: TRAIN Mobigo A/R dès 6€, 2€ enfants.',
       '<p>Direction <strong>Montbéliard</strong> pour le Festival des mômes ! Animations familiales et tarifs avantageux.</p>', '/img/festival-momes.svg',1)
    `);
    seeded = true;
  } catch(e){
    // silencieux pour ne pas casser le rendu si la table n'existe pas encore
    console.error('Seed articles défaut échoué', e.message);
  }
}
