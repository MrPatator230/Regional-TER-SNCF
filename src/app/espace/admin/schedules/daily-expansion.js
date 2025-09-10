// Expansion quotidienne des sillons en fonction de leurs jours de circulation
// Objectif: fournir une base pour la refonte "division des horaires par jour".
// Cette couche est purement côté client pour l'instant.

// days structure attendue: { selected:[0..6], holidays:false, sundays:false, custom:false, customDates:[], ... }
// selected: indices 0=lundi .. 6=dimanche

function parseDays(raw){
  if(!raw) return { selected:[], holidays:false, sundays:false, custom:false, customDates:[] };
  if(typeof raw === 'string'){
    try { raw = JSON.parse(raw); } catch { return { selected:[], holidays:false, sundays:false, custom:false, customDates:[] }; }
  }
  const customDates = raw.customDates || raw.custom_dates || raw.custom_dates_list || [];
  return { selected: Array.isArray(raw.selected)? raw.selected : [], holidays: !!raw.holidays, sundays: !!raw.sundays, custom: !!raw.custom, customDates };
}

function runsOnDate(schedule, dateStr){
  const d = new Date(dateStr+"T00:00:00"); if(isNaN(d)) return false;
  const jsDay = d.getDay(); // 0=dimanche
  const idx = (jsDay+6)%7; // remet lundi=0
  const days = parseDays(schedule.days);
  if(days.custom){
    return Array.isArray(days.customDates) && days.customDates.includes(dateStr);
  }
  return days.selected.includes(idx);
}

export function expandSchedulesForDate(schedules, dateStr){
  if(!dateStr) return [];
  return (schedules||[]).filter(s => runsOnDate(s, dateStr)).map(s => ({
    // daily instance id (virtuel)
    dailyId: `${s.id}@${dateStr}`,
    date: dateStr,
    baseId: s.id,
    ...s
  }));
}

export function expandSchedulesForRange(schedules, startDateStr, daysCount=7){
  const list=[]; if(!startDateStr) return list;
  const start = new Date(startDateStr+"T00:00:00"); if(isNaN(start)) return list;
  for(let i=0;i<daysCount;i++){
    const d = new Date(start.getTime()+i*86400000);
    const dateStr = d.toISOString().slice(0,10);
    list.push(...expandSchedulesForDate(schedules, dateStr));
  }
  return list;
}

// Hook simple (pas de cache avancé pour l'instant) --------------------
import { useMemo } from 'react';
export function useDailySchedules(date, schedules){
  return useMemo(()=> expandSchedulesForDate(schedules, date), [date, schedules]);
}
export function useDailyRange(startDate, daysCount, schedules){
  return useMemo(()=> expandSchedulesForRange(schedules, startDate, daysCount), [startDate, daysCount, schedules]);
}
