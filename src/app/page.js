"use client";
import React, { useMemo, useState, useRef, useEffect } from "react";
import Header from './components/Header';
import { useRouter } from 'next/navigation';
import { platformForStation } from '@/app/utils/platform';

export default function Home() {
  // Etats du planner
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showVia, setShowVia] = useState(false);
  const [via, setVia] = useState("");
  // const plannerCardRef = useRef(null); // supprimé: plus d'auto-ajustement de hauteur
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const nowTime = useMemo(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }, []);

  const [outDate, setOutDate] = useState(todayIso);
  const [outTime, setOutTime] = useState(nowTime);

  const [hasReturn, setHasReturn] = useState(false);
  const [retDate, setRetDate] = useState("");
  const [retTime, setRetTime] = useState("");

  const [passengers, setPassengers] = useState(1);
  const [card, setCard] = useState("none");
  // Nouvel état voyageurs détaillés
  const [travellers,setTravellers]=useState([{name:'', age:''}]);
  // SUPPR: travellersModalOpen (remplacé par panneau openSuggest='pax')
  // Etats info trafic (restaurés)
  const INFO_LIMIT = 1;
  const [infoItems, setInfoItems] = useState([]);
  const [infoPage, setInfoPage] = useState(1);
  const [infoPageCount, setInfoPageCount] = useState(1);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [trafficExpanded, setTrafficExpanded] = useState(false);
  // Refs restaurées
  const detailsRef = useRef(null);
  const sabonnerRef = useRef(null);
  const heroRef = useRef(null);
  const infoCardRef = useRef(null);

  const [homepageArticles,setHomepageArticles]=useState([]);
  const [articlesLoading,setArticlesLoading]=useState(false);
  const [articlesError,setArticlesError]=useState('');

  const [stationQueryFrom,setStationQueryFrom]=useState('');
  const [stationQueryTo,setStationQueryTo]=useState('');
  const [suggestionsFrom,setSuggestionsFrom]=useState([]);
  const [suggestionsTo,setSuggestionsTo]=useState([]);
  const [openSuggest,setOpenSuggest]=useState(null); // 'from' | 'to' | null
  const abortRef = useRef(null);
  const [highlightIndex,setHighlightIndex]=useState(-1);
  const suggestPanelRef = useRef(null);

  const router = useRouter();

  const swapStations = () => {
    const oldFrom = from;
    const oldFromQuery = stationQueryFrom;
    const oldTo = to;
    const oldToQuery = stationQueryTo;
    setFrom(oldTo);
    setTo(oldFrom);
    setStationQueryFrom(oldToQuery || oldTo);
    setStationQueryTo(oldFromQuery || oldFrom);
    // Ré-initialise l'index de surbrillance et garde le panneau ouvert côté départ si ouvert
    setHighlightIndex(-1);
  };

  const onSearch = () => {
    if (!from || !to) {
      alert("Merci de renseigner les gares de départ et d'arrivée.");
      return;
    }
    const sp = new URLSearchParams();
    sp.set('from', from.trim());
    sp.set('to', to.trim());
    if(showVia && via.trim()) sp.set('via', via.trim());
    sp.set('date', outDate);
    sp.set('time', outTime);
    if(hasReturn && retDate && retTime){ sp.set('ret_date', retDate); sp.set('ret_time', retTime); }
    sp.set('pax', String(passengers));
    if(card && card!=="none") sp.set('card', card);
    // encode voyageurs: nom:age|nom:age
    const travStr = travellers.map(t=> `${(t.name||'').replace(/[:|]/g,'')}:${t.age||''}`).join('|');
    if(travStr) sp.set('trav', travStr);
    // premier âge -> profile_age
    const firstAge = travellers.find(t=> t.age!=='' && !isNaN(+t.age));
    if(firstAge) sp.set('profile_age', String(firstAge.age));
    router.push(`/search?${sp.toString()}`);
  };

  // Sanitisation basique pour permettre les liens sûrs
  function sanitizeHtml(html){
    if(!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('script,iframe,object,embed,style,link,meta').forEach(el=> el.remove());
    div.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(attr => {
        const n = attr.name.toLowerCase();
        if(n.startsWith('on')) el.removeAttribute(attr.name);
        if(n === 'style') el.removeAttribute(attr.name);
        if(n === 'href'){
          const href = el.getAttribute('href')||'';
            if(href.trim().toLowerCase().startsWith('javascript:')) el.removeAttribute('href');
            else {
              el.setAttribute('target','_blank');
              el.setAttribute('rel','noopener noreferrer');
            }
        }
      });
    });
    return div.innerHTML;
  }
  function stripTags(html){ if(!html) return ''; const div=document.createElement('div'); div.innerHTML=html; return div.textContent||div.innerText||''; }

  // Chargement dynamique des infos trafic
  useEffect(() => {
    let abort = false;
    async function loadInfos(page=1){
      setInfoLoading(true); setInfoError('');
      try {
        const r = await fetch(`/api/public/infos-trafics?page=${page}&limit=${INFO_LIMIT}`, { cache: 'no-store' });
        const j = await r.json();
        if(!r.ok) throw new Error(j.error || 'Erreur chargement');
        if(!abort){
          const items = (j.items||[]).map(it => ({ ...it, __sanitized: sanitizeHtml(it.contenu), __plain: stripTags(it.contenu) }));
          setInfoItems(items);
          setInfoPage(j.page||page);
          setInfoPageCount(j.pageCount||1);
        }
      } catch(e){ if(!abort) setInfoError(e.message); }
      finally { if(!abort) setInfoLoading(false); }
    }
    loadInfos(infoPage);
    return ()=> { abort=true; };
  }, [infoPage]);

  // Chargement des articles de la homepage
  useEffect(()=>{ // chargement articles homepage
    let abort=false; (async()=>{
      setArticlesLoading(true); setArticlesError('');
      try { const r=await fetch('/api/public/articles?homepage=1',{cache:'no-store'}); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur chargement articles'); if(!abort) setHomepageArticles(j.items||[]); }
      catch(e){ if(!abort) setArticlesError(e.message);} finally { if(!abort) setArticlesLoading(false);} })();
    return ()=>{ abort=true; };
  },[]);

  // Affichage partiel des détails Info trafic (moitié en mode normal, complet en étendu)
  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const apply = () => {
      const full = details.scrollHeight;
      if (trafficExpanded) {
        details.style.maxHeight = full + 'px';
      } else {
        const half = Math.max(80, Math.round(full / 2));
        details.style.maxHeight = half + 'px';
      }
    };
    const raf = requestAnimationFrame(apply);
    const ro = new ResizeObserver(() => apply());
    ro.observe(details);
    window.addEventListener('resize', apply, { passive: true });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('resize', apply); };
  }, [trafficExpanded, infoItems]);

  const iconForType = (t) => {
    switch(t){
      case 'annulation': return 'cancel';
      case 'attention': return 'warning_amber';
      case 'travaux': return 'construction';
      default: return 'info';
    }
  };

  const alertMeta = (t) => {
    switch(t){
      case 'annulation': return { intent:'error', label:'Annulation' };
      case 'attention': return { intent:'warning', label:'Attention' };
      case 'travaux': return { intent:'warning', label:'Travaux' };
      default: return { intent:'information', label:'Information' };
    }
  };

  function debounceFetchStations(kind, q){
    if(abortRef.current){ abortRef.current.abort(); }
    if(q.length<2){
      if(kind==='from') setSuggestionsFrom([]); else setSuggestionsTo([]);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    fetch(`/api/public/stations/search?q=${encodeURIComponent(q)}&limit=8`, {signal:controller.signal})
      .then(r=> r.json())
      .then(j=>{
        if(kind==='from') setSuggestionsFrom(j.items||[]); else setSuggestionsTo(j.items||[]);
      })
      .catch(()=>{});
  }

  useEffect(()=>{ debounceFetchStations('from', stationQueryFrom); },[stationQueryFrom]);
  useEffect(()=>{ debounceFetchStations('to', stationQueryTo); },[stationQueryTo]);

  function pickStation(kind, name){
    if(kind==='from'){ setFrom(name); setStationQueryFrom(name); }
    else { setTo(name); setStationQueryTo(name); }
    setOpenSuggest(null);
  }

  useEffect(()=>{ setHighlightIndex(-1); },[openSuggest, suggestionsFrom, suggestionsTo]);

  useEffect(()=>{ // click extérieur pour fermer
    function onDoc(e){
      if(!suggestPanelRef.current) return;
      if(openSuggest && !suggestPanelRef.current.contains(e.target)){
        // si clic ni dans inputs
        if(!e.target.closest('.planner-input')) setOpenSuggest(null);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return ()=> document.removeEventListener('mousedown', onDoc);
  },[openSuggest]);

  useEffect(()=>{ setPassengers(travellers.length); },[travellers]);

  const [stationChoices] = useState([
    { name: 'Dijon Ville' },
    { name: 'Besançon Viotte' },
    { name: 'Seurre' },
    { name: 'Laroche - Migennes' }
  ]);
  const [depStationIdx, setDepStationIdx] = useState(0);
  const [stationResolved, setStationResolved] = useState({}); // name -> { id, loading, error }
  const [boards, setBoards] = useState({}); // stationId -> { loading, error, schedules: [] }

  // Résolution ID gare
  useEffect(()=> {
    const choice = stationChoices[depStationIdx];
    if(!choice) return;
    const current = stationResolved[choice.name];
    if(current || (current && current.loading)) return;
    setStationResolved(s=> ({ ...s, [choice.name]: { id:null, loading:true, error:null } }));
    fetch(`/api/public/stations/search?q=${encodeURIComponent(choice.name)}&limit=1`, { cache:'no-store' })
      .then(r=> r.json().then(j=>({ok:r.ok, j})))
      .then(({ok,j})=> {
        if(!ok) throw new Error(j.error||'Erreur recherche');
        const id = (j.items&&j.items[0]&&j.items[0].id) || null;
        setStationResolved(s=> ({ ...s, [choice.name]: { id, loading:false, error: id? null:'Gare introuvable' } }));
      })
      .catch(e=> setStationResolved(s=> ({ ...s, [choice.name]: { id:null, loading:false, error:e.message||'Erreur' } })));
  }, [depStationIdx, stationChoices, stationResolved]);

  // Chargement board quand ID dispo
  useEffect(()=> {
    const choice = stationChoices[depStationIdx];
    if(!choice) return;
    const meta = stationResolved[choice.name];
    if(!meta || meta.loading || meta.error || !meta.id) return;
    if(boards[meta.id]) return; // déjà chargé
    setBoards(b=> ({ ...b, [meta.id]: { loading:true, error:null, schedules:[] } }));
    const stationName = choice.name;
    fetch(`/api/public/stations/${meta.id}/board?type=departures&days=2`, { cache:'no-store' })
      .then(r=> r.json().then(j=>({ok:r.ok,j})))
      .then(({ok,j})=> {
        if(!ok) throw new Error(j.error||'Erreur horaires');
        const now = new Date();
        const today = now.toISOString().slice(0,10);
        const currentTime = now.toTimeString().slice(0,5);
        const days = (j.days||[]);
        const todayDay = days.find(d=> d.date===today);
        let list = [];
        if(todayDay){
          const dObj = new Date(todayDay.date+"T00:00:00");
          const idx = (dObj.getDay()+6)%7; // lundi=0
          const schedules = todayDay.schedules||[];
          list = schedules
            .filter(s=> !s.days_mask || ((s.days_mask & (1<<idx))!==0))
            .filter(s=> (s.time||'') >= currentTime)
            .slice(0,5)
            .map(s=> ({ ...s, __platform: platformForStation(s, stationName) || '-' }));
        }
        setBoards(b=> ({ ...b, [meta.id]: { loading:false, error:null, schedules:list } }));
      })
      .catch(e=> setBoards(b=> ({ ...b, [meta.id]: { loading:false, error:e.message||'Erreur', schedules:[] } })));
  }, [depStationIdx, stationChoices, stationResolved, boards]);

  const nextFive = useMemo(()=> {
    const choice = stationChoices[depStationIdx];
    const meta = stationResolved[choice.name];
    if(!meta || !meta.id) return [];
    const board = boards[meta.id];
    if(!board || board.loading || board.error) return [];
    return board.schedules.slice(0,5);
  }, [depStationIdx, stationChoices, stationResolved, boards]);

  return (
      <>

        <Header />

        <div ref={heroRef} className="hero-section">
          <h1 className="hero-title">BIENVENUE SUR LE SITE TER BOURGOGNE-FRANCHE-COMTÉ</h1>
          <div className="main-container">
            <div className={`planner-container ${openSuggest? 'with-suggest':''}`}>
              {/* Journey Planner */}
              <div className="card planner-card home-planner-card">
                <wcs-button shape="round" mode="clear" class="swap-button" onClick={swapStations} aria-label="Inverser départ et arrivée">
                  <wcs-mat-icon icon="swap_vert"></wcs-mat-icon>
                </wcs-button>

                <div className="planner-input" style={{position:'relative'}} onFocus={()=> setOpenSuggest('from')}>
                  <wcs-mat-icon icon="place"></wcs-mat-icon>
                  <input
                      type="text"
                      placeholder="Gare de départ"
                      value={stationQueryFrom}
                      onChange={(e) => { setStationQueryFrom(e.target.value); setFrom(e.target.value); setOpenSuggest('from'); }}
                      aria-label="Gare de départ"
                      className="flex-grow-1"
                      style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
                      onKeyDown={(e)=>{
                        const list = suggestionsFrom;
                        if(e.key==='Escape'){ setOpenSuggest(null); }
                        else if(e.key==='ArrowDown'){ e.preventDefault(); setHighlightIndex(i=> Math.min(list.length-1, i+1)); }
                        else if(e.key==='ArrowUp'){ e.preventDefault(); setHighlightIndex(i=> Math.max(0, i-1)); }
                        else if(e.key==='Enter'){ if(highlightIndex>=0 && list[highlightIndex]) pickStation('from', list[highlightIndex].name); }
                      }}
                  />
                </div>

                <div className="planner-input" style={{position:'relative'}} onFocus={()=> setOpenSuggest('to')}>
                  <wcs-mat-icon icon="place"></wcs-mat-icon>
                  <input
                      type="text"
                      placeholder="Gare d'arrivée"
                      value={stationQueryTo}
                      onChange={(e) => { setStationQueryTo(e.target.value); setTo(e.target.value); setOpenSuggest('to'); }}
                      aria-label="Gare d'arrivée"
                      className="flex-grow-1"
                      style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
                      onKeyDown={(e)=>{ const list = suggestionsTo; if(e.key==='Escape') setOpenSuggest(null); else if(e.key==='ArrowDown'){ e.preventDefault(); setHighlightIndex(i=> Math.min(list.length-1, i+1)); } else if(e.key==='ArrowUp'){ e.preventDefault(); setHighlightIndex(i=> Math.max(0, i-1)); } else if(e.key==='Enter'){ if(highlightIndex>=0 && list[highlightIndex]) pickStation('to', list[highlightIndex].name); } }}
                  />
                </div>

                <div className="via-button" role="button" tabIndex={0} onClick={() => setShowVia(v => !v)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setShowVia(v => !v)}>
                  {showVia ? '− Via' : '+ Via'}
                </div>
                {showVia && (
                    <div className="planner-input">
                      <wcs-mat-icon icon="alt_route"></wcs-mat-icon>
                      <input
                          type="text"
                          placeholder="Gare via (optionnel)"
                          value={via}
                          onChange={(e) => setVia(e.target.value)}
                          aria-label="Gare via"
                          className="flex-grow-1"
                          style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
                      />
                    </div>
                )}

                <div className="d-flex" style={{gap: '1rem'}}>
                  <div className="planner-input flex-grow-1 d-flex align-items-center" style={{gap: '0.5rem'}}>
                    <wcs-mat-icon icon="calendar_today"></wcs-mat-icon>
                    <span className="value">Aller</span>
                    <input
                        type="date"
                        value={outDate}
                        min={todayIso}
                        onChange={(e) => setOutDate(e.target.value)}
                        aria-label="Date aller"
                        style={{ border: 'none', outline: 'none', background: 'transparent' }}
                    />
                  </div>
                  <div className="planner-input d-flex align-items-center justify-content-center" style={{width: '120px'}}>
                    <input
                        type="time"
                        value={outTime}
                        onChange={(e) => setOutTime(e.target.value)}
                        aria-label="Heure aller"
                        style={{ border: 'none', outline: 'none', background: 'transparent', textAlign: 'center', width: '100%' }}
                    />
                  </div>
                </div>

                <div className="planner-input d-flex align-items-center" style={{gap: '0.5rem'}}>
                  <wcs-mat-icon icon="date_range"></wcs-mat-icon>
                  <label className="flex-grow-1" style={{margin: 0}}>
                    <input
                        type="checkbox"
                        checked={hasReturn}
                        onChange={(e) => {
                          setHasReturn(e.target.checked);
                          if (!e.target.checked) { setRetDate(""); setRetTime(""); }
                        }}
                        aria-label="Activer un retour"
                        style={{ marginRight: '0.5rem' }}
                    />
                    Retour (optionnel)
                  </label>
                  {hasReturn ? (
                      <div className="d-flex align-items-center" style={{gap: '0.5rem'}}>
                        <input
                            type="date"
                            value={retDate}
                            min={outDate}
                            onChange={(e) => setRetDate(e.target.value)}
                            aria-label="Date retour"
                            style={{ border: 'none', outline: 'none', background: 'transparent' }}
                        />
                        <input
                            type="time"
                            value={retTime}
                            onChange={(e) => setRetTime(e.target.value)}
                            aria-label="Heure retour"
                            style={{ border: 'none', outline: 'none', background: 'transparent', textAlign: 'center', width: '80px' }}
                        />
                      </div>
                  ) : (
                      <strong>--:--</strong>
                  )}
                </div>

                <div className="planner-input d-flex align-items-center" style={{gap: '0.5rem'}}>
                  <wcs-mat-icon icon="person"></wcs-mat-icon>
                  <div className="flex-grow-1 d-flex align-items-center" style={{gap: '0.5rem'}}>
                    <button type="button" onClick={()=> setOpenSuggest('pax')} className="btn btn-link p-0" style={{textDecoration:'none', color:'inherit'}} aria-haspopup="dialog">Voyageurs: {passengers}</button>
                    <span>|</span>
                    <label htmlFor="carte-reduction" className="mb-0">Carte</label>
                    <select
                        id="carte-reduction"
                        value={card}
                        onChange={(e) => setCard(e.target.value)}
                        aria-label="Carte de réduction"
                        style={{ border: 'none', outline: 'none', background: 'transparent' }}
                    >
                      <option value="none">Sans carte</option>
                      <option value="avantage">Carte Avantage</option>
                      <option value="liberte">Carte Liberté</option>
                      <option value="jeune">Carte Jeune</option>
                    </select>
                  </div>
                  <wcs-button mode="clear" shape="round" class="p-0" onClick={()=> setTravellers(t=> [...t,{name:'', age:''}])} aria-label="Ajouter un voyageur"><wcs-mat-icon icon="add"></wcs-mat-icon></wcs-button>
                </div>

                <wcs-button className="search-button" size="l" onClick={onSearch}>Rechercher</wcs-button>
              </div>

              {/* Panneau suggestions gares */}
              {openSuggest && (
                <div ref={suggestPanelRef} className="station-suggest-panel">
                  <h3 className="panel-title">
                    {openSuggest==='from'? 'Gare de départ': openSuggest==='to'? 'Gare d\'arrivée' : 'Voyageurs'}
                  </h3>
                  {openSuggest==='pax' && <button style={{position:'absolute', top:8, right:8, background:'none', border:'none', fontSize:'1.1rem'}} aria-label="Fermer" onClick={()=> setOpenSuggest(null)}>×</button>}
                  <hr />
                  {openSuggest!=='pax' && (
                    <>
                      {(openSuggest==='from'? stationQueryFrom.length: stationQueryTo.length) < 2 && (
                        <p className="muted small" style={{marginTop:'0.5rem'}}>Veuillez saisir au moins 2 caract��res dans ce champ.</p>
                      )}
                      {(openSuggest==='from'? stationQueryFrom.length: stationQueryTo.length) >= 2 && (
                        <ul className="station-suggest-list" role="listbox">
                          {(openSuggest==='from'? suggestionsFrom: suggestionsTo).map((s,idx)=> (
                            <li key={s.id}
                                role="option"
                                aria-selected={highlightIndex===idx}
                                className={highlightIndex===idx? 'active':''}
                                onMouseEnter={()=> setHighlightIndex(idx)}
                                onMouseDown={(ev)=>{ ev.preventDefault(); pickStation(openSuggest, s.name); }}>
                              <wcs-mat-icon icon="history"></wcs-mat-icon>
                              <span>{s.name}</span>
                            </li>
                          ))}
                          {!(openSuggest==='from'? suggestionsFrom: suggestionsTo).length && <li className="empty">Aucun résultat</li>}
                        </ul>
                      )}
                    </>
                  )}
                  {openSuggest==='pax' && (
                    <div className="travellers-editor" style={{display:'flex', flexDirection:'column', gap:'.75rem', maxHeight:'55vh', overflowY:'auto'}}>
                      {travellers.map((tr,idx)=> (
                        <div key={idx} style={{display:'grid', gridTemplateColumns:'1fr 90px auto', gap:'.5rem', alignItems:'end'}}>
                          <label style={{display:'flex', flexDirection:'column', fontSize:'.7rem'}}>Nom
                            <input type="text" value={tr.name} onChange={e=> setTravellers(arr=> arr.map((o,i)=> i===idx? {...o,name:e.target.value}: o))} placeholder={`Voyageur ${idx+1}`} />
                          </label>
                          <label style={{display:'flex', flexDirection:'column', fontSize:'.7rem'}}>Âge
                            <input type="number" min="0" value={tr.age} onChange={e=> setTravellers(arr=> arr.map((o,i)=> i===idx? {...o,age:e.target.value}: o))} />
                          </label>
                          <div style={{display:'flex', gap:'.25rem'}}>
                            {travellers.length>1 && <wcs-button size="s" mode="stroked" type="button" onClick={()=> setTravellers(arr=> arr.filter((_,i)=> i!==idx))} aria-label="Supprimer ce voyageur">✕</wcs-button>}
                          </div>
                        </div>
                      ))}
                      <div style={{display:'flex', gap:'.5rem', flexWrap:'wrap'}}>
                        <wcs-button size="s" mode="stroked" type="button" onClick={()=> setTravellers(t=> [...t,{name:'', age:''}])}>Ajouter</wcs-button>
                        <wcs-button size="s" type="button" onClick={()=> setOpenSuggest(null)}>Fermer</wcs-button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Info & Subscription */}
              <div className={`d-flex flex-column info-stack ${trafficExpanded ? 'info-expanded' : ''}`} style={{gap: '1.5rem', position: 'relative'}}>
                <div ref={infoCardRef} className={`card info-trafic-card${trafficExpanded ? ' expanded' : ''}`}>
                  <div className="info-trafic-header d-flex align-items-center justify-content-between">
                    <h3 className="info-trafic-title mb-0">Info trafic</h3>
                    {infoLoading && <small>Chargement...</small>}
                  </div>
                  <div className="info-trafic-body">
                    {infoError && <div className="alert alert-danger p-2 mb-2">{infoError}</div>}
                    {!infoError && !infoLoading && !infoItems.length && <div className="text-muted small">Aucune information trafic.</div>}
                    <div ref={detailsRef} className="info-trafic-details" style={{overflow:'hidden', transition:'max-height .4s ease'}}>
                      {infoItems.map(it => (
                        <article key={it.id} className="mb-3 pb-3 border-bottom" style={{borderColor:'rgba(255,255,255,.15)'}}>
                          {(() => { const m = alertMeta(it.type); return (
                            <wcs-alert intent={m.intent} show timeout="0" style={{marginBottom:'0.5rem'}}>
                              <span slot="title">{m.label}</span>
                              <span className={`info-type-icon ${it.type}`} aria-label={it.type}>
                              <wcs-mat-icon icon={iconForType(it.type)}></wcs-mat-icon>
                            </span>
                            </wcs-alert>
                          ); })()}
                          <div className="info-article-head mb-1">
                            <span className={`info-type-icon ${it.type}`} aria-label={it.type}>
                              <wcs-mat-icon icon={iconForType(it.type)}></wcs-mat-icon>
                            </span>
                            <h4 className="info-article-title h6 mb-0">{it.titre}</h4>
                          </div>
                          {trafficExpanded ? (
                            <div className="mb-1 info-trafic-contenu" style={{lineHeight:1.45}}
                              dangerouslySetInnerHTML={{__html: it.__sanitized}} />
                          ) : (
                            <p className="mb-1" style={{whiteSpace:'pre-wrap'}}>
                              {it.__plain.length>180? it.__plain.slice(0,180)+'…': it.__plain}
                            </p>
                          )}
                          <small className="text-muted">{new Date(it.created_at).toLocaleString()}</small>
                        </article>
                      ))}
                    </div>
                  </div>
                  <div className="info-trafic-footer d-flex flex-column gap-2">
                    <div className="d-flex flex-column gap-2" style={{flexWrap:'nowrap'}}>
                      {(() => {
                        const max = infoPageCount;
                        const makeRange = (a,b)=>{const r=[];for(let i=a;i<=b;i++) r.push(i);return r;};
                        let pages=[];
                        if(max<=7){ pages = makeRange(1,max); }
                        else if(infoPage<=4){ pages=[...makeRange(1,5), '…', max]; }
                        else if(infoPage>=max-3){ pages=[1,'…', ...makeRange(max-4,max)]; }
                        else { pages=[1,'…', infoPage-1, infoPage, infoPage+1,'…', max]; }
                        return (
                          <div className="d-flex align-items-center gap-1 flex-wrap">
                            <wcs-button size="s" mode="stroked" disabled={infoPage<=1} onClick={()=> setInfoPage(p=> Math.max(1,p-1))}>«</wcs-button>
                            {pages.map((p,idx)=> p==='…'? <span key={'e'+idx} style={{padding:'0 .25rem'}}>…</span> : (
                              <wcs-button key={p} size="s" mode={p===infoPage? 'plain':'stroked'} onClick={()=> setInfoPage(p)}>{p}</wcs-button>
                            ))}
                            <wcs-button size="s" mode="stroked" disabled={infoPage>=infoPageCount} onClick={()=> setInfoPage(p=> Math.min(infoPageCount,p+1))}>»</wcs-button>
                          </div>
                        );
                      })()}
                      <div className="d-flex justify-content-end">
                        <wcs-button class="toggle-pill" mode="clear" shape="round" size="s" style={{'--wcs-button-padding':'0 .35rem','--wcs-button-height':'1.25rem','fontSize':'.65rem'}} onClick={() => setTrafficExpanded(v => !v)}>
                          Détail {trafficExpanded ? '−' : '+'}
                        </wcs-button>
                      </div>
                    </div>
                  </div>
                </div>
                <div ref={sabonnerRef} className={`card sabonner-card`}>
                  <h5>S'abonner</h5>
                  <p>Pour vos trajets quotidiens, faites des économies avec l'abonnement Pass Mobigo et</p>
                  <wcs-button>En savoir plus</wcs-button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <main className="main-content">
          <div className="main-container">
            <div className="content-grid">
              {/* Prochains départs */}
              <div className="card prochains-departs-card">
                <h4>Prochains départs en gare de {stationChoices[depStationIdx]?.name || ''}</h4>
                <div className="prochains-departs-tabs">
                  {stationChoices.map((st,i)=> (
                    <wcs-button key={st.name} shape="pill" {...(depStationIdx===i? {active:true}:{})} onClick={()=> setDepStationIdx(i)}>{st.name}</wcs-button>
                  ))}
                </div>
                <div className="departures-header">
                  <span>Départ</span>
                  <span>Destination</span>
                  <span>Voie</span>
                </div>
                <div>
                  {(() => {
                    const choice = stationChoices[depStationIdx];
                    const meta = stationResolved[choice.name];
                    if(!meta || meta.loading) return <div className="small text-muted p-2">Chargement…</div>;
                    if(meta.error) return <div className="small text-danger p-2">{meta.error}</div>;
                    const board = boards[meta.id];
                    if(!board || board.loading) return <div className="small text-muted p-2">Chargement…</div>;
                    if(board.error) return <div className="small text-danger p-2">{board.error}</div>;
                    if(!nextFive.length) return <div className="small text-muted p-2">Aucun départ imminent.</div>;
                    return nextFive.map((s,idx)=> (
                      <React.Fragment key={s.id+':'+idx}>
                        <div className="departure-row">
                          <div className="departure-time">
                            {s.cancelled ? (
                              <><div className="delayed strike">{s.time}</div><strong className="text-danger">—</strong></>
                            ) : s.delay_min ? (
                              <><div className="delayed">{s.time}</div><strong>{addMinutesLocal(s.time, s.delay_min)}</strong></>
                            ) : <strong>{s.time}</strong>}
                          </div>
                          <div className="departure-info">
                            <strong className={s.cancelled? 'strike text-danger':''}>{s.destination}</strong>
                            <div className="train-details">{s.cancelled? <span className="strike text-danger">Train {(s.train_type || '').toUpperCase()} {s.train_number}</span> : <>Train {(s.train_type || '').toUpperCase()} {s.train_number}</>}</div>
                          </div>
                          <div className="departure-track"><span className={s.cancelled? 'strike text-danger':''}>{s.__platform || s.platform || '-'}</span></div>
                          <wcs-button mode="clear" shape="round" onClick={()=> router.push(`/se-deplacer/prochains-departs/${stationResolved[stationChoices[depStationIdx].name].id}?type=departures`)}>
                            <wcs-mat-icon icon="chevron_right"></wcs-mat-icon>
                          </wcs-button>
                        </div>
                        {s.cancelled && (
                          <div className="delay-message" style={{color:'#b00020'}}>
                            <wcs-mat-icon icon="report"></wcs-mat-icon>
                            Supprimé{s.info? ` – ${s.info.replace(/^Supprimé\s*–?\s*/i,'')}`:''}
                          </div>
                        )}
                        {!s.cancelled && s.delay_min && (
                          <div className="delay-message">
                            <wcs-mat-icon icon="warning_amber"></wcs-mat-icon>
                            Retard estimé de {s.delay_min} min
                          </div>
                        )}
                      </React.Fragment>
                    ));
                  })()}
                </div>
                <div className="more-times">
                  {stationResolved[stationChoices[depStationIdx].name]?.id && (
                    <a href={`/se-deplacer/prochains-departs/${stationResolved[stationChoices[depStationIdx].name].id}?type=departures`}>Voir plus d'horaires </a>
                  )}
                </div>
              </div>

              {/* Promo Cards */}
              <div className="promo-cards-container">
                {articlesLoading && <div className="card promo-card"><p>Chargement…</p></div>}
                {articlesError && <div className="card promo-card"><wcs-alert intent="error" show><span slot="title">{articlesError}</span></wcs-alert></div>}
                {!articlesLoading && !articlesError && !homepageArticles.length && (
                  <div className="card promo-card"><p>Aucun article.</p></div>
                )}
                {homepageArticles.map(a=> (
                  <div key={a.slug} className="card promo-card">
                    {a.image_path && <img src={a.image_path} alt={a.titre} />}
                    <h5>{a.titre}</h5>
                    {a.resume && <p>{a.resume}</p>}
                    <a href={`/articles/${a.slug}`}><wcs-button>Lire</wcs-button></a>
                  </div>
                ))}
              </div>
            </div>
          </div>


        </main>

        {/* SUPPR: ancienne modale voyageurs */}
      </>
  );
}

const addMinutesLocal = (hhmm, mins) => {
  if(!hhmm || typeof mins !== 'number') return hhmm;
  const m = String(hhmm).match(/^([0-1]\d|2[0-3]):([0-5]\d)$/);
  if(!m) return hhmm;
  let total = parseInt(m[1],10)*60 + parseInt(m[2],10) + mins;
  total = ((total % 1440) + 1440) % 1440; // wrap 24h
  const H = String(Math.floor(total/60)).padStart(2,'0');
  const M = String(total%60).padStart(2,'0');
  return `${H}:${M}`;
};
