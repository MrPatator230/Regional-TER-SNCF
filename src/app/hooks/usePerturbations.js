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

    async function fetchPerturbations() {
      try {
        setLoading(true);
        const res = await fetch('/api/perturbations/public');

        if (!res.ok) {
          throw new Error('Erreur lors de la récupération des perturbations');
        }

        const data = await res.json();

        if (isMounted) {
          setPerturbations(data.perturbations || []);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Une erreur est survenue');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchPerturbations();

    return () => {
      isMounted = false;
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
