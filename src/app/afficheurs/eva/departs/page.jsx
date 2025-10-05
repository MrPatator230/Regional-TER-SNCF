"use client";
import React, { useEffect, useState, useMemo } from 'react';
import './page.css';
import { FaTrain } from "react-icons/fa";
import { FaCircleInfo } from "react-icons/fa6";
import { FaClock } from "react-icons/fa";
import { IoWarning } from "react-icons/io5";
import { MdCancel } from "react-icons/md";
import { FaSquareCheck } from "react-icons/fa6";
import Image from 'next/image';

export default function AfficheurEVADeparts(){
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
        const r = await fetch(`/api/afficheurs/eva/departs?gare=${encodeURIComponent(gare)}`,{cache:'no-store'});
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

  const departures = data?.departures || [];
  const pageSize = 4;
  const visibleDepartures = Array.isArray(departures) ? departures.slice(0, pageSize) : [];

  return (
    <div className="eva-root">
      <header className="eva-topbar">
        <div className="eva-left">
          <div className="eva-icon"><FaTrain /></div>
          <div className="eva-title">
            <div className="big">DÉPARTS</div>
            <div className="sub">/ DEPARTURES TO / SALIDAS A</div>
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
        {!loading && !error && departures.length===0 && <div className="eva-row message">Aucun départ prochain</div>}

        {visibleDepartures.map((d,i)=>{
          const stops = d.stops || [];
          const intermediateStops = stops.slice(1, Math.max(1, stops.length-1));

          const currentStop = d.stops ? d.stops.find(s=> s.station_name === gare) : null;
          const plannedRaw = currentStop?.departure_time_planned || currentStop?.planned_time || d.planned_time || d.scheduled_time || d.scheduled_departure_time || null;
          const expectedRaw = currentStop?.departure_time || d.expected_time || d.departure_time || null;
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

          let status = "à l'heure";
          if(d.cancelled) status = 'supprimé';
          else if(d.status) status = d.status.toLowerCase();
          else if(d.delay && Number(d.delay) > 0) status = `+ ${d.delay} min`;
          else if(computedDelay && computedDelay > 0) status = `+ ${computedDelay} min`;

          const pillClass = d.cancelled ? 'red' : (computedDelay > 0 ? 'orange' : 'blue');
          const incidentClass = incident.toLowerCase().includes('panne') ? 'red' : 'orange';

          return (
            <article className="eva-row" key={d.id || i}>
              <div className="timecol">
                <div className="time-inner">
                  <div className={`time-h ${d.cancelled ? 'cancelled':''}`}>{timeDisplay}</div>
                  <div className={`time-pill ${pillClass}`} role="status">
                    <span className="time-pill-icon">
                        {d.cancelled ? <MdCancel/> : <FaClock/>}
                    </span>
                    <span className="time-pill-text">{status}</span>
                  </div>
                </div>
              </div>

              <div className="destcol">
                <div className="dest-main">
                  {destination}
                  {incident && <span className={`dest-badge ${incidentClass}`}>{incident}</span>}
                </div>
                {stops.length === 0 && <div className="via-line">train direct</div>}
                {intermediateStops.length > 0 && (
                  <div className="via-line">
                    <span className="via-prefix">via</span>
                    {intermediateStops.map((s, idx)=>{
                      const crossed = !!(s.cancelled || s.skipped || d.cancelled);
                      return (
                        <React.Fragment key={idx}>
                          {idx>0 && <span className="dot"/>}
                          <span className={`via-item ${crossed? 'crossed':''}`}>
                            {s.station_name}
                            {crossed && <span className="cross-mark">×</span>}
                          </span>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="voiecol">
                <div className="voie-box-outer">
                    {d.cancelled ? (
                        <Image src="/file.svg" alt="Train supprimé" width={50} height={50} />
                    ) : (
                        <>
                            <div className="voie-label">Voie</div>
                            <div className="voie-letter">{voie || '—'}</div>
                        </>
                    )}
                </div>
              </div>

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
          <div className="wi"><FaCircleInfo /></div>
          <div className="wt">Le réseau TCL est perturbé en raison d'un mouvement social, merci d'anticiper votre venu en gare.</div>
        </div>
      </footer>
    </div>
  );
}
