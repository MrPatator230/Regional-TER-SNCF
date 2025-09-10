import { query } from '@/js/db';
import { getSessionUser } from '@/app/lib/auth';
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';

export const runtime = 'nodejs';

async function ensureAdmin() {
  const user = await getSessionUser();
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  if (user.role !== 'admin') return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403 });
  return null;
}

const IMG_DIR = path.join(process.cwd(), 'public', 'img', 'm-r');
const EXT_TO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};
const TRY_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

function mimeFromPath(p) {
  return EXT_TO_MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

function findImagePathForSerialSync(serial) {
  for (const ext of TRY_EXTS) {
    const p = path.join(IMG_DIR, `${serial}${ext}`);
    if (fssync.existsSync(p)) return p;
  }
  return null;
}

export async function GET(_req, ctx) {
  const err = await ensureAdmin();
  if (err) return err;

  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  if (!id) return new Response(JSON.stringify({ error: 'ID invalide' }), { status: 400 });

  const rows = await query('SELECT serial_number FROM materiel_roulant WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) return new Response(JSON.stringify({ error: 'Introuvable' }), { status: 404 });

  const serial = rows[0].serial_number;
  const filePath = findImagePathForSerialSync(serial);
  if (!filePath) return new Response('Not Found', { status: 404 });

  const data = await fs.readFile(filePath);
  const mime = mimeFromPath(filePath);
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
