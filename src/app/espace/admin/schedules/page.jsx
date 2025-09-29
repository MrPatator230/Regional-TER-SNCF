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
      {/* Récupération des types depuis la région (API dédiée) */}
      {
        (()=>{
          // charger la liste depuis le fichier public /img/type/data.json (clé `logos`)
          const { data: rawTypes, loaded: typesLoaded } = useFetchOnce('/img/type/data.json', j=> j.logos || []);
          const trainTypes = (rawTypes||[]).map(l=> ({ slug: l.slug || l.file || l.path || '', name: l.name || l.label || l.slug || l.file || '' }));
          const normalize = s => String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
          const selectedValue = (() => {
            if(!typesLoaded || !trainTypes.length) return g.trainType || '';
            if(!g.trainType) return '';
            const norm = normalize(g.trainType);
            const match = trainTypes.find(t => normalize(t.slug) === norm || normalize(t.name) === norm);
            return match ? (match.slug || match.name) : (g.trainType || '');
          })();
          if(typesLoaded && Array.isArray(trainTypes) && trainTypes.length){
            return (
              <WcsSelect value={selectedValue} onChange={v=> dispatch({type:'SET_GENERAL',payload:{trainType:v}})}>
                <wcs-select-option value="">(Sélectionner)</wcs-select-option>
                {trainTypes.map(t=> <wcs-select-option key={(t.slug||t.name)} value={t.slug||t.name}>{t.name||t.slug}</wcs-select-option>)}
              </WcsSelect>
            );
          }
           // Fallback text input si la liste n'est pas disponible
           return <WcsInput value={g.trainType} onChange={v=> dispatch({type:'SET_GENERAL',payload:{trainType:v}})} />;
        })() }
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

function DaysForm({state,dispatch}){ const d=state.days; function toggle(idx){ const set=new Set(d.selected); set.has(idx)? set.delete(idx): set.add(idx); dispatch({type:'SET_DAYS',payload:{selected:[...set].sort()}}); }
  return <div className="panel">
    <h3>Jours de circulation</h3>
    <div className="week-days">{WEEK_LABELS.map((l,i)=> <wcs-button key={i} mode={d.selected.includes(i)?'primary':'stroked'} onClick={()=>toggle(i)}>{l}</wcs-button>)}</div>
    <div className="day-options">
      <label><input type="checkbox" checked={d.holidays} onChange={e=> dispatch({type:'SET_DAYS',payload:{holidays:e.target.checked}})} /> Jours fériés</label>
      <label><input type="checkbox" checked={d.sundays} onChange={e=> dispatch({type:'SET_DAYS',payload:{sundays:e.target.checked}})} /> Dimanches</label>
      <label><input type="checkbox" checked={d.custom} onChange={e=> dispatch({type:'SET_DAYS',payload:{custom:e.target.checked}})} /> Dates spécifiques</label>
      {d.custom && <WcsInput placeholder="2025-12-24,2025-12-31" value={d.customDates} onChange={v=> dispatch({type:'SET_DAYS',payload:{customDates:v}})} />}
    </div>
  </div>; }

/*********************\n * Variantes (perturb)*\n *********************/
function VariantStopsEditor({stops,setStops}){ function toggleRemoved(i){ setStops(prev=> prev.map((s,idx)=> idx===i? {...s, removed:!s.removed}: s)); }
  return <div className="panel">
    <h3>Arrêts (modification)</h3>
    <div className="stops-list variant" role="list">
      {stops.map((s,i)=> <div key={i} className={'stop-item'+(s.removed?' variant-removed':'')}>
        <div>
          <wcs-form-field><wcs-label>Gare</wcs-label>
            <WcsSelect value={s.station} onChange={v=> setStops(stops.map((st,idx)=> idx===i? {...st, station:v}: st))}>
              {stops.map((st,j)=> <wcs-select-option key={st.station+'-'+j} value={st.station}>{st.station}</wcs-select-option>)}
            </WcsSelect>
          </wcs-form-field>
        </div>
        <div>
          <label>Arrivée</label>
          <input type="time" value={s.arrival} onChange={e=> setStops(stops.map((st,idx)=> idx===i? {...st, arrival:e.target.value}: st))} />
        </div>
        <div>
          <label>Départ</label>
          <input type="time" value={s.departure} onChange={e=> setStops(stops.map((st,idx)=> idx===i? {...st, departure:e.target.value}: st))} />
        </div>
        <div className="stop-remove"><wcs-button shape="small" mode={s.removed? 'primary':'stroked'} onClick={()=>toggleRemoved(i)}>{s.removed? 'Réactiver':'Supprimer arrêt'}</wcs-button></div>
      </div>)}
    </div>
  </div>; }

/*********************\n * Page principale    *\n *********************/
export default function SchedulesPage(){
  // Référentiels
  const { data:lines } = useFetchOnce('/api/lignes', j=> j.lignes||[]);
  const { data:stationObjs } = useFetchOnce('/api/stations', j=> (j.stations||[]));
  const stations = useMemo(()=> stationObjs.map(s=> s.name), [stationObjs]);

  // Etat liste sillons
  const [schedules,setSchedules]=useState([]);
  const [loadingSchedules,setLoadingSchedules]=useState(false);
  const [loadError,setLoadError]=useState('');
  const reloadSchedules = useCallback(async(withStops=false)=>{ setLoadingSchedules(true); setLoadError(''); try { const r=await fetch('/api/schedules'+(withStops?'?withStops=1':'')); if(!r.ok) throw new Error('Chargement'); const j=await r.json(); const arr = Array.isArray(j)? j:(j.schedules||j.results||[]); setSchedules(arr||[]); } catch(e){ setLoadError(e.message); } finally { setLoadingSchedules(false);} },[]);
  useEffect(()=>{ reloadSchedules(false); },[reloadSchedules]);

  // Onglets
  const [mainTab,setMainTab]=useState('list');

  // Filtrage
  const [listSearch,setListSearch]=useState('');
  const [listLine,setListLine]=useState('');
  const filteredList = useMemo(()=>{ let arr=[...schedules]; if(listLine) arr=arr.filter(s=> String(s.ligne_id||s.ligneId||'')===listLine); if(listSearch.trim()){ const q=listSearch.trim().toLowerCase(); arr=arr.filter(s=> [s.train_number,s.departure_station,s.arrival_station,s.train_type,s.rolling_stock].some(v=> (v||'').toLowerCase().includes(q))); } return arr; },[schedules,listLine,listSearch]);

  // Formulaire (reducer)
  const [formState, dispatch] = useReducer(scheduleFormReducer, initialFormState);
  const [showModal,setShowModal]=useState(false);
  const [saving,setSaving]=useState(false);
  const [formError,setFormError]=useState('');
  const [modalTab,setModalTab]=useState('general');

  // --- Nouvel onglet: Liste des Perturbations ---
  const [pertDate,setPertDate]=useState(()=> new Date().toISOString().slice(0,10));
  const [pertLoading,setPertLoading]=useState(false);
  const [pertError,setPertError]=useState('');
  const [pertItems,setPertItems]=useState([]);
  const [pertSearch,setPertSearch]=useState('');
  async function loadPerturbations(){ setPertLoading(true); setPertError(''); try { const r=await fetch('/api/schedules/daily-perturbations?date='+encodeURIComponent(pertDate)); const j=await r.json().catch(()=>null); if(!r.ok) throw new Error(j?.error||'Erreur chargement'); setPertItems(Array.isArray(j?.items)? j.items: []); } catch(e){ setPertError(e.message); setPertItems([]); } finally { setPertLoading(false);} }
  useEffect(()=>{ if(mainTab==='perturb-list'){ loadPerturbations(); } },[mainTab, pertDate]);
  const filteredPert = useMemo(()=>{ const q=pertSearch.trim().toLowerCase(); if(!q) return pertItems; return pertItems.filter(it=> [it?.schedule?.train_number, it?.schedule?.departure_station, it?.schedule?.arrival_station, it?.type, it?.delay_from_station, it?.mod_departure_station, it?.mod_arrival_station].some(v=> String(v||'').toLowerCase().includes(q))); },[pertItems,pertSearch]);
  async function deletePerturbation(it){
    if(!confirm('Supprimer cette perturbation ?')) return;
    const dateOnly = String(it.date||'').slice(0,10);
    try {
      const r=await fetch(`/api/schedules/${it.schedule_id}/daily-perturbations/${encodeURIComponent(dateOnly)}`, { method:'DELETE' });
      const j=await r.json().catch(()=>null);
      if(!r.ok) throw new Error(j?.error||'Suppression impossible');
      // Clé unique côté serveur: (schedule_id, date)
      setPertItems(items=> items.filter(x=> !(x.schedule_id===it.schedule_id && String(x.date||'').slice(0,10)===dateOnly)));
      // Recharge défensive pour refléter l'état réel
      loadPerturbations().catch(()=>{});
      showToast('Perturbation supprimée');
    } catch(e){ alert(e.message); }
  }

  // Pré-remplissage arrêts depuis la ligne (uniquement à la création, si pas déjà modifié)
  useEffect(()=>{ if(!showModal) return; if(!formState.general.ligneId) return; if(formState.original) return; if(formState.stops.length>0) return; const l=lines.find(x=> String(x.id)===String(formState.general.ligneId)); if(!l) return; const seqIds=[l.depart_station_id, ...(Array.isArray(l.desservies)? l.desservies:[]), l.arrivee_station_id]; const nameById={}; stationObjs.forEach(o=> { nameById[o.id]=o.name; }); const seqNames=seqIds.map(id=> nameById[id]).filter(Boolean); const dep=formState.general.departureStation||l.depart_name; const arr=formState.general.arrivalStation||l.arrivee_name; if(!formState.general.departureStation||!formState.general.arrivalStation){ dispatch({type:'SET_GENERAL',payload:{ departureStation:dep, arrivalStation:arr }}); }
    const depIdx=seqNames.indexOf(dep); const arrIdx=seqNames.indexOf(arr); if(depIdx>-1 && arrIdx>-1 && depIdx!==arrIdx){ let inter; if(depIdx<arrIdx) inter=seqNames.slice(depIdx+1,arrIdx); else inter=seqNames.slice(arrIdx+1,depIdx).reverse(); inter=inter.filter(n=> n!==dep && n!==arr); if(inter.length){ dispatch({type:'SET_STOPS',payload: inter.map(n=>({station:n,arrival:'',departure:''})) }); } }
  },[showModal, formState.general.ligneId, formState.general.departureStation, formState.general.arrivalStation, formState.stops.length, formState.original, lines, stationObjs]);

  function openCreate(){ dispatch({type:'RESET'}); setShowModal(true); setFormError(''); setModalTab('general'); }
  async function openEdit(id){ try { const r=await fetch('/api/schedules?id='+id+'&withStops=1'); if(!r.ok) throw new Error('Lecture impossible'); const s=await r.json(); const dto={ id:s.id, ligneId:s.ligne_id||s.ligneId, departureStation:s.departure_station||s.departureStation, arrivalStation:s.arrival_station||s.arrivalStation, departureTime:(s.departure_time||s.departureTime||'').slice(0,5), arrivalTime:(s.arrival_time||s.arrivalTime||'').slice(0,5), trainNumber:s.train_number||s.trainNumber||'', trainType:s.train_type||s.trainType||'', rollingStock:s.rolling_stock||s.rollingStock||'', days:s.days||s.days, customDates:s.custom_dates||s.customDates||[], stops: (Array.isArray(s.stops)? s.stops:[]).map(st=> ({ station: st.station_name||st.station, arrival:(st.arrival_time||st.arrival||'').slice(0,5), departure:(st.departure_time||st.departure||'').slice(0,5) })), isSubstitution: !!(s.isSubstitution ?? s.is_substitution) };
    dispatch({type:'LOAD_FROM_DTO', payload:{ ...dto, days: dto.days }}); setShowModal(true); setFormError(''); setModalTab('general'); } catch(e){ showToast(e.message,'danger'); } }

  async function saveForm(){ if(saving) return; setSaving(true); setFormError(''); try { const errs = validateForm(formState, stations); if(errs.length) throw new Error(errs.join(', ')); const payload = buildPayload(formState); const method=formState.original? 'PUT':'POST'; const url=formState.original? '/api/schedules?id='+formState.original.id : '/api/schedules'; const r=await fetch(url,{ method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); let j=null; try{ j=await r.json(); }catch{} if(!r.ok) throw new Error(j?.error||'Echec enregistrement'); await reloadSchedules(false); setShowModal(false); showToast(formState.original? 'Sillon mis à jour':'Sillon créé'); if(j?.schedule){ dispatch({type:'APPLY_SAVED_DTO', payload:j.schedule}); } } catch(e){ setFormError(e.message); } finally { setSaving(false);} }

  async function deleteSchedule(id){ if(!confirm('Supprimer ce sillon ?')) return; try { const r=await fetch('/api/schedules?id='+id,{method:'DELETE'}); if(!r.ok) throw new Error('Suppression'); await reloadSchedules(false); showToast('Supprimé'); } catch(e){ showToast(e.message,'danger'); } }

  // Vue semaine
  const [weekStart,setWeekStart]=useState(()=>{ const d=new Date(); const wd=(d.getDay()+6)%7; d.setDate(d.getDate()-wd); return d.toISOString().slice(0,10); });
  function changeWeek(delta){ const d=new Date(weekStart+'T00:00:00'); d.setDate(d.getDate()+delta*7); setWeekStart(d.toISOString().slice(0,10)); }
  function expandForWeek(){ const start=new Date(weekStart+'T00:00:00'); const out={}; for(let i=0;i<7;i++){ const cur=new Date(start); cur.setDate(start.getDate()+i); const ds=cur.toISOString().slice(0,10); out[ds]=[]; } schedules.forEach(s=>{ let daysObj=s.days; try{ if(typeof daysObj==='string') daysObj=JSON.parse(daysObj); }catch{} const sel=(daysObj?.selected)||[]; for(let i=0;i<7;i++){ const cur=new Date(start); cur.setDate(start.getDate()+i); const idx=(cur.getDay()+6)%7; if(sel.includes(idx)){ const ds=cur.toISOString().slice(0,10); out[ds].push(s); } } }); return out; }
  const weekMap=useMemo(expandForWeek,[schedules,weekStart]);
  const weekDates=useMemo(()=> Array.from({length:7}).map((_,i)=>{ const d=new Date(weekStart+'T00:00:00'); d.setDate(d.getDate()+i); return d.toISOString().slice(0,10); }),[weekStart]);

  /************** Variantes quotidiennes **************/
  const [variantModal,setVariantModal]=useState(false); const [variantSchedule,setVariantSchedule]=useState(null); const [variantLoading,setVariantLoading]=useState(false); const [variantError,setVariantError]=useState(''); const [variantDate,setVariantDate]=useState(()=> new Date().toISOString().slice(0,10)); const [variantType,setVariantType]=useState('retard'); const [variantGeneral,setVariantGeneral]=useState({ departureStation:'', arrivalStation:'', departureTime:'', arrivalTime:'' }); const [variantStops,setVariantStops]=useState([]); const [variantDelay,setVariantDelay]=useState({ minutes:'', fromStation:'', cause:'' }); const [variantSuppression,setVariantSuppression]=useState({ cause:'' }); const originalVariantRef=useRef(null);
  async function openVariant(s){ setVariantError(''); setVariantLoading(true); setVariantModal(true); setVariantSchedule(null); try { const r=await fetch('/api/schedules?id='+s.id+'&withStops=1'); if(!r.ok) throw new Error('Chargement'); const js=await r.json(); const stops=Array.isArray(js.stops)? js.stops.map(st=> ({ station: st.station_name||st.station, arrival:(st.arrival_time||st.arrival||'').slice(0,5), departure:(st.departure_time||st.departure||'').slice(0,5) })) : []; setVariantSchedule(js); setVariantGeneral({ departureStation: js.departure_station||js.departureStation, arrivalStation: js.arrival_station||js.arrivalStation, departureTime:(js.departure_time||js.departureTime||'').slice(0,5), arrivalTime:(js.arrival_time||js.arrivalTime||'').slice(0,5) }); setVariantStops(stops); setVariantDelay({ minutes:'', fromStation: js.departure_station||js.departureStation, cause:'' }); originalVariantRef.current={ general:{...js}, stops: stops.map(x=>({...x})) }; } catch(e){ setVariantError(e.message); } finally { setVariantLoading(false); } }
  function resetVariant(){ if(!variantSchedule) return; setVariantType('retard'); setVariantDelay({ minutes:'', fromStation: variantSchedule.departure_station||variantSchedule.departureStation, cause:'' }); setVariantSuppression({ cause:'' }); if(originalVariantRef.current){ setVariantGeneral({ departureStation: variantSchedule.departure_station||variantSchedule.departureStation, arrivalStation: variantSchedule.arrival_station||variantSchedule.arrivalStation, departureTime:(variantSchedule.departure_time||variantSchedule.departureTime||'').slice(0,5), arrivalTime:(variantSchedule.arrival_time||variantSchedule.arrivalTime||'').slice(0,5) }); setVariantStops(originalVariantRef.current.stops.map(s=>({...s, removed:false}))); } }
  async function saveVariant(){ if(!variantSchedule) return; setVariantError(''); try { if(!variantDate) throw new Error('Date requise'); let payload; if(variantType==='retard'){ const m=Number(variantDelay.minutes)||0; if(m<=0) throw new Error('Minutes invalides'); payload={ type:'retard', delayMinutes:m, fromStation: variantDelay.fromStation||variantGeneral.departureStation, cause: variantDelay.cause||null }; } else if(variantType==='suppression'){ payload={ type:'suppression', cause: variantSuppression.cause||null }; } else { const removedStops=variantStops.filter(s=> s.removed).map(s=> s.station); payload={ type:'modification', departureStation: variantGeneral.departureStation, arrivalStation: variantGeneral.arrivalStation, departureTime: variantGeneral.departureTime, arrivalTime: variantGeneral.arrivalTime, removedStops }; }
    const r=await fetch(`/api/schedules/${variantSchedule.id}/daily-perturbations/${variantDate}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); const j=await r.json().catch(()=>null); if(!r.ok) throw new Error(j?.error||'Echec'); setVariantModal(false); showToast('Perturbation enregistrée'); } catch(e){ setVariantError(e.message); } }

  /********************* Rendu *********************/
  const diff = formState.original? computeDiff({ ...formState, original: { ...formState.original, stops: formState.original.stops||[] } }): {};

  return <section className="schedules-admin">
    <h1>Sillons (Horaires)</h1>
    <wcs-tabs value={mainTab} align="start" onWcsTabsChange={e=> setMainTab(e.detail.value)}>
      <wcs-tab header="Liste" item-key="list">
        <div className="actions">
          <wcs-button icon="add" onClick={openCreate}>Créer</wcs-button>
          <wcs-button mode="stroked" onClick={()=>{ location.href='/espace/admin/schedules/import'; }}>Importer Excel</wcs-button>
          <div className="search-wrapper"><WcsInput placeholder="Recherche" value={listSearch} onChange={v=> setListSearch(v)} /></div>
        </div>
        <div className="list-layout">
          <aside className="list-filters">
            <label>Ligne</label>
            <select className="native-select" value={listLine} onChange={e=> setListLine(e.target.value)}>
              <option value="">(Toutes)</option>
              {lines.map(l=> <option key={l.id} value={String(l.id)}>{l.depart_name} ➜ {l.arrivee_name}</option>)}
            </select>
            {(listLine||listSearch) && <button className="btn-reset-filters" onClick={()=>{ setListLine(''); setListSearch(''); }}>Réinitialiser</button>}
            <div className="filters-count">{filteredList.length} / {schedules.length} sillons</div>
            {loadError && <p className="err">{loadError}</p>}
          </aside>
          <div className="list">
            {loadingSchedules && <p>Chargement…</p>}
            {!loadingSchedules && filteredList.length===0 && <p>Aucun résultat.</p>}
            <ul>
              {filteredList.map(s=> <li key={s.id} className="schedule-row">
                <div className="row-main"><strong>{s.train_number||'?'}</strong> {s.departure_station} ➜ {s.arrival_station} ({(s.departure_time||'').slice(0,5)} - {(s.arrival_time||'').slice(0,5)})</div>
                <div className="row-actions">
                  <wcs-button shape="small" mode="stroked" onClick={()=>openVariant(s)} icon="warning">Perturber</wcs-button>
                  <wcs-button shape="small" mode="stroked" onClick={()=>openEdit(s.id)} icon="edit">Modifier</wcs-button>
                  <wcs-button shape="small" mode="stroked" onClick={()=>deleteSchedule(s.id)} icon="delete">Supprimer</wcs-button>
                </div>
              </li>)}
            </ul>
          </div>
        </div>
      </wcs-tab>
      <wcs-tab header="Semaine" item-key="week">
        <div className="week-controls">
          <wcs-button mode="stroked" shape="small" onClick={()=>changeWeek(-1)}>◀</wcs-button>
          <strong>Semaine du {weekStart}</strong>
            <wcs-button mode="stroked" shape="small" onClick={()=>changeWeek(1)}>▶</wcs-button>
          <wcs-button mode="clear" shape="small" onClick={()=> setWeekStart(()=>{ const d=new Date(); const w=(d.getDay()+6)%7; d.setDate(d.getDate()-w); return d.toISOString().slice(0,10); })}>Aujourd'hui</wcs-button>
        </div>
        <div className="week-grid">
          {weekDates.map(date=> <div key={date} className="week-col">
            <div className="week-col-header">{date}</div>
            <ul className="week-day-list">
              {(weekMap[date]||[]).length===0 && <li className="empty">—</li>}
              {(weekMap[date]||[]).map(s=> <li key={s.id} className="week-item"> <span className="tn">{s.train_number||'?'}</span> <span className="tt">{(s.departure_time||'').slice(0,5)}→{(s.arrival_time||'').slice(0,5)}</span> <span className="ga">{s.departure_station}→{s.arrival_station}</span></li>)}
            </ul>
          </div>)}
        </div>
      </wcs-tab>
      <wcs-tab header="Liste des Perturbations" item-key="perturb-list">
        <div className="actions" style={{marginTop:'.8rem'}}>
          <div><label style={{display:'block',fontSize:'.65rem',textTransform:'uppercase',letterSpacing:'.5px'}}>Date</label><input type="date" value={pertDate} onChange={e=> setPertDate(e.target.value)} /></div>
          <wcs-button mode="stroked" onClick={loadPerturbations} disabled={pertLoading}>Recharger</wcs-button>
          <div className="search-wrapper"><WcsInput placeholder="Rechercher (train, gare, type)" value={pertSearch} onChange={v=> setPertSearch(v)} /></div>
        </div>
        {pertError && <wcs-alert mode="danger" style={{marginBottom:'1rem'}}>{pertError}</wcs-alert>}
        {pertLoading && <p>Chargement…</p>}
        {!pertLoading && filteredPert.length===0 && <p>Aucune perturbation pour cette date.</p>}
        {!pertLoading && filteredPert.length>0 && (
          <table className="ov-table" style={{width:'100%',borderCollapse:'collapse',fontSize:'.72rem'}}>
            <thead><tr><th style={{textAlign:'left'}}>Train</th><th style={{textAlign:'left'}}>Trajet</th><th style={{textAlign:'left'}}>Type</th><th style={{textAlign:'left'}}>Détails</th><th style={{textAlign:'left'}}>Mis à jour</th><th></th></tr></thead>
            <tbody>
              {filteredPert.map(it=> (
                <tr key={it.id}>
                  <td style={{borderTop:'1px solid #e0e0e4',padding:'.4rem .5rem'}}><strong>{it?.schedule?.train_number||'?'}</strong></td>
                  <td style={{borderTop:'1px solid #e0e0e4',padding:'.4rem .5rem'}}>{it?.schedule?.departure_station} → {it?.schedule?.arrival_station}</td>
                  <td style={{borderTop:'1px solid #e0e0e4',padding:'.4rem .5rem'}}>{it.type}</td>
                  <td style={{borderTop:'1px solid #e0e0e4',padding:'.4rem .5rem'}}>
                    {it.type==='retard' && <>+{it.delay_minutes}m {it.delay_from_station? `depuis ${it.delay_from_station}`:''}</>}
                    {it.type==='suppression' && <>Supprimé{it.cause? ` – ${it.cause}`:''}</>}
                    {it.type==='modification' && <>
                      {(it.mod_departure_station||it.mod_departure_time) && <span>Départ: {it.mod_departure_station||'-'} {it.mod_departure_time||''}</span>}
                      {(it.mod_arrival_station||it.mod_arrival_time) && <span style={{marginLeft:8}}>Arrivée: {it.mod_arrival_station||'-'} {it.mod_arrival_time||''}</span>}
                      {Array.isArray(it.removed_stops) && it.removed_stops.length>0 && <span style={{marginLeft:8}}>{it.removed_stops.length} arrêt(s) supprimé(s)</span>}
                      {it.cause? <span style={{marginLeft:8}}>– {it.cause}</span>: null}
                    </>}
                  </td>
                  <td style={{borderTop:'1px solid #e0e0e4',padding:'.4rem .5rem'}}>{it.updated_at}</td>
                  <td style={{borderTop:'1px solid #e0e0e4',padding:'.4rem .5rem',textAlign:'right'}}>
                    <wcs-button mode="stroked" shape="small" icon="delete" onClick={()=> deletePerturbation(it)}>Supprimer</wcs-button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </wcs-tab>
    </wcs-tabs>

    {showModal && <>
      <wcs-modal show size="l" onWcsDialogClosed={()=> setShowModal(false)}>
        <span slot="header">{formState.original? 'Modifier le sillon':'Nouveau sillon'}</span>
        <div className="modal-content">
          <wcs-tabs value={modalTab} align="start" onWcsTabsChange={e=> setModalTab(e.detail.value)}>
            <wcs-tab header="Général" item-key="general">
              <GeneralForm state={formState} dispatch={dispatch} lines={lines} stations={stations} />
            </wcs-tab>
            <wcs-tab header="Arrêts" item-key="stops">
              <StopsForm state={formState} dispatch={dispatch} stations={stations} />
            </wcs-tab>
            <wcs-tab header="Jours" item-key="days">
              <DaysForm state={formState} dispatch={dispatch} />
            </wcs-tab>
            <wcs-tab header="Matériel roulant" item-key="rolling">
              <RollingStockForm state={formState} dispatch={dispatch} />
            </wcs-tab>
            <wcs-tab header="Substitution" item-key="substitution">
              <SubstitutionForm state={formState} dispatch={dispatch} />
            </wcs-tab>
          </wcs-tabs>
          {formError && <wcs-alert mode="danger" style={{marginTop:'1rem'}}>{formError}</wcs-alert>}
          {formState.original && Object.keys(diff).length>0 && <div className="diff-box"><strong>Modifications:</strong> {Object.keys(diff).slice(0,6).map(k=> <span key={k} className="diff-item">{k}</span>)}{Object.keys(diff).length>6 && <span>…</span>}</div>}
        </div>
        <div slot="actions" className="modal-actions">
          <wcs-button mode="stroked" onClick={()=> setShowModal(false)} disabled={saving}>Annuler</wcs-button>
          <wcs-button mode="primary" onClick={saveForm} disabled={saving || !formState.general.ligneId}>{saving? 'Enregistrement…': (formState.original? 'Mettre à jour':'Enregistrer')}</wcs-button>
        </div>
      </wcs-modal>
      <div className="wcs-modal-backdrop" />
    </>}

    {variantModal && <>
      <wcs-modal show size="xl" onWcsDialogClosed={()=> setVariantModal(false)}>
        <span slot="header">Perturbation quotidienne – {variantSchedule? (variantSchedule.train_number||''): ''}</span>
        <div className="modal-content" style={{maxHeight:'70vh'}}>
          {variantError && <wcs-alert mode="danger" style={{marginBottom:'1rem'}}>{variantError}</wcs-alert>}
          <div className="grid form-grid" style={{marginBottom:'1rem'}}>
            <div><label>Date</label><input type="date" value={variantDate} onChange={e=> setVariantDate(e.target.value)} /></div>
            <div><label>Type</label><select value={variantType} onChange={e=> setVariantType(e.target.value)}><option value="retard">Retard</option><option value="suppression">Suppression</option><option value="modification">Modification</option></select></div>
          </div>
          {!variantSchedule && variantLoading && <p>Chargement…</p>}
          {variantSchedule && <wcs-tabs value={variantType} align="start">
            <wcs-tab header="Retard" item-key="retard">
              <div className="panel">
                <div className="grid form-grid">
                  <div><label>Depuis gare</label><select className="native-select" value={variantDelay.fromStation} onChange={e=> setVariantDelay(v=>({...v, fromStation:e.target.value}))}>{[variantGeneral.departureStation, ...variantStops.map(s=>s.station), variantGeneral.arrivalStation].filter((v,i,a)=> a.indexOf(v)===i).map(g=> <option key={g} value={g}>{g}</option>)}</select></div>
                  <div><label>Minutes</label><input type="number" min={1} max={1440} value={variantDelay.minutes} onChange={e=> setVariantDelay(v=>({...v, minutes:e.target.value}))} /></div>
                  <div style={{gridColumn:'1 / -1'}}><label>Cause</label><textarea value={variantDelay.cause} onChange={e=> setVariantDelay(v=>({...v, cause:e.target.value}))} style={{width:'100%',minHeight:70}} /></div>
                </div>
              </div>
            </wcs-tab>
            <wcs-tab header="Suppression" item-key="suppression">
              <div className="panel"><label>Cause</label><textarea value={variantSuppression.cause} onChange={e=> setVariantSuppression({cause:e.target.value})} style={{width:'100%',minHeight:90}} /><p className="hint">Le trajet sera marqué supprimé.</p></div>
            </wcs-tab>
            <wcs-tab header="Modification" item-key="modification">
              <div className="panel">
                <div className="grid form-grid">
                  <div><label>Départ</label><WcsInput value={variantGeneral.departureStation} onChange={v=> setVariantGeneral(g=>({...g, departureStation:v}))} /></div>
                  <div><label>H. départ</label><input type="time" value={variantGeneral.departureTime} onChange={e=> setVariantGeneral(g=>({...g, departureTime:e.target.value}))} /></div>
                  <div><label>Arrivée</label><WcsInput value={variantGeneral.arrivalStation} onChange={v=> setVariantGeneral(g=>({...g, arrivalStation:v}))} /></div>
                  <div><label>H. arrivée</label><input type="time" value={variantGeneral.arrivalTime} onChange={e=> setVariantGeneral(g=>({...g, arrivalTime:e.target.value}))} /></div>
                </div>
                <VariantStopsEditor stops={variantStops} setStops={setVariantStops} />
              </div>
            </wcs-tab>
          </wcs-tabs>}
        </div>
        <div slot="actions" className="modal-actions">
          <wcs-button mode="stroked" onClick={()=>{ if(confirm('Fermer sans enregistrer ?')) setVariantModal(false); }}>Annuler</wcs-button>
          <wcs-button mode="stroked" onClick={resetVariant} disabled={!variantSchedule}>Réinitialiser</wcs-button>
          <wcs-button mode="primary" onClick={saveVariant} disabled={!variantSchedule || (variantType==='retard' && !variantDelay.minutes)}>Enregistrer</wcs-button>
        </div>
      </wcs-modal>
      <div className="wcs-modal-backdrop" />
    </>}

    <style jsx>{`
      .actions{display:flex;gap:1rem;align-items:center;margin:1rem 0;flex-wrap:wrap}
      .search-wrapper{min-width:200px}
      .list-layout{display:grid;grid-template-columns:220px 1fr;gap:1.2rem;align-items:start}
      @media(max-width:880px){.list-layout{grid-template-columns:1fr}}
      .list-filters{display:flex;flex-direction:column;gap:.8rem;padding:.9rem 1rem;border:1px solid #ddd;border-radius:8px;background:#f6f6f8}
      .filters-count{font-size:.7rem;opacity:.65}
      .schedule-row{display:flex;justify-content:space-between;align-items:center;padding:.65rem .8rem;border:1px solid #dadce2;border-radius:8px;margin-bottom:.55rem;background:#fff}
      .schedule-row strong{margin-right:.4rem}
      .row-actions{display:flex;gap:.4rem}
      .panel{display:flex;flex-direction:column;gap:1rem;padding:.75rem .25rem 1rem}
      .grid.form-grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
      label{font-size:.65rem;font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-bottom:.2rem;display:block}
      .week-controls{display:flex;align-items:center;gap:.8rem;margin:.75rem 0 .9rem;flex-wrap:wrap}
      .week-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.8rem}
      .week-col{border:1px solid #ddd;border-radius:6px;overflow:hidden;display:flex;flex-direction:column}
      .week-col-header{background:#eee;padding:.4rem .6rem;font-size:.7rem;font-weight:600}
      .week-day-list{list-style:none;margin:0;padding:.35rem .4rem;display:flex;flex-direction:column;gap:.3rem}
      .week-item{background:#fff;border:1px solid #e0e0e4;padding:.35rem .45rem;border-radius:4px;display:flex;flex-direction:column;font-size:.6rem;gap:.15rem}
      .week-item .tn{font-weight:600}
      .week-item .tt{font-family:monospace}
      .stops-list{display:flex;flex-direction:column;gap:.6rem;margin-top:.5rem}
      .stop-item{background:#f6f6f8;padding:.6rem .65rem;border:1px solid #dcdce2;border-radius:6px;}
      .stop-item.compact{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap}
      .stop-item.compact .stop-col.station{min-width:200px;flex:1 1 220px}
      .stop-item.compact .stop-col.time input{width:105px}
      .stop-item.compact .arrow{font-size:.75rem;opacity:.6}
      .stop-item.compact .stop-col.actions{margin-left:auto}
      @media(max-width:620px){.stop-item.compact .stop-col.actions{width:100%;display:flex;justify-content:flex-end;margin-left:0}}
      .stop-remove{display:flex;align-items:flex-end;padding-top:1.1rem}
      .hint{font-size:.7rem;opacity:.65}
      .modal-content{max-height:60vh;overflow:auto;padding:.5rem 1rem 1rem}
      .modal-content :global(wcs-tabs){ --tabs-header-padding:0 0 .4rem 0; }
      .modal-actions{display:flex;justify-content:flex-end;gap:.6rem}
      .wcs-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:blur(2px);z-index:999}
      wcs-modal{z-index:1000}
      .variant-removed{opacity:.55;position:relative}
      .variant-removed:after{content:'Supprimé';position:absolute;top:4px;right:4px;background:#c60018;color:#fff;font-size:.55rem;padding:.15rem .4rem;border-radius:4px;letter-spacing:.5px}
      .err{color:#c60018;font-size:.7rem}
      .diff-box{margin-top:1rem;font-size:.6rem;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}
      .diff-item{background:#eef;border:1px solid #ccd;padding:.2rem .4rem;border-radius:4px}
    `}</style>
  </section>; }

function SubstitutionForm({state,dispatch}){
  return <div className="panel">
    <h3>Sillon de substitution</h3>
    <p className="form-info">Définir si ce sillon peut être utilisé comme sillon de substitution pendant les perturbations.</p>

    <div className="form-check form-switch">
      <input
        className="form-check-input"
        type="checkbox"
        id="isSubstitution"
        checked={!!state.isSubstitution}
        onChange={e => dispatch({type:'SET_SUBSTITUTION', payload: e.target.checked})}
      />
      <label className="form-check-label" htmlFor="isSubstitution">
        Ce sillon peut être utilisé comme sillon de substitution pendant les travaux
      </label>
    </div>

    {state.isSubstitution && (
      <div className="substitution-info">
        <p className="hint">
          Ce sillon pourra être sélectionné comme substitution lors de la création des perturbations.
          Il sera clairement identifiable dans la liste des sillons disponibles.
        </p>
      </div>
    )}

    <style jsx>{`
      .form-info {
        font-size: 0.9rem;
        margin-bottom: 1rem;
      }
      .form-check {
        margin-bottom: 1rem;
      }
      .form-check-input {
        margin-right: 0.5rem;
      }
      .form-check-label {
        font-size: 1rem;
        font-weight: normal;
        text-transform: none;
        letter-spacing: normal;
      }
      .substitution-info {
        background-color: #f8f9fa;
        padding: 0.75rem;
        border-radius: 0.25rem;
        margin-top: 0.5rem;
      }
    `}</style>
  </div>;
}
