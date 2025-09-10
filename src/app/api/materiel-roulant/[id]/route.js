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

function normalize(x) { return String(x || '').trim(); }

// Fichiers image sur disque
const IMG_DIR = path.join(process.cwd(), 'public', 'img', 'm-r');
const TRY_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
async function ensureDir() { await fs.mkdir(IMG_DIR, { recursive: true }); }
function findImagePathForSerialSync(serial) {
  for (const ext of TRY_EXTS) {
    const p = path.join(IMG_DIR, `${serial}${ext}`);
    if (fssync.existsSync(p)) return p;
  }
  return null;
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
function extFromUpload(file) {
  const n = (file?.name || '').toLowerCase();
  const ext = path.extname(n);
  if (ext) return ext;
  // Fallback simple basé sur le type MIME
  const type = file?.type || '';
  if (type.includes('png')) return '.png';
  if (type.includes('jpeg') || type.includes('jpg')) return '.jpg';
  if (type.includes('webp')) return '.webp';
  if (type.includes('gif')) return '.gif';
  if (type.includes('svg')) return '.svg';
  return '.bin';
}
async function saveImageForSerial(serial, file) {
  if (!file || typeof file.arrayBuffer !== 'function' || file.size <= 0) return null;
  await ensureDir();
  await removeExistingForSerial(serial);
  const ext = extFromUpload(file);
  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);
  const filepath = path.join(IMG_DIR, `${serial}${ext}`);
  await fs.writeFile(filepath, buf);
  return filepath;
}

export async function GET(_req, ctx) {
  try {
    const err = await ensureAdmin();
    if (err) return err;

    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: 'ID invalide' }, { status: 400 });

    const rows = await query('SELECT id, name, technical_name, capacity, train_type, serial_number, created_at, updated_at FROM materiel_roulant WHERE id = ?', [id]);
    if (!rows.length) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });

    const row = rows[0];
    const hasImage = !!findImagePathForSerialSync(row.serial_number);
    return NextResponse.json({ ...row, hasImage });
  } catch (e) {
    console.error('GET /api/materiel-roulant/[id] error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(request, ctx) {
  try {
    const err = await ensureAdmin();
    if (err) return err;

    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: 'ID invalide' }, { status: 400 });

    const form = await request.formData();
    const name = normalize(form.get('name'));
    const technicalName = normalize(form.get('technicalName'));
    const trainType = normalize(form.get('trainType'));
    const capacityRaw = form.get('capacity');
    const capacity = capacityRaw != null ? Number(capacityRaw) : null;
    const imageFile = form.get('image');

    if (!name || !technicalName || !trainType || !capacity || Number.isNaN(capacity) || capacity <= 0) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    // Récupère le numéro de série pour nommer le fichier
    const serRows = await query('SELECT serial_number FROM materiel_roulant WHERE id = ? LIMIT 1', [id]);
    if (!serRows.length) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
    const serial = serRows[0].serial_number;

    // Sauvegarde sur disque si une image est fournie
    const setImage = imageFile && typeof imageFile === 'object' && typeof imageFile.arrayBuffer === 'function' && imageFile.size > 0;
    if (setImage) {
      await saveImageForSerial(serial, imageFile);
    }

    if (setImage) {
      await query(
        `UPDATE materiel_roulant SET name=?, technical_name=?, capacity=?, train_type=?, image=NULL, image_mime=NULL WHERE id=?`,
        [name, technicalName, capacity, trainType, id]
      );
    } else {
      await query(
        `UPDATE materiel_roulant SET name=?, technical_name=?, capacity=?, train_type=? WHERE id=?`,
        [name, technicalName, capacity, trainType, id]
      );
    }

    const [row] = await query('SELECT id, name, technical_name, capacity, train_type, serial_number, created_at, updated_at FROM materiel_roulant WHERE id = ?', [id]);
    const hasImage = !!findImagePathForSerialSync(row.serial_number);
    return NextResponse.json({ ...row, hasImage });
  } catch (e) {
    console.error('PUT /api/materiel-roulant/[id] error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(_request, ctx) {
  try {
    const err = await ensureAdmin();
    if (err) return err;

    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: 'ID invalide' }, { status: 400 });

    // Récupère le numéro de série pour supprimer les fichiers
    const serRows = await query('SELECT serial_number FROM materiel_roulant WHERE id = ? LIMIT 1', [id]);
    if (!serRows.length) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
    const serial = serRows[0].serial_number;

    await removeExistingForSerial(serial);

    const res = await query('DELETE FROM materiel_roulant WHERE id = ? LIMIT 1', [id]);
    if (res.affectedRows === 0) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/materiel-roulant/[id] error', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
