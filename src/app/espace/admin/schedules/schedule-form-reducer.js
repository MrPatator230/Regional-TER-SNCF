// Reducer de formulaire de sillon (horaires)
// Objectif: centraliser mutations + suivi du diff

export const initialFormState = {
  original: null, // snapshot DTO complet (camelCase)
  general: { ligneId:'', departureStation:'', arrivalStation:'', departureTime:'', arrivalTime:'', trainNumber:'', trainType:'' },
  stops: [],
  days: { selected:[0,1,2,3,4], holidays:false, sundays:false, custom:false, customDates:'' },
  rollingStock: '',
  dirty: false,
  lastSavedAt: null
};

function shallowEqual(a,b){ if(a===b) return true; if(!a||!b) return false; const ka=Object.keys(a); const kb=Object.keys(b); if(ka.length!==kb.length) return false; return ka.every(k=> a[k]===b[k]); }

export function computeDiff(state){ if(!state.original) return {}; const diff={}; const o=state.original; const g=state.general; function add(path,val){ diff[path]=val; }
  if(String(o.ligneId||'') !== String(g.ligneId||'')) add('ligneId',{from:o.ligneId,to:g.ligneId});
  ['departureStation','arrivalStation','departureTime','arrivalTime','trainNumber','trainType'].forEach(k=>{ if((o[k]||'') !== (g[k]||'')) add(k,{from:o[k],to:g[k]}); });
  if((o.rollingStock||'') !== (state.rollingStock||'')) add('rollingStock',{from:o.rollingStock,to:state.rollingStock});
  if(!!o.isSubstitution !== !!state.isSubstitution) add('isSubstitution',{from:!!o.isSubstitution,to:!!state.isSubstitution});
  // stops diff simple (par longueur + toute modif index)
  if(o.stops?.length !== state.stops.length){ add('stops.length',{from:o.stops?.length||0,to:state.stops.length}); }
  else { state.stops.forEach((s,i)=>{ const os=o.stops[i]; if(!os || os.station!==s.station || (os.arrival||'')!== (s.arrival||'') || (os.departure||'')!==(s.departure||'')) add(`stops[${i}]`,{from:os,to:s}); }); }
  // days
  const daysChanged = JSON.stringify({selected:o.days?.selected,holidays:o.days?.holidays,sundays:o.days?.sundays,custom:o.days?.custom,customDates:o.customDates?.join?.(',')||''}) !== JSON.stringify({selected:state.days.selected,holidays:state.days.holidays,sundays:state.days.sundays,custom:state.days.custom,customDates:state.days.customDates});
  if(daysChanged) add('days',{from:o.days,to:state.days});
  return diff;
}

export function scheduleFormReducer(state, action){ switch(action.type){
  case 'RESET': return { ...initialFormState, original:null };
  case 'LOAD_FROM_DTO': { const dto=action.payload; return { ...state, original: dto, general:{ ligneId: String(dto.ligneId||'')||'', departureStation:dto.departureStation||'', arrivalStation:dto.arrivalStation||'', departureTime:dto.departureTime||'', arrivalTime:dto.arrivalTime||'', trainNumber:dto.trainNumber||'', trainType:dto.trainType||'' }, stops: dto.stops?.map(s=>({ station:s.station, arrival:s.arrival||'', departure:s.departure||'' }))||[], days: { ...(dto.days||{selected:[],holidays:false,sundays:false,custom:false}), customDates: (dto.customDates||[]).join(',') }, rollingStock: dto.rollingStock||'', isSubstitution: !!dto.isSubstitution, dirty:false, lastSavedAt: Date.now() }; }
  case 'SET_GENERAL': return { ...state, general:{ ...state.general, ...action.payload }, dirty:true };
  case 'SET_STOPS': return { ...state, stops: action.payload, dirty:true };
  case 'SET_DAYS': return { ...state, days:{ ...state.days, ...action.payload }, dirty:true };
  case 'SET_ROLLING': return { ...state, rollingStock: action.payload, dirty:true };
  case 'SET_SUBSTITUTION': return { ...state, isSubstitution: !!action.payload, dirty:true };
  case 'APPLY_SAVED_DTO': { const dto=action.payload; return { ...state, original:dto, dirty:false, lastSavedAt: Date.now() }; }
  default: return state;
 } }
