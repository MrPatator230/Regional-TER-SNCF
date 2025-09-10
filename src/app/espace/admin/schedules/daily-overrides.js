// Refonte complète du système de perturbations (overrides)
// Objectifs: unification API, validation robuste, simplification logique UI
// Actions supportées: delay, cancel (reroute supprimé)

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// ---------------------- Helpers génériques ----------------------
function isValidDate(str){ return /^\d{4}-\d{2}-\d{2}$/.test(str); }
function clamp(n,min,max){ return Math.min(max,Math.max(min,n)); }
function normStr(v,max=5000){ if(v==null) return ''; return String(v).trim().slice(0,max); }
function validTime(hhmm){ return /^([01]\d|2[0-3]):([0-5]\d)$/.test(hhmm||''); }
function addMinutes(hhmm, delta){ if(!validTime(hhmm)) return hhmm; const [H,M]=hhmm.split(':').map(Number); let tot=H*60+M+delta; if(tot<0) tot=0; tot%=1440; const h=(tot/60|0); const m=tot%60; return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'); }

// Applique override à un schedule brut
function materialize(base, override){
  if(!override) return { base, effective: base, override:null };
  if(override.action==='cancel') return { base, effective: base, override };
  if(override.action==='multi' && override.multi){
    const multi = override.multi; // ne traite plus reroute
    let working = { ...base, stops: (base.stops||[]).map(s=>({...s})) };
    if(multi.delay){
      const delay = Number(multi.delay.minutes)||0; if(delay>0){
        const seq=[working.departure_station,...(working.stops||[]).map(s=>s.station_name),working.arrival_station];
        const startIdx = seq.indexOf(multi.delay.fromStation)||0;
        const add=delay;
        function shift(t){ if(!t) return t; const [H,M]=t.split(':').map(Number); if(isNaN(H)||isNaN(M)) return t; let m=H*60+M+add; m=(m+1440)%1440; const h2=(m/60|0)%24; const m2=m%60; return String(h2).padStart(2,'0')+':'+String(m2).padStart(2,'0'); }
        working = { ...working,
          departure_time: (startIdx===0 && working.departure_time)? shift(working.departure_time): working.departure_time,
          arrival_time: working.arrival_time? shift(working.arrival_time): working.arrival_time,
          stops: (working.stops||[]).map(st=>{ const idx=seq.indexOf(st.station_name); if(idx<startIdx) return st; return { ...st, arrival_time: shift(st.arrival_time), departure_time: shift(st.departure_time) }; }) };
      }
    }
    return { base, effective: working, override };
  }
  if(override.action==='delay'){
    const delay = Number(override.delay_minutes)||0; if(delay<=0) return { base, effective: base, override };
    const seq=[base.departure_station,...(base.stops||[]).map(s=>s.station_name),base.arrival_station];
    const startIdx=seq.indexOf(override.delay_from_station)||0;
    function shift(t){ if(!t) return t; const [H,M]=t.split(':').map(Number); if(isNaN(H)||isNaN(M)) return t; let mins=H*60+M+delay; mins=(mins+1440)%1440; const h2=(mins/60|0)%24; const m2=mins%60; return String(h2).padStart(2,'0')+':'+String(m2).padStart(2,'0'); }
    const newStops=(base.stops||[]).map(st=>{ const idx=seq.indexOf(st.station_name); if(idx<startIdx) return st; return { ...st, arrival_time: shift(st.arrival_time), departure_time: shift(st.departure_time) }; });
    return { base, effective:{ ...base, departure_time: (startIdx===0 && base.departure_time)? shift(base.departure_time): base.departure_time, arrival_time: base.arrival_time? shift(base.arrival_time): base.arrival_time, stops: newStops }, override };
  }
  return { base, effective: base, override };
}

// ---------------------- Service API ----------------------
async function apiListOverrides(date){ if(!isValidDate(date)) return []; const r=await fetch('/api/schedules/overrides?date='+encodeURIComponent(date)); if(!r.ok) return []; return r.json(); }
async function apiGetOverride(scheduleId,date){ const r=await fetch(`/api/schedules/${scheduleId}/overrides/${date}`); if(!r.ok) return null; return r.json(); }
async function apiSaveOverride(scheduleId,date,payload){ const r=await fetch(`/api/schedules/${scheduleId}/overrides/${date}`,{ method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); const j=await r.json().catch(()=>null); if(!r.ok) throw new Error(j?.error||'Enregistrement échec'); return j; }
async function apiDeleteOverride(scheduleId,date){ const r=await fetch(`/api/schedules/${scheduleId}/overrides/${date}`,{ method:'DELETE' }); if(!r.ok){ const j=await r.json().catch(()=>null); throw new Error(j?.error||'Suppression impossible'); } }

// ---------------------- Hook principal ----------------------
export function useDailyOverrides(date){
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [map,setMap]=useState({}); // schedule_id -> override
  const [dialog,setDialog]=useState({ open:false, schedule:null, baseSchedule:null, override:null });
  const [form,setForm]=useState({ actions:[], action:'none', delay:{ fromStation:'', minutes:'', cause:'' }, cancel:{ cause:'' } });
  const [saving,setSaving]=useState(false);
  const [dirty,setDirty]=useState(false);

  // Chargement liste journée
  const reload = useCallback(async()=>{ if(!date) return; setLoading(true); setError(''); try { const list=await apiListOverrides(date); const newMap={}; list.forEach(o=> newMap[o.schedule_id]=o); setMap(newMap); } catch(e){ setError(e.message); } finally { setLoading(false); } },[date]);
  useEffect(()=>{ reload(); },[reload]);

  // Ouvrir dialogue
  async function openDialog(schedule){
    let ov=map[schedule.id];
    try { const fresh=await apiGetOverride(schedule.id,date); if(fresh) ov=fresh; } catch{};
    const newForm = buildFormStateFromOverride(schedule, ov);
    const effective = materialize(schedule, ov).effective; // parcours effectif (affiché)
    setForm(newForm);
    setDirty(false);
    setDialog({ open:true, schedule: effective, baseSchedule: schedule, override: ov||null });
  }
  function closeDialog(){ setDialog({ open:false, schedule:null, baseSchedule:null, override:null }); }

  function buildFormStateFromOverride(schedule, ov){
    if(!ov){
      return { actions:[], action:'none', delay:{ fromStation:schedule.departure_station, minutes:'', cause:'' }, cancel:{ cause:'' } };
    }
    if(ov.action==='multi' && ov.multi){
      const multi = ov.multi;
      const actions=[]; if(multi.delay) actions.push('delay'); if(multi.cancel) actions.push('cancel');
      return { actions, action: actions.length? (actions.length>1?'multi':actions[0]):'none',
        delay:{ fromStation: multi.delay?.fromStation||schedule.departure_station, minutes:String(multi.delay?.minutes||''), cause: multi.delay?.cause||'' },
        cancel:{ cause: multi.cancel?.cause||'' }
      };
    }
    if(ov.action==='delay') return { actions:['delay'], action:'delay', delay:{ fromStation: ov.delay_from_station||schedule.departure_station, minutes:String(ov.delay_minutes||''), cause: ov.delay_cause||'' }, cancel:{ cause:'' } };
    if(ov.action==='cancel') return { actions:['cancel'], action:'cancel', delay:{ fromStation:schedule.departure_station, minutes:'', cause:'' }, cancel:{ cause: ov.cancel_cause||'' } };
    return { actions:[], action:'none', delay:{ fromStation:schedule.departure_station, minutes:'', cause:'' }, cancel:{ cause:'' } };
  }

  // Validation form
  function validate(){ const errs=[]; if(!dialog.schedule) return ['Aucun sillon']; const acts=form.actions.filter(a=> ['delay','cancel'].includes(a)); if(!acts.length) return errs; if(acts.includes('delay')){ const m=Number(form.delay.minutes); if(!Number.isFinite(m) || m<=0) errs.push('Minutes de retard invalides'); if(m>1440) errs.push('Retard > 1440'); if(!form.delay.fromStation) errs.push('Gare de départ retard manquante'); } return errs; }

  // Auto-save (debounce) à chaque modification valide
  useEffect(()=>{ if(!dialog.open) return; if(saving) return; if(!dirty) return; const acts=form.actions.filter(a=> ['delay','cancel'].includes(a)); const errs=validate(); if(acts.length && errs.length) return; const to=setTimeout(()=>{ save(); }, 900); return ()=> clearTimeout(to); }, [form, dirty, dialog.open, saving]);

  async function save(){ if(!dialog.schedule && !dialog.baseSchedule) return; const errs=validate(); if(errs.length){ setError(errs.join('\n')); return; } setSaving(true); setError(''); try { const baseSched = dialog.baseSchedule||dialog.schedule; const scheduleId=baseSched.id; const acts=form.actions.filter(a=> ['delay','cancel'].includes(a)); if(!acts.length){ await apiDeleteOverride(scheduleId,date); setMap(m=>{ const c={...m}; delete c[scheduleId]; return c; }); closeDialog(); return; }
      let payload; if(acts.length===1){ const only=acts[0]; if(only==='delay'){ payload={ action:'delay', delay_from_station: form.delay.fromStation||baseSched.departure_station, delay_minutes: clamp(Number(form.delay.minutes)||0,0,1440), delay_cause: normStr(form.delay.cause,5000)||null }; } else if(only==='cancel'){ payload={ action:'cancel', cancel_cause: normStr(form.cancel.cause,5000)||null }; } } else { const multi={ multi:true }; if(acts.includes('delay')) multi.delay={ fromStation: form.delay.fromStation||baseSched.departure_station, minutes: clamp(Number(form.delay.minutes)||0,0,1440), cause: normStr(form.delay.cause,5000)||null }; if(acts.includes('cancel')) multi.cancel={ cause: normStr(form.cancel.cause,5000)||null }; payload={ action:'multi', actions: acts, reroute: multi }; }
      const ov=await apiSaveOverride(scheduleId,date,payload); const eff = materialize(baseSched, ov).effective;
      setMap(m=> ({ ...m, [scheduleId]: ov }));
      setDialog(d=> ({ ...d, override: ov, schedule: eff, baseSchedule: baseSched }));
      setDirty(false); showToast('Perturbation enregistrée'); } catch(e){ setError(e.message); } finally { setSaving(false); } }
  async function remove(){ if(!dialog.schedule && !dialog.baseSchedule) return; const baseSched = dialog.baseSchedule||dialog.schedule; setSaving(true); setError(''); try { await apiDeleteOverride(baseSched.id,date); setMap(m=>{ const c={...m}; delete c[baseSched.id]; return c; }); showToast('Perturbation supprimée'); closeDialog(); } catch(e){ setError(e.message); } finally { setSaving(false); } }

  function showToast(msg){ try { const el=document.createElement('wcs-alert'); el.setAttribute('open',''); el.setAttribute('mode','success'); el.style.position='fixed'; el.style.bottom='16px'; el.style.right='16px'; el.style.zIndex='9000'; el.textContent=msg; document.body.appendChild(el); setTimeout(()=>{ try{ el.remove(); }catch{} },2500); } catch {} }

  const api = useMemo(()=>({ overridesMap: map, materialize:(s)=> materialize(s,map[s.id]), openDialog, closeDialog, saveCurrent: save, deleteOverride: remove, setForm, form, dialog, error, loading, saving, dirty, setDirty, reload }), [map, openDialog, error, loading, saving, form, dialog, dirty, reload]);
  return api;
}

// ---------------------- UI Dialog ----------------------
export function DailyOverrideDialog({ api, stations }){
  // conserve l'export pour compatibilité
  const { dialog, closeDialog, form, setForm, saveCurrent, deleteOverride, error, saving } = api;
  if(!dialog.open || !dialog.schedule) return null;
  const s = dialog.schedule; const base = dialog.baseSchedule||dialog.schedule;
  const allStations = stations||[];
  const acts=form.actions;
  function toggleAction(a){ api.setDirty(true); setForm(f=>{ const set=new Set(f.actions); set.has(a)? set.delete(a): set.add(a); const arr=[...set]; return { ...f, actions: arr, action: arr.length? (arr.length>1?'multi':arr[0]):'none' }; }); }
  function resetForm(){ api.setDirty(false); if(dialog.override){ api.openDialog(dialog.baseSchedule||dialog.schedule); } else { setForm({ actions:[], action:'none', delay:{ fromStation:(dialog.baseSchedule||dialog.schedule).departure_station, minutes:'', cause:'' }, cancel:{ cause:'' } }); } }
  // Aperçu reroute supprimé
  return (
    <wcs-modal show size="l" onWcsDialogClosed={closeDialog}>
      <span slot="header">Perturbation – {s.train_number} {s.departure_station} ➜ {s.arrival_station} {api.dirty && <span style={{marginLeft:8,fontSize:'.55rem',background:'#ff9800',color:'#fff',padding:'.15rem .4rem',borderRadius:4,letterSpacing:.5}}>Modifié</span>}</span>
      <div className="modal-content modal-content-override">
        {error && <wcs-alert mode="danger" style={{marginBottom:'1rem',whiteSpace:'pre-line'}}>{error}</wcs-alert>}
        <div className="mode-switch" style={{display:'flex',flexWrap:'wrap',gap:'1rem',margin:'0 0 1rem'}}>
          {['delay','cancel'].map(a=> (
            <label key={a} style={{display:'flex',alignItems:'center',gap:'.4rem',fontSize:'.7rem'}}>
              <input type="checkbox" checked={acts.includes(a)} onChange={()=>toggleAction(a)} /> {a==='delay'?'Retard':'Suppression'}
            </label>
          ))}
          {acts.length===0 && <span style={{fontSize:'.65rem',opacity:.6}}>Aucune action</span>}
        </div>
        {acts.includes('delay') && (
          <div className="ov-block grid form-grid">
            <div>
              <label>Depuis gare</label>
              <select className="native-select" value={form.delay.fromStation} onChange={e=>{ api.setDirty(true); setForm(f=>({...f,delay:{...f.delay,fromStation:e.target.value}})); }}>
                {[s.departure_station, ...(s.stops||[]).map(st=>st.station_name), s.arrival_station].map(g=> <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label>Minutes</label>
              <input type="number" min={1} max={1440} value={form.delay.minutes} onChange={e=>{ api.setDirty(true); setForm(f=>({...f,delay:{...f.delay,minutes:e.target.value}})); }} />
            </div>
            <div style={{gridColumn:'1 / -1'}}>
              <label>Cause</label>
              <textarea style={{width:'100%',minHeight:70}} value={form.delay.cause} onChange={e=>{ api.setDirty(true); setForm(f=>({...f,delay:{...f.delay,cause:e.target.value}})); }} />
            </div>
          </div>
        )}
        {acts.includes('cancel') && (
          <div className="ov-block">
            <label>Cause de suppression</label>
            <textarea style={{width:'100%',minHeight:80}} value={form.cancel.cause} onChange={e=>{ api.setDirty(true); setForm(f=>({...f,cancel:{...f.cancel,cause:e.target.value}})); }} />
          </div>
        )}
      </div>
      <div slot="actions" className="modal-actions">
        <wcs-button mode="stroked" onClick={()=>{ if(api.dirty && !confirm('Annuler les modifications non enregistrées ?')) return; api.closeDialog(); }} disabled={saving}>Fermer</wcs-button>
        <wcs-button mode="stroked" onClick={()=>{ if(api.dirty){ if(!confirm('Réinitialiser le formulaire ?')) return; } resetForm(); }} disabled={saving}>Réinitialiser</wcs-button>
        {dialog.override && <wcs-button mode="stroked" style={{color:'#b00020',borderColor:'#b00020'}} onClick={()=>{ if(!confirm('Supprimer la perturbation ?')) return; deleteOverride(); }} disabled={saving}>Supprimer</wcs-button>}
        <wcs-button mode="primary" onClick={saveCurrent} disabled={saving || (acts.includes('delay') && !form.delay.minutes)}>{saving? 'Enregistrement…':'Enregistrer'}</wcs-button>
      </div>
    </wcs-modal>
  );
}

