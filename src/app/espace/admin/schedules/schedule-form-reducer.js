// Reducer de formulaire de sillon (horaires)
// Objectif: centraliser mutations + suivi du diff

export const initialFormState = {
  original: null, // snapshot DTO complet (camelCase)
  general: { ligneId:'', departureStation:'', arrivalStation:'', departureTime:'', arrivalTime:'', trainNumber:'', trainType:'' },
  stops: [],
  // days.selected en UI = format serveur 1..7 (1 = Lundi, 7 = Dimanche)
  // Par défaut : Lundi..Vendredi => 1..5
  days: { selected:[1,2,3,4,5], holidays:false, sundays:false, custom:false, customDates:'' },
  rollingStock: '',
  dirty: false,
  lastSavedAt: null
};

// Convertit un tableau de jours venant du serveur ou de l'UI en format serveur 1..7
function normalizeDaysToServer(selected){
  // Retourne un tableau trié de valeurs 1..7 (1=Lun .. 7=Dim)
  if(!Array.isArray(selected)) return [];
  const out = new Set();
  for(const v of selected){
    const n = Number(v);
    if(!Number.isFinite(n)) continue;
    // Si le tableau contient déjà 1..7
    if(n >= 1 && n <= 7){ out.add(n); }
    // Si le tableau contient 0..6 (ancien format client), convertir vers 1..7
    else if(n >= 0 && n <= 6){ out.add(n + 1); }
  }
  return Array.from(out).sort((a,b)=>a-b);
}

export function computeDiff(state){ if(!state.original) return {}; const diff={}; const o=state.original; const g=state.general; function add(path,val){ diff[path]=val; }
  if(String(o.ligneId||'') !== String(g.ligneId||'')) add('ligneId',{from:o.ligneId,to:g.ligneId});
  ['departureStation','arrivalStation','departureTime','arrivalTime','trainNumber','trainType'].forEach(k=>{ if((o[k]||'') !== (g[k]||'')) add(k,{from:o[k],to:g[k]}); });
  if((o.rollingStock||'') !== (state.rollingStock||'')) add('rollingStock',{from:o.rollingStock,to:state.rollingStock});
  if(!!o.isSubstitution !== !!state.isSubstitution) add('isSubstitution',{from:!!o.isSubstitution,to:!!state.isSubstitution});
  // stops diff simple (par longueur + toute modif index)
  if(o.stops?.length !== state.stops.length){ add('stops.length',{from:o.stops?.length||0,to:state.stops.length}); }
  else { state.stops.forEach((s,i)=>{ const os=o.stops[i]; if(!os || os.station!==s.station || (os.arrival||'')!== (s.arrival||'') || (os.departure||'')!==(s.departure||'')) add(`stops[${i}]`,{from:os,to:s}); }); }
  // days
  // comparer en normalisant l'original si nécessaire (original.days peut être au format 0..6 ou 1..7)
  const originalDaysSelected = Array.isArray(o.days?.selected) ? normalizeDaysToServer(o.days.selected) : o.days?.selected || [];
  const currentDaysSelected = Array.isArray(state.days?.selected) ? normalizeDaysToServer(state.days.selected) : state.days?.selected || [];
  const daysChanged = JSON.stringify({selected:originalDaysSelected,holidays:o.days?.holidays,sundays:o.days?.sundays,custom:o.days?.custom,customDates:o.customDates?.join?.(',')||''}) !== JSON.stringify({selected:currentDaysSelected,holidays:state.days.holidays,sundays:state.days.sundays,custom:state.days.custom,customDates:state.days.customDates});
  if(daysChanged) add('days',{from:o.days,to:state.days});
  return diff;
}

export function scheduleFormReducer(state, action){ switch(action.type){
  case 'RESET': return { ...initialFormState, original:null };
  case 'LOAD_FROM_DTO': { const dto=action.payload;
    // Normaliser les jours venant du DTO (serveur utilise 1..7), UI attend 1..7 également
    const dtoDays = dto.days || { selected:[], holidays:false, sundays:false, custom:false };
    const serverSelected = normalizeDaysToServer(dtoDays.selected || dto.days?.selected || dto.days?.selected || []);
    // stocker `original` en conservant le DTO mais en normalisant days.selected au format serveur 1..7
    const normalizedOriginal = { ...dto, days: { ...(dto.days||{}), selected: serverSelected } };
    return { ...state, original: normalizedOriginal, general:{ ligneId: String(dto.ligneId||'')||'', departureStation:dto.departureStation||'', arrivalStation:dto.arrivalStation||'', departureTime:dto.departureTime||'', arrivalTime:dto.arrivalTime||'', trainNumber:dto.trainNumber||'', trainType:dto.trainType||'' }, stops: dto.stops?.map(s=>({ station:s.station, arrival:s.arrival||'', departure:s.departure||'' }))||[], days: { selected: serverSelected, holidays: !!dtoDays.holidays, sundays: !!dtoDays.sundays, custom: !!dtoDays.custom, customDates: (dto.customDates||dto.custom_dates||[]).join(',') }, rollingStock: dto.rollingStock||'', isSubstitution: !!dto.isSubstitution, dirty:false, lastSavedAt: Date.now() };
  }
  case 'SET_GENERAL': return { ...state, general:{ ...state.general, ...action.payload }, dirty:true };
  case 'SET_STOPS': return { ...state, stops: action.payload, dirty:true };
  case 'SET_DAYS': return { ...state, days:{ ...state.days, ...action.payload }, dirty:true };
  case 'SET_ROLLING': return { ...state, rollingStock: action.payload, dirty:true };
  case 'SET_SUBSTITUTION': return { ...state, isSubstitution: !!action.payload, dirty:true };
  case 'APPLY_SAVED_DTO': { const dto=action.payload; return { ...state, original:dto, dirty:false, lastSavedAt: Date.now() }; }
  default: return state;
 } }
