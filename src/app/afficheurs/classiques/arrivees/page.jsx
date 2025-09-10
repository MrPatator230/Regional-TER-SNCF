"use client";
import React, { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';

export default function AfficheurClassiqueArrivees(){
  const [data,setData]=useState(null); const [error,setError]=useState(''); const [loading,setLoading]=useState(true); const [now,setNow]=useState(new Date());
  const search = typeof window!=='undefined'? new URLSearchParams(window.location.search): null; const gare = search? (search.get('gare')||'').trim(): '';
  useEffect(()=>{ const id=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(id); },[]);
  const timeStr = useMemo(()=> now.toLocaleTimeString('fr-FR',{hour:'2-digit', minute:'2-digit'}),[now]);
  const secondsStr = useMemo(()=> String(now.getSeconds()).padStart(2,'0'),[now]);
  useEffect(()=>{ if(!gare) return; let abort=false; setLoading(true); setError(''); async function load(){ try { const r=await fetch(`/api/afficheurs/classiques/arrivees?gare=${encodeURIComponent(gare)}`,{cache:'no-store'}); if(!r.ok) throw new Error((await r.json()).error||'Erreur'); const j=await r.json(); if(!abort) setData(j);} catch(e){ if(!abort) setError(e.message||'Erreur'); } finally { if(!abort) setLoading(false);} } load(); const id=setInterval(load,30000); return ()=>{abort=true; clearInterval(id);}; },[gare]);
  if(!gare) return <div style={{fontFamily:'Achemine', padding:40}}><h1>Paramètre "gare" manquant</h1><p>Ajouter ?gare=NomDeLaGare dans l'URL.</p></div>;
  const arrivals = data?.arrivals||[];
  return (
    <div className="board-root">
      {/* Police Achemine héritée du layout parent /afficheurs/layout.jsx */}
      <div className="board-wrapper">
        <div className="watermark">arrivées</div>
        <div className="rows">
          {loading && <div className="row loading">Chargement…</div>}
          {error && !loading && <div className="row error">{error}</div>}
          {!loading && !error && !arrivals.length && <div className="row empty">Aucune arrivée prochaine</div>}
          {arrivals.map((d,i)=>{
            const secondary = d.stops.slice(0,4).join(' • ')+ (d.stops.length>4? '…':'');
            return (
              <div className={`row ${i%2?'alt':''}`} key={d.id||i}>
                <div className="cell logo">
                  <Image
                    src={d.logo || '/img/type/ter.svg'}
                    alt={d.type || 'TER'}
                    width={84}
                    height={32}
                  />
                </div>
                <div className="cell status">à l'heure</div>
                <div className="cell time"><span>{d.arrival_time?.replace(':','h')}</span></div>
                <div className="cell destination">
                  <div className="dest-main">{d.origin_station}</div>
                  {secondary && <div className="dest-stops">{secondary}</div>}
                </div>
                <div className="cell voie"><div className="voie-box">{d.voie}</div></div>
              </div>
            );
          })}
        </div>
        <div className="footer-bar">
          <div className="footer-msg">Afficheur des arrivées – {gare}</div>
          <div className="clock"><span className="hms">{timeStr}</span><span className="sec">{secondsStr}</span></div>
        </div>
      </div>
      <style jsx>{`
        html,body,.board-root{height:100%;}
        html,body{overflow:hidden}
        .board-root{background:#1d4f8a;min-height:100vh;margin:0;padding:0;color:#fff;display:flex;overflow:hidden}
        .board-wrapper{position:relative;flex:1;display:flex;flex-direction:column;min-height:100vh}
        .watermark{position:absolute;top:0;right:-30px;font-size:300px;line-height:.8;font-weight:700;color:rgba(255,255,255,.08);writing-mode:vertical-rl;text-orientation:mixed;pointer-events:none;user-select:none;z-index:5}
        .rows{padding-top:8px;flex:1;position:relative;overflow:hidden}
        .row{display:grid;grid-template-columns:140px 140px 140px 1fr 160px;align-items:center;padding:8px 24px;min-height:92px;background:#215d9e;position:relative}
        .row.alt{background:#133b66}
        .row:nth-child(2){background:#0f2f52}
        .row.loading,.row.error,.row.empty{font-size:48px;font-weight:600;justify-content:center;grid-template-columns:1fr}
        .cell.logo{display:flex;align-items:center}
        .cell.status{font-size:34px;font-weight:400;opacity:.95}
        .cell.time span{font-size:64px;font-weight:800;color:#ffed00;letter-spacing:1px;font-variant-numeric:tabular-nums}
        .cell.destination{padding-left:20px}
        .dest-main{font-size:68px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .dest-stops{font-size:38px;color:#c3d1e4;margin-top:2px;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .cell.voie{display:flex;justify-content:flex-end}
        .voie-box{border:4px solid #fff;border-radius:10px;font-size:60px;font-weight:600;width:110px;height:110px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.15)}
        .footer-bar{background:#edbe63;color:#08213b;display:flex;align-items:center;font-weight:600;font-size:48px;padding:8px 24px;gap:24px;margin-top:auto;position:relative;z-index:6;}
        .footer-msg{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .clock{background:#0e2d4d;color:#fff;padding:12px 28px;border-radius:6px;display:flex;align-items:center;gap:12px;font-size:66px;font-weight:700;line-height:1}
        .clock .sec{font-size:46px;color:#ffb000;font-weight:700}
        @media (max-width:1600px){
          .row{grid-template-columns:120px 120px 120px 1fr 140px;min-height:80px}
          .cell.time span{font-size:52px}
          .dest-main{font-size:56px}
          .dest-stops{font-size:30px}
          .voie-box{width:90px;height:90px;font-size:50px}
          .footer-bar{font-size:36px}
          .clock{font-size:54px}
          .clock .sec{font-size:38px}
        }
      `}</style>
    </div>
  );
}
