"use client";
import React, { useEffect, useState, useMemo, useRef } from 'react';
import Image from 'next/image';
import Marquee from '../../../../components/Marquee';
import { platformForStation } from '@/app/utils/platform';

export default function AfficheurClassiqueDeparts(){
    const [departuresData, setDeparturesData] = useState(null);
    const [arrivalsData, setArrivalsData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [now, setNow] = useState(new Date());
    const [serverNow, setServerNow] = useState(null);
    const [logosMap, setLogosMap] = useState(null);
    const [showStatus, setShowStatus] = useState(true);

    const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const gare = search ? (search.get('gare') || '').trim() : '';

    // horloge
    useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
    const timeStr = useMemo(() => now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), [now]);
    const secondsStr = useMemo(() => String(now.getSeconds()).padStart(2, '0'), [now]);

    // toggle affichage statut <-> type (global) toutes les 2s
    useEffect(() => { const tid = setInterval(() => setShowStatus(s => !s), 2000); return () => clearInterval(tid); }, []);

    // charge mapping type->image depuis public
    useEffect(() => {
        let abort = false;
        async function load() {
            try {
                const r = await fetch('/img/type/data.json', { cache: 'no-store' });
                if (!r.ok) return;
                const j = await r.json();
                if (abort) return;
                const map = {};
                (j.logos || []).forEach(l => {
                    if (!l || !l.slug) return;
                    const key = String(l.slug).toLowerCase();
                    map[key] = {
                        path: l.path || l.file || null,
                        name: l.name || l.label || l.title || l.slug
                    };
                });
                setLogosMap(map);
            } catch (e) { /* ignore */ }
        }
        load();
        return () => { abort = true; };
    }, []);

    // --- charger les perturbations quotidiennes depuis l'API /api/perturbationsdaily (polling) ---
    const [perturbations, setPerturbations] = useState([]);
    useEffect(() => {
        let aborted = false;
        let timer = null;
        async function fetchPerturbations() {
            try {
                const url = '/api/perturbations/daily';
                const r = await fetch(url, { cache: 'no-store' });
                if (!r.ok) { setPerturbations([]); return; }
                const j = await r.json().catch(() => null);
                if (aborted) return;
                if (!j) { setPerturbations([]); return; }
                // normaliser plusieurs formats possibles
                let list;
                if (Array.isArray(j)) list = j;
                else if (Array.isArray(j.items)) list = j.items;
                else if (Array.isArray(j.perturbations)) list = j.perturbations;
                else if (Array.isArray(j.data)) list = j.data;
                else if (Array.isArray(j.results)) list = j.results;
                else list = Array.isArray(j) ? j : [];
                setPerturbations(list || []);
            } catch (_) { if (!aborted) setPerturbations([]); }
        }
        fetchPerturbations();
        timer = setInterval(fetchPerturbations, 30000);
        // Réagir aux mises à jour globales des perturbations (émises par usePerturbations)
        const onPerturbationsUpdated = () => { try { fetchPerturbations(); } catch (_) {/* ignore */} };
        try { window.addEventListener('perturbations:updated', onPerturbationsUpdated); } catch (_) {/* ignore */}
        return () => { aborted = true; if (timer) clearInterval(timer); try { window.removeEventListener('perturbations:updated', onPerturbationsUpdated); } catch (_) {/* ignore */} };
    }, []);

    // Fonction pour synchroniser les statuts avec les perturbations quotidiennes
    const synchronizeStatusWithPerturbations = (train) => {
        if (!perturbations || perturbations.length === 0) {
            // Pas de perturbations, retourner le statut original
            return {
                status: train.status || 'A L\'HEURE',
                delay: train.delay_minutes || 0,
                cancelled: train.status === 'SUPPRIMÉ'
            };
        }

        const trainNumber = train.number || train.train_number || train.code || train.name || train.id || '';
        const timeRaw = train.horaire_afficheur || train.departure_time || train.arrival_time || train.time || '';

        // Chercher une perturbation correspondante
        const matchingPerturbation = perturbations.find(perturb => {
            // Matcher par numéro de train
            const perturbTrainNumber = perturb.train_number || perturb.number || perturb.code || '';
            if (perturbTrainNumber && trainNumber && perturbTrainNumber.toString() === trainNumber.toString()) {
                return true;
            }

            // Matcher par gare et heure si disponible
            const perturbStation = perturb.station || perturb.gare || '';
            const perturbTime = perturb.time || perturb.departure_time || perturb.arrival_time || perturb.horaire || '';
            if (perturbStation && perturbTime && timeRaw) {
                const normalizedStation = normalizeLabel(perturbStation);
                const normalizedGare = normalizeLabel(gare);
                if (normalizedStation === normalizedGare || normalizedStation.includes(normalizedGare) || normalizedGare.includes(normalizedStation)) {
                    // Comparer les heures (format approximatif)
                    const perturbTimeFormatted = perturbTime.replace(/[^\d:]/g, '').slice(0, 5);
                    const trainTimeFormatted = timeRaw.replace(/[^\d:h]/g, '').replace('h', ':').slice(0, 5);
                    if (perturbTimeFormatted === trainTimeFormatted) {
                        return true;
                    }
                }
            }

            return false;
        });

        if (matchingPerturbation) {
            // Appliquer les données de la perturbation
            const perturbStatus = matchingPerturbation.status || matchingPerturbation.state || '';
            const perturbDelay = matchingPerturbation.delay_minutes || matchingPerturbation.delay || 0;
            const perturbCancelled = perturbStatus.toLowerCase().includes('supprimé') ||
                                   perturbStatus.toLowerCase().includes('cancelled') ||
                                   matchingPerturbation.cancelled === true;

            return {
                status: perturbCancelled ? 'SUPPRIMÉ' : (perturbDelay > 0 ? 'RETARDÉ' : perturbStatus || 'A L\'HEURE'),
                delay: perturbDelay,
                cancelled: perturbCancelled
            };
        }

        // Aucune perturbation trouvée, retourner le statut original
        return {
            status: train.status || 'A L\'HEURE',
            delay: train.delay_minutes || 0,
            cancelled: train.status === 'SUPPRIMÉ'
        };
    };

    // charge des départs
    useEffect(() => {
        if (!gare) return;
        let abort = false;
        async function loadDepartures() {
            try {
                const debugFlag = (typeof window !== 'undefined') && new URLSearchParams(window.location.search).get('debug') === '1';
                const apiUrl = `/api/afficheurs/classiques/departs?gare=${encodeURIComponent(gare)}` + (debugFlag ? '&debug=1' : '');
                const r = await fetch(apiUrl, { cache: 'no-store' });
                let j;
                try { j = await r.json(); } catch (_) { j = null; }
                if (!r.ok) { if (!abort) setError((j && j.error) ? j.error : 'Erreur'); return; }
                if (!abort) {
                    setDeparturesData(j);
                    if (j && j.server_timestamp) {
                        try { setServerNow(new Date(j.server_timestamp)); } catch (_) { /* ignore */ }
                    }
                }
            } catch (e) { if (!abort) setError(e.message || 'Erreur'); }
        }
        loadDepartures();
        const id = setInterval(loadDepartures, 30000);
        return () => { abort = true; clearInterval(id); };
    }, [gare]);

    // charge des arrivées
    useEffect(() => {
        if (!gare) return;
        let abort = false;
        async function loadArrivals() {
            try {
                const debugFlag = (typeof window !== 'undefined') && new URLSearchParams(window.location.search).get('debug') === '1';
                const apiUrl = `/api/afficheurs/classiques/arrivees?gare=${encodeURIComponent(gare)}` + (debugFlag ? '&debug=1' : '');
                const r = await fetch(apiUrl, { cache: 'no-store' });
                let j;
                try { j = await r.json(); } catch (_) { j = null; }
                if (!r.ok) { if (!abort) setError((j && j.error) ? j.error : 'Erreur'); return; }
                if (!abort) {
                    setArrivalsData(j);
                    if (j && j.server_timestamp) {
                        try { setServerNow(new Date(j.server_timestamp)); } catch (_) { /* ignore */ }
                    }
                }
            } catch (e) { if (!abort) setError(e.message || 'Erreur'); }
            finally { if (!abort) setLoading(false); }
        }
        loadArrivals();
        const id = setInterval(loadArrivals, 30000);
        return () => { abort = true; clearInterval(id); };
    }, [gare]);

    // utilitaires (normalisation / extraction de label / extraction d'heure)
    const normalizeLabel = (s) => {
        if (!s) return '';
        try {
            let t = String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '');
            t = t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
            return t.replace(/\s+/g, ' ');
        } catch (_) {
            let t = String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            t = t.replace(/[^A-Za-z0-9\u00C0-\u017F]+/g, ' ').trim().toLowerCase();
            return t.replace(/\s+/g, ' ');
        }
    };

    const getStopLabel = (s) => {
        if (!s) return '';
        if (typeof s === 'string') {
            let label = s.trim();
            label = label.replace(/\s*\(.*?\)\s*/g, ' ').trim();
            const parts = label.split(/\s+/);
            if (parts.length >= 2) {
                const secondPart = parts.slice(1).join(' ');
                if (/ville/i.test(secondPart)) return parts[0];
            }
            return label;
        }
        const candidates = [
            s.station_name, s.name, s.station, s.label, s.stop_point_name, s.display_name, s.libelle, s.nom,
            s.stop && (s.stop.name || s.stop.station_name), s.stop_point && (s.stop_point.name || s.stop_point.label),
            s.location && s.location.name, s.stop_name, s.stopPointName, s.stop_point_label, s.stationName, s.title, s.station_label
        ];
        for (const c of candidates) {
            if (c && typeof c === 'string' && c.trim()) {
                let label = c.trim();
                label = label.replace(/\s*\(.*?\)\s*/g, ' ').trim();
                const parts = label.split(/\s+/);
                if (parts.length >= 2) {
                    const secondPart = parts.slice(1).join(' ');
                    if (/ville/i.test(secondPart)) return parts[0];
                }
                return label;
            }
        }
        try { return String(JSON.stringify(s)); } catch (_) { return ''; }
    };

    // Filtrer automatiquement par jour de circulation selon la date du serveur (fallback client)
    const referenceNow = serverNow || now;

    // Normaliser les tableaux d'items renvoyés par les APIs
    const departureItems = (departuresData && typeof departuresData === 'object') ? (
        departuresData.departures ?? departuresData.arrivals ?? departuresData.items ?? departuresData.data ?? departuresData.results ?? []
    ) : [];

    const arrivalItems = (arrivalsData && typeof arrivalsData === 'object') ? (
        arrivalsData.departures ?? arrivalsData.arrivals ?? arrivalsData.items ?? arrivalsData.data ?? arrivalsData.results ?? []
    ) : [];

    // Combiner les deux listes et marquer le type
    const combinedTrains = [
        ...departureItems.map(item => ({ ...item, _displayType: 'departure' })),
        ...arrivalItems.map(item => ({ ...item, _displayType: 'arrival' }))
    ];

    // Helper: calcule stationTime, timeRaw, timeFmt et la Date parsée pour un item
    const getTimeForItem = (d, baseDate = referenceNow) => {
        const stops = (d && d.stops) || [];
        const normGare = normalizeLabel(gare);
        const currentIdx = stops.findIndex(s => {
            const lbl = normalizeLabel(getStopLabel(s));
            return lbl === normGare || lbl.startsWith(normGare) || normGare.startsWith(lbl);
        });
        const currentStop = currentIdx >= 0 ? stops[currentIdx] : (stops.length ? stops[0] : null);
        let stationTime = '';
        if (currentStop) {
            // Pour les arrivées, privilégier arrival_time, pour les départs, departure_time
            if (d._displayType === 'arrival') {
                stationTime = currentStop.arrival_time || currentStop.arrival || currentStop.departure_time || currentStop.departure || '';
            } else {
                stationTime = currentStop.departure_time || currentStop.departure || currentStop.arrival_time || currentStop.arrival || '';
            }
        }

        let timeRaw = stationTime || d.horaire_afficheur || d.pass_time;
        if (d._displayType === 'arrival') {
            timeRaw = timeRaw || d.arrival_time || d.arrival || d.departure_time;
        } else {
            timeRaw = timeRaw || d.departure_time || d.departure || d.arrival_time;
        }

        return { timeRaw };
    };

    // Trier les trains par heure
    combinedTrains.sort((a, b) => {
        const aTimeRaw = getTimeForItem(a).timeRaw;
        const bTimeRaw = getTimeForItem(b).timeRaw;
        // Simple comparaison de chaînes d'heure
        return (aTimeRaw || '').localeCompare(bTimeRaw || '');
    });

    // debug flag
    const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

    // utilitaires de logo (fallback local si non fournis globalement)
    const getLogoFor = (type) => {
        if (!type) return '/img/brand/sncf-logo.png';
        if (logosMap && logosMap[type] && logosMap[type].path) return logosMap[type].path;
        return `/img/type/logo-${type}.svg`;
    };
    const getTypeName = (type) => {
        if (!type) return 'SNCF';
        if (logosMap && logosMap[type] && logosMap[type].name) return String(logosMap[type].name).toUpperCase();
        return String(type).toUpperCase();
    };

    if (!gare) return <div style={{ fontFamily: 'Achemine', padding: 40 }}><h1>Paramètre "gare" manquant</h1><p>Ajouter ?gare=NomDeLaGare dans l'URL.</p></div>;

    return (
        <div className="board-root">
            <div className="board-wrapper">
                <div className="watermark">départs & arrivées</div>

                <div className="rows">
                    <div className="rows-inner">
                        {loading && <div className="row loading">Chargement…</div>}
                        {error && !loading && <div className="row error">{error}</div>}
                        {!loading && !error && !combinedTrains.length && <div className="row empty">Aucun train prévu</div>}

                        {combinedTrains.map((d, i) => {
                            const tinfo = getTimeForItem(d, referenceNow);
                            const timeRaw = tinfo.timeRaw;
                            const stops = d.stops || [];
                            const firstStop = (stops && stops.length) ? stops[0] : null;
                            const lastStop = (stops && stops.length) ? stops[stops.length - 1] : null;

                            // Calculer la gare d'origine/destination selon le type d'affichage
                            let displayName = '';
                            if (d._displayType === 'arrival') {
                                // Pour les arrivées, afficher l'origine (d'où vient le train)
                                if (d) {
                                    displayName = getStopLabel(d.origin_station) || getStopLabel(d.departure_station) || getStopLabel(d.start_station) || getStopLabel(d.from) || getStopLabel(d.origin) || '';
                                    if (!displayName && stops && stops.length) {
                                        displayName = getStopLabel(firstStop);
                                    }
                                } else if (firstStop) {
                                    displayName = getStopLabel(firstStop);
                                }
                            } else {
                                // Pour les départs, afficher la destination (où va le train)
                                if (d) {
                                    if (d.arrival_station) displayName = getStopLabel(d.arrival_station) || String(d.arrival_station || '').trim();
                                    else if (d.destination_station) displayName = getStopLabel(d.destination_station) || String(d.destination_station || '').trim();
                                    else if (d.destination) displayName = (typeof d.destination === 'string') ? String(d.destination).trim() : getStopLabel(d.destination);
                                } else if (lastStop) {
                                    displayName = getStopLabel(lastStop);
                                }
                            }
                            displayName = String(displayName || '').trim();

                            const trainNumber = d.number || d.train_number || d.code || d.name || d.id || '';
                            const served = (stops || []).map(s => getStopLabel(s)).filter(Boolean);

                            // Utiliser directement le statut et le retard renvoyés par l'API
                            const { status, delay, cancelled } = synchronizeStatusWithPerturbations(d);

                            const typeSlug = (d.type || '').toString().toLowerCase();
                            const typeName = getTypeName(typeSlug);

                            // Modification de la logique d'affichage des quais
                            const apiAssigned = Object.prototype.hasOwnProperty.call(d, 'platform') ? d.platform : undefined;
                            let platformToShow = null;
                            if (apiAssigned !== undefined) {
                                if (String(apiAssigned).trim() !== '') platformToShow = apiAssigned;
                                else platformToShow = '—';
                            } else {
                                const adminPlatform = platformForStation(d, gare);
                                if (adminPlatform !== null && adminPlatform !== undefined) {
                                    if (String(adminPlatform).trim() !== '') platformToShow = adminPlatform;
                                    else platformToShow = '—';
                                } else {
                                    const fallbackPlatform = d.voie || d.platform || d.platform_code || d.track;
                                    platformToShow = fallbackPlatform || '—';
                                }
                            }

                            // Indicateur visuel pour différencier arrivées et départs
                            const typeIndicator = d._displayType === 'arrival' ? 'ARR' : 'DEP';

                            return (
                                <div className={`row ${i % 2 ? 'alt' : ''}`} key={`${d._displayType}-${d.id || i}`}>
                                    <div className="cell logo"><Image src={getLogoFor((d.type || '').toString().toLowerCase())} alt={d.type || 'type'} width={135} height={54} /></div>
                                    <div className="cell status">
                                        <div className="meta-top">
                                            {showStatus ? (
                                                cancelled ? (
                                                    // supprimé : ligne unique "supprimé"
                                                    <div className="status-stack cancelled">
                                                        <span className="status-primary">supprimé</span>
                                                    </div>
                                                ) : (delay ? (
                                                    // retardé : deux lignes "retardé" + "+XX min"
                                                    <div className="status-stack delayed">
                                                        <span className="status-primary">retardé</span>
                                                        <span className="status-secondary">+{delay} min</span>
                                                    </div>
                                                ) : (
                                                    // à l'heure
                                                    <span className={`status-text ontime`}>à l'heure</span>
                                                ))
                                            ) : (
                                                <div className="type-block">
                                                    <div className="type-name">{typeName}</div>
                                                    <div className="train-number">{typeIndicator} {trainNumber}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {/* masquer l'heure uniquement lorsque le statut 'supprimé' est affiché (showStatus && cancelled) */}
                                    <div className="cell time"><span>{(!showStatus || !cancelled) ? timeRaw : ''}</span></div>
                                    <div className="cell destination">
                                        <div className="dest-main">{displayName || '—'}</div>
                                        {served.length > 0 && i < 2 && (
                                            <div className="served-list" title={served.join(' • ')}>
                                                <span className="served-title">Via :</span>
                                                <div className="served-mask">
                                                    <Marquee className="served-inline">{served.join(' • ')}</Marquee>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {/* Modifier le rendu pour toujours afficher la box de quai */}
                                    <div className="cell voie"><div className="voie-box">{platformToShow}</div></div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="footer-bar">
                    <div className="footer-msg">Afficheur des départs & arrivées – {gare}</div>
                    <div className="clock"><span className="hms">{timeStr}</span><span className="sec">{secondsStr}</span></div>
                </div>

            </div>

            <style jsx>{`
                /* Reset / layout */
                /* Cacher toutes les scrollbars globalement (WebKit, Firefox, IE/Edge) */
                :global(*::-webkit-scrollbar){ display: none; }
                :global(*){ -ms-overflow-style: none; /* IE and Edge */ scrollbar-width: none; /* Firefox */ }

                html,body,.board-root{height:100%;}
                /* hauteur du footer par défaut (modifiable) — utilisée pour réserver l'espace en bas */
                /* Valeurs explicites (96px) pour éviter les problèmes d'analyse statique avec les custom properties */
                html,body{overflow:hidden;}
                /* Fond principal: thème bleu pour l'afficheur départs (conservé) */
                .board-root{background:var(--dep-blue-2);min-height:100vh;margin:0;padding:0;color:#fff;display:flex;overflow:hidden;}
                .board-wrapper{position:relative;flex:1;display:flex;flex-direction:column;min-height:100vh;}
                .watermark{position:absolute;top:0;right:-10px;font-size:220px;line-height:.8;font-weight:700;color:rgba(255,255,255,.12);writing-mode:vertical-rl;text-orientation:mixed;pointer-events:none;user-select:none;z-index:5;letter-spacing:-0.05em;}

                /* Rows / grid : la dernière colonne correspond à la largeur de la boîte quai */
                .rows{padding-top:0;flex:1;position:relative;overflow:hidden;padding-bottom:calc(96px + 12px);} 
                .rows-inner{position:relative;will-change:transform;}
                /* Ajustement : colonne quai élargie à 120px pour correspondre à .voie-box */
                /* Hauteur pour les lignes à partir de la 3ème : plus compactes que les deux premières */
                /* Utiliser une alternance de bleus (clair / foncé) pour le style départs */
                /* Ordre des colonnes : logo | opérateur+num | heure | destination (flex) | quai */
                .row{display:grid;grid-template-columns:140px 200px 260px 1fr 140px;align-items:center;min-height:100px;background:var(--dep-blue-1);position:relative;border-bottom:2.5px solid rgba(0,0,0,0.12);} 
                .rows .row:nth-child(-n+2){ min-height:220px; }
                /* alternate (darker) row */
                .row.alt{background:var(--dep-blue-2);}
                .row:nth-child(2){background:rgba(6,59,115,0.92);} /* slight variant for second row */
                .row.loading,.row.error,.row.empty{font-size:48px;font-weight:600;justify-content:center;grid-template-columns:1fr}

                /* Cells */
                .cell.logo{display:flex;align-items:center;justify-content:center;padding-left:10px}
                .cell.status{display:flex;flex-direction:column;align-items:center;justify-content:center;padding-left:0;padding-right:6px;text-align:center}
                .meta-top{height:48px;display:flex;align-items:center;gap:10px}

                .status-text{font-size:26px;font-weight:700;color:#fff;text-align:center}
                .status-text.ontime{color:#fff}
                .status-text.delayed{color:#ffe300}
                .status-text.cancelled{color:#ff6b6b}

                /* Nouvelle présentation du statut : pile pour Retardé (+XX min) ou ligne unique Supprimé */
                .status-stack{display:flex;flex-direction:column;align-items:center;gap:2px}
                .status-stack .status-primary{font-size:26px;font-weight:800;color:#ffe300}
                .status-stack.delayed .status-primary{color:#ffe300}
                .status-stack.delayed .status-secondary{font-size:20px;font-weight:700;color:#ffe300}
                .status-stack.cancelled .status-primary{font-size:28px;font-weight:900;color:#ff6b6b}
                /* Garantir que l'heure est masquée quand un sillon est supprimé et que le statut est affiché */
                .cell.time span{display:inline-block}

                .type-name{font-size:22px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;text-align:center}
                .type-block{display:flex;flex-direction:column;align-items:center;gap:6px}
                /* Le numéro de train doit être aligné à gauche (horizontalement) mais rester centré verticalement
                   dans la colonne ; on force la largeur à 100% et on aligne le texte à gauche. */
                .train-number{font-size:22px;font-weight:700;color:#fff;align-self:flex-start;width:100%;text-align:left;padding-left:8px}

                .cell.time span{font-size:60px;font-weight:900;color:#ffe300;letter-spacing:0.01em;font-variant-numeric:tabular-nums;}
                .cell.destination{padding-left:18px;padding-right:110px;display:flex;flex-direction:column;justify-content:center;min-width:0}
                .dest-main{font-size:60px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;line-height:1.08;}

                /* Served list: compact chips, responsive, +N expansion */
                .served-list{font-size:20px;color:#c8d6e6;margin-top:6px;display:flex;align-items:center;gap:12px}
                .served-title{font-weight:700;color:#ffffff;flex:0 0 auto;margin-right:12px;font-size:22px}
                .served-mask{flex:1 1 auto;overflow:hidden;max-width:100%;display:block}
                /* Afficher toutes les gares sur UNE SEULE LIGNE sans changer la taille de la police */
                /* mêmes dimensions de police que la destination principale */
                .served-inline{display:inline-block;white-space:nowrap;color:#cfe7ff;font-weight:600;font-size:54px;padding-right:24px}

                /* Colonne destination : élément flexible prenant l'espace restant */
                .cell.destination{padding-left:60px;padding-right:20px;display:flex;flex-direction:column;justify-content:center;min-width:0}
                .dest-main{font-size:60px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;line-height:1.02;}

                /* Quai : boîte carrée bordée blanche */
                .cell.voie{display:flex;justify-content:center;align-items:center;padding-right:12px}
                .voie-box{
                  border:4px solid #fff;
                  border-radius:12px;
                  font-size:56px;
                  font-weight:800;
                  width:120px;
                  height:120px;
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  background: transparent; /* fond transparent demandé */
                  color:#fff;
                  box-sizing:border-box;
                  text-align:center;
                  line-height:1;
                  box-shadow: inset 0 -6px 0 rgba(0,0,0,0.04);
                }
                /* Adapter la taille de la boîte quai pour les lignes à partir de la 3ème (min-height:100px) */
                .rows .row:nth-child(n+3) .voie-box{ width:80px; height:80px; font-size:40px; border-width:3px }

                
                /* Footer */
                /* Footer fixe en bas de la fenêtre */
                .footer-bar{background:#f4b85a;color:#073247;display:flex;align-items:center;font-weight:600;font-size:36px;padding:8px 24px;gap:24px;margin-top:0;position:fixed;left:0;right:0;bottom:0;height:96px;box-sizing:border-box;z-index:9999}
                .footer-msg{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
                .clock{background:#083b6b;color:#fff;padding:6px 22px;border-radius:8px;display:flex;align-items:center;gap:10px;font-size:38px;font-weight:700}
                .clock .sec{font-size:28px;color:#ffe300;font-weight:700;margin-left:6px}

                /* Responsive adjustments */
                @media (max-width:1600px){
                  /* réduire la hauteur du footer sur écrans plus petits */
                  .rows{padding-bottom:calc(72px + 12px);} 
                  /* responsive : colonnes plus compactes */
                  .row{grid-template-columns:90px 120px 120px 1fr 140px;min-height:100px}
                  .rows .row:nth-child(-n+2){ min-height:240px; }
                  .cell.time span{font-size:48px}
                  /* Ajustements responsive pour les lignes 3+ */
                  .rows .row:nth-child(n+3) .cell.time span{ font-size:28px }
                  .rows .row:nth-child(n+3) .dest-main{ font-size:28px }
                  .rows .row:nth-child(n+3) .served-inline{ font-size:28px }
                  .rows .row:nth-child(n+3) .meta-top{ height:34px }
                  .rows .row:nth-child(n+3) .status-text{ font-size:18px }
                  .rows .row:nth-child(n+3) .train-number{ font-size:14px }
                  /* forcer taille de la voie sur lignes 3+ en responsive */
                  .rows .row:nth-child(n+3) .voie-box{ width:72px; height:72px; font-size:28px; border-width:3px }
                }
            `}</style>
        </div>
    );
}
