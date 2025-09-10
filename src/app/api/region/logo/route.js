import { NextResponse } from 'next/server';
import { getSessionUser } from '@/app/lib/auth';
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';

export const runtime = 'nodejs';

async function ensureAdmin() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  return null;
}

const ALLOWED_MIME = new Set(['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

function isAllowedImage(file) {
  if (!file || typeof file.arrayBuffer !== 'function') return false;
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return false;
  if (!ALLOWED_MIME.has(file.type)) return false;
  return true;
}

function extFromMime(m) {
  switch ((m||'').toLowerCase()) {
    case 'image/png': return '.png';
    case 'image/jpeg':
    case 'image/jpg': return '.jpg';
    case 'image/webp': return '.webp';
    case 'image/svg+xml': return '.svg';
    default: return '.bin';
  }
}

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

export async function POST(request) {
  try {
    const err = await ensureAdmin();
    if (err) return err;

    const form = await request.formData();
    const file = form.get('logo');
    if (!isAllowedImage(file)) {
      return NextResponse.json({ error: 'Image invalide (PNG, JPEG, WEBP, SVG; ≤5MB)' }, { status: 400 });
    }
    const IMG_DIR = path.join(process.cwd(), 'public', 'img');
    await ensureDir(IMG_DIR);
    // Nom canonique: logo.jpg|png|svg|webp
    const ext = extFromMime(file.type);
    const buf = Buffer.from(await file.arrayBuffer());

    // Supprime anciens logos
    for (const e of ['.png','.jpg','.jpeg','.webp','.svg']) {
      const p = path.join(IMG_DIR, 'logo' + e);
      try { await fs.unlink(p); } catch {}
    }

    const dest = path.join(IMG_DIR, 'logo' + ext);
    await fs.writeFile(dest, buf);

    return NextResponse.json({ ok: true, path: '/img/logo' + ext });
  } catch (e) {
    console.error('POST /api/region/logo error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

