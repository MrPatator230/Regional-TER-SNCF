"use client";
import { useState, useEffect, useCallback } from 'react';

/**
 * Hook pour récupérer les perturbations actives
 * @returns {Object} { perturbations, loading, error, getPerturbationsForLine }
 */
export function usePerturbations() {
  const [perturbations, setPerturbations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Récupère toutes les perturbations actives
  useEffect(() => {
    let isMounted = true;
    let pollId = null;
    let lastPayload = null;

    async function fetchPerturbations() {
      try {
        // Récupérer simultanément les perturbations publiques et les variantes quotidiennes
        const [rPublic, rDaily] = await Promise.all([
          fetch('/api/perturbations/public'),
          fetch('/api/perturbations/daily?days=3')
        ]);
        if (!rPublic.ok) throw new Error('Erreur lors de la récupération des perturbations publiques');
        if (!rDaily.ok) {
          // on tolère l'absence de daily, on utilisera uniquement public
          const pub = await rPublic.json();
          const payload = JSON.stringify(pub?.perturbations || []);
          if (isMounted && payload !== lastPayload) {
            lastPayload = payload;
            setPerturbations(pub.perturbations || []);
            setError(null);
            if (typeof window !== 'undefined' && window.dispatchEvent) {
              try { window.dispatchEvent(new CustomEvent('perturbations:updated', { detail: { at: Date.now() } })); } catch(e) { /* silenced */ }
            }
          }
          return;
        }
        const dataPub = await rPublic.json();
        const dataDaily = await rDaily.json();
        const publicList = Array.isArray(dataPub?.perturbations) ? dataPub.perturbations : (dataPub || []);
        const dailyList = Array.isArray(dataDaily?.perturbations) ? dataDaily.perturbations : (dataDaily || []);

        // merge publicList + dailyList, en évitant les doublons basés sur schedule_id/sillon_id + date
        const merged = Array.isArray(publicList) ? [...publicList] : [];
        const seenDailyKeys = new Set();
        // construire set des clefs déjà présentes dans public (schedule_id/date)
        for (const p of merged) {
          const sid = p.schedule_id ?? p.sillon_id ?? p.sillonId ?? null;
          const date = p.date ?? p.day ?? null;
          if (sid && date) seenDailyKeys.add(`${sid}_${date}`);
        }
        for (const d of dailyList) {
          const sid = d.schedule_id ?? d.sillon_id ?? d.sillonId ?? null;
          const date = d.date ?? null;
          const key = sid && date ? `${sid}_${date}` : null;
          if (key && seenDailyKeys.has(key)) {
            // déjà présent dans public (éviter duplication)
            continue;
          }
          // Normaliser quelques champs pour la compatibilité côté client
          const norm = {
            // garder la trace brute
            ...d,
            // double nommage pour compatibilité
            sillon_id: d.schedule_id ?? d.sillon_id ?? d.sillonId ?? null,
            schedule_id: d.schedule_id ?? d.sillon_id ?? d.sillonId ?? null,
            // id string pour éviter conflit simple
            id: d.id != null ? (`daily-${d.id}`) : (d.id || null),
          };
          merged.push(norm);
          if (key) seenDailyKeys.add(key);
        }

        const payload = JSON.stringify(merged || []);
        // Ne pas rerendre si identique
        if (isMounted && payload !== lastPayload) {
          lastPayload = payload;
          setPerturbations(merged || []);
          setError(null);
          // Dispatch d'un événement global pour que d'autres parties de l'app puissent se réactualiser
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            try { window.dispatchEvent(new CustomEvent('perturbations:updated', { detail: { at: Date.now() } })); } catch(e) { /* silenced */ }
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Une erreur est survenue');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    // Chargement initial
    fetchPerturbations();
    // Polling périodique (tous les 60s)
    pollId = setInterval(() => fetchPerturbations(), 60000);

    return () => {
      isMounted = false;
      if (pollId) clearInterval(pollId);
    };
  }, []);

  function toDate(d){
    if(!d) return null;
    if(d instanceof Date) return d;
    try { return new Date(String(d)); } catch { return null; }
  }

  /**
   * Vérifie si une date est dans la période spécifiée (incluant banner_days_before si défini)
   * @param {Date|string|null} date - Date à vérifier
   * @param {Object} perturbation - Objet perturbation avec date_debut et date_fin
   * @returns {boolean} True si la date est dans la période
   */
  function isDateInPeriod(date, perturbation) {
    if (!perturbation) return false;

    const targetDate = toDate(date) || new Date();
    const todayIdx = targetDate.getDay(); // 0 (dimanche) à 6 (samedi)
    const joursSemaine = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const jourActuel = joursSemaine[todayIdx];

    // Si la perturbation a des jours spécifiques et qu'aujourd'hui n'en fait pas partie, pas de perturbation
    if (perturbation.data?.jours && perturbation.data.jours.length > 0) {
      if (!perturbation.data.jours.includes(jourActuel)) {
        return false;
      }
    }

    const startDate = perturbation.date_debut ? new Date(perturbation.date_debut) : null;
    const endDate = perturbation.date_fin ? new Date(perturbation.date_fin) : null;

    // Appliquer l'option banner_days_before si présente (affichage en avance)
    const daysBefore = Math.max(0, Number(perturbation?.data?.banner_days_before) || 0);
    const startFloor = startDate ? new Date(startDate) : null;
    if (startFloor) startFloor.setDate(startFloor.getDate() - daysBefore);

    // Si aucune date n'est définie, la perturbation est toujours active
    if (!startDate && !endDate) {
      return true;
    }

    // Vérifier si on est après la date de début (ou la date de début - jours avant si banner)
    const afterStart = !(startFloor) || targetDate >= startFloor;

    // Vérifier si on est avant la date de fin (ou pas de date de fin)
    const beforeEnd = !endDate || targetDate <= endDate;

    return afterStart && beforeEnd;
  }

  /**
   * Vérifie si une heure est dans la plage horaire de la perturbation
   * Si banner_all est actif, on ignore le filtrage horaire pour afficher le bandeau sur tous les sillons
   * @param {string} time - Heure au format HH:MM
   * @param {Object} perturbation - Objet perturbation
   * @returns {boolean} True si l'heure est dans la plage
   */
  function isTimeInRange(time, perturbation) {
    if (!perturbation) return true;
    // Bandeau global: ne pas restreindre par heure
    if (perturbation?.data?.banner_all) return true;
    if (!time) return true;
    if (!perturbation.data?.horaire_interruption) return true;

    const { debut, fin } = perturbation.data.horaire_interruption;
    if (!debut || !fin) return true;

    // Convertir en minutes depuis minuit pour comparaison facile
    const timeMinutes = convertTimeToMinutes(time);
    const startMinutes = convertTimeToMinutes(debut);
    const endMinutes = convertTimeToMinutes(fin);

    // Gérer le cas où la période couvre minuit (ex: 22:00 - 06:00)
    if (startMinutes > endMinutes) {
      // La période passe par minuit
      return timeMinutes >= startMinutes || timeMinutes <= endMinutes;
    } else {
      // Période normale
      return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
    }
  }

  /**
   * Convertit une heure format HH:MM en minutes depuis minuit
   */
  function convertTimeToMinutes(time) {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + (minutes || 0);
  }

  /**
   * Récupère les perturbations pour une ligne spécifique
   * @param {number} ligneId - ID de la ligne
   * @param {string} time - Heure du train (optionnel, pour filtrer par horaire)
   * @param {Date|string|null} date - Date du train (optionnel, pour filtrer par date)
   * @returns {Array} Tableau des perturbations concernant cette ligne
   */
  const getPerturbationsForLine = useCallback((ligneId, time = null, date = null) => {
    if (!ligneId || !perturbations.length) return [];

    return perturbations.filter(p => {
      // Vérifier que la perturbation concerne bien cette ligne
      const matchesLine = p.ligne_id === Number(ligneId);

      // Vérifier que la perturbation est active aujourd'hui ou à la date spécifiée (avec banner_days_before pris en compte)
      const isActive = isDateInPeriod(date, p);

      // Vérifier que l'heure du train est dans la plage horaire concernée par la perturbation
      const inTimeRange = isTimeInRange(time, p);

      return matchesLine && isActive && inTimeRange;
    });
  }, [perturbations]);

  return {
    perturbations,
    loading,
    error,
    getPerturbationsForLine
  };
}
