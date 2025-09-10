"use client";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Header from '@/app/components/Header';
import './search.css';

/********************** Hooks *************************/
function useSearchQuery(){
  const params = useSearchParams();
  return useMemo(()=>({
    from: (params.get('from')||'').trim(),
    to: (params.get('to')||'').trim(),
    via: (params.get('via')||'').trim(),
    date: params.get('date') || new Date().toISOString().slice(0,10),
    time: (params.get('time') || new Date().toTimeString().slice(0,5)).slice(0,5),
    pax: params.get('pax') || '1',
    profile_card: params.get('profile_card') || params.get('card') || 'none',
    profile_type: params.get('profile_type') || '',
    profile_age: params.get('profile_age') || '',
    modes: (params.get('modes')||'train').split(',').filter(Boolean)
  }), [params]);
}

function useTrainTypeNames(){
  const [map,setMap]=useState({});
  useEffect(()=>{ let abort=false; (async()=>{ try { const r=await fetch('/img/type/data.json'); if(!r.ok) return; const j=await r.json(); const m={}; (j.logos||[]).forEach(l=>{ if(l.slug&&l.name) m[l.slug.toLowerCase()]=l.name; }); if(!abort) setMap(m);} catch{} })(); return ()=>{ abort=true; }; },[]);
  return map;
}

function useJourneys(query){
  const router = useRouter();
  const [items,setItems]=useState([]); const [loading,setLoading]=useState(false); const [error,setError]=useState('');
  const abortRef = useRef(null);
  const fetchJourneys = useCallback(()=>{
    if(!query.from || !query.to){ setItems([]); return; }
    abortRef.current?.abort(); const ctrl=new AbortController(); abortRef.current=ctrl;
    setLoading(true); setError('');
    const qs=new URLSearchParams({ from:query.from, to:query.to, time:query.time, limit:'40', includeStops:'1', date:query.date });
    fetch(`/api/public/journeys?${qs.toString()}`, { signal:ctrl.signal, cache:'no-store' })
      .then(async r=>{ if(r.status===410){ throw new Error('Sillons en refonte — horaires indisponibles'); } const b=await r.json().catch(()=>({})); if(!r.ok) throw new Error(b.error||'Erreur inconnue'); return b; })
      .then(b=> setItems(b.items||[]))
      .catch(e=> { if(e.name!=='AbortError') setError(e.message); })
      .finally(()=> setLoading(false));
  }, [query.from, query.to, query.time, query.date]);
  useEffect(()=>{ fetchJourneys(); return ()=> abortRef.current?.abort(); }, [fetchJourneys]);
  return { items, loading, error, refetch:fetchJourneys };
}

/********************** Utils *************************/
const formatEuro = v => { const n = Number(v); if(isNaN(n)) return v; return n.toLocaleString('fr-FR',{minimumFractionDigits:2, maximumFractionDigits:2}) + ' €'; };
const minutesLabel = m => { if(m==null) return ''; const h=Math.floor(m/60), mn=m%60; return h? `${h} h ${String(mn).padStart(2,'0')} min` : `${mn} min`; };
const upperFirst = s => s? s.charAt(0).toUpperCase()+s.slice(1) : s;

/********************** Composants UI *************************/
function TimeNav({time, loading, onEarlier, onLater}){
  return (<div className="time-nav-bar" role="navigation" aria-label="Navigation horaire">
    <button type="button" className="time-nav-btn prev" disabled={loading} onClick={onEarlier}><wcs-mat-icon icon="chevron_left" /><span>Plus tôt</span></button>
    <div className="time-nav-center">Autour de <strong>{time}</strong></div>
    <button type="button" className="time-nav-btn next" disabled={loading} onClick={onLater}><span>Plus tard</span><wcs-mat-icon icon="chevron_right" /></button>
  </div>);
}

function JourneyHeader({query,onChangeDate,onChangeModes}){
  const rel = useMemo(()=>{ try { const today=new Date(); today.setHours(0,0,0,0); const d=new Date(query.date+'T00:00:00'); d.setHours(0,0,0,0); const diff=(d-today)/86400000; if(diff===0) return "Aujourd'hui"; if(diff===1) return 'Demain'; if(diff===-1) return 'Hier'; return null; } catch { return null; } },[query.date]);
  const full = useMemo(()=>{ try { return new Date(query.date+'T00:00:00').toLocaleDateString('fr-FR',{ weekday:'long', day:'numeric', month:'long', year:'numeric'}); } catch { return query.date; } },[query.date]);
  const modes=query.modes; const active=new Set(modes); const chips=[['train','Train','train'],['bus','Bus','directions_bus'],['car','Covoiturage','directions_car']];
  const toggle = m => { const next = active.has(m)? modes.filter(x=>x!==m): [...modes,m]; onChangeModes(next.length? next:['train']); };
  return (<div className="journey-head">
    <div className="jh-row date">
      <div className="jh-date-block">
        <div className="jh-date-text"><div className="jh-date-main">{full}</div>{rel && <div className="jh-date-rel">{rel}</div>}</div>
        <label className="jh-date-input"><wcs-mat-icon icon="calendar_today" /><input type="date" value={query.date} onChange={e=> onChangeDate?.(e.target.value)} /></label>
      </div>
    </div>
    <div className="jh-row modes">
      {chips.map(([k,l,i])=> (<button key={k} type="button" className={`mode-chip${active.has(k)?' is-active':''}`} aria-pressed={active.has(k)} onClick={()=> toggle(k)}><wcs-mat-icon icon={i} /> <span>{l}</span></button>))}
    </div>
  </div>);
}

function OfferCard({ item, query, typeNames, isMin, isFastest, selected, onSelect, onDetails, detailsOpen, priceFn }){
  const duration = minutesLabel(item.durationMin);
  const trainTypeDisplay = useMemo(()=>{ const raw=item.trainType||''; return typeNames[raw?.toLowerCase?.()] || (raw? raw.toUpperCase(): 'TRAIN'); },[item.trainType,typeNames]);
  const delayed = item.delayed && item.delayMinutes>0;
  const cancelled = item.cancelled;
  const cause = cancelled? item.cancelCause : (delayed? item.delayCause : null);
  return (
    <li className={`offer-card ticket${selected? ' is-selected':''}${delayed?' is-delayed':''}${cancelled?' is-cancelled':''}`}>
      <div className="offer-grid">
        <div className="og-times">
          <div className="og-time-block">
            <time className="og-time" dateTime={item.departure}>{item.departure}</time>
            {delayed && item.originalDeparture && item.originalDeparture!==item.departure && <div className="og-time-original" aria-label="Heure initiale">{item.originalDeparture}</div>}
            <div className="og-station" title={query.from}>{query.from}</div>
            {item.depPlatform && <div className="og-platform dep" aria-label="Quai de départ">Quai {item.depPlatform}</div>}
          </div>
          <div className="og-line" aria-label={`Durée ${duration}${delayed?`, retard ${item.delayMinutes} min`:''}${cancelled? ', supprimé':''}`}>
            <div className="og-line-track"><span className="og-dot"/><span className="og-seg"/><span className="og-duration">{duration}</span><span className="og-seg"/><span className="og-dot"/></div>
            <div className="og-train-meta"><wcs-mat-icon icon="train" /> {trainTypeDisplay} {item.trainNumber}</div>
          </div>
          <div className="og-time-block">
            <time className="og-time" dateTime={item.arrival}>{item.arrival}</time>
            {delayed && item.originalArrival && item.originalArrival!==item.arrival && <div className="og-time-original" aria-label="Heure initiale">{item.originalArrival}</div>}
            <div className="og-station" title={query.to}>{query.to}</div>
            {item.arrPlatform && <div className="og-platform arr" aria-label="Quai d'arrivée">Quai {item.arrPlatform}</div>}
          </div>
        </div>
        <div className="og-fares">
          <div className="og-fare-box">
            <div className="og-badges">
              {isMin && !cancelled && <span className="og-badge price">Prix mini</span>}
              {isFastest && !cancelled && <span className="og-badge fast">Plus rapide</span>}
              {item.hasSegment && !cancelled && <span className="og-badge seg">Partiel</span>}
              {delayed && <span className="og-badge delay" title={`Retard estimé ${item.delayMinutes} min`}>{`+${item.delayMinutes} min`}</span>}
              {cancelled && <span className="og-badge cancel" title="Train supprimé">Supprimé</span>}
            </div>
            <div className="og-class">2ᵉ classe</div>
            <div className="og-price">{cancelled? '—' : formatEuro(priceFn(item.price))}</div>
            <div className="og-disclaimer">{cancelled? 'Indisponible' : 'Profil appliqué'}</div>
            {cause && <div className="og-cause" aria-label="Cause">{cause}</div>}
            <div className="og-actions">
              {!selected && !cancelled && <button type="button" className="og-select" onClick={()=> onSelect(item.id)}>Choisir</button>}
              {selected && !cancelled && <button type="button" className="og-select" disabled>Élu</button>}
              {selected && !cancelled && <button type="button" className="og-delete" onClick={()=> onSelect(null)}>Supprimer</button>}
              <button type="button" className="og-details-btn" aria-expanded={detailsOpen} onClick={()=> onDetails(detailsOpen? null : item)}>Détails</button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

function JourneyInlineDetails({ journey, query, typeNames, onOpenProfile }){
  if(!journey) return null;
  const stops = journey.stops||journey.allStops||[];
  const trainTypeName = useMemo(()=>{ const raw=journey.trainType||''; return typeNames?.[raw?.toLowerCase?.()] || (raw? raw.toUpperCase(): 'TRAIN'); },[journey.trainType,typeNames]);
  const routeLabel = useMemo(()=>{
    if(!stops.length) return '';
    const first = stops[0].station; const last = stops[stops.length-1].station; if(first===last) return first; return `${first} → ${last}`;
  },[stops]);
  return (
    <div className="jd-mini-wrapper" role="region" aria-label="Description du trajet">
      <div className="jd-mini-head">
        <h2 className="jd-mini-route">{routeLabel}</h2>
        <button type="button" className="jd-mini-profile" onClick={onOpenProfile} aria-label="Modifier profil"><wcs-mat-icon icon="person" /> {query.pax} pax</button>
      </div>
      <div className="jd-mini-table" role="table">
        <div className="jd-mini-row jd-mini-row-head" role="row">
          <div className="jd-mini-time hd" role="columnheader">Heure</div>
          <div className="jd-mini-line-col" aria-hidden="true"></div>
          <div className="jd-mini-station hd" role="columnheader">Étape</div>
          <div className="jd-mini-platform hd" role="columnheader">Quai</div>
        </div>
        {stops.map((s,i)=>{ const t=(s.departure||s.arrival||'').slice(0,5); const last=i===stops.length-1; return (
          <div className={`jd-mini-row has-line ${i===0?'first':''} ${last?'last':''}`} role="row" key={i}>
            <div className="jd-mini-time" role="cell">{t||'-'}</div>
            <div className="jd-mini-line-col" role="cell" aria-hidden="true">
              <span className="jd-mini-dot" />
            </div>
            <div className="jd-mini-station" role="cell">{s.station}</div>
            <div className="jd-mini-platform" role="cell">{s.platform || '-'}</div>
          </div>
        ); })}
      </div>
    </div>
  );
}

function ProfileModal({query,onClose,router}){
  return (<div className="profile-modal" role="dialog" aria-modal="true" aria-label="Profil voyageur">
    <div className="profile-backdrop" onClick={onClose} />
    <div className="profile-panel">
      <header className="profile-head"><h2>Profil</h2><button onClick={onClose} className="close-btn" aria-label="Fermer">×</button></header>
      <form onSubmit={e=>{ e.preventDefault(); const fd=new FormData(e.currentTarget); const sp=new URLSearchParams(window.location.search); ['profile_age','profile_type','profile_card','pax'].forEach(k=>{ const v=fd.get(k); if(v!=null) sp.set(k,v); }); router.push(`/search?${sp.toString()}`); onClose(); }}>
        <div className="profile-grid">
          <label>Âge<input type="number" name="profile_age" min="0" defaultValue={query.profile_age}/></label>
          <label>Type<select name="profile_type" defaultValue={query.profile_type}><option value="">(auto)</option><option value="jeune">Jeune</option><option value="adulte">Adulte</option><option value="senior">Senior</option></select></label>
            <label>Carte<select name="profile_card" defaultValue={query.profile_card}><option value="none">Sans</option><option value="avantage">Avantage</option><option value="liberte">Liberté</option><option value="jeune">Jeune</option></select></label>
            <label>Voyageurs<input type="number" name="pax" min="1" max="9" defaultValue={query.pax}/></label>
        </div>
        <div className="profile-actions"><wcs-button size="s" type="submit">Appliquer</wcs-button></div>
      </form>
    </div>
  </div>);
}

/********************** Page *************************/
function SearchPageContent(){
  const query = useSearchQuery();
  const router = useRouter();
  const { items, loading, error, refetch } = useJourneys(query);
  const typeNames = useTrainTypeNames();
  const [selected,setSelected]=useState(null); const [detailJourney,setDetailJourney]=useState(null); const [profileOpen,setProfileOpen]=useState(false);

  // Reset sélection lors changement paramètres essentiels
  useEffect(()=>{ setSelected(null); setDetailJourney(null); }, [query.from, query.to, query.time]);

  // Navigation temporelle (flèches)
  const changeTime = useCallback(delta => {
    const [h,m]=query.time.split(':').map(Number); let total=(h*60+m+delta+1440)%1440; const nh=String(Math.floor(total/60)).padStart(2,'0'); const nm=String(total%60).padStart(2,'0'); const sp=new URLSearchParams(window.location.search); sp.set('time',`${nh}:${nm}`); router.push(`/search?${sp.toString()}`);
  }, [query.time, router]);
  useEffect(()=>{ const h=e=>{ if(e.altKey||e.metaKey||e.ctrlKey||e.shiftKey) return; if(e.key==='ArrowLeft'){ e.preventDefault(); changeTime(-60);} if(e.key==='ArrowRight'){ e.preventDefault(); changeTime(60);} }; window.addEventListener('keydown',h); return ()=> window.removeEventListener('keydown',h); },[changeTime]);

  // Prix profilé
  const pricingFactor = useMemo(()=>{ const card=query.profile_card; const type=query.profile_type; let f=1; if(card==='avantage') f*=0.75; else if(card==='liberte') f*=0.9; else if(card==='jeune' || type==='jeune') f*=0.70; else if(type==='senior') f*=0.80; return f; },[query.profile_card, query.profile_type]);
  const profiled = useCallback(p=>{ const n=Number(p); if(isNaN(n)) return p; return (n*pricingFactor).toFixed(2); },[pricingFactor]);

  // Stats
  const minPrice = useMemo(()=>{ const arr=items.map(i=> +i.price).filter(n=>!isNaN(n)); return arr.length? Math.min(...arr): null; },[items]);
  const fastest = useMemo(()=>{ const arr=items.map(i=> i.durationMin).filter(n=> typeof n==='number'); return arr.length? Math.min(...arr): null; },[items]);
  const dateTitle = useMemo(()=>{ try { return upperFirst(new Date(query.date+'T00:00:00').toLocaleDateString('fr-FR',{ weekday:'long', day:'numeric', month:'long'})); } catch { return query.date; } },[query.date]);

  const routerUpdate = patch => { const sp=new URLSearchParams(window.location.search); Object.entries(patch).forEach(([k,v])=> v!=null && sp.set(k,v)); router.push(`/search?${sp.toString()}`); };

  return (<>
    <Header />
    <div className="search-wrapper" role="main">
      <div className="results-pane">
        <header className="results-head">
          <h1 className="sr-title">Sélectionnez votre trajet</h1>
          <JourneyHeader query={query} onChangeDate={d=> routerUpdate({date:d})} onChangeModes={m=> routerUpdate({modes:m.join(',')})} />
        </header>
        <div className="toolbar-line">
          <button className="profile-open-btn" onClick={()=> setProfileOpen(true)}><wcs-mat-icon icon="person" /> Profil</button>
          <div className="date-chip">{dateTitle} à {query.time}</div>
        </div>
        <TimeNav time={query.time} loading={loading} onEarlier={()=> changeTime(-60)} onLater={()=> changeTime(60)} />
        {error && <wcs-alert intent="error" show><span slot="title">{error}</span><button slot="actions" onClick={refetch}>Réessayer</button></wcs-alert>}
        {!error && !loading && !items.length && <p>Aucun résultat.</p>}
        <ul className="cards-list" role="list" aria-label="Résultats horaires">
          {loading && Array.from({length:6}).map((_,i)=> <li key={i} className="sched-card skeleton" aria-hidden="true" />)}
          {!loading && items.map(it => (
            <React.Fragment key={it.id}>
              <OfferCard item={it} query={query} typeNames={typeNames} isMin={minPrice!=null && +it.price===minPrice} isFastest={fastest!=null && it.durationMin===fastest} selected={selected===it.id} onSelect={setSelected} onDetails={setDetailJourney} detailsOpen={detailJourney?.id===it.id} priceFn={profiled} />
              {detailJourney?.id===it.id && <JourneyInlineDetails journey={detailJourney} query={query} typeNames={typeNames} onOpenProfile={()=> setProfileOpen(true)} />}
            </React.Fragment>
          ))}
        </ul>
        {!loading && items.length>0 && (<div className="time-nav-bottom-wrap"><button type="button" className="time-nav-btn next full" onClick={()=> changeTime(60)}>Horaires suivants <wcs-mat-icon icon="expand_more" /></button></div>)}
      </div>
      <aside className="summary-pane" aria-label="Récapitulatif">
        <div className="summary-card design">
          <div className="sum-line">Aller le {dateTitle} à {query.time}</div>
            <div className="sum-route">{query.from || 'Origine'} → {query.to || 'Destination'}</div>
            <div className="sum-meta">{query.pax} voyageur{Number(query.pax)>1?'s':''} · {query.profile_card==='none'? 'sans carte': query.profile_card}</div>
            {selected && (()=>{ const j=items.find(x=> x.id===selected); if(!j) return null; return <div className="sum-selected">Départ {j.departure} · Arrivée {j.arrival} · {formatEuro(profiled(j.price))}</div>; })()}
            <details style={{marginTop:'.75rem'}}>
              <summary className="modify-link"><wcs-mat-icon icon="edit" /> Modifier</summary>
              <form className="modify-form" onSubmit={e=>{ e.preventDefault(); const fd=new FormData(e.currentTarget); const sp=new URLSearchParams(); ['from','to','via','date','time','pax','profile_card','profile_type','profile_age','modes'].forEach(k=>{ const v=fd.get(k); if(v) sp.set(k,v); }); router.push(`/search?${sp.toString()}`); }}>
                <div className="grid">
                  <label>De<input name="from" defaultValue={query.from} required/></label>
                  <label>À<input name="to" defaultValue={query.to} required/></label>
                  <label>Via<input name="via" defaultValue={query.via} placeholder="(opt)"/></label>
                  <label>Date<input type="date" name="date" defaultValue={query.date} required/></label>
                  <label>Heure<input type="time" name="time" defaultValue={query.time} required/></label>
                  <label>Carte<select name="profile_card" defaultValue={query.profile_card}><option value="none">Sans</option><option value="avantage">Avantage</option><option value="liberte">Liberté</option><option value="jeune">Jeune</option></select></label>
                  <label>Type<select name="profile_type" defaultValue={query.profile_type}><option value="">Auto</option><option value="jeune">Jeune</option><option value="adulte">Adulte</option><option value="senior">Senior</option></select></label>
                  <label>Âge<input type="number" name="profile_age" defaultValue={query.profile_age} min="0"/></label>
                  <label>Voyageurs<input type="number" name="pax" min="1" max="9" defaultValue={query.pax}/></label>
                </div>
                <div className="actions"><wcs-button size="s" type="submit">Appliquer</wcs-button></div>
              </form>
            </details>
        </div>
      </aside>
      {profileOpen && <ProfileModal query={query} onClose={()=> setProfileOpen(false)} router={router} />}
    </div>
  </>);
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div>Chargement…</div>}>
      <SearchPageContent />
    </Suspense>
  );
}
