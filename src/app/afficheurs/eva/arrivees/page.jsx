"use client";
import React, { useEffect, useState, useMemo } from 'react';
import './page.css';

export default function AfficheurEVAArrivees(){
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [now,setNow]=useState(new Date());
  const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const gare = search ? (search.get('gare') || '').trim() : '';

  useEffect(()=>{ const id=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(id); },[]);
  const timeStr = useMemo(()=> now.toLocaleTimeString('fr-FR',{hour:'2-digit', minute:'2-digit'}),[now]);
  const secondsStr = useMemo(()=> String(now.getSeconds()).padStart(2,'0'),[now]);

  function parseTimeValue(t){
    if(!t) return null;
    if(t instanceof Date) return t;
    if(typeof t === 'number') return new Date(t);
    if(typeof t === 'string'){
      let s = t.trim();
      if(s === '') return null;
      if(/\d{4}-\d{2}-\d{2}/.test(s) || /T\d{2}:\d{2}/.test(s)){
        const d = new Date(s); return isNaN(d.getTime()) ? null : d;
      }
      s = s.replace(/\s+/g,'').replace(/h/i,':');
      if(/^\d{3,4}$/.test(s)){
        const mins = s.slice(-2); const hours = s.slice(0, s.length-2);
        const d = new Date(); d.setHours(parseInt(hours,10), parseInt(mins,10), 0, 0); return d;
      }
      const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if(m){ const hh = parseInt(m[1],10); const mm = parseInt(m[2],10); const ss = m[3]?parseInt(m[3],10):0; const d = new Date(); d.setHours(hh,mm,ss,0); return d; }
      const d2 = new Date(s); return isNaN(d2.getTime()) ? null : d2;
    }
    return null;
  }
  function fmtTime(t){ const d = parseTimeValue(t); return d ? d.toLocaleTimeString('fr-FR',{hour:'2-digit', minute:'2-digit'}) : ''; }

  useEffect(()=>{
    if(!gare) return;
    let abort=false; setLoading(true); setError('');
    async function load(){
      try{
        const r = await fetch(`/api/afficheurs/eva/arrivees?gare=${encodeURIComponent(gare)}`,{cache:'no-store'});
        const j = await r.json().catch(()=>null);
        if(!r.ok){ if(!abort) setError(j?.error||'Erreur'); return; }
        if(!abort) setData(j);
      }catch(e){ if(!abort) setError(e.message||'Erreur'); }
      finally{ if(!abort) setLoading(false); }
    }
    load();
    const id = setInterval(load,30000);
    return ()=>{ abort=true; clearInterval(id); };
  },[gare]);

  if(!gare) return (
    <div className="eva-root">
      <div className="eva-empty">
        <h1>Paramètre "gare" manquant</h1>
        <p>Ajouter ?gare=NomDeLaGare dans l'URL.</p>
      </div>
    </div>
  );

  const arrivals = data?.arrivals || [];
  // Limiter l'affichage à la première page — 4 lignes par page
  const pageSize = 4;
  const visibleArrivals = Array.isArray(arrivals) ? arrivals.slice(0, pageSize) : [];

  return (
    <div className="eva-root">
      <header className="eva-topbar">
        <div className="eva-left">
          <div className="eva-icon">🚶‍♂️🚆</div>
          <div className="eva-title">
            <div className="big">ARRIVÉES</div>
            <div className="sub">ARRIVALS FROM / LLEGADAS DE</div>
          </div>
        </div>
        <div className="eva-clock">
          <div className="clock-hm">{timeStr}</div>
          <div className="clock-sec">{secondsStr}</div>
        </div>
      </header>

      <main className="eva-board">
        {loading && <div className="eva-row message">Chargement…</div>}
        {error && !loading && <div className="eva-row message error">{error}</div>}
        {!loading && !error && arrivals.length===0 && <div className="eva-row message">Aucune arrivée prochaine</div>}

        {visibleArrivals.map((d,i)=>{
          const stops = d.stops || [];
          const intermediateStops = stops.slice(1, Math.max(1, stops.length-1));

          const currentStop = d.stops ? d.stops.find(s=> s.station_name === gare) : null;
          const plannedRaw = currentStop?.arrival_time_planned || currentStop?.planned_time || d.planned_time || d.scheduled_time || d.scheduled_arrival_time || null;
          const expectedRaw = currentStop?.arrival_time || d.expected_time || d.arrival_time || d.departure_time || null;
          const plannedDate = parseTimeValue(plannedRaw);
          const expectedDate = parseTimeValue(expectedRaw);
          const timeDisplay = fmtTime(expectedRaw || plannedRaw || '');

          const destination = stops.length ? stops[stops.length-1].station_name : d.destination_station || '';
          const voie = d.voie || '';
          const typeLabel = d.type || 'TER';
          const number = d.number || d.train_number || '';

          const incident = d.incident || d.note || d.message || d.incident_message || '';

          let computedDelay = null;
          if(plannedDate && expectedDate){ const diff = Math.round((expectedDate.getTime() - plannedDate.getTime())/60000); if(!isNaN(diff)) computedDelay = diff; }

          let status = 'à l\'heure';
          if(d.cancelled) status = 'supprimé';
          else if(d.status) status = d.status;
          else if(d.delay && Number(d.delay) > 0) status = `+ ${d.delay} min`;
          else if(computedDelay && computedDelay > 0) status = `+ ${computedDelay} min`;

          const pillClass = status.toLowerCase().includes('supprim') ? 'red' : (status.includes('+') ? 'orange' : 'blue');

          return (
            <article className="eva-row" key={d.id || i}>
              {/* Time column: panneau clair avec HH:MM et pilule */}
              <div className="timecol">
                <div className="time-inner">
                  <div className={`time-h ${status.toLowerCase().includes('supprim') ? 'muted':''}`}>{timeDisplay}</div>
                  <div className={`time-pill ${pillClass}`} role="status" aria-label={`Statut: ${status}`}>
                    <span className="time-pill-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="9" fill="#fff" opacity="0.12" />
                        <path d="M12 7v4l3 2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    </span>
                    <span className="time-pill-text">{status}</span>
                  </div>
                </div>
              </div>

              {/* Destination column */}
              <div className="destcol">
                <div className="dest-main">
                  {destination}{incident && <span className="dest-badge">{incident}</span>}
                </div>
                {intermediateStops.length>0 && (
                  <div className="via-line">
                    <span style={{color:'#05d08b', marginRight:8, fontWeight:700}}>via</span>
                    {intermediateStops.map((s, idx)=>{
                      const crossed = !!(s.cancelled || s.skipped || d.cancelled);
                      return (
                        <span key={idx} className={`via-item ${crossed? 'crossed':''}`}>
                          {idx>0 && <span className="dot"/>}
                          {s.station_name}
                          {crossed && <span className="cross-mark"> ×</span>}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Voie column */}
              <div className="voiecol">
                <div className="voie-box-outer">
                  <div className="voie-label">Voie</div>
                  <div className="voie-letter">{voie || '—'}</div>
                </div>
              </div>

              {/* Green type/number column */}
              <div className="greencol">
                <div className="train-green">
                  <div className="train-type">{typeLabel}</div>
                  <div className="train-number">{number}</div>
                </div>
              </div>
            </article>
          );
        })}
      </main>

      <footer className="eva-footer">
        <div className="warning">
          <div className="wi">i</div>
          <div className="wt">Le réseau TCL est perturbé en raison d'un mouvement social, merci d'anticiper votre venu en gare.</div>
        </div>
        <div className="footer-right">Afficheur EVA — {gare}</div>
      </footer>
    </div>
  );
}
