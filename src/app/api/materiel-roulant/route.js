import { NextResponse } from 'next/server';
import { query } from '@/js/db';
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

function normalizeString(x) {
  return String(x || '').trim();
}

async function generateSerial() {
  // Génère un numéro à 5 chiffres, évite les collisions avec la table materiel_roulant
  // et tente d'éviter les collisions avec schedules.train_number si la table/colonne existe.
  async function existsInMateriel(serial) {
    const rows = await query('SELECT id FROM materiel_roulant WHERE serial_number = ? LIMIT 1', [serial]);
    return rows.length > 0;
  }
  async function existsInSchedules(serial) {
    try {
      const rows = await query('SELECT COUNT(1) AS c FROM schedules WHERE train_number = ?', [serial]);
      return (rows?.[0]?.c || 0) > 0;
    } catch (e) {
      // Table ou colonne inexistante, on ignore
      return false;
    }
  }
  for (let i = 0; i < 1000; i++) {
    const n = Math.floor(Math.random() * 100000);
    const serial = n.toString().padStart(5, '0');
    // Vérifie collisions
    // eslint-disable-next-line no-await-in-loop
    const inMateriel = await existsInMateriel(serial);
    if (inMateriel) continue;
    // eslint-disable-next-line no-await-in-loop
    const inSchedules = await existsInSchedules(serial);
    if (inSchedules) continue;
    return serial;
  }
  // Fallback improbable
  return '00000';
}

// Gestion des fichiers image sur disque
const IMG_DIR = path.join(process.cwd(), 'public', 'img', 'm-r');
const MIME_TO_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};
const EXT_TO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};
const TRY_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

async function ensureDir() {
  await fs.mkdir(IMG_DIR, { recursive: true });
}

function extFromUpload(file) {
  const byMime = MIME_TO_EXT[file?.type || ''];
  if (byMime) return byMime;
  try {
    const n = file?.name || '';
    const ext = path.extname(n).toLowerCase();
    if (ext) return ext;
  } catch {}
  return '.bin';
}

async function removeExistingForSerial(serial) {
  await ensureDir();
  await Promise.all(
    TRY_EXTS.map(async (ext) => {
      const p = path.join(IMG_DIR, `${serial}${ext}`);
      try { await fs.unlink(p); } catch {}
    })
  );
}

async function saveImageForSerial(serial, file) {
  if (!file || typeof file.arrayBuffer !== 'function' || file.size <= 0) return null;
  await ensureDir();
  const ext = extFromUpload(file);
  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);
  await removeExistingForSerial(serial);
  const filepath = path.join(IMG_DIR, `${serial}${ext}`);
  await fs.writeFile(filepath, buf);
  return filepath;
}

async function findImagePathForSerial(serial) {
  for (const ext of TRY_EXTS) {
    const p = path.join(IMG_DIR, `${serial}${ext}`);
    if (fssync.existsSync(p)) return p;
  }
  return null;
}

function mimeFromPath(p) {
  const ext = path.extname(p).toLowerCase();
  return EXT_TO_MIME[ext] || 'application/octet-stream';
}

const ALLOWED_MIME = new Set(['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/svg+xml']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
function isAllowedImage(file) {
  if (!file || typeof file.arrayBuffer !== 'function') return false;
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return false;
  if (!ALLOWED_MIME.has(file.type)) return false;
  return true;
}

export async function GET() {
  try {
    const err = await ensureAdmin();
    if (err) return err;

    const rows = await query(
      'SELECT id, name, technical_name, capacity, train_type, serial_number, created_at, updated_at FROM materiel_roulant ORDER BY id DESC',
      []
    );

    const items = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        hasImage: !!(await findImagePathForSerial(r.serial_number)),
      }))
    );

    return NextResponse.json({ items });
  } catch (e) {
    console.error('GET /api/materiel-roulant error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const err = await ensureAdmin();
    if (err) return err;

    const form = await request.formData();
    const name = normalizeString(form.get('name'));
    const technicalName = normalizeString(form.get('technicalName'));
    const trainType = normalizeString(form.get('trainType'));
    const capacity = Number(form.get('capacity'));
    const imageFile = form.get('image'); // File ou null

    if (!name || !technicalName || !trainType || !capacity || Number.isNaN(capacity) || capacity <= 0) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    if (imageFile && imageFile.size > 0 && !isAllowedImage(imageFile)) {
      return NextResponse.json({ error: 'Image invalide (types autorisés: PNG, JPEG, WEBP, GIF, SVG; taille ≤ 5MB)' }, { status: 400 });
    }

    const serial = await generateSerial();

    // Sauvegarde éventuelle de l'image sur disque, basée sur le numéro de série
    if (imageFile && typeof imageFile === 'object' && typeof imageFile.arrayBuffer === 'function' && imageFile.size > 0) {
      await saveImageForSerial(serial, imageFile);
    }

    const result = await query(
      `INSERT INTO materiel_roulant (name, technical_name, capacity, image, image_mime, train_type, serial_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, technicalName, capacity, null, null, trainType, serial]
    );

    const [row] = await query(
      'SELECT id, name, technical_name, capacity, train_type, serial_number, created_at, updated_at FROM materiel_roulant WHERE id = ?',
      [result.insertId]
    );

    const hasImage = !!(await findImagePathForSerial(serial));
    return NextResponse.json({ ...row, hasImage }, { status: 201 });
  } catch (e) {
    console.error('POST /api/materiel-roulant error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
