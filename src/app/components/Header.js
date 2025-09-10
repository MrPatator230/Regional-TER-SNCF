"use client";
import "@sncf/bootstrap-sncf.communication/dist/bootstrap-sncf.min.css";

import React, { useRef, useCallback, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from '@/app/lib/useSession';
import { logout } from '@/app/lib/logout';

export default function Header() {
    const router = useRouter();
    const searchRef = useRef(null);
    const alertTimeoutRef = useRef(null);
    const [highlightEvent, setHighlightEvent] = useState(null);
    const [cartCount, setCartCount] = useState(0);
    const { user: session } = useSession();
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const accountBtnRef = useRef(null);
    const accountMenuRef = useRef(null);

    useEffect(()=>{
        let abort=false;
        (async()=>{
            try {
                const r = await fetch('/api/public/evenements/highlight',{ cache:'no-store' });
                if(!r.ok) return;
                const j = await r.json();
                if(!abort) setHighlightEvent(j.item||null);
            } catch {/* ignore */}
        })();
        return ()=>{ abort=true; };
    },[]);

    const showEphemeralAlert = useCallback((message, mode="error") => {
        // Crée une alerte WCS éphémère
        const host = document.body;
        const alert = document.createElement('wcs-alert');
        alert.setAttribute('mode', mode);
        alert.setAttribute('open', '');
        alert.style.position='fixed';
        alert.style.top='80px';
        alert.style.right='16px';
        alert.style.zIndex='5000';
        alert.innerText = message;
        host.appendChild(alert);
        if(alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
        alertTimeoutRef.current = setTimeout(()=>{ try { alert.remove(); } catch{} }, 4000);
    }, []);

    const handleSearch = useCallback(async () => {
        const el = searchRef.current;
        const value = (el?.value||'').trim();
        if(!value){ return; }
        // Extraction numéro + date éventuelle (pattern AAAA-MM-JJ)
        const parts = value.split(/\s+/);
        const trainNumber = parts[0];
        const dateCandidate = parts.slice(1).find(p=>/^\d{4}-\d{2}-\d{2}$/.test(p));
        if(!/^\w+$/.test(trainNumber)) { showEphemeralAlert('Numéro de train invalide'); return; }
        try {
            const url = `/api/public/train?number=${encodeURIComponent(trainNumber)}${dateCandidate?`&date=${dateCandidate}`:''}`;
            const r = await fetch(url, { cache:'no-store' });
            if(r.status===410){ showEphemeralAlert('Sillons en refonte — horaires indisponibles', 'warning'); return; }
            if(!r.ok){ showEphemeralAlert('Aucun train trouvé pour ce numéro'); return; }
            router.push(`/se-deplacer/horaires/train/${encodeURIComponent(trainNumber)}${dateCandidate?`?date=${dateCandidate}`:''}`);
        } catch {
            showEphemeralAlert('Erreur recherche train');
        }
    }, [showEphemeralAlert, router]);

    const loadCart = useCallback(async ()=>{
        try {
            // session d��jà chargée via hook
            if(!session || session.role!=='client') { setCartCount(0); return; }
            const r = await fetch('/api/public/cart',{cache:'no-store'});
            if(!r.ok) return; const j = await r.json(); setCartCount(j.count||0);
        } catch {/* ignore */}
    },[session]);

    useEffect(()=>{ loadCart(); },[loadCart]);
    useEffect(()=>{
        const handler = ()=> loadCart();
        window.addEventListener('cart-updated', handler);
        return ()=> window.removeEventListener('cart-updated', handler);
    },[loadCart]);

    const handleLogout = useCallback(()=>{
        setShowAccountMenu(false);
        logout('/');
    },[setShowAccountMenu]);

    useEffect(()=>{
        if(!showAccountMenu) return;
        const onClick = (e)=>{
            if(accountMenuRef.current && accountMenuRef.current.contains(e.target)) return;
            if(accountBtnRef.current && accountBtnRef.current.contains(e.target)) return;
            setShowAccountMenu(false);
        };
        const onKey = (e)=>{ if(e.key==='Escape') setShowAccountMenu(false); };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return ()=>{ document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
    },[showAccountMenu]);

    useEffect(()=>{
        if(typeof window==='undefined') return;
        const params = new URLSearchParams(window.location.search);
        if(params.get('logged_out')==='1') {
            showEphemeralAlert('Déconnexion réussie', 'success');
            params.delete('logged_out');
            const newSearch = params.toString();
            const newUrl = window.location.pathname + (newSearch?`?${newSearch}`:'') + window.location.hash;
            window.history.replaceState({}, '', newUrl);
        }
    },[showEphemeralAlert]);

    return (
        <div>
            {highlightEvent && (
                <div className="top-banner">
                    {highlightEvent.lien ? (
                      <a href={highlightEvent.lien} className="m-0 d-flex align-items-center justify-content-center" style={{color:'inherit', textDecoration:'none'}}>
                        <wcs-mat-icon icon="celebration" className="me-2"></wcs-mat-icon>
                        <strong>{highlightEvent.titre}</strong>
                      </a>
                    ) : (
                      <p className="m-0 d-flex align-items-center justify-content-center">
                        <wcs-mat-icon icon="celebration" className="me-2"></wcs-mat-icon>
                        <strong>{highlightEvent.titre}</strong>
                      </p>
                    )}
                </div>
            )}
            <wcs-header>
                <Link href="/" slot="logo">
                    <img alt="SNCF" src="/img/brand/ter-bfc.svg" />
                </Link>
                <div slot="center">
                    <wcs-form-field style={{ flex: "0.8" }}>
                        <wcs-input placeholder="Rechercher" ref={searchRef} onKeyDown={(e)=>{ if(e.key==='Enter'){ handleSearch(); } }} />
                        <wcs-button aria-label="Rechercher" ripple="false" shape="square" slot="suffix" onClick={handleSearch}>
                            <wcs-mat-icon icon="search" />
                        </wcs-button>
                    </wcs-form-field>
                </div>
                <div slot="actions" className="actions-flex">
                    <Link href="/panier" className="me-2" aria-label={`Panier (${cartCount})`}>
                        <wcs-button mode="clear" shape="round" style={{position:'relative'}}>
                          <wcs-mat-icon icon="shopping_cart"></wcs-mat-icon>
                          {session?.role==='client' && cartCount>0 && <span style={{position:'absolute', top:'2px', right:'2px', background:'#c00', color:'#fff', fontSize:'10px', lineHeight:'14px', padding:'0 4px', borderRadius:'12px'}}>{cartCount}</span>}
                        </wcs-button>
                    </Link>
                    {!session && (
                      <Link href="/se-connecter">
                        <wcs-button mode="clear">
                          <wcs-mat-icon icon="person_outline"></wcs-mat-icon>
                          <span>Connexion</span>
                        </wcs-button>
                      </Link>
                    )}
                    {session && (
                      <div style={{position:'relative'}}>
                        <wcs-button ref={accountBtnRef} mode="clear" onClick={()=>setShowAccountMenu(v=>!v)} aria-haspopup="menu" aria-expanded={showAccountMenu?"true":"false"} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', padding:'4px 8px'}}>
                          <wcs-mat-icon icon="account_circle" style={{fontSize:'24px'}}></wcs-mat-icon>
                          <span style={{fontSize:'10px', lineHeight:'1.1', maxWidth:'90px', textAlign:'center', display:'block'}}>{session.first_name} {session.last_name}</span>
                        </wcs-button>
                        {showAccountMenu && (
                          <div ref={accountMenuRef} className="account-menu" role="menu">
                            <Link href={`/espace/${session.role}`} role="menuitem" onClick={()=>setShowAccountMenu(false)}>Mon espace</Link>
                            <button type="button" onClick={handleLogout} role="menuitem">Se déconnecter</button>
                          </div>
                        )}
                      </div>
                    )}
                </div>
            </wcs-header>
            <style jsx>{`
              .actions-flex { display:flex; align-items:center; gap:8px; position:relative; }
              .icon-btn, .account-link { position:relative; display:flex; align-items:center; justify-content:center; width:40px; height:40px; text-decoration:none; color:inherit; cursor:pointer; background:none; border:none; }
              .btn-plain { font: inherit; }
              .icon-btn wcs-mat-icon, .account-link wcs-mat-icon { font-size:26px; line-height:1; }
              .badge-cart { position:absolute; top:2px; right:2px; background:#c00; color:#fff; font-size:10px; line-height:14px; padding:0 4px; border-radius:12px; }
              .account-link .account-name { position:absolute; top:100%; left:50%; transform:translate(-50%, 2px); font-size:10px; line-height:1.05; white-space:nowrap; pointer-events:none; }
              @media (max-width: 600px){ .account-link .account-name { display:none; } }
              .account-menu { position:absolute; top:44px; right:0; background:#fff; border:1px solid #d3d3d3; border-radius:6px; padding:.4rem .5rem; display:flex; flex-direction:column; gap:.2rem; min-width:160px; z-index:3000; box-shadow:0 4px 14px rgba(0,0,0,.15); }
              .account-menu a, .account-menu button { text-align:left; background:none; border:none; padding:.4rem .5rem; font-size:.75rem; text-decoration:none; color:#0d5637; border-radius:4px; cursor:pointer; }
              .account-menu a:hover, .account-menu button:hover { background:#f2f7f2; }
              .no-name .account-name { display:none; }
            `}</style>

            <div>
                <div>
                    <wcs-com-nav mode="horizontal">
                        <wcs-com-nav-submenu
                            label="Se déplacer"
                            panel-description="Rechercher un horaire, consulter les fiches horaires, les infos trafic..."
                            panel-title="Se déplacer">
                            <wcs-com-nav-item>
                                <Link href="/se-deplacer/horaires">Rechercher un horaire (train, car...)</Link>
                            </wcs-com-nav-item>
                            <wcs-com-nav-item>
                                <Link href="/se-deplacer/prochains-departs">Toutes les lignes</Link>
                            </wcs-com-nav-item>
                            <wcs-com-nav-item>
                                <Link href="/se-deplacer/prochains-departs">Prochains Départs</Link>
                            </wcs-com-nav-item>
                            <wcs-com-nav-item>
                                <Link href="/se-deplacer/fiches-horaires">Fiches Horaires</Link>
                            </wcs-com-nav-item>
                            <wcs-com-nav-item>
                                <Link href="/se-deplacer/travaux">Travaux, grèves</Link>
                            </wcs-com-nav-item>
                        </wcs-com-nav-submenu>
                        <wcs-com-nav-submenu
                            label="Abonnements"
                            panel-description="Abonnements et cartes de réduction"
                            panel-title="Abonnements">
                            <wcs-com-nav-item>
                                <Link href="/abonnements/tous-les-abonnements">Tous les abonnements</Link>
                            </wcs-com-nav-item>
                            <wcs-com-nav-category label="Abonnement TRAIN Mobigo ">
                                <wcs-com-nav-item>
                                    <Link href="/abonnements/abonnements-regional">Abonnement TRAIN Mobigo</Link>
                                </wcs-com-nav-item>
                                <wcs-com-nav-item>
                                    <Link href="/abonnements/tous-les-abonnements/abonnements-ter/pass-mobigo-flex-quotidien/">Abonnement illimité +26ans: Pass Mobigo Flex
                                        Quotidien</Link>
                                </wcs-com-nav-item>
                                <wcs-com-nav-item>
                                    <Link href="/titres-cartes-reduction/titres-cartes-reduction/abonnement-mobigo-hebdo">Abonnement Mobigo Hebdo</Link>
                                </wcs-com-nav-item>
                                <wcs-com-nav-item>
                                    <Link href="/titres-cartes-reduction/titres-cartes-reduction/abonnement-mobigo-mensuel">Abonnement Mobigo Mensuel</Link>
                                </wcs-com-nav-item>
                            </wcs-com-nav-category>
                            <wcs-com-nav-category label="Abonnement CAR Mobigo ">
                                <wcs-com-nav-item>
                                    <Link href="/abonnements/abonnements-regional">Abonnement CAR Mobigo</Link>
                                </wcs-com-nav-item>
                            </wcs-com-nav-category>
                        </wcs-com-nav-submenu>

                        <wcs-com-nav-submenu
                            label="Titres et cartes de réduction"
                            panel-description="Titres et cartes de réduction"
                        panel-title="Titres et cartes de réduction">
                            <wcs-com-nav-item>
                                <Link href="/titres-cartes-reduction/titres-cartes-reduction">Tous les titres et cartes de réduction</Link>
                            </wcs-com-nav-item>
                        </wcs-com-nav-submenu>

                        <wcs-com-nav-submenu
                            label="Services et contact"
                            panel-description="Services et contact"
                            panel-title="Services et contact">
                            <wcs-com-nav-item>
                                <Link href="/services-contact/services-contact">Tous les services et contacts</Link>
                            </wcs-com-nav-item>
                            <wcs-com-nav-item>
                                <Link href="/services-contact/assistance-handicap">Assistance handicap</Link>
                            </wcs-com-nav-item>
                            <wcs-com-nav-item>
                                <Link href="/services-contact/assistance-handicap/assistance-handicap-mobigo">Assistance handicap Mobigo</Link>
                            </wcs-com-nav-item>
                            <wcs-com-nav-item>
                                <Link href="/services-contact/assistance-handicap/assistance-handicap-car-mobigo">Assistance handicap Mobigo</Link>
                            </wcs-com-nav-item>
                            <wcs-com-nav-item>
                                <Link href="/services-contact/assistance-handicap/assistance-handicap-tgv">Assistance handicap TGV</Link>
                            </wcs-com-nav-item>
                            <wcs-com-nav-item>
                                <Link href="/services-contact/assistance-handicap/assistance-handicap-intercites">Assistance handicap Intercités</Link>
                            </wcs-com-nav-item>
                            <wcs-com-nav-item>
                                <Link href="/services-contact/justificatifs-de-retards-suppressions">Télécharger un justificatif de retard ou de suppression.</Link>
                            </wcs-com-nav-item>
                        </wcs-com-nav-submenu>

                        <wcs-com-nav-submenu
                            label="Découvrir la région"
                            panel-description="Décourvrir la région avec TRAIN Mobigo"
                            panel-title="Découvrir la région ">
                            <wcs-com-nav-item>
                                <Link href="/decouvrir-la-region/lignes-touristiques">Les Lignes Touristiques.</Link>
                            </wcs-com-nav-item>
                            <wcs-com-nav-item>
                                <Link href="/decouvrir-la-region/idees-de-sorties"> Idées de sorties</Link>
                            </wcs-com-nav-item>
                            <wcs-com-nav-item>
                                <Link href="/decouvrir-la-region/evenements">Évenements</Link>
                            </wcs-com-nav-item>

                        </wcs-com-nav-submenu>

                    </wcs-com-nav>

                </div>
            </div>
        </div>
    );
}
