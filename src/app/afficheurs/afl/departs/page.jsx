"use client";
import React, { useEffect, useState } from 'react';
import './page.css';

export default function AfficheurAFLDeparts() {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [currentPage, setCurrentPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const totalPages = 3;

    // Récupération des paramètres de l'URL
    const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const gare = search ? (search.get('gare') || 'Dijon-Ville').trim() : 'Dijon-Ville';
    const dateParam = search ? (search.get('date') || search.get('jour') || null) : null;
    const typeParam = search ? (search.get('type') || 'departs').trim().toLowerCase() : 'departs';

    // Date de référence (aujourd'hui par défaut ou date fournie)
    const refDate = dateParam ? new Date(dateParam + 'T00:00:00') : new Date();
    const dateISO = refDate.toISOString().slice(0, 10);

    // Mise à jour de l'heure toutes les secondes
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Rotation automatique des pages toutes les 10 secondes
    useEffect(() => {
        const pageTimer = setInterval(() => {
            setCurrentPage(prev => {
                // Calculer le nombre de pages actuel basé sur les données
                const totalDepartures = data?.departures?.length || 0;
                if (totalDepartures === 0) return 1;

                const remaining = totalDepartures - 4;
                const maxPages = remaining > 0 ? Math.min(1 + Math.ceil(remaining / 8), 3) : 1;

                return prev >= maxPages ? 1 : prev + 1;
            });
        }, 10000);
        return () => clearInterval(pageTimer);
    }, [data]);

    // Chargement des données depuis l'API
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError('');
            try {
                const endpoint = typeParam === 'arrivees'
                    ? `/api/afficheurs/eva/arrivees?gare=${encodeURIComponent(gare)}&date=${dateISO}`
                    : `/api/afficheurs/eva/departs?gare=${encodeURIComponent(gare)}&date=${dateISO}`;

                const response = await fetch(endpoint);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const result = await response.json();
                setData(result);
            } catch (err) {
                console.error('Erreur chargement données:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        // Rafraîchir toutes les minutes
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [gare, dateISO, typeParam]);

    const formatTime = (date) => {
        return date.toTimeString().slice(0, 5);
    };

    // Fonction pour déterminer si un train est un bus
    const isBusService = (trainNumber) => {
        return trainNumber && (trainNumber.includes('408') || trainNumber.includes('car'));
    };

    // Extraction et formatage des données
    const departures = React.useMemo(() => {
        if (!data || !data.departures) return [];

        return data.departures.slice(0, 20).map(item => {
            const trainNumber = item.number || item.train_number || item.trainNumber || '';
            const isBus = isBusService(trainNumber);

            // Construction de la chaîne "via"
            let viaStations = '';
            if (item.next && Array.isArray(item.next) && item.next.length > 0) {
                const stations = item.next.slice(0, 4);
                viaStations = 'via ' + stations.join(' > ');
            } else if (item.stops && Array.isArray(item.stops)) {
                const stations = item.stops
                    .filter(s => s.station_name || s.station)
                    .map(s => s.station_name || s.station)
                    .slice(0, 4);
                if (stations.length > 0) {
                    viaStations = 'via ' + stations.join(' > ');
                }
            } else if (item.via) {
                viaStations = 'via ' + item.via;
            }

            return {
                departure_time: item.time || item.departure_time || item.departureTime || '00:00',
                arrival_time: item.time || item.arrival_time || item.arrivalTime || '00:00',
                train_type: item.type || item.train_type || item.trainType || 'TER',
                train_number: trainNumber.replace(/^TER\s*/i, '').trim(),
                destination: typeParam === 'arrivees'
                    ? (item.origin || item.departure_station || item.departureStation || 'Inconnu')
                    : (item.destination || item.terminus_name || item.arrival_station || item.arrivalStation || 'Inconnu'),
                via: viaStations,
                voie: item.platform || item.voie || null,
                isBus: isBus,
                status: item.cancelled ? 'Supprimé' : (item.delay_min > 0 ? 'Retardé' : item.status || 'À l\'heure'),
                delay: item.delay_min || item.delay || 0,
                cancelled: item.cancelled || false
            };
        });
    }, [data, typeParam]);

    // Pagination dynamique : 4 sur page 1, puis 8 par page sur pages 2-3
    const { paginatedDepartures, actualTotalPages } = React.useMemo(() => {
        if (departures.length === 0) {
            return { paginatedDepartures: [], actualTotalPages: 1 };
        }

        let items = [];
        let pages = 1;

        if (currentPage === 1) {
            // Première page : 4 horaires max
            items = departures.slice(0, 4);
            const remaining = departures.length - 4;
            if (remaining > 0) {
                pages = 1 + Math.ceil(remaining / 8);
                pages = Math.min(pages, 3);
            }
        } else if (currentPage === 2) {
            // Deuxième page : horaires 5-12 (8 max)
            items = departures.slice(4, 12);
            pages = departures.length > 12 ? 3 : 2;
        } else {
            // Troisième page : horaires 13-20 (8 max)
            items = departures.slice(12, 20);
            pages = 3;
        }

        return { paginatedDepartures: items, actualTotalPages: pages };
    }, [departures, currentPage]);

    if (loading) {
        return (
            <div className="afl-display">
                <div className="afl-header">
                    <div className="header-left">
                        <div className="train-icon">🚂</div>
                        <div className="header-title">{typeParam === 'arrivees' ? 'Arrivées' : 'Départs'}</div>
                    </div>
                    <div className="header-center">
                        <div className="pagination">
                            {Array.from({ length: totalPages }, (_, i) => (
                                <span key={i + 1} className={`page-indicator ${currentPage === i + 1 ? 'active' : ''}`}>
                                    {i + 1}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="header-right">
                        <div className="current-time">{formatTime(currentTime)}</div>
                    </div>
                </div>
                <div className="departures-list" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem'}}>
                    Chargement des horaires...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="afl-display">
                <div className="afl-header">
                    <div className="header-left">
                        <div className="train-icon">🚂</div>
                        <div className="header-title">{typeParam === 'arrivees' ? 'Arrivées' : 'Départs'}</div>
                    </div>
                    <div className="header-center">
                        <div className="pagination">
                            {Array.from({ length: totalPages }, (_, i) => (
                                <span key={i + 1} className={`page-indicator ${currentPage === i + 1 ? 'active' : ''}`}>
                                    {i + 1}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="header-right">
                        <div className="current-time">{formatTime(currentTime)}</div>
                    </div>
                </div>
                <div className="departures-list" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: '#FF6B6B'}}>
                    Erreur: {error}
                </div>
            </div>
        );
    }

    return (
        <div className="afl-display afficheur-root">
            {/* En-tête */}
            <div className="afl-header">
                <div className="header-left">
                    <div className="train-icon">🚂</div>
                    <div className="header-title">{typeParam === 'arrivees' ? 'Arrivées' : 'Départs'}</div>
                </div>
                <div className="header-center">
                    <div className="pagination">
                        {Array.from({ length: actualTotalPages }, (_, i) => (
                            <span
                                key={i + 1}
                                className={`page-indicator ${currentPage === i + 1 ? 'active' : ''}`}
                            >
                                {i + 1}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="header-right">
                    <div className="current-time">{formatTime(currentTime)}</div>
                </div>
            </div>

            {/* Liste des départs */}
            <div className="departures-list">
                {paginatedDepartures.length === 0 ? (
                    <div className="empty-message">
                        Aucun {typeParam === 'arrivees' ? 'train en arrivée' : 'départ'} prévu
                    </div>
                ) : (
                    paginatedDepartures.map((departure, index) => (
                        <div key={index} className="departure-row">
                            <div className="time-section">
                                <div className="departure-time">
                                    {typeParam === 'arrivees' ? departure.arrival_time : departure.departure_time}
                                </div>
                                <div className="status-check">
                                    <div className="check-circle">
                                        <span className="check-icon">✓</span>
                                    </div>
                                    <span className="status-text">{departure.status}</span>
                                </div>
                            </div>

                            <div className="train-info">
                                <div className="train-type">{departure.train_type}</div>
                                <div className="train-number">{departure.train_number}</div>
                            </div>

                            <div className="destination-section">
                                <div className="destination-main">
                                    {departure.isBus && <span className="bus-icon">🚌</span>}
                                    {departure.destination}
                                </div>
                                {departure.via && (
                                    <div className="via-stations">
                                        {departure.via}
                                    </div>
                                )}
                            </div>

                            <div className="voie-section">
                                {departure.isBus ? (
                                    <div className="voie-display">
                                        <div className="bus-platform">
                                            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>
                                            </svg>
                                        </div>
                                    </div>
                                ) : departure.voie ? (
                                    <div className="voie-display">
                                        <div className="voie-number-large">
                                            <div className="voie-label">Voie</div>
                                            <div className="voie-number">{departure.voie}</div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
