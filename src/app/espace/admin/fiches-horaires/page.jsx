"use client";
import { useEffect, useState, useCallback } from 'react';

export default function FichesHorairesGenerator(){
  const [lignes, setLignes] = useState([]);
  const [ligneId, setLigneId] = useState('');
  const [orientation, setOrientation] = useState('portrait');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [autoPrint, setAutoPrint] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // force reload iframe

  // Charger lignes
  useEffect(()=>{
    let abort=false;
    fetch('/api/lignes').then(r=>r.json()).then(j=>{ if(!abort){ setLignes(j.lignes||[]); if(!ligneId && j.lignes?.length) setLigneId(String(j.lignes[0].id)); }}).catch(()=>{});
    return ()=>{ abort=true; };
  },[]);

  const buildPdfUrl = useCallback(()=>{
    if(!ligneId) return '';
    const params = new URLSearchParams({ ligneId:String(ligneId), orientation, format:'pdf' });
    if(startDate) params.set('startDate', startDate);
    if(endDate) params.set('endDate', endDate);
    return `/api/fiches-horaires?${params.toString()}`;
  },[ligneId, orientation, startDate, endDate]);

  const generate = useCallback(()=>{
    setError('');
    if(!ligneId){ setError('Sélectionnez une ligne'); return; }
    setLoading(true);
    const url = buildPdfUrl();
    // On ne télécharge pas maintenant, on assigne l'iframe pour prévisualiser
    setPdfUrl(url + `#${Date.now()}`); // bust cache
    setRefreshKey(k=>k+1);
    // Optionnel: ping HEAD pour vérifier
    fetch(url, { method:'HEAD' }).catch(()=>{}).finally(()=> setLoading(false));
  },[ligneId, buildPdfUrl]);

  // Impression automatique quand pdfUrl change
  useEffect(()=>{
    if(!autoPrint || !pdfUrl) return;
    // Attendre que l'iframe charge – listener load
    const iframe = document.getElementById('pdfPreviewIframe');
    if(!iframe) return;
    const handler = ()=>{ try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch{} };
    iframe.addEventListener('load', handler, { once:true });
    return ()=> iframe.removeEventListener('load', handler);
  },[pdfUrl, autoPrint]);

  const currentLine = lignes.find(l=> String(l.id)===String(ligneId));

  return (
    <div style={{padding:'1.5rem'}}>
      <h1 style={{fontSize:'1.9rem', marginBottom:'0.25rem'}}>GÉNÉRATEUR DE FICHES HORAIRES</h1>
      <p style={{marginTop:0, color:'#444'}}>Sélectionnez une ligne, la période et l'orientation pour générer un PDF stylé. Prévisualisation ci‑dessous.</p>

      <div style={{display:'flex', gap:'1.5rem', flexWrap:'wrap', alignItems:'flex-end', marginBottom:'1rem'}}>
        <div>
          <label style={{fontWeight:600, display:'block', marginBottom:4}}>Ligne</label>
          <select value={ligneId} onChange={e=> setLigneId(e.target.value)} style={{padding:'6px 10px'}}>
            {lignes.map(l=> <option key={l.id} value={l.id}>#{l.id} {l.depart_station_name} → {l.arrivee_station_name}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontWeight:600, display:'block', marginBottom:4}}>Orientation</label>
          <div style={{display:'flex', gap:6}}>
            {['portrait','landscape'].map(o=> <button key={o} onClick={()=> setOrientation(o)} style={{padding:'6px 12px', background:o===orientation?'#0b2740':'#e1e5e9', color:o===orientation?'#fff':'#222', border:'none', borderRadius:4, cursor:'pointer'}}>{o==='portrait'?'Portrait':'Paysage'}</button>)}
          </div>
        </div>
        <div>
          <label style={{fontWeight:600, display:'block', marginBottom:4}}>Début</label>
          <input type="date" value={startDate} onChange={e=> setStartDate(e.target.value)} />
        </div>
        <div>
          <label style={{fontWeight:600, display:'block', marginBottom:4}}>Fin</label>
          <input type="date" value={endDate} onChange={e=> setEndDate(e.target.value)} />
        </div>
        <div style={{alignSelf:'flex-end'}}>
          <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12}}>
            <input type="checkbox" checked={autoPrint} onChange={e=> setAutoPrint(e.target.checked)} /> Impression auto
          </label>
        </div>
        <div style={{alignSelf:'flex-end'}}>
          <button onClick={generate} disabled={loading} style={{padding:'8px 18px', background:'#006cbe', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontWeight:600}}>{loading?'Génération…':'Générer le PDF'}</button>
        </div>
        {pdfUrl && (
          <div style={{alignSelf:'flex-end'}}>
            <a href={pdfUrl} download={`fiche-horaires-ligne-${ligneId}.pdf`} style={{textDecoration:'none', fontSize:14}}>Télécharger</a>
          </div>
        )}
      </div>

      {currentLine && (
        <div style={{marginBottom:'0.75rem', fontSize:12, color:'#555'}}>Relation: {currentLine.depart_station_name} → {currentLine.arrivee_station_name}</div>
      )}

      {error && <div style={{color:'#b00020', marginBottom:'0.75rem'}}>{error}</div>}

      <div style={{border:'1px solid #ccc', background:'#fafafa', padding:'6px 10px', fontSize:12, fontWeight:600, fontFamily:'Avenir,Helvetica,Arial'}}>PRÉVISUALISATION</div>
      <div style={{border:'1px solid #ccc', borderTop:'none', minHeight: '400px', background:'#fff'}}>
        {!pdfUrl && <div style={{padding:'1rem', color:'#777', fontSize:14}}>Aucun PDF généré pour le moment.</div>}
        {pdfUrl && (
          <iframe
            key={refreshKey}
            id="pdfPreviewIframe"
            src={pdfUrl}
            title="Prévisualisation PDF"
            style={{width:'100%', height:'900px', border:'none'}}
          />
        )}
      </div>
    </div>
  );
}

