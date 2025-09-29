// Petit test pour valider la logique de parsing de days_mask_list
// Vérifie que les formats suivants sont correctement interprétés :
// - tableau [1,2]
// - chaîne '1;2;3'
// - chaîne binaire '1010101' (ordre lundi..dimanche)
// - nombre entier bitmask (LSB = lundi)

function runsOnDateMaskOnly(item, date){
  if(!item) return false;
  const jsDay = date.getDay(); // 0=Sunday,1=Monday ..
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1; // 0=Monday..6=Sunday
  try{
    const maskCandidates = item.days_mask_list ?? item.daysMaskList ?? item.days_mask ?? item.daysMask ?? item.daysmask ?? item.daysMaskInt ?? null;
    if(maskCandidates !== null && maskCandidates !== undefined){
      const numForApi = dayIndex + 1; // 1=Monday ... 7=Sunday
      if(Array.isArray(maskCandidates)){
        const normalized = maskCandidates.map(s=>String(s).trim());
        if(normalized.includes(String(numForApi))) return true;
      }else if(typeof maskCandidates === 'string'){
        const sMask = maskCandidates.trim();
        if(/^[01]{7}$/.test(sMask)){
          if(sMask[dayIndex] === '1') return true;
        }else if(/[;,]/.test(sMask)){
          const parts = sMask.split(/[;,]/).map(p=>p.trim()).filter(Boolean);
          if(parts.includes(String(numForApi))) return true;
        }else if(/^[1-7]$/.test(sMask)){
          // single-digit string indicating a day (1=Mon ... 7=Sun)
          if(sMask === String(numForApi)) return true;
         }else{
           const asNum = Number(sMask);
           if(!Number.isNaN(asNum)){
             if(((asNum >> dayIndex) & 1) === 1) return true;
           }
         }
      }else if(typeof maskCandidates === 'number'){
        if(((maskCandidates >> dayIndex) & 1) === 1) return true;
      }
    }
  }catch(e){
    console.error('parse error', e);
  }
  return false;
}

function dateForWeekday(weekday){
  // weekday: 1=Monday ... 7=Sunday -> build a date in 2025 September where 2025-09-29 is Monday
  // find a Monday reference: 2025-09-29 is Monday
  const base = new Date('2025-09-29T00:00:00Z');
  const delta = (weekday - 1); // 0..6
  const d = new Date(base);
  d.setUTCDate(base.getUTCDate() + delta);
  return d;
}

const cases = [
  {name: "array [7]", item: {days_mask_list: [7]}},
  {name: "string '7'", item: {days_mask_list: '7'}},
  {name: "semicolon '1;2;3'", item: {days_mask_list: '1;2;3'}},
  {name: "comma '1,2,3'", item: {days_mask_list: '1,2,3'}},
  {name: "binary '1010101'", item: {days_mask_list: '1010101'}},
  {name: "number 5 (bitmask) -> bits 101 -> Mon+Wed", item: {days_mask_list: 5}},
  {name: "string number '5'", item: {days_mask_list: '5'}},
  {name: "number 64 (bit for Sunday)", item: {days_mask_list: 64}},
];

function weekdayNameFromIndex(idx){
  const names = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return names[idx];
}

for(const c of cases){
  console.log('\nCase:', c.name, JSON.stringify(c.item.days_mask_list));
  for(let wd=1; wd<=7; wd++){
    const d = dateForWeekday(wd);
    const ok = runsOnDateMaskOnly(c.item, d);
    process.stdout.write(`${weekdayNameFromIndex(wd-1)}:${ok? 'Y' : 'N'} `);
  }
  console.log('');
}

// Expectations (human readable):
// - array [7] and '7' -> only Sun Y on Sun
// - '1;2;3' -> Mon Tue Wed
// - '1010101' -> positions Mon..Sun: 1,0,1,0,1,0,1 => Mon,Y Tue,N Wed,Y Thu,N Fri,Y Sat,N Sun,Y
// - number 5 (binary 101) -> bit0=1 (Mon), bit2=1 (Wed) -> Mon Y, Wed Y
// - number 64 -> bit6 -> Sunday Y

console.log('\nDone.');
