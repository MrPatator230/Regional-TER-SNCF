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

function useJourneys(query){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const abortRef = useRef(null);

  const fetchJourneys = useCallback(()=>{
    if(!query.from || !query.to){ setItems([]); return; }
    abortRef.current?.abort();
    const ctrl=new AbortController();
    abortRef.current=ctrl;
    setLoading(true);
    setError('');

    const qs=new URLSearchParams({
      from:query.from,
      to:query.to,
      time:query.time,
      limit:'40',
      includeStops:'1',
      date:query.date
    });

    fetch(`/api/public/journeys?${qs.toString()}`, {
      signal:ctrl.signal,
      cache:'no-store'
    })
      .then(async r=>{
        if(r.status===410){
          throw new Error('Sillons en refonte — horaires indisponibles');
        }
        const b=await r.json().catch(()=>({}));
        if(!r.ok) throw new Error(b.error||'Erreur inconnue');
        return b;
      })
      .then(b=> setItems(b.items||[]))
      .catch(e=> {
        if(e.name!=='AbortError') setError(e.message);
      })
      .finally(()=> setLoading(false));
  }, [query.from, query.to, query.time, query.date]);

  useEffect(()=>{
    fetchJourneys();
    return ()=> abortRef.current?.abort();
  }, [fetchJourneys]);

  return { items, loading, error, refetch:fetchJourneys };
}

/********************** Utils *************************/
const formatEuro = v => {
  const n = Number(v);
  if(isNaN(n)) return v;
  return n.toLocaleString('fr-FR',{minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';
};

const minutesLabel = m => {
  if(m==null) return '';
  const h=Math.floor(m/60), mn=m%60;
  return h? `${h} h ${String(mn).padStart(2,'0')} min` : `${mn} min`;
};

const upperFirst = (s='') => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const formatDate = (dateStr, withTime=false) => {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const opts = { weekday:'long', day:'numeric', month:'short' };
    const raw = withTime ? d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'short' }) : d.toLocaleDateString('fr-FR', opts);
    return upperFirst(raw);
  } catch {
    return dateStr;
  }
};

/********************** Composants UI *************************/
function JourneyCard({ journey, onShowDetails, selected }) {
  const duration = minutesLabel(journey.durationMin);

  return (
    <article className={`offer-card ticket ${selected ? 'is-selected' : ''}`} tabIndex={0} aria-labelledby={`offer-${journey.id}`}>
      <div className="offer-grid">
        <div className="og-times">
          <div className="og-time-block">
            <div className="og-time">{journey.departure || '-'}</div>
            <div className="og-station">{journey.from || ''}</div>
          </div>

          <div className="og-line">
            <div className="og-line-track">
              <div className="og-dot"></div>
              <div className="og-seg"></div>
              <div className="og-duration">{duration}</div>
              <div className="og-seg"></div>
              <div className="og-dot"></div>
            </div>
            <div className="og-train-meta">🚆 TER {journey.trainNumber || ''}</div>
          </div>

          <div className="og-time-block" style={{textAlign: 'right'}}>
            <div className="og-time">{journey.arrival || '-'}</div>
            <div className="og-station">{journey.to || ''}</div>
          </div>
        </div>

        <div className="og-fares">
          <div className="og-fare-box">
            <div className="og-badges">
              <span className="og-badge">2nde classe</span>
            </div>
            <div className="og-class">2nde classe</div>
            <div className="og-price">{formatEuro(journey.price)}</div>
            <div className="og-disclaimer">Billet non remboursable • Places limitées</div>
            <div className="og-actions">
              <button className="og-details-btn" onClick={() => onShowDetails(journey)} aria-expanded={selected}>Détails</button>
              <button className="og-select">Sélectionner</button>
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <div className="offer-details">
          <div className="offer-details-inner">
            <div className="leg-list">
              <div style={{marginBottom:8}}><strong>Départ:</strong> {journey.departure} — {journey.from}</div>
              <div style={{marginBottom:8}}><strong>Arrivée:</strong> {journey.arrival} — {journey.to}</div>
              <div style={{marginBottom:8}}><strong>Durée:</strong> {minutesLabel(journey.durationMin)}</div>
              <div style={{marginBottom:8}}><strong>Train:</strong> TER {journey.trainNumber}</div>

              {journey.stops && journey.stops.length > 0 && (
                <ul>
                  {journey.stops.map((stop, i) => (
                    <li key={i} className="leg-item" style={{display:'flex',gap:12,alignItems:'center'}}>
                      <span className="leg-time" style={{minWidth:72}}>{stop.departure || stop.arrival || '-'}</span>
                      <span style={{flex:1}}>{stop.station}</span>
                      <span className="plat" style={{minWidth:72,textAlign:'right'}}>{stop.platform || '-'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function SidebarSummary({ query, onModify }) {
  return (
    <aside className="sidebar-summary">
      <div className="summary-card summary-card--pale">
        <div className="summary-line">Aller le <strong>{formatDate(query.date, true)}</strong> à {query.time}</div>
        <div className="route">{query.from} → {query.to}</div>
        <div className="pax">{query.pax} voyageur{Number(query.pax) > 1 ? 's' : ''}, 30 ans, sans carte</div>

        <button className="modify" onClick={onModify}><span className="icon">✎</span> Modifier ma recherche</button>
      </div>
    </aside>
  );
}

function SearchPageContent() {
  const query = useSearchQuery();
  const router = useRouter();
  const { items, loading, error, refetch } = useJourneys(query);
  const [selectedJourney, setSelectedJourney] = useState(null);

  const pricingFactor = useMemo(() => {
    const card = query.profile_card;
    const type = query.profile_type;
    let factor = 1;

    if (card === 'avantage') factor *= 0.75;
    else if (card === 'liberte') factor *= 0.9;
    else if (card === 'jeune' || type === 'jeune') factor *= 0.70;
    else if (type === 'senior') factor *= 0.80;

    return factor;
  }, [query.profile_card, query.profile_type]);

  const calculatePrice = useCallback((basePrice) => {
    const n = Number(basePrice);
    if (isNaN(n)) return basePrice;
    return (n * pricingFactor).toFixed(2);
  }, [pricingFactor]);

  const handleShowDetails = (journey) => {
    setSelectedJourney(selectedJourney?.id === journey.id ? null : journey);
  };

  const handleModifySearch = () => {
    const searchParams = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value && key !== 'modes') searchParams.set(key, value);
    });
    if (query.modes && query.modes.length > 0) searchParams.set('modes', query.modes.join(','));
    router.push(`/?${searchParams.toString()}`);
  };

  const handleNextDay = () => {
    const currentDate = new Date(query.date + 'T00:00:00');
    currentDate.setDate(currentDate.getDate() + 1);
    const nextDate = currentDate.toISOString().slice(0, 10);

    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set('date', nextDate);
    router.push(`/search?${searchParams.toString()}`);
  };

  if (!query.from || !query.to) {
    return (
      <>
        <Header />
        <div className="container py-5">
          <div className="text-center">
            <h1>Recherche d'horaires</h1>
            <p className="text-muted">Veuillez saisir vos gares de départ et d'arrivée</p>
            <button className="btn btn-primary" onClick={() => router.push('/')}>Retour à l'accueil</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />

      <div className="search-page" style={{paddingTop:32}}>
        <div className="search-grid">
          <main className="results">
            <div className="results-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <h1 style={{margin:0}}>Sélectionner votre billet</h1>
                <div className="filters" style={{marginTop:8}}><span className="icon">⚙</span> Modes de transport</div>
              </div>

              <div style={{alignSelf:'flex-start'}} className="date-pill"><span className="icon">📅</span> {formatDate(query.date)}</div>
            </div>

            {error && (
              <div className="alert alert-danger">
                <strong>Erreur:</strong> {error}
                <button className="btn btn-link" onClick={refetch}>Réessayer</button>
              </div>
            )}

            {loading && (
              <div className="loading">
                <div className="spinner"></div>
                <p>Recherche des horaires...</p>
              </div>
            )}

            {!loading && !error && (
              <div className="list">
                {items.length === 0 ? (
                  <div className="no-results">Aucun résultat trouvé pour cette recherche</div>
                ) : (
                  <>
                    {items.map((journey) => (
                      <div key={journey.id} className="list-item-wrap">
                        <JourneyCard
                          journey={{
                            ...journey,
                            price: calculatePrice(journey.price),
                            from: query.from,
                            to: query.to
                          }}
                          onShowDetails={handleShowDetails}
                          selected={selectedJourney?.id === journey.id}
                        />
                      </div>
                    ))}

                    <div className="next-day-container">
                      <button className="next-day" onClick={handleNextDay}>Jour suivant <span>›</span></button>
                    </div>
                  </>
                )}
              </div>
            )}

          </main>

          <div className="sidebar">
            <SidebarSummary query={query} onModify={handleModifySearch} />
          </div>
        </div>
      </div>
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="loading-fallback"><div className="spinner"></div></div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
