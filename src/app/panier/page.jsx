"use client";
import React, { useEffect, useState, useCallback } from 'react';
import Header from '@/app/components/Header';
import Link from 'next/link';

// NOTE: pdf-lib import différé (dynamic) pour réduire le bundle initial
export default function PanierPage(){
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null); // {orders:[{order:{}, tickets:[]}]}
  const [showConfirm, setShowConfirm] = useState(false);
  const [updatingIds, setUpdatingIds] = useState(new Set()); // ids en cours d'update
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const load = useCallback(async()=>{
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/public/cart', { cache:'no-store' });
      if(!r.ok) throw new Error();
      const j = await r.json();
      setItems(j.items||[]);
    } catch { setError('Impossible de charger le panier'); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  const total = items.reduce((sum,i)=> sum + (i.price_cents||0),0);
  const totalPassengers = items.reduce((s,i)=> s + (i.passengers||0),0);

  const removeItem = async(id)=>{
    await fetch('/api/public/cart', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id}) });
    window.dispatchEvent(new Event('cart-updated'));
    load();
  };

  const patchItem = async (id, patch) => {
    setUpdatingIds(s=> new Set(s).add(id));
    try {
      await fetch('/api/public/cart', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, ...patch }) });
      await load();
    } finally {
      setUpdatingIds(s=> { const n=new Set(s); n.delete(id); return n; });
    }
  };

  const checkout = async()=>{
    if(!items.length) return;
    setProcessing(true); setError(null);
    try {
      const r = await fetch('/api/public/cart/checkout', { method:'POST' });
      const j = await r.json();
      if(!r.ok) throw new Error(j.error||'Echec paiement');
      setResult(j); // contient les billets
      window.dispatchEvent(new Event('cart-updated'));
    } catch(e){ setError(e.message); }
    finally { setProcessing(false); }
  };

  const openConfirm = ()=> { if(items.length) setShowConfirm(true); };
  const closeConfirm = ()=> setShowConfirm(false);
  const confirmAndPay = async()=> { closeConfirm(); await checkout(); };

  const generatePdf = async () => {
    if(!result) return;
    setPdfGenerating(true);
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const A4 = [595.28, 841.89];
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.Helvetica);
      const safe = (s='') => s.replace(/→/g,'->');

      async function fetchImage(path){
        try {
          const res = await fetch(path);
          if(!res.ok) return null;
          const ct = res.headers.get('content-type') || '';
          if(!/png|jpeg|jpg/i.test(ct)) return null; // ignore SVG ou autres
          const buf = await res.arrayBuffer();
          const bytes = new Uint8Array(buf);
          if(/png/i.test(ct)) return await pdf.embedPng(bytes);
          return await pdf.embedJpg(bytes);
        } catch { return null; }
      }
      const logoSncf = await fetchImage('/img/brand/sncf-logo.png');
      const logoRegion = await fetchImage('/img/brand/ter-bfc.svg'); // sera ignoré (SVG)

      const drawLabelBlock = (page, x, y, w, h, label, value, options={}) => {
        const grey = rgb(0.85,0.85,0.85);
        page.drawRectangle({ x, y, width:w, height:h, color: grey, opacity: options.bgOpacity||1 });
        page.drawText(label.toUpperCase() + (value?` : ${value}`:''), { x: x+6, y: y + h - 14, size:10, font });
      };

      const buildPage = async (ticket, order) => {
        const page = pdf.addPage(A4);
        const [pw, ph] = A4;
        const margin = 40;
        page.drawLine({ start:{x: pw/2, y: margin}, end:{x: pw/2, y: ph-margin}, thickness:1, color: rgb(0.75,0.75,0.75) });
        if(logoSncf){
          const dim = logoSncf.scale(0.25);
            page.drawImage(logoSncf, { x: pw - margin - dim.width, y: ph - margin - dim.height, width: dim.width, height: dim.height });
        }
        if(logoRegion){
          const dim2 = logoRegion.scale(0.35);
          page.drawImage(logoRegion, { x: pw - margin - (logoSncf?logoSncf.width:0) - dim2.width - 12, y: ph - margin - dim2.height, width: dim2.width, height: dim2.height });
        }
        page.drawRectangle({ x: margin, y: ph - 120, width: pw/2 - margin*1.5, height: 28, color: rgb(0.85,0.85,0.85) });
        page.drawText('MON BILLET', { x: margin + 14, y: ph - 101, size:12, font: fontBold });
        // QR
        let png;
        try {
          const base64 = ticket.qr_data.split(',')[1];
          const bytes = Uint8Array.from(atob(base64), c=>c.charCodeAt(0));
          png = await pdf.embedPng(bytes);
        } catch(err) {
          console.error('Embed QR error', err);
        }
        if(png){
          const qrSize = 220;
          const qrX = margin + (pw/2 - margin*1.5 - qrSize)/2;
          const qrY = ph - 120 - 40 - qrSize;
          page.drawImage(png, { x: qrX, y: qrY, width: qrSize, height: qrSize });
        }
        const rightX = pw/2 + 25;
        let cursorY = ph - margin - 20;
        page.drawText(safe(`${order.origin} → ${order.destination}`), { x: rightX, y: cursorY, size:14, font: fontBold });
        cursorY -= 22; page.drawText(`Commande ${order.reference}`, { x: rightX, y: cursorY, size:10, font });
        cursorY -= 30; drawLabelBlock(page, rightX, cursorY, 220, 22, 'De', safe(order.origin));
        cursorY -= 26; drawLabelBlock(page, rightX, cursorY, 220, 22, 'À', safe(order.destination));
        cursorY -= 26; drawLabelBlock(page, rightX, cursorY, 220, 22, 'Voyageur', `${ticket.passenger_index} / ${order.passengers}`);
        cursorY -= 26; drawLabelBlock(page, rightX, cursorY, 220, 22, 'Classe', '2');
        cursorY -= 26; drawLabelBlock(page, rightX, cursorY, 220, 40, 'Tarif', (order.price_cents/100).toFixed(2)+' €');
        cursorY -= 50;
        page.drawRectangle({ x: rightX, y: cursorY, width: 260, height: 70, color: rgb(0.92,0.92,0.92) });
        page.drawText('Billet démo – Non valable pour voyager', { x: rightX + 8, y: cursorY + 52, size:9, font });
        page.drawText('Signature HMAC intégrée (QR).', { x: rightX + 8, y: cursorY + 38, size:8, font, opacity:0.8 });
        page.drawText(new Date().toLocaleString('fr-FR'), { x: rightX + 8, y: cursorY + 12, size:8, font, opacity:0.6 });
      };

      for(const o of result.orders){ for(const t of o.tickets){ await buildPage(t, o.order); } }

      const pdfBytes = await pdf.save();
      const blob = new Blob([pdfBytes], { type:'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'billets.pdf'; a.click();
      setTimeout(()=> URL.revokeObjectURL(url), 5000);
    } catch(e) {
      console.error('PDF generation failed', e);
      alert('Erreur génération PDF');
    } finally { setPdfGenerating(false); }
  };

  return (
    <>
      <Header />
      <main className="container my-4" style={{maxWidth:'1000px'}}>
        <nav className="mb-3" style={{fontSize:'0.75rem'}} aria-label="Fil d'ariane">
          <ol className="breadcrumb" style={{margin:0}}>
            <li className="breadcrumb-item"><Link href="/">Accueil</Link></li>
            <li className="breadcrumb-item active" aria-current="page">Panier</li>
          </ol>
        </nav>
        <h1 className="h4 mb-4">Mon panier</h1>
        {loading && <p>Chargement…</p>}
        {error && <p className="text-danger">{error}</p>}
        {!loading && !result && items.length===0 && <p>Votre panier est vide.</p>}
        {!loading && !result && items.length>0 && (
          <div className="row g-4">
            <div className="col-lg-8">
              <ul className="list-group">
                {items.map(it=> (
                  <li key={it.id} className="list-group-item d-flex justify-content-between align-items-start">
                    <div>
                      <div><strong>{it.origin} → {it.destination}</strong></div>
                      <div className="small text-muted mb-1">Sillon #{it.schedule_id}</div>
                      <div className="d-flex align-items-center gap-2 flex-wrap small">
                        <label className="m-0">Voyageurs
                          <input
                            type="number"
                            min={1}
                            max={9}
                            className="form-control form-control-sm d-inline-block ms-1"
                            style={{width:'70px'}}
                            value={it.passengers}
                            onChange={(e)=> patchItem(it.id,{ passengers: e.target.value })}
                            disabled={updatingIds.has(it.id)}
                          />
                        </label>
                        <label className="m-0">Carte
                          <select
                            className="form-select form-select-sm d-inline-block ms-1"
                            style={{width:'140px'}}
                            value={it.card}
                            onChange={(e)=> patchItem(it.id,{ card: e.target.value })}
                            disabled={updatingIds.has(it.id)}
                          >
                            <option value="none">Aucune</option>
                            <option value="avantage">Avantage</option>
                            <option value="jeune">Jeune</option>
                          </select>
                        </label>
                        {updatingIds.has(it.id) && <span className="text-muted">Maj…</span>}
                      </div>
                      <div className="small text-muted">Ajouté le {new Date(it.created_at).toLocaleString('fr-FR')}</div>
                    </div>
                    <div className="text-end">
                      <div className="fw-bold">{(it.price_cents/100).toFixed(2)} €</div>
                      <button className="btn btn-link text-danger p-0 mt-1" onClick={()=>removeItem(it.id)}>Supprimer</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="col-lg-4">
              <div className="card p-3">
                <h2 className="h6">Récapitulatif</h2>
                <p className="mb-1 small">{items.length} trajet(s), {totalPassengers} voyageur(s)</p>
                <p className="fw-bold">Total: {(total/100).toFixed(2)} €</p>
                <button disabled={processing} onClick={openConfirm} className="btn btn-primary w-100">Procéder au paiement</button>
                <p className="small text-muted mt-2">Paiement simulé (aucune transaction réelle).</p>
              </div>
            </div>
          </div>
        )}
        {result && (
          <div className="mt-4">
            <h2 className="h5 mb-3">Billets générés</h2>
            {result.orders.map(o=> (
              <div key={o.order.id} className="mb-4 p-3 border rounded bg-white">
                <h3 className="h6">Commande {o.order.reference} – {(o.order.price_cents/100).toFixed(2)} €</h3>
                <p className="small mb-2">Trajet: {o.order.origin} → {o.order.destination} · Voyageurs: {o.order.passengers}</p>
                <div className="d-flex flex-wrap gap-3">
                  {o.tickets.map(t => (
                    <div key={t.id} className="text-center" style={{width:'140px'}}>
                      <img src={t.qr_data} alt={`QR billet ${t.passenger_index}`} style={{width:'120px', height:'120px'}} />
                      <div className="small">Voyageur {t.passenger_index}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="d-flex gap-2 flex-wrap">
              <button className="btn btn-secondary" disabled={pdfGenerating} onClick={generatePdf}>{pdfGenerating? 'Génération…':'Télécharger PDF billets'}</button>
              <Link href="/espace/client/commandes" className="btn btn-outline-secondary">Voir toutes mes commandes</Link>
            </div>
          </div>
        )}
        {showConfirm && !result && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-panel">
              <h2 className="h6 mb-3">Confirmation de paiement</h2>
              <ul className="list-unstyled small mb-3" style={{maxHeight:'200px', overflowY:'auto'}}>
                {items.map(i=> (
                  <li key={i.id} className="mb-2">
                    <strong>{i.origin} → {i.destination}</strong><br />
                    {i.passengers} voyageur(s) · {(i.price_cents/100).toFixed(2)} € · Carte: {i.card==='none'?'Aucune':i.card}
                  </li>
                ))}
              </ul>
              <p className="fw-bold">Total: {(total/100).toFixed(2)} €</p>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary" onClick={closeConfirm}>Annuler</button>
                <button className="btn btn-primary" disabled={processing} onClick={confirmAndPay}>{processing?'Paiement…':'Confirmer'}</button>
              </div>
            </div>
          </div>
        )}
      </main>
      <style jsx>{`
        .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); display:flex; align-items:center; justify-content:center; z-index:2000; }
        .modal-panel { background:#fff; padding:1.5rem; border-radius:8px; width: min(500px, 90%); box-shadow:0 6px 24px rgba(0,0,0,.2); }
      `}</style>
    </>
  );
}
