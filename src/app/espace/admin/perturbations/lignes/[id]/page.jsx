"use client";
import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export default function VoirPerturbationLigne() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [perturbation, setPerturbation] = useState(null);
  const [parsedData, setParsedData] = useState({});
  const [sillonsMap, setSillonsMap] = useState({});
  const [loadingSillons, setLoadingSillons] = useState(false);
  const [lignes, setLignes] = useState([]);
  const [loadingLignes, setLoadingLignes] = useState(false);

  // Récupération perturbation
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true); setError("");
      try {
        const res = await fetch(`/api/perturbations/${id}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Erreur de chargement');
        const p = data.perturbation || {};
        let pdata = {};
        try { pdata = p.data ? (typeof p.data === 'string' ? JSON.parse(p.data) : p.data) : {}; } catch { pdata = {}; }
        setPerturbation(p);
        setParsedData(pdata);
      } catch (e) {
        setError(e.message || 'Erreur');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Charger sillons si nécessaire pour afficher les noms (exclude_schedules / substitutions)
  useEffect(() => {
    if (!perturbation) return;
    const exclude = parsedData?.exclude_schedules || [];
    const subs = parsedData?.substitutions || [];
    const need = [...new Set([...exclude, ...subs])];
    if (!need.length || !perturbation.ligne_id) return;
    (async () => {
      setLoadingSillons(true);
      try {
        const res = await fetch(`/api/schedules?ligne_id=${perturbation.ligne_id}`);
        const all = await res.json();
        const map = {};
        if (Array.isArray(all)) {
          all.forEach(s => { map[s.id] = s; });
        } else if (Array.isArray(all?.schedules)) {
          all.schedules.forEach(s => { map[s.id] = s; });
        }
        setSillonsMap(map);
      } catch {
        // silencieux
      } finally {
        setLoadingSillons(false);
      }
    })();
  }, [perturbation, parsedData]);

  // Charger les lignes pour libellé
  useEffect(() => {
    (async () => {
      setLoadingLignes(true);
      try {
        const res = await fetch('/api/lignes', { cache: 'no-store' });
        const data = await res.json();
        if (res.ok) setLignes(data.lignes || []);
      } catch { /* silencieux */ } finally { setLoadingLignes(false); }
    })();
  }, []);

  const horaires = useMemo(() => parsedData?.horaire_interruption || {}, [parsedData]);
  const ligneLabel = useMemo(() => {
    if (!perturbation) return '';
    const L = lignes.find(l => String(l.id) === String(perturbation.ligne_id));
    return L ? `${L.depart_name || 'Inconnue'} <> ${L.arrivee_name || 'Inconnue'}` : `Ligne #${perturbation.ligne_id}`;
  }, [lignes, perturbation]);

  if (loading) return <div>Chargement…</div>;
  if (error) return <div className="text-danger">{error}</div>;
  if (!perturbation) return <div>Introuvable</div>;

  const formatDate = d => {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleString();
  };

  const listSillons = ids => ids && ids.length ? ids.map(i => {
    const s = sillonsMap[i];
    const dep = (s?.departure_time || s?.departureTime || '').slice(0,5);
    const arr = (s?.arrival_time || s?.arrivalTime || '').slice(0,5);
    return s ? `[${s.train_number || ('#'+s.id)}] (${dep} / ${arr})` : `#${i}`;
  }).join(', ') : 'Aucun';

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">Perturbation #{perturbation.id}</h1>
        <div className="d-flex gap-2">
          <Link href={`/espace/admin/perturbations/lignes/edition/${perturbation.id}`} className="btn btn-sm btn-primary">Éditer</Link>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => router.back()}>Retour</button>
        </div>
      </div>
      <div className="mb-4">
        <span className="badge bg-info me-2 text-uppercase">{perturbation.type}</span>
        <span className="badge bg-secondary">{loadingLignes ? 'Chargement…' : ligneLabel}</span>
      </div>
      <div className="row g-4">
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header">Diffusion</div>
            <div className="card-body small">
              <p><strong>Début :</strong> {formatDate(perturbation.date_debut)}</p>
              <p><strong>Fin :</strong> {formatDate(perturbation.date_fin)}</p>
              {perturbation.type === 'travaux' && (
                <>
                  <p><strong>Jours :</strong> {Array.isArray(parsedData.jours) && parsedData.jours.length ? parsedData.jours.map(i => JOURS[i]).join(', ') : '-'}</p>
                  <p><strong>Plage horaire :</strong> {horaires?.debut || '-'} - {horaires?.fin || '-'}</p>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header">Circulation & Substitutions</div>
            <div className="card-body small">
              {perturbation.type === 'travaux' ? (
                <>
                  <p><strong>Impact circulation :</strong> {parsedData.exclude_schedules ? 'Oui' : 'Non'}</p>
                  {parsedData.exclude_schedules && (
                    <p><strong>Sillons non circulants :</strong><br /> {loadingSillons ? 'Chargement…' : listSillons(parsedData.exclude_schedules)}</p>
                  )}
                  <p><strong>Substitutions :</strong> {parsedData.substitutions ? 'Oui' : 'Non'}</p>
                  {parsedData.substitutions && (
                    <p><strong>Sillons de substitution :</strong><br /> {loadingSillons ? 'Chargement…' : listSillons(parsedData.substitutions)}</p>
                  )}
                </>
              ) : <p>Aucun impact circulation spécifique (type {perturbation.type}).</p>}
            </div>
          </div>
        </div>
        <div className="col-12">
          <div className="card">
            <div className="card-header">Contenu</div>
            <div className="card-body">
              <h2 className="h5">{perturbation.titre}</h2>
              <div className="mt-3" dangerouslySetInnerHTML={{ __html: perturbation.description || '<em>Aucun contenu.</em>' }} />
            </div>
          </div>
        </div>
        <div className="col-12">
          <div className="card">
            <div className="card-header">Brut / Debug</div>
            <div className="card-body small">
              <pre className="mb-0 bg-light p-2 border rounded" style={{maxHeight:300, overflow:'auto'}}>{JSON.stringify({ ...perturbation, data: parsedData }, null, 2)}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
