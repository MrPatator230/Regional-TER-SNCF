// Utilitaires centralisés pour la gestion des perturbations (overrides)
// Fournit: normalisation reroute, diff de parcours, hash stable

function pad2(n){ return String(n).padStart(2,'0'); }
function isTime(v){ return /^([0-1]\d|2[0-3]):([0-5]\d)$/.test(v||''); }

export function normalizeTime(raw){ if(!raw) return null; const m=String(raw).match(/^\s*(\d{1,2}):(\d{1,2})\s*$/); if(!m) return null; let h=+m[1], mi=+m[2]; if(h>23||mi>59) return null; return pad2(h)+':'+pad2(mi); }

export function normalizeReroutePayload(raw){
  if(!raw || typeof raw!=='object') return null;
  const out={ version:1, generated_at: new Date().toISOString() };
  if(raw.departure) out.departure=String(raw.departure).trim().slice(0,190);
  if(raw.arrival) out.arrival=String(raw.arrival).trim().slice(0,190);
  if(Array.isArray(raw.stops)){
    const stops=[]; for(const st of raw.stops.slice(0,200)){
      if(!st||typeof st!=='object') continue;
      const station=String(st.station||st.station_name||'').trim().slice(0,190); if(!station) continue;
      const arrival=normalizeTime(st.arrival||st.arrival_time||'');
      const departure=normalizeTime(st.departure||st.departure_time||'');
      stops.push({ station_name: station, arrival_time: arrival, departure_time: departure });
    }
    out.stops=stops;
  } else { out.stops=[]; }
  return out;
}

// Diff entre deux listes de stops normalisées (station_name, arrival_time, departure_time)
export function computeRouteDiff(original=[], modified=[]){
  const o = Array.isArray(original)? original:[];
  const m = Array.isArray(modified)? modified:[];
  const oNames=o.map(s=>s.station_name.toLowerCase());
  const mNames=m.map(s=>s.station_name.toLowerCase());
  const removed = o.filter(s=> !mNames.includes(s.station_name.toLowerCase())).map(s=> s.station_name);
  const added = m.filter(s=> !oNames.includes(s.station_name.toLowerCase())).map(s=> s.station_name);
  // reordered si ensembles identiques mais ordre différent
  let reordered=false;
  if(!removed.length && !added.length){
    const seqO = o.map(s=>s.station_name.toLowerCase()).join('>');
    const seqM = m.map(s=>s.station_name.toLowerCase()).join('>');
    reordered = seqO!==seqM;
  }
  const timesChanged=[];
  const mapO=new Map(o.map(s=>[s.station_name.toLowerCase(), s]));
  for(const st of m){
    const prev = mapO.get(st.station_name.toLowerCase());
    if(prev){
      const diffFields=[];
      if(prev.arrival_time!==st.arrival_time) diffFields.push('arrival');
      if(prev.departure_time!==st.departure_time) diffFields.push('departure');
      if(diffFields.length) timesChanged.push({ station: st.station_name, fields: diffFields });
    }
  }
  return { added, removed, reordered, timesChanged };
}

// Hash stable (JSON trié) – suffisant pour détection modification UI
export function stableHash(value){
  function sortObj(v){
    if(Array.isArray(v)) return v.map(sortObj);
    if(v && typeof v==='object'){
      return Object.keys(v).sort().reduce((acc,k)=>{ acc[k]=sortObj(v[k]); return acc; },{});
    }
    return v;
  }
  const json = JSON.stringify(sortObj(value));
  // simple FNV-1a 32 bits
  let h=0x811c9dc5; for(let i=0;i<json.length;i++){ h ^= json.charCodeAt(i); h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0; }
  return ('0000000'+h.toString(16)).slice(-8);
}

export function buildOverrideHash(ov){
  if(!ov) return null;
  const base={ action: ov.action };
  if(ov.action==='delay') Object.assign(base,{ delay_from_station: ov.delay_from_station||null, delay_minutes: ov.delay_minutes||0 });
  if(ov.action==='cancel') Object.assign(base,{ cancel: true });
  if(ov.action==='reroute'){
    const r=ov.reroute||{}; base.reroute={ departure:r.departure||null, arrival:r.arrival||null, stops:(Array.isArray(r.stops)? r.stops.map(s=>({ s: s.station_name||s.station||'', a:s.arrival_time||s.arrival||null, d:s.departure_time||s.departure||null })):[]) };
  }
  return stableHash(base);
}

