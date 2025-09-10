"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';

const SERVICE_OPTIONS = ["TER", "TGV", "Intercités", "Fret"];
const TRANSPORT_OPTIONS = [
  { key: "bus", label: "Bus", color: "#1976d2" },
  { key: "train", label: "Train", color: "#333" },
  { key: "tramway", label: "Tramway", color: "#009688" },
  { key: "métro", label: "Métro", color: "#9c27b0" },
  { key: "tram-train", label: "Tram-Train", color: "#ff9800" },
];

function showToast(msg, mode='success'){ try { const el=document.createElement('wcs-alert'); el.setAttribute('open',''); el.setAttribute('mode',mode); el.style.position='fixed'; el.style.bottom='16px'; el.style.right='16px'; el.style.zIndex='9500'; el.textContent=msg; document.body.appendChild(el); setTimeout(()=>{ try{el.remove();}catch{} },3000);} catch{} }

export default function ImportSchedulesPage(){
  const [step,setStep]=useState(1);
  const [file,setFile]=useState(null);
  const [parsing,setParsing]=useState(false);
  const [parseError,setParseError]=useState('');
  const [parsed,setParsed]=useState({ items:[], stations:[], warnings:[] });
  const [selected,setSelected]=useState([]); // indices sélectionnés

  const [checking,setChecking]=useState(false);
  const [checkError,setCheckError]=useState('');
  const [stationStatus,setStationStatus]=useState([]); // { name, existsMain, mainId, existsSchedules }

  const [stationDialogOpen,setStationDialogOpen]=useState(false);
  const [stationForm,setStationForm]=useState({ name:'', station_type:'urbaine', services:[], platforms:[{name:'Quai A', distance_m:0}], transports:[] });
  const stationDlgRef = useRef(null);
  useEffect(()=>{ if(!stationDlgRef.current) return; if(stationDialogOpen){ try{ stationDlgRef.current.showModal?.(); }catch{} } else { try{ stationDlgRef.current.close?.(); }catch{} } },[stationDialogOpen]);

  useEffect(()=>{ setSelected(parsed.items.map((it)=> (Array.isArray(it.errors) && it.errors.length===0))); },[parsed]);

  function onFileChange(e){ const f=e.target.files?.[0]||null; setFile(f); }
  async function doParse(){ if(!file) return; setParsing(true); setParseError(''); try { const fd=new FormData(); fd.append('file',file); const r=await fetch('/api/schedules/import/parse',{ method:'POST', body: fd }); const j=await r.json(); if(!r.ok) throw new Error(j?.error||'Lecture impossible'); setParsed({ items: Array.isArray(j.items)? j.items:[], stations: Array.isArray(j.stations)? j.stations:[], warnings: Array.isArray(j.warnings)? j.warnings:[] }); setStep(2); } catch(e){ setParseError(e.message); } finally { setParsing(false);} }

  const selectedItems = useMemo(()=> parsed.items.filter((_,i)=> !!selected[i]), [parsed.items, selected]);

  // Groupes par numéro de train (alternances)
  const groups = useMemo(()=>{
    const map = new Map();
    (parsed.items||[]).forEach((it, idx)=>{
      const tn = it?.general?.trainNumber?.trim();
      const key = tn && tn.length? `TN:${tn}` : `IDX:${idx}`; // pas de num → groupe isolé
      if(!map.has(key)) map.set(key, { key, trainNumber: tn||'', items: [] });
      map.get(key).items.push({ it, idx });
    });
    return Array.from(map.values());
  }, [parsed.items]);

  function daysLabel(days){ const d=days||{}; const sel=d.selected||[]; const names=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']; const base=sel.map(i=> names[i]||'').filter(Boolean).join(' '); const flags=[d.holidays?'Fériés':'', d.sundays?'Dimanches':'', d.custom?'Dates spécifiques':'' ].filter(Boolean).join(' • '); return [base, flags].filter(Boolean).join(' • '); }

  async function doCheckStations(){ setChecking(true); setCheckError(''); try { const r=await fetch('/api/schedules/import/check-stations',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ names: parsed.stations||[] }) }); const j=await r.json(); if(!r.ok) throw new Error(j?.error||'Echec vérification'); setStationStatus(Array.isArray(j.stations)? j.stations:[]); setStep(3); } catch(e){ setCheckError(e.message); } finally { setChecking(false);} }

  function openCreateStation(name){ setStationForm({ name: name||'', station_type:'urbaine', services:[], platforms:[{name:'Quai A', distance_m:0}], transports:[] }); setStationDialogOpen(true); }
  function updatePlatform(i, patch){ setStationForm(f=>{ const arr=[...f.platforms]; arr[i]={...arr[i],...patch}; return {...f, platforms:arr}; }); }
  function addPlatform(){ setStationForm(f=> ({...f, platforms:[...(f.platforms||[]), { name:'', distance_m:0 }]})); }
  function removePlatform(i){ setStationForm(f=> ({...f, platforms: f.platforms.filter((_,idx)=> idx!==i)})); }

  async function submitStation(e){ e?.preventDefault?.(); try { const payload={ name: stationForm.name.trim(), station_type: stationForm.station_type, services: stationForm.services, platforms: (stationForm.platforms||[]).map(p=>({ name:String(p.name||'').trim(), distance_m:Number(p.distance_m||0) })), transports: stationForm.transports };
      const r=await fetch('/api/stations', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); const j=await r.json(); if(!r.ok) throw new Error(j?.error||'Création impossible'); setStationDialogOpen(false); setStationStatus(prev=> prev.map(s=> s.name===payload.name? {...s, existsMain:true, mainId: j?.station?.id||s.mainId }: s)); showToast('Gare créée'); } catch(e){ alert(e.message||'Erreur'); } }

  const missingStations = useMemo(()=> (stationStatus||[]).filter(s=> !s.existsMain), [stationStatus]);

  const [committing,setCommitting]=useState(false);
  const [commitResult,setCommitResult]=useState(null);
  const [commitError,setCommitError]=useState('');

  async function doCommit(){ setCommitting(true); setCommitError(''); try { const r=await fetch('/api/schedules/import/commit',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ items: selectedItems }) }); const j=await r.json(); if(!r.ok) throw new Error(j?.error||'Echec import'); setCommitResult(j); setStep(4); } catch(e){ setCommitError(e.message); } finally { setCommitting(false);} }

  return <section className="import-wizard">
    <h1>Import Excel – Sillons</h1>
    <ol className="steps">
      <li className={step>=1? 'active': ''}>1. Fichier</li>
      <li className={step>=2? 'active': ''}>2. Sillons détectés</li>
      <li className={step>=3? 'active': ''}>3. Gares concernées</li>
      <li className={step>=4? 'active': ''}>4. Récapitulatif</li>
    </ol>

    {step===1 && (
      <div className="panel">
        <h3>1. Choisir le fichier Excel</h3>
        <input type="file" accept=".xlsx,.xls" onChange={onFileChange} />
        <div className="mt-2 d-flex gap-2 align-items-center flex-wrap">
          <wcs-button mode="primary" onClick={doParse} disabled={!file || parsing}>{parsing? 'Analyse…':'Analyser'}</wcs-button>
          <a href="/api/schedules/import/sample" className="btn btn-light">Télécharger un modèle Excel</a>
        </div>
        {parseError && <wcs-alert mode="danger" class="mt-2">{parseError}</wcs-alert>}
      </div>
    )}

    {step===2 && (
      <div className="panel">
        <h3>2. Résumé et sélection</h3>
        {parsed.warnings?.length>0 && <wcs-alert mode="warning">{parsed.warnings.length} avertissement(s)</wcs-alert>}
        <div className="table-responsive">
          <table className="table align-middle">
            <thead><tr><th><input type="checkbox" checked={selected.length>0 && selected.every(Boolean)} onChange={e=> setSelected(selected.map(()=> e.target.checked))} /></th><th>Ligne</th><th>Train</th><th>Trajet</th><th>Heures</th><th>Erreurs</th></tr></thead>
            <tbody>
              {groups.map(group=>{
                if(group.items.length<=1){ const { it, idx } = group.items[0]; return (
                  <tr key={group.key} className={it.errors?.length? 'table-warning': ''}>
                    <td><input type="checkbox" checked={!!selected[idx]} onChange={e=> setSelected(sel=> sel.map((v,i)=> i===idx? e.target.checked: v))} /></td>
                    <td>{it.general?.ligneId||''}</td>
                    <td>{it.general?.trainNumber||''} <span className="text-muted">{it.general?.trainType||''}</span></td>
                    <td>{it.general?.departureStation||'?'} → {it.general?.arrivalStation||'?'}</td>
                    <td>{it.general?.departureTime||''} – {it.general?.arrivalTime||''}</td>
                    <td>{Array.isArray(it.errors)&&it.errors.length>0? it.errors.join(', '): 'OK'}</td>
                  </tr>
                ); }
                // Accordéon pour alternances
                const first = group.items[0].it;
                return (
                  <React.Fragment key={group.key}>
                    <tr className="table-info">
                      <td>
                        {/* coche master: applique à toutes les variantes */}
                        <input type="checkbox" checked={group.items.every(({idx})=> !!selected[idx])} onChange={e=> setSelected(sel=> sel.map((v,i)=> group.items.some(g=> g.idx===i)? e.target.checked: v))} />
                      </td>
                      <td>{first.general?.ligneId||''}</td>
                      <td>{first.general?.trainNumber||''} <span className="text-muted">{first.general?.trainType||''}</span><div className="small text-muted">{group.items.length} alternances</div></td>
                      <td>{first.general?.departureStation||'?'} → {first.general?.arrivalStation||'?'}</td>
                      <td>Plusieurs horaires</td>
                      <td></td>
                    </tr>
                    <tr>
                      <td colSpan={6}>
                        <details>
                          <summary>Afficher les {group.items.length} alternances</summary>
                          <div className="table-responsive mt-2">
                            <table className="table table-sm align-middle mb-0">
                              <thead><tr><th></th><th>Jours</th><th>Trajet</th><th>Heures</th><th>Erreurs</th></tr></thead>
                              <tbody>
                                {group.items.map(({it, idx})=> (
                                  <tr key={idx} className={it.errors?.length? 'table-warning': ''}>
                                    <td style={{width:40}}><input type="checkbox" checked={!!selected[idx]} onChange={e=> setSelected(sel=> sel.map((v,i)=> i===idx? e.target.checked: v))} /></td>
                                    <td>{daysLabel(it.days)}</td>
                                    <td>{it.general?.departureStation||'?'} → {it.general?.arrivalStation||'?'}</td>
                                    <td>{it.general?.departureTime||''} – {it.general?.arrivalTime||''}</td>
                                    <td>{Array.isArray(it.errors)&&it.errors.length>0? it.errors.join(', '): 'OK'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="d-flex gap-2">
          <wcs-button mode="stroked" onClick={()=> setStep(1)}>Retour</wcs-button>
          <wcs-button mode="primary" onClick={doCheckStations} disabled={checking || selectedItems.length===0}>{checking? 'Vérification…':'Suivant'}</wcs-button>
        </div>
      </div>
    )}

    {step===3 && (
      <div className="panel">
        <h3>3. Gares concernées</h3>
        {checkError && <wcs-alert mode="danger">{checkError}</wcs-alert>}
        {!stationStatus.length && <p>Chargement…</p>}
        {stationStatus.length>0 && (
          <div className="table-responsive">
            <table className="table align-middle">
              <thead><tr><th>Gare</th><th>Dans BDD principale</th><th>Dans BDD horaires</th><th></th></tr></thead>
              <tbody>
                {stationStatus.map(s=> (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td>{s.existsMain? 'Oui': 'Non'}</td>
                    <td>{s.existsSchedules? 'Oui': 'Non'}</td>
                    <td className="text-end">{!s.existsMain && <wcs-button mode="stroked" onClick={()=> openCreateStation(s.name)}>Créer</wcs-button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="d-flex gap-2">
          <wcs-button mode="stroked" onClick={()=> setStep(2)}>Retour</wcs-button>
          <wcs-button mode="primary" onClick={()=> setStep(4)} disabled={missingStations.length>0}>Suivant</wcs-button>
        </div>

        <dialog ref={stationDlgRef} style={{ width: 720, maxWidth: '95%' }} onClose={()=> setStationDialogOpen(false)}>
          <form onSubmit={submitStation}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h2 className="h5 m-0">Créer une gare</h2>
              <button type="button" className="btn btn-sm btn-light" onClick={()=> setStationDialogOpen(false)}>Fermer</button>
            </div>

            <div className="mb-3">
              <label className="form-label">Nom de la gare</label>
              <input className="form-control" value={stationForm.name} onChange={e=> setStationForm(f=> ({...f, name:e.target.value}))} required />
            </div>

            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Type de gare</label>
                <select className="form-select" value={stationForm.station_type} onChange={e=> setStationForm(f=> ({...f, station_type: e.target.value}))}>
                  <option value="urbaine">Gare urbaine (fenêtre 12 h)</option>
                  <option value="ville">Gare de ville (fenêtre 30 min)</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Services</label>
                <div className="d-flex flex-wrap gap-2">
                  {SERVICE_OPTIONS.map(s=> (
                    <label key={s} className="form-check">
                      <input type="checkbox" className="form-check-input" checked={stationForm.services.includes(s)} onChange={(e)=> setStationForm(f=> ({...f, services: e.target.checked? [...f.services, s]: f.services.filter(x=> x!==s)}))} />
                      <span className="form-check-label ms-1">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="form-label">Quais</label>
              <div className="list-group mb-2">
                {(stationForm.platforms||[]).map((p,i)=> (
                  <div className="list-group-item" key={i}>
                    <div className="row g-2 align-items-end">
                      <div className="col-6">
                        <label className="form-label">Nom</label>
                        <input className="form-control" value={p.name} onChange={e=> updatePlatform(i,{name:e.target.value})} required />
                      </div>
                      <div className="col-4">
                        <label className="form-label">Distance (m)</label>
                        <input type="number" min={0} className="form-control" value={p.distance_m} onChange={e=> updatePlatform(i,{distance_m:e.target.value})} required />
                      </div>
                      <div className="col-2 text-end">
                        <button type="button" className="btn btn-outline-danger" onClick={()=> removePlatform(i)} title="Supprimer">✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <wcs-button mode="stroked" onClick={addPlatform}>Ajouter un quai</wcs-button>
            </div>

            <div className="mt-4">
              <label className="form-label">Transports</label>
              <div className="d-flex flex-wrap gap-2">
                {TRANSPORT_OPTIONS.map(o=> (
                  <label key={o.key} className="form-check">
                    <input type="checkbox" className="form-check-input" checked={stationForm.transports.includes(o.key)} onChange={(e)=> setStationForm(f=> ({...f, transports: e.target.checked? [...f.transports, o.key]: f.transports.filter(x=> x!==o.key)}))} />
                    <span className="form-check-label ms-1">{o.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-3 d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-light" onClick={()=> setStationDialogOpen(false)}>Annuler</button>
              <button type="submit" className="btn btn-primary">Créer</button>
            </div>
          </form>
        </dialog>
      </div>
    )}

    {step===4 && (
      <div className="panel">
        <h3>4. Récapitulatif</h3>
        <ul>
          <li>{selectedItems.length} sillon(s) à importer</li>
          <li>{(stationStatus||[]).length} gares, manquantes: {missingStations.length}</li>
        </ul>
        {commitError && <wcs-alert mode="danger">{commitError}</wcs-alert>}
        {!commitResult && <wcs-button mode="primary" onClick={doCommit} disabled={committing || selectedItems.length===0 || missingStations.length>0}>{committing? 'Import…':'Importer'}</wcs-button>}
        {commitResult && (
          <div className="mt-3">
            <wcs-alert mode={commitResult.failed? 'warning':'success'}>
              Créés: {commitResult.created} – Échecs: {commitResult.failed}
            </wcs-alert>
            {Array.isArray(commitResult.results) && commitResult.results.some(r=> !r.ok) && (
              <div className="table-responsive mt-2">
                <table className="table table-sm">
                  <thead><tr><th>#</th><th>Statut</th><th>Erreur</th></tr></thead>
                  <tbody>
                    {commitResult.results.map((r,i)=> (
                      <tr key={i}>
                        <td>{r.index}</td>
                        <td>{r.ok? 'OK': 'Erreur'}</td>
                        <td>{r.ok? '': (r.error||'')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <div className="d-flex gap-2 mt-3">
          <wcs-button mode="stroked" onClick={()=> setStep(3)}>Retour</wcs-button>
          <a href="/espace/admin/schedules" className="btn btn-light">Terminer</a>
        </div>
      </div>
    )}

    <style jsx>{`
      .steps{display:flex;gap:.6rem;list-style:none;padding:0;margin:.8rem 0 1rem}
      .steps li{opacity:.6}
      .steps li.active{opacity:1}
      .panel{border:1px solid #e3e4ea;background:#fff;border-radius:8px;padding:1rem}
      .table-responsive{margin-top:.6rem}
      .native-select{width:100%}
      details > summary{cursor:pointer; user-select:none}
    `}</style>
  </section>;
}
