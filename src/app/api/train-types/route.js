import { NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMG_DIR = path.join(process.cwd(), 'public', 'img', 'type');
const DATA_PATH = path.join(IMG_DIR, 'data.json');

const IMAGE_EXT = new Set(['.svg','.png','.jpg','.jpeg','.webp']);
const UPPER_FORCE = new Set(['ter','tgv','rer','db','sncb','sbb','cfl','ice','ouigo','ave']);

function deriveName(file){
  let base = file.replace(/\.[^.]+$/,'');
  base = base.replace(/^logo-/, '');
  // Cas spéciaux multi-mots connus
  if(base === 'inoui') return 'TGV InOui';
  if(base === 'ouigo-classique') return 'OUIGO Trains Classiques';
  if(base === 'frecciarossa') return 'Frecciarossa';
  if(base === 'intercites') return 'Intercités';
  if(base === 'lyria') return 'TGV Lyria';
  if(base === 'eurostar') return 'Eurostar';
  if(base === 'renfeave') return 'Renfe AVE';
  if(base === 'sncf-voyageurs-logo') return 'SNCF';
  // segmenter
  return base.split(/[-_]+/).map(part=> {
    if(UPPER_FORCE.has(part)) return part.toUpperCase();
    return part.charAt(0).toUpperCase()+part.slice(1);
  }).join(' ');
}

async function buildData(){
  const files = (await fsp.readdir(IMG_DIR)).filter(f=> IMAGE_EXT.has(path.extname(f).toLowerCase()));
  // Préférence: si doublon entre "x.svg" et "logo-x.svg" garder "logo-x.svg"
  const chosen = new Map();
  for(const f of files){
    const key = f.replace(/^logo-/, '');
    const already = chosen.get(key);
    if(!already){
      chosen.set(key, f);
    } else {
      // si l'actuel commence par logo- et l'existant non, remplacer
      if(f.startsWith('logo-') && !already.startsWith('logo-')){
        chosen.set(key, f);
      }
    }
  }
  const logos = Array.from(chosen.values()).map(file=>{
    const name = deriveName(file);
    const slug = file.replace(/^logo-/, '').replace(/\.[^.]+$/,'');
    return {
      file,
      path: `/img/type/${file}`,
      slug,
      name
    };
  }).sort((a,b)=> a.name.localeCompare(b.name,'fr'));
  const json = { generatedAt: new Date().toISOString(), logos };
  await fsp.writeFile(DATA_PATH, JSON.stringify(json,null,2),'utf8');
  return json;
}

export async function GET(){
  try {
    // Vérifier existence & cohérence
    let data = null;
    if(fs.existsSync(DATA_PATH)){
      try { data = JSON.parse(fs.readFileSync(DATA_PATH,'utf8')); } catch { data = null; }
    }
    let needRebuild = false;
    try {
      const currentFiles = (await fsp.readdir(IMG_DIR)).filter(f=> IMAGE_EXT.has(path.extname(f).toLowerCase()));
      const countInData = Array.isArray(data?.logos)? data.logos.length : -1;
      if(countInData !== currentFiles.length) needRebuild = true;
    } catch { needRebuild = true; }
    if(!data || needRebuild){
      data = await buildData();
    }
    return NextResponse.json({ success:true, ...data });
  } catch (e) {
    console.error('train-types GET error', e);
    return NextResponse.json({ success:false, error:'Erreur génération liste logos' }, { status:500 });
  }
}

