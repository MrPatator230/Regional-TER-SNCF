"use client";
import React, { useEffect, useMemo, useState } from 'react';

function useFetchStations(){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [q,setQ]=useState('');
  async function run(search){
    setLoading(true); setError('');
    try {
      const url = '/api/quais/stations'+(search? ('?q='+encodeURIComponent(search)):'');
      const r = await fetch(url, { cache:'no-store' });
      const j = await r.json();
      if(!r.ok) throw new Error(j?.error||'Erreur chargement gares');
      setItems(j.items||[]);
    } catch(e){ setError(String(e.message||e)); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ run(''); },[]);
  // recherche debouncée
  useEffect(()=>{ const t=setTimeout(()=>{ run(q.trim()); }, q? 300: 0); return ()=> clearTimeout(t); },[q]);
  return { items, loading, error, q, setQ, reload: ()=> run(q) };
}

function showToast(msg, mode='success'){ try { const el=document.createElement('wcs-alert'); el.setAttribute('open',''); el.setAttribute('mode',mode); el.style.position='fixed'; el.style.bottom='16px'; el.style.right='16px'; el.style.zIndex='9500'; el.textContent=msg; document.body.appendChild(el); setTimeout(()=>{ try{el.remove();}catch{} },2400);} catch{} }

function PlatformSelector({value, options, onSave, disabled}){
  const [sel,setSel]=useState(value||'');
  useEffect(()=>{ setSel(value||''); },[value]);
  async function commit(newVal){ if(disabled) return; if(newVal===value) return; await onSave(newVal); }
  const allOptions = useMemo(()=>{
    const names = (options||[]).map(o=> String(o.name||o).trim()).filter(Boolean);
    // inclure la valeur actuelle si non présente
    if(value && !names.includes(value)) names.unshift(value);
    return names;
  },[options,value]);
  return <div className="platform-select">
    <select className="native-select" value={sel} disabled={disabled}
            onChange={async e=>{ const v=e.target.value; setSel(v); await commit(v); }}>
      <option value="">(Aucun)</option>
      {allOptions.map(n=> <option key={n} value={n}>{n}</option>)}
    </select>
    {sel && !disabled && <button className="btn-clear" title="Supprimer" onClick={async()=>{ setSel(''); await commit(''); }}>✕</button>}
    <style jsx>{`
      .platform-select{display:flex;gap:.3rem;align-items:center}
      .native-select{min-width:6.5rem;border:1px solid #cdd3de;border-radius:6px;padding:.2rem .3rem}
      .btn-clear{background:#f5f5f7;border:1px solid #e3e7ef;border-radius:6px;padding:.15rem .35rem;cursor:pointer}
    `}</style>
  </div>;
}

export default function QuaisPage(){
  // Sélection de la gare via autocomplétion (similaire "prochains départs")
  const stations = useFetchStations();
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [candidate, setCandidate] = useState(null); // { id, name } sélection en suggestion
  const [activeStation, setActiveStation] = useState(null); // station validée et chargée
  const boxRef = React.useRef(null);

  // Synchronisation des suggestions avec la saisie
  useEffect(()=>{ stations.setQ(input); }, [input]);
  useEffect(()=>{ setOpen((stations.items||[]).length>0 && input.trim().length>=1); setHighlight(-1); }, [stations.items, input]);

  // Click extérieur pour fermer
  useEffect(()=>{
    function onClick(e){ if(boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClick);
    return ()=> document.removeEventListener('mousedown', onClick);
  },[]);

  function selectSuggestion(item){ setCandidate(item); setInput(item?.name||''); setOpen(false); }

  function onKeyDown(e){
    if(!open) return;
    const list = stations.items||[];
    if(e.key==='ArrowDown'){ e.preventDefault(); setHighlight(h=> (h+1) % list.length); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); setHighlight(h=> (h-1+list.length) % list.length); }
    else if(e.key==='Enter'){
      if(highlight>=0 && list[highlight]){ e.preventDefault(); selectSuggestion(list[highlight]); }
    } else if(e.key==='Escape'){ setOpen(false); }
  }

  // Plateformes de la gare (provenant de la table stations côté BDD principale)
  const [stationPlatforms,setStationPlatforms]=useState([]);
  useEffect(()=>{ (async()=>{
    try{
      if(!activeStation?.name){ setStationPlatforms([]); return; }
      const r=await fetch('/api/quais/platforms?stationName='+encodeURIComponent(activeStation.name),{cache:'no-store'});
      const j=await r.json();
      setStationPlatforms(Array.isArray(j.items)? j.items: []);
    }catch{ setStationPlatforms([]);} })(); },[activeStation?.name]);

  // Items (sillons desservant la gare sélectionnée)
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  async function loadForStation(st){
    if(!st?.id && !st?.name){ setItems([]); return; }
    setLoading(true); setError('');
    try {
      const qp = st?.id ? `stationId=${st.id}` : `stationName=${encodeURIComponent(st.name)}`;
      const r = await fetch(`/api/quais?${qp}`);
      const j = await r.json();
      if(!r.ok) throw new Error(j?.error||'Erreur chargement');
      setItems(j.items||[]);
    } catch(e){ setError(String(e.message||e)); setItems([]); }
    finally { setLoading(false); }
  }

  // Charger après validation
  useEffect(()=>{ if(activeStation?.id || activeStation?.name){ loadForStation(activeStation); } },[activeStation?.id, activeStation?.name]);

  const [search,setSearch]=useState('');
  const filtered = useMemo(()=>{
    const q=search.trim().toLowerCase();
    let arr=[...items];
    if(q){ arr = arr.filter(it=> String(it.train_number||'').toLowerCase().includes(q) || String(it.relation||'').toLowerCase().includes(q)); }
    return arr;
  },[items,search]);

  async function savePlatform(scheduleId, newValue){
    // Ne pas bloquer si l'ID de station est absent: utiliser stationName comme secours
    const stId = activeStation?.id;
    const stName = activeStation?.name;
    if(!stId && !stName){ showToast('Sélectionnez une gare.', 'danger'); return; }
    try {
      const payload = { scheduleId, platform: newValue };
      if(stId) payload.stationId = stId; else if(stName) payload.stationName = stName;
      const r = await fetch('/api/quais', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const j = await r.json().catch(()=>null);
      if(!r.ok) throw new Error(j?.error||'Echec enregistrement');
      setItems(prev=> prev.map(it=> it.schedule_id===scheduleId? { ...it, platform: newValue }: it));
      showToast(newValue? 'Quai enregistré':'Quai supprimé');
    } catch(e){ showToast(String(e.message||e),'danger'); }
  }

  return <div className="quais-admin">
    <div className="panel">
      <h3>Choisir une gare</h3>
      <div className="station-autocomplete" ref={boxRef} role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-owns="qa-stations">
        <wcs-mat-icon icon="search" aria-hidden="true"></wcs-mat-icon>
        <input className="native-input flex" placeholder="Rechercher une gare" value={input}
               onChange={e=> { setInput(e.target.value); if(!e.target.value) { setCandidate(null); } }}
               onKeyDown={onKeyDown}
               aria-autocomplete="list" aria-controls="qa-stations" />
        {open && (
          <ul id="qa-stations" role="listbox" className="qa-suggestions">
            {(stations.items||[]).map((s,idx)=> (
              <li key={s.id} role="option" aria-selected={idx===highlight}
                  className={"qa-suggestion" + (idx===highlight? ' highlight':'')}
                  onMouseDown={e=> { e.preventDefault(); selectSuggestion(s); }}
                  onMouseEnter={()=> setHighlight(idx)}>
                {s.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="qa-actions">
        <wcs-button size="s" onClick={()=> { if(candidate){ setActiveStation(candidate); } }} disabled={!candidate}>Voir les sillons</wcs-button>
      </div>
      {candidate && <div className="sel-hint">Gare sélectionnée: <strong>{candidate.name}</strong></div>}
    </div>

    {activeStation && <div className="panel">
      <div className="panel-head">
        <h3>Sillons à la gare: <strong>{activeStation.name}</strong></h3>
        <div className="actions">
          <input className="native-input" placeholder="Filtrer (n° train, relation)" value={search} onChange={e=> setSearch(e.target.value)} />
          <button className="btn" onClick={()=> loadForStation(activeStation)} disabled={loading}>Rafraîchir</button>
        </div>
      </div>
      {error && <wcs-alert mode="danger">{error}</wcs-alert>}
      {loading && <p>Chargement…</p>}
      {!loading && filtered.length===0 && <p>Aucun sillon.</p>}
      {!loading && filtered.length>0 && <table className="table">
        <thead><tr>
          <th style={{width:'7rem'}}>Train</th>
          <th>Trajet</th>
          <th style={{width:'14rem'}}>À cette gare</th>
          <th style={{width:'8rem'}}>Quai</th>
        </tr></thead>
        <tbody>
          {filtered.map(it=> {
            const hasArr = !!it.stop_arrival_time;
            const hasDep = !!it.stop_departure_time;
            const rowClass = hasArr && hasDep ? 'row-both' : hasArr ? 'row-arrivee' : hasDep ? 'row-depart' : '';
            const isOrigin = Number(it.stop_order)===0;
            const isTerminus = Number(it.stop_order)===Number(it.max_order);
            return <tr key={it.schedule_id} className={rowClass}>
              <td>
                <div className="row-primary"><strong>{it.train_number||'?'}</strong></div>
                <div className="row-tags">
                  {isOrigin && <span className="tag tag-depart">Origine</span>}
                  {isTerminus && <span className="tag tag-arrivee">Terminus</span>}
                  {!isOrigin && !isTerminus && <span className="tag">Desservie</span>}
                </div>
              </td>
              <td>
                <div className="relation">{it.relation}</div>
                {it.route && <div className="route">{it.route}</div>}
              </td>
              <td>
                <div className="badges">
                  {it.stop_arrival_time && <span className="badge badge-arrivee">Arrivée: <span className="time-lg">{it.stop_arrival_time}</span></span>}
                  {it.stop_departure_time && <span className="badge badge-depart">Départ: <span className="time-lg">{it.stop_departure_time}</span></span>}
                </div>
              </td>
              <td>
                <PlatformSelector value={it.platform||''} options={stationPlatforms} onSave={(v)=> savePlatform(it.schedule_id, v)} />
              </td>
            </tr>;
          })}
        </tbody>
      </table>}
    </div>}

    <style jsx>{`
      .quais-admin{display:grid;grid-template-columns:280px 1fr;gap:1rem;align-items:start}
      @media(max-width:980px){ .quais-admin{grid-template-columns:1fr} }
      .panel{border:1px solid #e2e6ef;border-radius:10px;background:#fff;padding:.8rem 1rem}
      .panel-head{display:flex;justify-content:space-between;align-items:center;gap:.8rem;flex-wrap:wrap}
      .station-autocomplete{position:relative;display:flex;gap:.6rem;align-items:center;border:1px solid #e1e1e1;border-radius:6px;padding:.5rem .6rem}
      .station-autocomplete .flex{flex:1 1 auto}
      .qa-actions{margin-top:.5rem}
      .qa-suggestions{position:absolute;top:100%;left:0;right:0;z-index:20;background:#fff;border:1px solid #d7d7d7;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.12);margin-top:.25rem;max-height:260px;overflow:auto;list-style:none;padding:0}
      .qa-suggestion{padding:.5rem .7rem;cursor:pointer}
      .qa-suggestion.highlight, .qa-suggestion:hover{background:#0d5637;color:#fff}
      .sel-hint{margin-top:.4rem;font-size:.9rem;color:#333}
      .native-input{padding:.4rem .5rem;border:1px solid #cdd3de;border-radius:6px}
      .table{width:100%;border-collapse:collapse}
      .table th,.table td{border-bottom:1px solid #eee;padding:.5rem .4rem;text-align:left;vertical-align:top}
      .table tbody tr.row-arrivee{background:#e8f7ee}
      .table tbody tr.row-depart{background:#e7f2ff}
      .table tbody tr.row-both{background:linear-gradient(to right, #e8f7ee 0 50%, #e7f2ff 50% 100%)}
      .relation{font-weight:600}
      .route{font-size:.75rem;opacity:.75;margin-top:.15rem}
      .row-tags{display:flex;gap:.25rem;margin-top:.2rem}
      .tag{font-size:.65rem;padding:.1rem .35rem;border-radius:999px;background:#eef1f6;border:1px solid #dde3ee}
      .tag-depart{background:#e7f2ff;border-color:#b7dafc;color:#1672c4}
      .tag-arrivee{background:#e8f7ee;border-color:#b9e8c9;color:#1f7a3a}
      .badges{display:flex;gap:.3rem;flex-wrap:wrap}
      .badge{display:inline-block;font-size:.72rem;padding:.12rem .4rem;border-radius:999px;border:1px solid transparent}
      .badge-depart{background:#e7f2ff;border-color:#b7dafc;color:#1672c4}
      .badge-arrivee{background:#e8f7ee;border-color:#b9e8c9;color:#1f7a3a}
      /* Heures plus grandes dans les badges */
      .badge .time-lg{font-size:1.05rem;font-weight:800;line-height:1; margin-left:.2rem; font-variant-numeric:tabular-nums}
      @media (max-width:640px){ .badge .time-lg{font-size:1.1rem} }
      .btn{border:1px solid #cdd3de;border-radius:6px;background:#f7f8fa;padding:.35rem .6rem;cursor:pointer}
      .err{color:#b00;font-size:.9rem}
    `}</style>
  </div>;
}
