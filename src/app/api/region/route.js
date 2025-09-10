import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Emplacement fichier de persistance des paramètres région
const DATA_DIR = path.join(process.cwd(), 'data');
const REGION_DATA_PATH = path.join(DATA_DIR, 'region.json');

function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p, { recursive:true }); }

function defaultRegionData(){
  return {
    company: { name:'', currency:'EUR', description:'' },
    types: [],
    footerLinks: [],
    tickets: [],
    promotions: [],
    subscriptions: [],
    events: []
  };
}

function loadRegionData(){
  try {
    if(fs.existsSync(REGION_DATA_PATH)){
      const raw = fs.readFileSync(REGION_DATA_PATH,'utf8');
      const parsed = JSON.parse(raw);
      // Fusion fail‑safe avec defaults
      return { ...defaultRegionData(), ...parsed };
    }
  } catch(e){ /* ignore */ }
  return defaultRegionData();
}

function saveRegionData(data){
  ensureDir(DATA_DIR);
  fs.writeFileSync(REGION_DATA_PATH, JSON.stringify(data,null,2),'utf8');
}

function discoverLogoAsset(){
  // Cherche un logo global (optionnel) déjà téléversé via /api/region/logo
  const IMG_DIR = path.join(process.cwd(),'public','img');
  if(!fs.existsSync(IMG_DIR)) return null;
  const files = fs.readdirSync(IMG_DIR);
  const candidate = files.find(f=> /^logo\.(png|jpg|jpeg|webp|svg)$/i.test(f));
  return candidate? '/img/' + candidate : null;
}

// GET: retourne l’état complet des paramètres région
export async function GET(){
  try {
    const data = loadRegionData();
    return NextResponse.json({ success:true, data, assets:{ logoPath: discoverLogoAsset() } });
  } catch(e){
    console.error('region GET error', e);
    return NextResponse.json({ success:false, error:'Erreur chargement paramètres région' }, { status:500 });
  }
}

// POST: applique un patch partiel { patch: {...} }
export async function POST(request){
  try {
    const body = await request.json().catch(()=>null);
    if(!body || typeof body.patch !== 'object'){
      return NextResponse.json({ success:false, error:'Requête invalide' }, { status:400 });
    }
    const current = loadRegionData();
    // Fusion superficielle (types / listes remplacées telles quelles)
    const next = { ...current, ...body.patch };
    saveRegionData(next);
    return NextResponse.json({ success:true, data: next, assets:{ logoPath: discoverLogoAsset() } });
  } catch(e){
    console.error('region POST error', e);
    return NextResponse.json({ success:false, error:'Erreur sauvegarde paramètres région' }, { status:500 });
  }
}
