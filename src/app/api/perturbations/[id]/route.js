import { NextResponse } from 'next/server';
import { query } from '@/js/db';

export const runtime = 'nodejs';

// GET /api/perturbations/[id] - Récupère une perturbation spécifique
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const perturbations = await query('SELECT * FROM perturbations WHERE id = ?', [id]);

    if (!perturbations.length) {
      return NextResponse.json({ error: 'Perturbation introuvable' }, { status: 404 });
    }

    return NextResponse.json({ perturbation: perturbations[0] });
  } catch (e) {
    console.error(`GET /api/perturbations/${params?.id}`, e);
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH /api/perturbations/[id] - Met à jour une perturbation existante
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const payload = await request.json();

    // Vérifier si la perturbation existe
    const existingResults = await query('SELECT id FROM perturbations WHERE id = ?', [id]);
    if (!existingResults.length) {
      return NextResponse.json({ error: 'Perturbation introuvable' }, { status: 404 });
    }

    // Préparer les données à mettre à jour
    const updateFields = [];
    const updateValues = [];

    if (payload.type) {
      updateFields.push('type = ?');
      updateValues.push(payload.type);
    }

    // Permettre la modification de la ligne associée si fournie
    if (payload.ligne_id) {
      updateFields.push('ligne_id = ?');
      updateValues.push(payload.ligne_id);
    }

    if (payload.titre) {
      updateFields.push('titre = ?');
      updateValues.push(payload.titre);
    }

    if (payload.description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(payload.description);
    }

    if (payload.date_debut !== undefined) {
      updateFields.push('date_debut = ?');
      updateValues.push(payload.date_debut);
    }

    if (payload.date_fin !== undefined) {
      updateFields.push('date_fin = ?');
      updateValues.push(payload.date_fin);
    }

    if (payload.data) {
      updateFields.push('data = ?');
      updateValues.push(JSON.stringify(payload.data));
    }

    // Toujours mettre à jour updated_at
    updateFields.push('updated_at = ?');
    updateValues.push(new Date().toISOString().slice(0, 19).replace('T', ' '));

    // Ajouter l'ID à la fin des valeurs pour la clause WHERE
    updateValues.push(id);

    // Mise à jour en base de données
    if (updateFields.length > 0) {
      await query(
        `UPDATE perturbations SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(`PATCH /api/perturbations/${(await params).id}`, e);
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE /api/perturbations/[id] - Supprime une perturbation
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    // Vérifier si la perturbation existe
    const existingResults = await query('SELECT id FROM perturbations WHERE id = ?', [id]);
    if (!existingResults.length) {
      return NextResponse.json({ error: 'Perturbation introuvable' }, { status: 404 });
    }

    // Suppression
    await query('DELETE FROM perturbations WHERE id = ?', [id]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(`DELETE /api/perturbations/${(await params).id}`, e);
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 });
  }
}
