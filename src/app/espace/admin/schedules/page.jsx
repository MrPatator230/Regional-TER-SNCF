"use client";
import { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { initialFormState, scheduleFormReducer, computeDiff } from './schedule-form-reducer';

/*********************\n * Utilitaires        *\n *********************/
function toMinutes(t){ if(!t||!/^[0-9]{2}:[0-9]{2}$/.test(t)) return null; const [h,m]=t.split(':').map(Number); return h*60+m; }
function pad2(n){ return String(n).padStart(2,'0'); }
function minutesToTime(m){ if(m==null) return ''; return pad2(Math.floor(m/60)%24)+":"+pad2(m%60); }
function showToast(msg, mode='success'){ try { const el=document.createElement('wcs-alert'); el.setAttribute('open',''); el.setAttribute('mode',mode); el.style.position='fixed'; el.style.bottom='16px'; el.style.right='16px'; el.style.zIndex='9500'; el.textContent=msg; document.body.appendChild(el); setTimeout(()=>{ try{el.remove();}catch{} },3000);} catch{} }

/*********************\n * Hooks données API  *\n *********************/
function useFetchOnce(url, mapFn){ const [data,setData]=useState([]); const [loaded,setLoaded]=useState(false); const [error,setError]=useState(''); useEffect(()=>{ if(loaded) return; (async()=>{ try { const r=await fetch(url); if(!r.ok) throw new Error('HTTP '+r.status); const j=await r.json(); const d=mapFn? mapFn(j): j; setData(d); } catch(e){ setError(e.message); } finally { setLoaded(true); } })(); },[url,loaded,mapFn]); return { data, loaded, error, reload: async()=>{ setLoaded(false); setError(''); } }; }

/*********************\n * Composants WCS     *\n *********************/
function useWcsBind(ref,value,onChange,events=['wcsChange','wcsInput']){ useEffect(()=>{ const el=ref.current; if(!el) return; const h=e=>{ const v=e?.detail?.value ?? el.value; onChange?.(v); }; events.forEach(evt=> el.addEventListener(evt,h)); return ()=> events.forEach(evt=> el.removeEventListener(evt,h)); },[ref,onChange,events]); useEffect(()=>{ const el=ref.current; if(!el) return; try { if(value!==undefined && el.value!==value) el.value=value??''; } catch{} },[value]); }
function WcsInput({value,onChange,...rest}){ const ref=useRef(null); useWcsBind(ref,value,onChange); return <wcs-input ref={ref} {...rest}></wcs-input>; }
function WcsSelect({value,onChange,children,...rest}){ const ref=useRef(null); useEffect(()=>{ const el=ref.current; if(!el) return; const h=e=>{ const v=e?.detail?.value ?? el.value; onChange?.(v); }; el.addEventListener('wcsChange',h); return ()=> el.removeEventListener('wcsChange',h); },[onChange]); useEffect(()=>{ const el=ref.current; if(el && el.value!==value){ try { el.value=value??''; } catch{} } },[value]); return <wcs-select ref={ref} value={value||''} {...rest}>{children}</wcs-select>; }

/*********************\n * Helpers spécifiques *\n *********************/
const WEEK_LABELS=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
function normalizeSequential(list){ if(!list.length) return list; let prev=null; return list.map(s=>{ let a=toMinutes(s.arrival); let d=toMinutes(s.departure); if(prev!=null){ if(a==null||a<prev) a=prev; if(d==null||d<a) d=a; } else { if(a!=null && d!=null && d<a) d=a; if(a==null && d!=null) a=d; if(d==null && a!=null) d=a; }
  if(a!=null) prev=d!=null? d: a; if(d!=null) prev=d; return {...s, arrival:a!=null? minutesToTime(a):'', departure:d!=null? minutesToTime(d):''}; }); }
function cleanDaysForPayload(days){ return { selected:[...(days.selected||[])].sort(), holidays:!!days.holidays, sundays:!!days.sundays, custom:!!days.custom, customDates: days.custom? (days.customDates||''): '' }; }
function validateForm(state, stations){ const errs=[]; const g=state.general; const stationSet=new Set(stations); if(!g.ligneId) errs.push('Ligne requise'); if(!g.departureTime) errs.push('Heure départ'); if(!g.arrivalTime) errs.push('Heure arrivée'); if(!g.departureStation) errs.push('Gare départ'); if(!g.arrivalStation) errs.push('Gare arrivée'); if(g.departureStation && g.arrivalStation && g.departureStation===g.arrivalStation) errs.push('Départ = arrivée'); if(g.departureTime && g.arrivalTime){ const dep=toMinutes(g.departureTime); const arr=toMinutes(g.arrivalTime); if(dep!=null && arr!=null && arr<dep) errs.push('Arrivée avant départ'); }
  if(g.departureStation && !stationSet.has(g.departureStation)) errs.push('Gare départ inconnue'); if(g.arrivalStation && !stationSet.has(g.arrivalStation)) errs.push('Gare arrivée inconnue');
  const used=[g.departureStation,g.arrivalStation]; state.stops.forEach((s,i)=>{ if(!s.station) return; if(used.includes(s.station)) errs.push(`Arrêt ${i+1}: doublon avec départ/arrivée`); used.push(s.station); if(!stationSet.has(s.station)) errs.push(`Arrêt ${i+1}: gare inconnue`); });
  return errs; }
function buildPayload(state){ const days=cleanDaysForPayload(state.days); return { general:{ ...state.general, rollingStock: state.rollingStock }, stops: state.stops.filter(s=> s.station).map(s=> ({ station:s.station, arrival:s.arrival||'', departure:s.departure||'' })), days, rollingStock: state.rollingStock, isSubstitution: !!state.isSubstitution }; }

/*********************\n * Sous-composants UI *\n *********************/
function GeneralForm({state,dispatch,lines,stations}){ const g=state.general; const missingLine=!g.ligneId; return <div className="panel">
  <h3>Informations principales</h3>
  <div className="grid form-grid">
    <div>
      <wcs-form-field state={missingLine? 'error': undefined}>
        <wcs-label>Ligne *</wcs-label>
        <WcsSelect value={g.ligneId} placeholder="Ligne" onChange={v=> dispatch({type:'SET_GENERAL',payload:{ligneId:v}})}>
          <wcs-select-option value="">(Sélectionner)</wcs-select-option>
          {lines.map(l=> <wcs-select-option key={l.id} value={String(l.id)}>{l.depart_name} ➜ {l.arrivee_name}</wcs-select-option>)}
        </WcsSelect>
        {missingLine && <wcs-hint slot="messages" state="error">Requis</wcs-hint>}
      </wcs-form-field>
    </div>
    <div>
      <wcs-form-field>
        <wcs-label>Départ</wcs-label>
        <WcsSelect value={g.departureStation} onChange={v=> dispatch({type:'SET_GENERAL',payload:{departureStation:v}})}>
          <wcs-select-option value="">(Gare)</wcs-select-option>
          {stations.map(s=> <wcs-select-option key={s} value={s}>{s}</wcs-select-option>)}
        </WcsSelect>
      </wcs-form-field>
    </div>
    <div>
      <wcs-form-field>
        <wcs-label>Arrivée</wcs-label>
        <WcsSelect value={g.arrivalStation} onChange={v=> dispatch({type:'SET_GENERAL',payload:{arrivalStation:v}})}>
          <wcs-select-option value="">(Gare)</wcs-select-option>
          {stations.map(s=> <wcs-select-option key={s} value={s}>{s}</wcs-select-option>)}
        </WcsSelect>
      </wcs-form-field>
    </div>
    <div>
      <label>Heure départ</label>
      <WcsInput type="time" value={g.departureTime} onChange={v=> dispatch({type:'SET_GENERAL',payload:{departureTime:v}})} />
    </div>
    <div>
      <label>Heure arrivée</label>
      <WcsInput type="time" value={g.arrivalTime} onChange={v=> dispatch({type:'SET_GENERAL',payload:{arrivalTime:v}})} />
    </div>
    <div>
      <label>N° train</label>
      <WcsInput value={g.trainNumber} onChange={v=> dispatch({type:'SET_GENERAL',payload:{trainNumber:v}})} />
    </div>
    <div>
      <label>Type train</label>
      <WcsInput value={g.trainType} onChange={v=> dispatch({type:'SET_GENERAL',payload:{trainType:v}})} />
    </div>
    {/* Champ Matériel roulant déplacé vers l’onglet dédié */}
  </div>
</div>; }

function RollingStockForm({state,dispatch}){
  const { data:items, loaded, error, reload } = useFetchOnce('/api/materiel-roulant', j=> j.items||[]);
  const [search,setSearch]=useState('');
  const [typeFilter,setTypeFilter]=useState('');
  const filtered = useMemo(()=>{
    const q=search.trim().toLowerCase();
    return (items||[]).filter(it=> (!typeFilter || (it.train_type||'')===typeFilter) && (!q || [it.name,it.technical_name,it.serial_number,it.train_type].some(v=> String(v||'').toLowerCase().includes(q))));
  },[items,search,typeFilter]);
  function select(serial){ dispatch({type:'SET_ROLLING', payload: serial}); }
  return <div className="panel">
    <h3>Matériel roulant</h3>
    {error && <wcs-alert mode="danger">{String(error)}</wcs-alert>}
    <div className="grid form-grid">
      <div>
        <label>Rechercher</label>
        <WcsInput value={search} onChange={v=> setSearch(v)} placeholder="Nom, type, numéro de série" />
      </div>
      <div>
        <label>Type</label>
        <select className="native-select" value={typeFilter} onChange={e=> setTypeFilter(e.target.value)}>
          <option value="">(Tous)</option>
          {(Array.from(new Set((items||[]).map(i=> i.train_type).filter(Boolean)))).map(t=> <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
    {!loaded && <p>Chargement…</p>}
    {loaded && filtered.length===0 && <p>Aucun matériel.</p>}
    {loaded && filtered.length>0 && <ul className="rs-list">
      {filtered.map(it=> <li key={it.id} className={'rs-row'+(state.rollingStock===it.serial_number?' selected':'')}>
        <div className="rs-main">
          <strong>{it.name}</strong>
          <span className="muted">{it.technical_name}</span>
          <span className="muted">Type: {it.train_type}</span>
          <span className="muted">Série: {it.serial_number}</span>
        </div>
        <div className="rs-actions">
          <wcs-button mode={state.rollingStock===it.serial_number? 'primary':'stroked'} onClick={()=>select(it.serial_number)}>{state.rollingStock===it.serial_number? 'Sélectionné':'Sélectionner'}</wcs-button>
        </div>
      </li>)}
    </ul>}
    <p className="hint">Sélection actuelle: {state.rollingStock? state.rollingStock: 'Aucune'}</p>
    <style jsx>{`
      .rs-list{list-style:none;margin:.6rem 0 0;padding:0;display:flex;flex-direction:column;gap:.5rem}
      .rs-row{display:flex;justify-content:space-between;align-items:center;border:1px solid #dadce2;background:#fff;border-radius:8px;padding:.6rem .8rem}
      .rs-row.selected{border-color:#3a5}
      .rs-main{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}
      .muted{font-size:.7rem;opacity:.7}
    `}</style>
  </div>;
}

function StopsForm({state,dispatch,stations}){ const stops=state.stops; const used=new Set(stops.map(s=>s.station).filter(Boolean)); function update(i,patch){ dispatch({type:'SET_STOPS',payload: normalizeSequential(stops.map((s,idx)=> idx===i? {...s,...patch}: s))}); }
  function add(){ dispatch({type:'SET_STOPS',payload:[...stops,{station:'',arrival:'',departure:''}]}); }
  function remove(i){ dispatch({type:'SET_STOPS',payload: stops.filter((_,idx)=> idx!==i)}); }
  function selectableFor(stop){ return stations.filter(st => !used.has(st) || st===stop.station); }
  return <div className="panel">
    <h3>Arrêts intermédiaires</h3>
    <wcs-button mode="stroked" icon="add" onClick={add} disabled={stops.length>=stations.length}>Ajouter</wcs-button>
    <div className="stops-list" role="list">
      {stops.map((s,i)=> <div key={i} className="stop-item compact" role="group" aria-label={`Arrêt ${i+1}`}>
        <div className="stop-col station">
          <WcsSelect value={s.station} onChange={v=> update(i,{station:v})} aria-label="Gare">
            <wcs-select-option value="">(Gare)</wcs-select-option>
            {selectableFor(s).map(st=> <wcs-select-option key={st} value={st}>{st}</wcs-select-option>)}
          </WcsSelect>
        </div>
        <div className="stop-col time">
          <input type="time" aria-label="Arrivée" value={s.arrival} onChange={e=>update(i,{arrival:e.target.value})} />
        </div>
        <span className="arrow">→</span>
        <div className="stop-col time">
          <input type="time" aria-label="Départ" value={s.departure} onChange={e=>update(i,{departure:e.target.value})} />
        </div>
        <div className="stop-col actions">
          <wcs-button shape="small" mode="stroked" onClick={()=>remove(i)} aria-label="Supprimer l'arrêt">✕</wcs-button>
        </div>
      </div>)}
    </div>
    {stops.length===0 && <p className="hint">Aucun arrêt intermédiaire.</p>}
  </div>; }

export default async function Page(){
  await requireRole(['admin']);
  return <SchedulesClient />;
}
