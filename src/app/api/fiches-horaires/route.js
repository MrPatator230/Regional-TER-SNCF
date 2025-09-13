import { NextResponse } from 'next/server';
import { getSchedulesDb } from '@/js/db-schedule';
import fs from 'fs/promises';
import path from 'path';

// Forcer l'exécution côté Node (sinon Edge casse Buffer / fonts et le PDF peut s'afficher en texte)
export const runtime = 'nodejs';


function fromMask(mask){
  const out=[]; for(let i=0;i<7;i++){ if(mask & (1<<i)) out.push(i); } return out;
}

function mapScheduleRow(r){
  return {
    id: r.id,
    ligne_id: r.ligne_id,
    train_number: r.train_number,
    train_type: r.train_type,
    rolling_stock: r.rolling_stock,
    departure_station: r.departure_station,
    arrival_station: r.arrival_station,
    departure_time: r.departure_time,
    arrival_time: r.arrival_time,
    days: {
      selected: fromMask(r.days_mask||0),
      holidays: !!r.flag_holidays,
      sundays: !!r.flag_sundays,
      custom: !!r.flag_custom
    },
    isSubstitution: !!r.isSubstitution,
    stops_json: r.stops_json||'[]'
  };
}

function formatDays(d){
  if(!d) return '';
  const names=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const sel=(d.selected||[]).map(i=>names[i]).join(',');
  let extra=[]; if(d.holidays) extra.push('Fériés'); if(d.sundays) extra.push('Dimanches'); if(d.custom) extra.push('Dates');
  return [sel, ...extra].filter(Boolean).join(' / ');
}

async function buildPdf({ ligneId, orientation, tables, travaux, period }){
  // Nouvelle version multi-table. Pour rétrocompat on accepte si tables non fourni (utiliser ancienne signature)
  if(!tables){
    // rétrocompat single direction: reconstruire tables
    tables=[{ lineInfo: arguments[0].lineInfo, schedules: arguments[0].schedules }];
  }
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  let fontBytes=null, fontBoldBytes=null, fontMediumBytes=null;
  try {
    const baseDir = path.join(process.cwd(), 'src','fonts');
    fontBytes = await fs.readFile(path.join(baseDir,'avenir-book.woff')).catch(()=>null);
    fontBoldBytes = await fs.readFile(path.join(baseDir,'avenir-heavy.woff')).catch(()=>null);
    fontMediumBytes = await fs.readFile(path.join(baseDir,'avenir-medium.woff')).catch(()=>null);
  } catch {}
  const pdf = await PDFDocument.create();
  let avenir=null, avenirBold=null, avenirMedium=null;
  try {
    if(fontBytes){ const fontkit=(await import('fontkit')).default; pdf.registerFontkit(fontkit); avenir = await pdf.embedFont(fontBytes,{subset:true}); }
    if(fontBoldBytes){ if(!pdf._fontkit){ const fontkit=(await import('fontkit')).default; pdf.registerFontkit(fontkit);} avenirBold = await pdf.embedFont(fontBoldBytes,{subset:true}); }
    if(fontMediumBytes){ if(!pdf._fontkit){ const fontkit=(await import('fontkit')).default; pdf.registerFontkit(fontkit);} avenirMedium = await pdf.embedFont(fontMediumBytes,{subset:true}); }
  } catch {}
  const fontStd = await pdf.embedFont(StandardFonts.Helvetica);
  const fontStdBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  if(!avenir) avenir=fontStd; if(!avenirBold) avenirBold=fontStdBold; if(!avenirMedium) avenirMedium=avenir;

  const brandColor = rgb(11/255,39/255,64/255);
  const grayBg = rgb(245/255,247/255,250/255);
  const lineColor = rgb(200/255,205/255,210/255);
  const accent = rgb(0/255,108/255,190/255);

  const landscape = orientation==='landscape';
  const pageWidth = landscape? 842: 595;
  const pageHeight = landscape? 595: 842;
  const margin = 34;

  const pages=[];
  function newPage(){ const p = pdf.addPage([pageWidth,pageHeight]); pages.push(p); return p; }

  // Préparation stations et colonnes
  const stations = (tables[0]?.lineInfo?.stations && tables[0].lineInfo.stations.length)? tables[0].lineInfo.stations : (()=>{ // fallback: déduire des sillons
    const set=new Set();
    tables.forEach(t=> t.schedules.forEach(sc=>{ try { JSON.parse(sc.stops_json||'[]').forEach(s=> set.add(s.station_name||s.station)); } catch{}; set.add(sc.departure_station); set.add(sc.arrival_station); }));
    return Array.from(set).map((n,i)=> ({ id:i+1, name:n })).sort((a,b)=> a.name.localeCompare(b.name));
  })();
  const schedCols = tables[0]?.schedules;

  const cardPaddingX = 18;
  const cardPaddingTop = 56; // sous bandeaux
  const cardPaddingBottom = 110; // place légende

  const headerGlobalHeight = 110; // bandeaux + espace titre

  // Mesure largeur colonnes dynamique (min 48)
  const firstColWidth = 140;
  const usableWidth = pageWidth - margin*2 - cardPaddingX*2 - firstColWidth;
  const colWidth = Math.max(48, Math.min(90, usableWidth / Math.max(1,schedCols.length)));

  // Fonction rendu pages
  let page = newPage();

  function drawTop(p){
    // Bandeau principal
    const h1=48;
    p.drawRectangle({ x:0,y:pageHeight-h1,width:pageWidth,height:h1,color:brandColor });
    p.drawText('HORAIRES TER', { x: margin, y: pageHeight - 34, size:22, font: avenirBold, color: rgb(1,1,1) });
    const periodText = period?.start && period?.end ? `Applicables du ${period.start} au ${period.end}` : (period?.start? `Valable à partir du ${period.start}`: (period?.label||''));
    if(periodText){ p.drawText(periodText, { x: margin, y: pageHeight - 52, size:10, font: avenirMedium, color: rgb(1,1,1) }); }
    // Bandeau secondaire (diagramme)
    const h2=46; const y2 = pageHeight - h1 - h2;
    p.drawRectangle({ x:0,y:y2,width:pageWidth,height:h2,color:grayBg });
    const relation = tables[0]?.lineInfo ? `${tables[0].lineInfo.departName} > ${tables[0].lineInfo.arriveeName}` : '';
    if(relation){ p.drawText(relation, { x: margin, y: y2 + h2 - 28, size:18, font: avenirBold, color: brandColor }); }
    if(stations.length){
      const diagX = margin; const diagY = y2 + 18; const usableW = pageWidth - margin*2; const step = usableW / Math.max(1, stations.length-1);
      stations.forEach((s,idx)=>{
        const cx = diagX + idx*step;
        p.drawCircle({ x: cx, y: diagY, size:4, color: brandColor });
        if(idx<stations.length-1) p.drawLine({ start:{x:cx+4,y:diagY}, end:{x:cx+step-4,y:diagY}, thickness:1.2, color: brandColor });
        const label = s.name.length>18? s.name.slice(0,17)+'…': s.name;
        p.drawText(label, { x: cx-24, y: diagY-14, size:6, font: avenir, color: brandColor });
      });
    }
  }

  function drawPageFrame(p){
    // Ombre (simple) + carte blanche
    const cardTop = pageHeight - headerGlobalHeight - 10;
    const cardHeight = pageHeight - cardTop - margin + 10;
    // Ombre
    p.drawRectangle({ x: margin+2, y: margin-2, width: pageWidth - margin*2, height: cardTop - margin + 12, color: rgb(0,0,0), opacity:0.05 });
    // Fond
    p.drawRectangle({ x: margin, y: margin, width: pageWidth - margin*2, height: cardTop - margin + 10, color: rgb(1,1,1) });
    // Titre central au-dessus du tableau
    const relation = tables[0]?.lineInfo ? `${tables[0].lineInfo.departName.toUpperCase()} > ${tables[0].lineInfo.arriveeName.toUpperCase()}`: '';
    if(relation){ p.drawText(relation, { x: margin + cardPaddingX, y: cardTop - 24, size:16, font: avenirBold, color: brandColor }); }
    return { cardTop };
  }

  drawTop(page);
  const { cardTop } = drawPageFrame(page);

  const rowHeight = 16; // hauteur station
  const doubleHeaderH = 30; // 2 lignes

  let yCursor = cardTop - 50; // sous titre

  function printTableHeader(p){
    // Zone d’en-tête colonnes (double)
    const startX = margin + cardPaddingX;
    const tableWidth = firstColWidth + schedCols.length*colWidth;
    // Fond header
    p.drawRectangle({ x:startX, y: yCursor - doubleHeaderH, width: tableWidth, height: doubleHeaderH, color: grayBg });
    // Première colonne label
    p.drawText('Gare', { x: startX+6, y: yCursor - 13, size:9, font: avenirBold, color: brandColor });
    // Lignes séparation horizontales header
    p.drawLine({ start:{x:startX,y:yCursor - rowHeight}, end:{x:startX+tableWidth,y:yCursor - rowHeight}, thickness:0.5, color: lineColor });
    // Colonnes
    schedCols.forEach((sc,i)=>{
      const colX = startX + firstColWidth + i*colWidth;
      // Ligne verticale
      p.drawLine({ start:{x:colX, y:yCursor - doubleHeaderH}, end:{x:colX, y:yCursor}, thickness:0.5, color: lineColor });
      // Train number (ligne 1)
      const tn=(sc.train_number||'').toString();
      p.drawText(tn, { x: colX+4, y: yCursor - 12, size:8, font: avenirBold, color: brandColor });
      // Days (ligne 2)
      const daysStr = formatDays(sc.days)||'';
      p.drawText(daysStr.slice(0,24), { x: colX+4, y: yCursor - 25, size:6, font: avenir, color: rgb(60/255,60/255,60/255) });
    });
    // Bordure droite
    p.drawLine({ start:{x:startX+tableWidth, y:yCursor - doubleHeaderH}, end:{x:startX+tableWidth, y:yCursor}, thickness:0.5, color: lineColor });
    yCursor -= doubleHeaderH;
  }

  function newContentPage(){ page = newPage(); drawTop(page); const f = drawPageFrame(page); yCursor = f.cardTop - 50; printTableHeader(page); }

  printTableHeader(page);

  function ensureSpace(rowsNeeded){
    if(yCursor - rowsNeeded*rowHeight < margin + cardPaddingBottom){ newContentPage(); }
  }

  const startX = margin + cardPaddingX;
  const tableWidth = firstColWidth + schedCols.length*colWidth;

  stations.forEach((st, idx)=>{
    ensureSpace(1);
    const rowY = yCursor - rowHeight;
    // Fond alterné
    if(idx %2 ===1){ page.drawRectangle({ x:startX, y: rowY, width: tableWidth, height: rowHeight, color: rgb(250/255,252/255,253/255) }); }
    // Séparateur haut
    page.drawLine({ start:{x:startX, y: rowY+rowHeight}, end:{x:startX+tableWidth, y: rowY+rowHeight}, thickness:0.35, color: lineColor });
    // Nom gare
    const isEndpoint = st.id===tables[0]?.lineInfo?.stations?.[0]?.id || st.id===tables[0]?.lineInfo?.stations?.[tables[0].lineInfo.stations.length-1]?.id;
    page.drawText(st.name.slice(0,34), { x:startX+6, y: rowY + 4, size: isEndpoint?9:8, font: isEndpoint? avenirBold: avenir, color: isEndpoint? brandColor: rgb(20/255,20/255,20/255) });
    // Colonnes horaires
    schedCols.forEach((sc,i)=>{
      const colX = startX + firstColWidth + i*colWidth;
      let stops=[]; try { stops = JSON.parse(sc.stops_json||'[]'); } catch {}
      const stop = stops.find(s=> (s.station_name||s.station) === st.name);
      const arr = stop?.arrival_time||stop?.arrival||''; const dep = stop?.departure_time||stop?.departure||'';
      let text='';
      if(arr && dep && arr!==dep) text = arr + '/' + dep; else text = dep || arr || '';
      if(sc.departure_station===st.name) text = sc.departure_time || text;
      if(sc.arrival_station===st.name) text = sc.arrival_time || text;
      if(text){
        const isMain = isEndpoint;
        page.drawText(text, { x: colX+4, y: rowY + 4, size: isMain?8:7, font: isMain? avenirBold: avenir, color: accent });
      }
    });
    yCursor -= rowHeight;
  });
  // Dernière bordure bas
  page.drawLine({ start:{x:startX, y:yCursor}, end:{x:startX+tableWidth, y:yCursor}, thickness:0.6, color: lineColor });

  // Légende & travaux sur dernière page
  function drawLegendBlock(p){
    let baseY = margin + 70; // réserve pour logos / pagination
    const legendX = startX;
    // Travaux
    if(travaux && travaux.length){
      const blockH = 46 + Math.min(3,travaux.length)*10;
      p.drawRectangle({ x: legendX, y: baseY + 80, width: tableWidth, height: blockH, color: rgb(255/255,247/255,210/255) });
      p.drawText('Travaux / perturbations', { x: legendX+10, y: baseY + 80 + blockH - 18, size:10, font: avenirBold, color: rgb(170/255,110/255,0) });
      travaux.slice(0,3).forEach((t,i)=>{
        // Remplacement flèche unicode par ASCII '->'
        p.drawText('- ' + (t.titre||'Travaux') + (t.date_debut? ` (${t.date_debut.split('T')[0]} -> ${(t.date_fin||'').split('T')[0]})` : ''), { x: legendX+12, y: baseY + 80 + blockH - 32 - i*10, size:7, font: avenir, color: rgb(60/255,60/255,60/255) });
      });
    }
    // Légende symboles (dessin vectoriel pour éviter glyphes non WinAnsi)
    p.drawText('Légende', { x: legendX, y: baseY + 60, size:10, font: avenirBold, color: brandColor });
    const rowBase = baseY + 50;
    const lineSpacing = 10;
    const iconX = legendX + 4;
    // 1. Correspondance: double flèche horizontale dessinée
    const y1 = rowBase; p.drawLine({ start:{x:iconX, y:y1}, end:{x:iconX+12, y:y1}, thickness:1, color: rgb(70/255,70/255,70/255) });
    // pointes
    p.drawLine({ start:{x:iconX, y:y1}, end:{x:iconX+3, y:y1+2}, thickness:1, color: rgb(70/255,70/255,70/255) });
    p.drawLine({ start:{x:iconX, y:y1}, end:{x:iconX+3, y:y1-2}, thickness:1, color: rgb(70/255,70/255,70/255) });
    p.drawLine({ start:{x:iconX+12, y:y1}, end:{x:iconX+9, y:y1+2}, thickness:1, color: rgb(70/255,70/255,70/255) });
    p.drawLine({ start:{x:iconX+12, y:y1}, end:{x:iconX+9, y:y1-2}, thickness:1, color: rgb(70/255,70/255,70/255) });
    p.drawText('Correspondance', { x: iconX+18, y: y1-3, size:7, font: avenir, color: rgb(70/255,70/255,70/255) });
    // 2. Exception: petit carré avec * dessiné manuellement
    const y2 = rowBase - lineSpacing; p.drawRectangle({ x:iconX, y:y2-3, width:8, height:8, borderColor: rgb(70/255,70/255,70/255), color: rgb(1,1,1) });
    p.drawLine({ start:{x:iconX+1, y:y2+1}, end:{x:iconX+7, y:y2-1}, thickness:0.6, color: rgb(70/255,70/255,70/255) });
    p.drawLine({ start:{x:iconX+1, y:y2-1}, end:{x:iconX+7, y:y2+1}, thickness:0.6, color: rgb(70/255,70/255,70/255) });
    p.drawText('Exception / ne circule pas certains jours', { x: iconX+18, y: y2-3, size:7, font: avenir, color: rgb(70/255,70/255,70/255) });
    // 3. Travaux: triangle + !
    const y3 = rowBase - lineSpacing*2; // triangle base
    const triX = iconX+4; const triY = y3-3;
    p.drawLine({ start:{x:triX-4,y:triY}, end:{x:triX+4,y:triY}, thickness:0.8, color: rgb(170/255,110/255,0) });
    p.drawLine({ start:{x:triX-4,y:triY}, end:{x:triX,y:triY+7}, thickness:0.8, color: rgb(170/255,110/255,0) });
    p.drawLine({ start:{x:triX+4,y:triY}, end:{x:triX,y:triY+7}, thickness:0.8, color: rgb(170/255,110/255,0) });
    p.drawLine({ start:{x:triX,y:triY+1}, end:{x:triX,y:triY+5}, thickness:0.8, color: rgb(170/255,110/255,0) });
    p.drawLine({ start:{x:triX,y:triY}, end:{x:triX,y:triY}, thickness:1, color: rgb(170/255,110/255,0) });
    p.drawText('Travaux', { x: iconX+18, y: y3-3, size:7, font: avenir, color: rgb(70/255,70/255,70/255) });
    // Disclaimer
    p.drawText('Informations indicatives susceptibles de modifications. Verifiez avant le voyage.', { x: legendX, y: baseY + 12, size:6.5, font: avenirMedium, color: rgb(90/255,90/255,90/255) });
  }
  drawLegendBlock(page);

  // Logos (SNCF + TER) si disponibles
  try {
    const sncfPath = path.join(process.cwd(),'public','img','brand','sncf-logo.png');
    const sncfBytes = await fs.readFile(sncfPath).catch(()=>null);
    if(sncfBytes){ const sncfImg = await pdf.embedPng(sncfBytes); const pngW= sncfImg.width; const pngH= sncfImg.height; const scale=40/pngH; page.drawImage(sncfImg,{ x: pageWidth - margin - 50, y: margin + 10, width: pngW*scale, height: pngH*scale }); }
  } catch {}

  // Pagination + date génération
  const genTxt = `Généré le ${(new Date()).toLocaleDateString('fr-FR')} - Ligne ${ligneId}`;
  pages.forEach((p, idx)=>{
    const footerY = margin - 16;
    p.drawText(genTxt, { x: margin, y: footerY+4, size:6.5, font: avenir, color: rgb(120/255,120/255,120/255) });
    const pageLabel = `Page ${idx+1}/${pages.length}`;
    const textWidth = avenir.widthOfTextAtSize(pageLabel, 7);
    p.drawText(pageLabel, { x: (pageWidth - textWidth)/2, y: footerY+4, size:7, font: avenirMedium, color: rgb(120/255,120/255,120/255) });
  });

  return await pdf.save();
}
export { buildPdf }; // export pour tests éventuels

export async function GET(request){
  const { searchParams } = new URL(request.url);
  const ligneId = Number(searchParams.get('ligneId')||0);
  let orientation = (searchParams.get('orientation')||'portrait').toLowerCase();
  if(!['portrait','landscape'].includes(orientation)) orientation = 'portrait';
  const format = (searchParams.get('format')||'json').toLowerCase();
  const periodStart = searchParams.get('startDate')||''; // AAAA-MM-JJ
  const periodEnd = searchParams.get('endDate')||'';

  const direction = (searchParams.get('direction')||'forward').toLowerCase();
  const stationsParam = (searchParams.get('stations')||'').trim();
  let stationFilterIds = stationsParam? stationsParam.split(',').map(s=> Number(s.trim())).filter(n=> Number.isInteger(n)&& n>0) : [];

  if(!ligneId){
    return NextResponse.json({ error:'ligneId manquant' }, { status:400 });
  }

  const conn = await getSchedulesDb().getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT s.id, s.ligne_id, s.train_number, s.train_type, s.rolling_stock,
              ds.name AS departure_station, as2.name AS arrival_station,
              TIME_FORMAT(s.departure_time,'%H:%i') AS departure_time,
              TIME_FORMAT(s.arrival_time,'%H:%i') AS arrival_time,
              s.days_mask, s.flag_holidays, s.flag_sundays, s.flag_custom,
              s.is_substitution AS isSubstitution,
              s.stops_json AS stops_json
         FROM schedules s
         JOIN stations ds ON ds.id = s.departure_station_id
         JOIN stations as2 ON as2.id = s.arrival_station_id
        WHERE s.ligne_id=?
        ORDER BY s.departure_time ASC, s.id ASC`,
      [ligneId]
    );

    const schedules = rows.map(mapScheduleRow);

    if(format==='pdf'){
      // Infos ligne (ordre stations)
      let lineInfo=null; try {
        const [lineRows] = await conn.execute(`SELECT l.id, l.depart_station_id, l.arrivee_station_id, l.desservies, ds.name AS departName, as2.name AS arriveeName
          FROM lignes l
          JOIN stations ds ON ds.id=l.depart_station_id
          JOIN stations as2 ON as2.id=l.arrivee_station_id
          WHERE l.id=? LIMIT 1`, [ligneId]);
        if(lineRows.length){
          const lr = lineRows[0];
          let dess=[]; try { dess = JSON.parse(lr.desservies||'[]'); } catch { dess=[]; }
          dess = Array.isArray(dess)? dess: [];
          if(dess.length){
            const placeholders = dess.map(()=>'?').join(',');
            const [dessStations] = await conn.execute(`SELECT id,name FROM stations WHERE id IN (${placeholders})`, dess);
            const nameById={}; dessStations.forEach(r=>{ nameById[r.id]=r.name; });
            const stationSeq = [ lr.depart_station_id, ...dess, lr.arrivee_station_id ];
            lineInfo={ id: lr.id, departName: lr.departName, arriveeName: lr.arriveeName, stations: stationSeq.map(id=> ({ id, name: id===lr.depart_station_id? lr.departName: (id===lr.arrivee_station_id? lr.arriveeName: nameById[id]||('Gare '+id)) })) };
          } else {
            lineInfo={ id: lr.id, departName: lr.departName, arriveeName: lr.arriveeName, stations: [ {id:lr.depart_station_id,name:lr.departName}, {id:lr.arrivee_station_id,name:lr.arriveeName} ] };
          }
        }
      } catch {}

      // Ré-ordonnancement des gares basé sur la séquence réelle des arrêts (plus long trajet)
      if(lineInfo){
        const allSchedules = schedules; // déjà filtré par ligne
        let longestStops = [];
        let longestSchedule = null;
        for(const sc of allSchedules){
          let stops=[]; try { stops = JSON.parse(sc.stops_json||'[]'); } catch {}
          if(stops.length > longestStops.length){ longestStops = stops; longestSchedule = sc; }
        }
        if(longestSchedule && longestStops.length){
          const seqNamesRaw = [longestSchedule.departure_station, ...longestStops.map(s=> (s.station_name||s.station)).filter(Boolean), longestSchedule.arrival_station];
          const seen=new Set(); const seqNames=[]; // dédoublonnage en conservant l'ordre
          seqNamesRaw.forEach(n=>{ if(n && !seen.has(n)){ seen.add(n); seqNames.push(n); } });
          const indexByName={}; seqNames.forEach((n,i)=>{ indexByName[n]=i; });
          const depName=lineInfo.departName; const arrName=lineInfo.arriveeName;
          lineInfo.stations = [...lineInfo.stations].sort((a,b)=>{
            if(a.name===depName && b.name!==depName) return -1;
            if(b.name===depName && a.name!==depName) return 1;
            if(a.name===arrName && b.name!==arrName) return 1;
            if(b.name===arrName && a.name!==arrName) return -1;
            const ia = indexByName[a.name]; const ib = indexByName[b.name];
            if(ia==null && ib==null) return a.name.localeCompare(b.name);
            if(ia==null) return 1;
            if(ib==null) return -1;
            return ia-ib;
          });
        }
      }
      // Perturbations travaux
      let travaux=[]; try {
        const now = new Date();
        const [pertRows] = await conn.execute(`SELECT id, type, titre, description, DATE_FORMAT(date_debut,'%Y-%m-%dT%H:%i:%sZ') AS date_debut, DATE_FORMAT(date_fin,'%Y-%m-%dT%H:%i:%sZ') AS date_fin
          FROM perturbations WHERE ligne_id=? AND type='travaux' ORDER BY date_debut DESC LIMIT 5`, [ligneId]);
        travaux = pertRows;
      } catch{}
      const period={ start: periodStart||'', end: periodEnd||'', label: (periodStart||periodEnd)?'':'Période non spécifiée' };

      // filtrage stations
      let filteredForwardStations = lineInfo?.stations || [];
      if(stationFilterIds.length){
        const idSet = new Set(stationFilterIds);
        // toujours garder endpoints
        if(lineInfo?.stations?.length){ idSet.add(lineInfo.stations[0].id); idSet.add(lineInfo.stations[lineInfo.stations.length-1].id); }
        const tmp = filteredForwardStations.filter(st=> idSet.has(st.id));
        if(tmp.length>=2) filteredForwardStations = tmp; // sinon garde tout
      }
      const forwardLineInfo = lineInfo? { ...lineInfo, stations: filteredForwardStations }: null;
      // Partition sillons
      const forwardSchedules = schedules.filter(sc=> sc.departure_station === lineInfo?.departName);
      const reverseSchedules = schedules.filter(sc=> sc.departure_station === lineInfo?.arriveeName);
      // Construire lineInfo reverse (ordre inversé)
      let reverseLineInfo=null; if(lineInfo){
        let revStations = [...lineInfo.stations].reverse();
        if(stationFilterIds.length){
          const idSet = new Set(stationFilterIds); idSet.add(lineInfo.stations[0].id); idSet.add(lineInfo.stations[lineInfo.stations.length-1].id);
            const tmp = revStations.filter(st=> idSet.has(st.id)); if(tmp.length>=2) revStations=tmp;
        }
        reverseLineInfo = { ...lineInfo, stations: revStations, departName: lineInfo.arriveeName, arriveeName: lineInfo.departName };
      }
      const tables=[]; if(direction==='forward' || direction==='both'){ tables.push({ lineInfo: forwardLineInfo, schedules: forwardSchedules, label:'Aller' }); }
      if((direction==='reverse' || direction==='both') && reverseSchedules.length){ tables.push({ lineInfo: reverseLineInfo, schedules: reverseSchedules, label:'Retour' }); }
      const pdfBytes = await buildPdf({ ligneId, orientation, tables, travaux, period });
      return new Response(pdfBytes, { status:200, headers:{ 'Content-Type':'application/pdf', 'Content-Disposition': `inline; filename=fiche-horaires-ligne-${ligneId}.pdf`, 'Cache-Control':'no-store' } });
    }

    return NextResponse.json({
      ligneId,
      orientation,
      generatedAt: new Date().toISOString(),
      count: schedules.length,
      schedules
    });
  } catch(e){
    console.error('GET /api/fiches-horaires error', e);
    return NextResponse.json({ error:'Erreur serveur' }, { status:500 });
  } finally {
    conn.release();
  }
}

export async function HEAD(request){
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format')||'json').toLowerCase();
  if(format==='pdf') return new Response(null,{ status:200, headers:{ 'Content-Type':'application/pdf' }});
  return new Response(null,{ status:200 });
}
