import { NextResponse } from 'next/server';
import { getSchedulesDb } from '@/js/db-schedule';
import { getDb } from '@/js/db';
import { parseStopsJson } from '@/app/lib/schedules-service';
import fs from 'fs/promises';
import path from 'path';

// Forcer l'exécution côté Node
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
  if(!tables){
    tables=[{ lineInfo: arguments[0].lineInfo, schedules: arguments[0].schedules }];
  }
  
  // Debug: Vérifier les données reçues
  console.log('=== buildPdf Debug ===');
  console.log('ligneId:', ligneId);
  console.log('tables.length:', tables?.length);
  console.log('tables[0]?.lineInfo?.stations?.length:', tables[0]?.lineInfo?.stations?.length);
  console.log('tables[0]?.schedules?.length:', tables[0]?.schedules?.length);
  if (tables[0]?.lineInfo?.stations) {
    console.log('Stations:', tables[0].lineInfo.stations.map(s => s.name));
  }
  
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  
  // Chargement des polices Avenir
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
    if(fontBytes){ 
      const fontkit=(await import('fontkit')).default; 
      pdf.registerFontkit(fontkit); 
      avenir = await pdf.embedFont(fontBytes,{subset:true}); 
    }
    if(fontBoldBytes){ 
      if(!pdf._fontkit){ 
        const fontkit=(await import('fontkit')).default; 
        pdf.registerFontkit(fontkit);
      } 
      avenirBold = await pdf.embedFont(fontBoldBytes,{subset:true}); 
    }
    if(fontMediumBytes){ 
      if(!pdf._fontkit){ 
        const fontkit=(await import('fontkit')).default; 
        pdf.registerFontkit(fontkit);
      } 
      avenirMedium = await pdf.embedFont(fontMediumBytes,{subset:true}); 
    }
  } catch {}
  
  const fontStd = await pdf.embedFont(StandardFonts.Helvetica);
  const fontStdBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  if(!avenir) avenir=fontStd; 
  if(!avenirBold) avenirBold=fontStdBold; 
  if(!avenirMedium) avenirMedium=avenir;

  // === DESIGN SNCF VOYAGEURS ===
  
  // Couleurs officielles SNCF
  const sncfBlue = rgb(11/255, 39/255, 64/255);        // Bleu marine principal
  const sncfRed = rgb(181/255, 31/255, 43/255);        // Rouge SNCF
  const sncfLightBlue = rgb(0/255, 108/255, 190/255);  // Bleu clair
   const sncfGray = rgb(245/255, 247/255, 250/255);     // Gris clair fond
   const sncfDarkGray = rgb(82/255, 93/255, 102/255);   // Gris foncé texte
   const white = rgb(1, 1, 1);

  // Dimensions
  const landscape = orientation === 'landscape';
  const pageWidth = landscape ? 842 : 595;
  const pageHeight = landscape ? 595 : 842;
  const margin = 40;
  
  const pages = [];
  function newPage() { 
    const p = pdf.addPage([pageWidth, pageHeight]); 
    pages.push(p); 
    return p; 
  }

  // Extraction des données - utilise les stations ordonnées depuis lineInfo
  let stations = [];
  
  // Priorité 1 : Utiliser les stations depuis lineInfo (déjà ordonnées correctement dans GET)
  if (tables[0]?.lineInfo?.stations?.length) {
    stations = tables[0].lineInfo.stations;
  }
  // Fallback : Extraction depuis l'horaire le plus long si lineInfo n'est pas disponible
  else if (tables[0]?.schedules?.length) {
    let longestStops = [];
    let longestSchedule = null;
    for (const sc of tables[0].schedules) {
      let stops = [];
      try { stops = JSON.parse(sc.stops_json || '[]'); } catch (e) { stops = []; }
      if (stops.length > longestStops.length) {
        longestStops = stops;
        longestSchedule = sc;
      }
    }
    if (longestSchedule && longestStops.length) {
      const seqNamesRaw = [
        longestSchedule.departure_station, 
        ...longestStops.map(s => (s.station_name || s.station)).filter(Boolean), 
        longestSchedule.arrival_station
      ];
      const seen = new Set();
      const seqNames = [];
      seqNamesRaw.forEach(n => { 
        if (n && !seen.has(n)) { 
          seen.add(n); 
          seqNames.push(n); 
        } 
      });
      stations = seqNames.map((name, i) => ({ id: i + 1, name }));
    }
  }
  
  const schedCols = tables[0]?.schedules || [];
  
  // Calcul dynamique des colonnes
  const headerHeight = 80;
  const infoBarHeight = 36;
  const footerHeight = 110;
  const tableTopMargin = 20;
  // Compute first column width dynamically based on station names and font metrics
  // fallback to 160 if fonts or station names are not available
  let firstColWidth = 160;
  try {
    const stationNames = (stations||[]).map(s => (s && s.name) ? String(s.name) : '').filter(Boolean);
    if (stationNames.length && avenir && typeof avenir.widthOfTextAtSize === 'function') {
      // measure at the size we use for terminal names (10) to ensure long names fit
      const measured = stationNames.map(n => Math.ceil(avenir.widthOfTextAtSize(String(n), 10)));
      const maxMeasured = Math.max(...measured, 120);
      const padding = 48; // reserve space for icon/margins
      // don't let the station column occupy the whole page: cap at fraction of usable page width
      const maxAllowed = Math.floor((pageWidth - margin * 2) * 0.55);
      firstColWidth = Math.min(maxAllowed, Math.max(120, Math.ceil(maxMeasured + padding)));
    }
  } catch (e) {
    firstColWidth = 160;
  }
  const minColWidth = 50;
  const maxColWidth = 85;

  let availableWidth = pageWidth - margin * 2 - firstColWidth;
  // If availableWidth is too small to render schedule columns, reduce firstColWidth to free space
  const minTotalSched = Math.max(minColWidth * Math.max(1, schedCols.length), 120);
  if (availableWidth < minTotalSched) {
    const reduce = minTotalSched - availableWidth;
    firstColWidth = Math.max(100, firstColWidth - reduce);
    availableWidth = pageWidth - margin * 2 - firstColWidth;
  }

  const colWidth = Math.max(minColWidth, Math.min(maxColWidth, availableWidth / Math.max(1, schedCols.length)));
  const rowHeight = 20;
  
  // === FONCTIONS DE DESSIN ===
  
  function drawHeader(p) {
    // Fond bleu marine
    p.drawRectangle({
      x: 0,
      y: pageHeight - headerHeight,
      width: pageWidth,
      height: headerHeight,
      color: sncfBlue
    });

    // Logo SNCF stylisé
    p.drawRectangle({
      x: margin,
      y: pageHeight - headerHeight + 40,
      width: 70,
      height: 28,
      color: white
    });
    p.drawText('SNCF', {
      x: margin + 8,
      y: pageHeight - headerHeight + 48,
      size: 18,
      font: avenirBold,
      color: sncfBlue
    });

    // Badge TER rouge
    p.drawRectangle({
      x: margin + 75,
      y: pageHeight - headerHeight + 44,
      width: 40,
      height: 20,
      color: sncfRed
    });
    p.drawText('TER', {
      x: margin + 82,
      y: pageHeight - headerHeight + 49,
      size: 12,
      font: avenirBold,
      color: white
    });

    // Ligne de relation avec chevrons doubles
    const relation = tables[0]?.lineInfo 
      ? `${tables[0].lineInfo.departName.toUpperCase()} <> ${tables[0].lineInfo.arriveeName.toUpperCase()}` 
      : `LIGNE ${ligneId}`;
    p.drawText(relation, {
      x: margin + 130,
      y: pageHeight - headerHeight + 50,
      size: 22,
      font: avenirBold,
      color: white
    });

    // Numéro de ligne (petit badge)
    if (ligneId) {
      const ligneText = `Ligne ${ligneId}`;
      const ligneWidth = avenirMedium.widthOfTextAtSize(ligneText, 9);
      const badgeX = pageWidth - margin - ligneWidth - 20;

      p.drawRectangle({
        x: badgeX - 5,
        y: pageHeight - headerHeight + 46,
        width: ligneWidth + 10,
        height: 16,
        color: rgb(1, 1, 1),
        opacity: 0.2
      });

      p.drawText(ligneText, {
        x: badgeX,
        y: pageHeight - headerHeight + 50,
        size: 9,
        font: avenirMedium,
        color: white
      });
    }

    // Période de validité
    const periodText = period?.start && period?.end 
      ? `Horaires valables du ${period.start} au ${period.end}` 
      : (period?.start ? `Valable à partir du ${period.start}` : '');
    if (periodText) {
      p.drawText(periodText, {
        x: margin + 130,
        y: pageHeight - headerHeight + 30,
        size: 10,
        font: avenirMedium,
        color: white,
        opacity: 0.9
      });
    }

    // Date de génération (petite, en haut à droite)
    p.drawText(new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }), {
      x: pageWidth - margin - 100,
      y: pageHeight - headerHeight + 50,
      size: 9,
      font: avenirMedium,
      color: white,
      opacity: 0.9
    });
  }
  
  function drawInfoBar(p) {
    const y = pageHeight - headerHeight - infoBarHeight;
    
    // Fond gris clair
    p.drawRectangle({
      x: 0,
      y: y,
      width: pageWidth,
      height: infoBarHeight,
      color: sncfGray
    });
    
    // Barre verticale bleue accent
    p.drawRectangle({
      x: 0,
      y: y,
      width: 4,
      height: infoBarHeight,
      color: sncfLightBlue
    });
    
    // Icône info (cercle avec i)
    p.drawCircle({
      x: margin + 8,
      y: y + infoBarHeight / 2,
      size: 8,
      color: sncfLightBlue
    });
    p.drawText('i', {
      x: margin + 5,
      y: y + infoBarHeight / 2 - 4,
      size: 12,
      font: avenirBold,
      color: white
    });
    
    // Texte informatif
    p.drawText('INFORMATION VOYAGEURS', {
      x: margin + 24,
      y: y + 22,
      size: 10,
      font: avenirBold,
      color: sncfBlue
    });
    p.drawText('Consultez les horaires en temps réel sur sncf-connect.com ou l\'application mobile', {
      x: margin + 24,
      y: y + 8,
      size: 8,
      font: avenir,
      color: sncfDarkGray
    });
  }
  
  function drawTable(p, stations, schedCols) {
    console.log('=== drawTable Debug ===');
    console.log('stations.length:', stations?.length);
    console.log('schedCols.length:', schedCols?.length);
    
    const tableStartY = pageHeight - headerHeight - infoBarHeight - tableTopMargin;
    const startX = margin;
    let yCursor = tableStartY;
    
    // Protection: afficher un message si pas de données
    if (!stations || stations.length === 0) {
      p.drawText('Aucune gare à afficher', {
        x: startX + 12,
        y: tableStartY - 50,
        size: 10,
        font: avenir,
        color: sncfDarkGray
      });
    }
    
    if (!schedCols || schedCols.length === 0) {
      p.drawText('Aucun horaire disponible pour cette ligne', {
        x: startX + 12,
        y: tableStartY - 70,
        size: 10,
        font: avenir,
        color: sncfDarkGray
      });
    }
    
    const tableWidth = firstColWidth + schedCols.length * colWidth;
    
    // En-tête du tableau (fond bleu)
    const headerRowHeight = rowHeight * 2.5;
    p.drawRectangle({
      x: startX,
      y: yCursor - headerRowHeight,
      width: tableWidth,
      height: headerRowHeight,
      color: sncfBlue
    });
    
    // Colonne "GARES"
    p.drawText('GARES', {
      x: startX + 12,
      y: yCursor - headerRowHeight + rowHeight + 8,
      size: 11,
      font: avenirBold,
      color: white
    });
    
    // Colonnes trains
    schedCols.forEach((sc, i) => {
      const colX = startX + firstColWidth + i * colWidth;
      
      // Séparateur vertical léger
      if (i > 0) {
        p.drawLine({
          start: { x: colX, y: yCursor - headerRowHeight },
          end: { x: colX, y: yCursor },
          thickness: 0.5,
          color: white,
          opacity: 0.3
        });
      }
      
      // Numéro de train
      const trainNum = sc.train_number || '';
      p.drawText(trainNum, {
        x: colX + 8,
        y: yCursor - headerRowHeight + rowHeight + 8,
        size: 11,
        font: avenirBold,
        color: white
      });
      
      // Jours de circulation
      const daysStr = formatDays(sc.days) || '';
      const daysShort = daysStr.length > 16 ? daysStr.slice(0, 14) + '...' : daysStr;
      p.drawText(daysShort, {
        x: colX + 4,
        y: yCursor - headerRowHeight + 8,
        size: 7,
        font: avenir,
        color: white,
        opacity: 0.85
      });
    });
    
    yCursor -= headerRowHeight;
    
    // Par schedule, indiquer si l'arrivée du terminus a déjà été affichée sous la gare précédente
    const terminusArrivalRendered = new Array(schedCols.length).fill(false);

    // Helper to normalize station names for tolerant comparison (remove accents, lowercase, collapse punctuation)
    const normalizeName = (s) => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').replace(/[\-–—_.]/g,' ').trim().toLowerCase().replace(/\s+ville$/,'').replace(/[^a-z0-9 ]/g,'');

    // Precompute arrival index for each schedule so we can detect the terminus row for that schedule
    const scheduleArrivalIndex = schedCols.map(sc => {
      const target = normalizeName(sc.arrival_station || sc.arriveeName || '');
      if (!target) return -1;
      for (let si = 0; si < (stations||[]).length; si++) {
        const sname = normalizeName((stations[si] && stations[si].name) ? stations[si].name : '');
        if (!sname) continue;
        if (sname === target || sname.includes(target) || target.includes(sname)) return si;
      }
      return -1;
    });

    // Lignes de gares
    stations.forEach((st, idx) => {
      // Fond alterné
      const isEven = idx % 2 === 0;
      const bgColor = isEven ? white : sncfGray;
      
      p.drawRectangle({
        x: startX,
        y: yCursor - rowHeight,
        width: tableWidth,
        height: rowHeight,
        color: bgColor
      });
      
      // Déterminer si la gare doit être traitée comme terminal.
      // On considère comme terminal : le 1er, le dernier, ou toute gare dont le nom correspond
      // explicitement au départ/à l'arrivée déclarés dans le lineInfo (gare importante).
      const lineInfoLocal = tables[0]?.lineInfo || null;
      const departLabel = lineInfoLocal?.departName?.toString().trim();
      const arriveeLabel = lineInfoLocal?.arriveeName?.toString().trim();
      const isTerminal = idx === 0 || idx === stations.length - 1 || (st.name && (st.name === departLabel || st.name === arriveeLabel));
      
      if (isTerminal) {
        // Style terminal identique : grande puce rouge
        p.drawCircle({
          x: startX + 8,
          y: yCursor - rowHeight / 2,
          size: 4,
          color: sncfRed
        });
      } else {
        // Petite puce bleue pour les arrêts intermédiaires
        p.drawCircle({
          x: startX + 8,
          y: yCursor - rowHeight / 2,
          size: 2,
          color: sncfLightBlue
        });
      }
      
      // Pour le premier/dernier et les gares importantes, afficher explicitement les noms de départ/arrivée
      let stationDisplayName = st.name;
      if (idx === 0 && departLabel) stationDisplayName = departLabel;
      if (idx === stations.length - 1 && arriveeLabel) stationDisplayName = arriveeLabel;
      
      // Afficher le nom complet pour les terminaux (pas de troncature) ; sinon limiter à 28 chars
      const stationName = isTerminal ? stationDisplayName : (stationDisplayName || '').slice(0, 28);
      p.drawText(stationName, {
        x: startX + 18,
        y: yCursor - rowHeight / 2 - 3,
        size: isTerminal ? 10 : 9,
        font: isTerminal ? avenirBold : avenir,
        color: isTerminal ? sncfBlue : sncfDarkGray
      });
      
      // Horaires pour chaque train
      schedCols.forEach((sc, i) => {
        const colX = startX + firstColWidth + i * colWidth;
        
        // Séparateur vertical
        if (i > 0) {
          p.drawLine({
            start: { x: colX, y: yCursor - rowHeight },
            end: { x: colX, y: yCursor },
            thickness: 0.5,
            color: sncfDarkGray,
            opacity: 0.15
          });
        }
        
        // Récupération de l'horaire (utiliser parseStopsJson pour normalisation)
        let rawStops = [];
        try { rawStops = JSON.parse(sc.stops_json || '[]'); } catch (e) { rawStops = []; }
        // parseStopsJson renvoie des objets { station, arrival, departure } avec HH:MM
        let normStops = [];
        try { normStops = parseStopsJson(sc.stops_json || '[]'); } catch (e) { normStops = []; }

        // Normalisation des identifiants / noms de la gare courante
        const stId = st.id;
        const stName = (st.name || '').toString().trim();

        // Chercher d'abord parmi les stops normalisés (par nom)
        let foundStop = normStops.find(s => s && s.station && s.station.toString().trim().toLowerCase() === stName.toLowerCase());

        // Si non trouvé, tenter par id dans rawStops
        if (!foundStop && rawStops.length) {
          const idFields = ['station_id','stationId','id','gare_id','stop_id'];
          const rawMatch = rawStops.find(s => {
            if (!s) return false;
            for (const f of idFields) {
              if (s[f] != null && String(s[f]).trim() !== '') {
                try { if (Number(s[f]) === Number(stId)) return true; } catch {}
              }
            }
            return false;
          });
          if (rawMatch) {
            // extraire heures si présentes (plusieurs variantes)
            const arrRaw = rawMatch.arrival_time || rawMatch.arrival || rawMatch.arrivalTime || rawMatch.heure_arrivee || '';
            const depRaw = rawMatch.departure_time || rawMatch.departure || rawMatch.departureTime || rawMatch.heure_depart || '';
            const norm = t => { if(!t) return ''; try { return String(t).replace(/^(\d{2}:\d{2}):\d{2}$/, '$1').slice(0,5); } catch { return String(t).slice(0,5); } };
            foundStop = { station: stName, arrival: norm(arrRaw), departure: norm(depRaw) };
          }
        }

        // Si toujours pas trouvé, tenter appariement approximatif sur le nom dans rawStops
        if (!foundStop && rawStops.length) {
          const approx = rawStops.find(s => {
            const cand = (s?.station_name || s?.station || s?.name || s?.stop_name || '').toString().trim().toLowerCase();
            return cand && stName && cand === stName.toLowerCase();
          });
          if (approx) {
            const arrRaw = approx.arrival_time || approx.arrival || approx.arrivalTime || approx.heure_arrivee || '';
            const depRaw = approx.departure_time || approx.departure || approx.departureTime || approx.heure_depart || '';
            const norm = t => { if(!t) return ''; try { return String(t).replace(/^(\d{2}:\d{2}):\d{2}$/, '$1').slice(0,5); } catch { return String(t).slice(0,5); } };
            foundStop = { station: stName, arrival: norm(arrRaw), departure: norm(depRaw) };
          }
        }

        // Normaliser utilitaire pour comparaison tolérante
        const normCmp = s => String(s||'').toString().trim().toLowerCase();
        // Définir normTime local
        const normTime = t => { if(!t) return ''; try { return String(t).replace(/^(\d{2}:\d{2}):\d{2}$/, '$1').slice(0,5); } catch { return String(t).slice(0,5); } };

        // Nom de la gare pour cette ligne
        // stName already declared above for this station row

        // Nom du terminus déclaré globalement (lineInfo)
        const globalArrivee = (arriveeLabel || '').toString().trim();

        // Nom de la gare correspondant à l'arrêt trouvé dans les stops (s'il existe)
        // foundStop est déjà calculé ci-dessus

        // Calculer si pour CE sillon, le terminus correspond à la gare courante
        // prefer precomputed arrival index matching (more tolerant)
        const isScheduleTerminus = (scheduleArrivalIndex[i] !== undefined && scheduleArrivalIndex[i] === idx);

        // Déterminer texte principal pour la ligne courante (préférence arrivée si c'est le terminus de CE sillon)
        let text = '';
        if (isScheduleTerminus) {
          // Priorité: heure d'arrivée pour ce sillon
          const arrRaw = foundStop?.arrival || sc.arrival_time || '';
          text = normTime(arrRaw);
          if (!text) text = normTime(sc.arrival_time || '');
        } else {
          // Si ce n'est pas le terminus de ce sillon, mais la gare correspond au global terminus, afficher aussi arrivée
          const isGlobalLast = normCmp(globalArrivee) && normCmp(globalArrivee) === normCmp(stName);
          if (isGlobalLast) {
            const arrRaw = foundStop?.arrival || sc.arrival_time || '';
            text = normTime(arrRaw) || normTime(sc.arrival_time || '');
          } else {
            // Comportement historique : afficher l'heure de départ
            let dep = foundStop?.departure || '';
            dep = normTime(dep);
            if (dep) {
              text = dep;
            } else {
              if (sc.departure_station && normCmp(sc.departure_station) === normCmp(stName)) {
                text = normTime(sc.departure_time || '');
              }
            }
          }
        }

        // Affichage standard : afficher le texte principal (départ ou arrivée si déterminé) s'il existe
        if (text) {
          const textColor = isTerminal ? sncfBlue : sncfLightBlue;
          p.drawText(text, {
            x: colX + 8,
            y: yCursor - rowHeight / 2 - 3,
            size: isTerminal ? 10 : 9,
            font: isTerminal ? avenirBold : avenir,
            color: textColor
          });
        }
      });
      
      // Ligne de séparation horizontale
      p.drawLine({
        start: { x: startX, y: yCursor - rowHeight },
        end: { x: startX + tableWidth, y: yCursor - rowHeight },
        thickness: 0.5,
        color: sncfDarkGray,
        opacity: 0.2
      });
      
      yCursor -= rowHeight;
    });
    
    // Bordure finale épaisse
    p.drawLine({
      start: { x: startX, y: yCursor },
      end: { x: startX + tableWidth, y: yCursor },
      thickness: 2,
      color: sncfBlue
    });
    
    return yCursor;
  }
  
  function drawServicesIcons(p, schedCols) {
    const y = pageHeight - headerHeight - infoBarHeight - tableTopMargin - rowHeight * 2.5 - 28;
    const startX = margin + firstColWidth;
    
    schedCols.forEach((sc, i) => {
      const colX = startX + i * colWidth;
      const centerX = colX + colWidth / 2;
      
      // Icône vélo (transport de vélos autorisé)
      const bikeX = centerX - 8;
      p.drawCircle({ x: bikeX, y: y, size: 3, color: sncfLightBlue });
      p.drawCircle({ x: bikeX + 10, y: y, size: 3, color: sncfLightBlue });
      p.drawLine({
        start: { x: bikeX + 3, y: y },
        end: { x: bikeX + 10, y: y },
        thickness: 1,
        color: sncfLightBlue
      });
      p.drawLine({
        start: { x: bikeX + 3, y: y },
        end: { x: bikeX + 6, y: y + 5 },
        thickness: 1,
        color: sncfLightBlue
      });
      p.drawLine({
        start: { x: bikeX + 10, y: y },
        end: { x: bikeX + 6, y: y + 5 },
        thickness: 1,
        color: sncfLightBlue
      });
    });
  }
  
  function drawFooter(p) {
    const y = margin;
    const blockHeight = footerHeight - 20;
    
    // Bloc gauche - Informations pratiques
    const leftBlockWidth = (pageWidth - margin * 2) * 0.58;
    
    p.drawRectangle({
      x: margin,
      y: y,
      width: leftBlockWidth,
      height: blockHeight,
      color: sncfGray
    });
    
    // Barre d'accent bleue
    p.drawRectangle({
      x: margin,
      y: y + blockHeight - 3,
      width: leftBlockWidth,
      height: 3,
      color: sncfLightBlue
    });
    
    p.drawText('INFORMATIONS PRATIQUES', {
      x: margin + 16,
      y: y + blockHeight - 18,
      size: 11,
      font: avenirBold,
      color: sncfBlue
    });
    
    const infoLineHeight = 11;
    let yInfo = y + blockHeight - 34;
    
    const infos = [
      '• Réservation conseillée pour certains trains',
      '• Transport de vélos selon disponibilité',
      '• Services accessibles PMR sur demande',
      '• Wifi gratuit à bord (selon matériel)',
      '• Consultez les horaires en temps réel sur sncf-connect.com'
    ];
    
    infos.forEach(info => {
      p.drawText(info, {
        x: margin + 16,
        y: yInfo,
        size: 8,
        font: avenir,
        color: sncfDarkGray
      });
      yInfo -= infoLineHeight;
    });
    
    // Bloc droit - Contact
    const rightBlockWidth = (pageWidth - margin * 2) * 0.38;
    const rightX = pageWidth - margin - rightBlockWidth;
    
    p.drawRectangle({
      x: rightX,
      y: y,
      width: rightBlockWidth,
      height: blockHeight,
      color: sncfBlue
    });
    
    p.drawText('CONTACTS & ASSISTANCE', {
      x: rightX + 16,
      y: y + blockHeight - 18,
      size: 11,
      font: avenirBold,
      color: white
    });
    
    let yContact = y + blockHeight - 36;
    
    p.drawText('SNCF Voyageurs', {
      x: rightX + 16,
      y: yContact,
      size: 9,
      font: avenirBold,
      color: white
    });
    yContact -= 14;
    
    p.drawText('3635 - Informations et réservations', {
      x: rightX + 16,
      y: yContact,
      size: 8,
      font: avenir,
      color: white,
      opacity: 0.9
    });
    yContact -= 11;
    
    p.drawText('7j/7 de 7h à 22h', {
      x: rightX + 16,
      y: yContact,
      size: 7,
      font: avenir,
      color: white,
      opacity: 0.75
    });
    yContact -= 16;
    
    p.drawText('Application SNCF Connect', {
      x: rightX + 16,
      y: yContact,
      size: 8,
      font: avenirBold,
      color: white
    });
    yContact -= 11;
    
    p.drawText('www.sncf-connect.com', {
      x: rightX + 16,
      y: yContact,
      size: 8,
      font: avenir,
      color: white,
      opacity: 0.9
    });
    
    // Logo TER en bas à droite
    p.drawRectangle({
      x: pageWidth - margin - 55,
      y: y + 8,
      width: 48,
      height: 18,
      color: sncfRed
    });
    p.drawText('TER', {
      x: pageWidth - margin - 44,
      y: y + 12,
      size: 13,
      font: avenirBold,
      color: white
    });
  }
  
  // === GÉNÉRATION DU PDF ===
  
  const page = newPage();
  
  drawHeader(page);
  drawInfoBar(page);
  drawServicesIcons(page, schedCols);
  drawTable(page, stations, schedCols);
  drawFooter(page);
  
  // Numérotation des pages
  pages.forEach((p, idx) => {
    const pageNum = `${idx + 1}`;
    const pageText = `Page ${pageNum}`;
    p.drawText(pageText, {
      x: pageWidth / 2 - 20,
      y: 14,
      size: 8,
      font: avenir,
      color: sncfDarkGray,
      opacity: 0.7
    });
  });
  
  return await pdf.save();
}

export { buildPdf };

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ligneId = Number(searchParams.get('ligneId') || 0);
  const format = (searchParams.get('format') || 'json').toLowerCase();
  const dateParam = searchParams.get('date');

  if (!ligneId) {
    return NextResponse.json({ error: 'ligneId manquant' }, { status: 400 });
  }

  const conn = await getSchedulesDb().getConnection();
  const today = dateParam || new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    let [rows] = await conn.execute(
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
        WHERE s.ligne_id = ? AND DATE(s.departure_time) = ?
        ORDER BY s.departure_time ASC, s.id ASC`,
      [ligneId, today]
    );

    // Si aucun horaire pour aujourd'hui, essayer pour demain
    if (rows.length === 0) {
      [rows] = await conn.execute(
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
          WHERE s.ligne_id = ? AND DATE(s.departure_time) = ?
          ORDER BY s.departure_time ASC, s.id ASC`,
        [ligneId, tomorrow]
      );
    }

    const schedules = rows.map(mapScheduleRow);
    return NextResponse.json({ schedules });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    conn.release();
  }
}

export async function HEAD(request) {
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') || 'json').toLowerCase();
  if (format === 'pdf') {
    return new Response(null, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' }
    });
  }
  return new Response(null, { status: 200 });
}

async function fetchLineInfo(ligneId, schedules) {
  // Essaie d'abord de récupérer la ligne depuis la base principale (ferrovia_bfc)
  let lineInfo = null;
  const mainConn = await getDb().getConnection();
  try {
    // Récupérer d'abord les infos de base sur la ligne sans référencer des colonnes optionnelles
    const [lineRows] = await mainConn.execute(
      `SELECT l.id, l.depart_station_id, l.arrivee_station_id, ds.name AS departName, as2.name AS arriveeName
       FROM lignes l
       JOIN stations ds ON ds.id=l.depart_station_id
       JOIN stations as2 ON as2.id=l.arrivee_station_id
       WHERE l.id=? LIMIT 1`,
      [ligneId]
    );

    if (lineRows.length) {
      const lr = lineRows[0];

      // Valeur brute depuis la table (peut être JSON, CSV, chaîne d'IDs, ou liste de noms)
      // Lire la colonne `desservies` en essayant d'abord la colonne pluriel, puis singulier si nécessaire.
      let rawDess = '';
      try {
        const [r] = await mainConn.execute('SELECT desservies FROM lignes WHERE id=? LIMIT 1', [ligneId]);
        rawDess = r && r[0] && r[0].desservies != null ? String(r[0].desservies) : '';
      } catch (errSelectDess) {
        // Si la colonne `desservies` n'existe pas, essayer `desservie` (ancien schéma)
        try {
          const [r2] = await mainConn.execute('SELECT desservie FROM lignes WHERE id=? LIMIT 1', [ligneId]);
          rawDess = r2 && r2[0] && r2[0].desservie != null ? String(r2[0].desservie) : '';
        } catch (errSelectDess2) {
          // Si aucun des deux n'est présent, laisser rawDess vide
          rawDess = '';
        }
      }
      rawDess = rawDess.replace(/\u00A0/g, ' ').trim(); // remplacer NBSP

      let dessRaw = [];
      try {
        const parsed = JSON.parse(rawDess || '[]');
        if (Array.isArray(parsed)) dessRaw = parsed.slice();
        else if (typeof parsed === 'string' && parsed.trim()) {
          // si la chaîne contient des séparateurs explicites, utiliser ',' ou ';'
          if (/[,;]/.test(parsed)) dessRaw = parsed.split(/[;,]+/).map(s => s.trim()).filter(Boolean);
          else dessRaw = [parsed.trim()];
        }
      } catch (e) {
        if (typeof rawDess === 'string' && rawDess.trim()) {
          const s = rawDess.trim();
          // Prioriser virgules/; pour séparer noms composés. Si pas de séparateur et que la chaîne ressemble à "1 2 3" alors splitter sur espaces (IDs séparés par espaces)
          if (/[,;]/.test(s)) dessRaw = s.split(/[;,]+/).map(x => x.trim()).filter(Boolean);
          else if (/^\d+(?:\s+\d+)*$/.test(s)) dessRaw = s.split(/\s+/).map(x => x.trim()).filter(Boolean);
          else dessRaw = [s];
        } else dessRaw = [];
      }

      // Détecter si ce sont des IDs numériques (tous les éléments sont des nombres entiers)
      const normalized = dessRaw.map(x => String(x).trim()).filter(Boolean);
      const ids = normalized.length && normalized.every(s => /^\d+$/.test(s)) ? normalized.map(Number) : [];
      const names = ids.length ? [] : normalized; // si pas d'IDs, on prendra ces valeurs comme noms

      // Debug info
      console.log('fetchLineInfo debug:', { rawDess: rawDess, normalized, ids, names });
      if (ids.length) {
        // Requêter par ID en conservant l'ordre
        const placeholders = ids.map(() => '?').join(',');
        let dessStations = [];
        try {
          const sql = `SELECT id, name FROM stations WHERE id IN (${placeholders}) ORDER BY FIELD(id, ${placeholders})`;
          const params = [...ids, ...ids];
          const [rows] = await mainConn.execute(sql, params);
          dessStations = rows || [];
        } catch (e) {
          console.error('Erreur récupération stations par IDs:', e);
          dessStations = [];
        }

        const nameById = {};
        dessStations.forEach(r => { nameById[Number(r.id)] = r.name; });

        const stationSeq = [lr.depart_station_id, ...ids, lr.arrivee_station_id];

        lineInfo = {
          id: lr.id,
          departName: lr.departName,
          arriveeName: lr.arriveeName,
          stations: stationSeq.map(id => ({
            id,
            name: id === lr.depart_station_id ? lr.departName : (id === lr.arrivee_station_id ? lr.arriveeName : (nameById[id] || `Gare #${id}`))
          }))
        };
        console.log('fetchLineInfo -> built stations (ids):', lineInfo.stations.map(s => s.name));
      }
      // Si on a des noms fournis dans `desservies`, résoudre par nom et garder l'ordre
      else if (names.length) {
        let dessStations = [];
        try {
          // Requête insensible à la casse: on compare LOWER(name)
          const lcNames = names.map(s => String(s).toLowerCase());
          const placeholders = lcNames.map(() => '?').join(',');
          const sql = `SELECT id, name FROM stations WHERE LOWER(name) IN (${placeholders}) ORDER BY FIELD(LOWER(name), ${placeholders})`;
          const params = [...lcNames, ...lcNames];
          const [rows] = await mainConn.execute(sql, params);
          dessStations = rows || [];
        } catch (e) {
          console.error('Erreur récupération stations par noms:', e);
          dessStations = [];
        }

        const seqNames = [lr.departName, ...(dessStations.length ? dessStations.map(r => r.name) : names), lr.arriveeName];
         const seen = new Set();
         const unique = [];
         seqNames.forEach(n => { if (n && !seen.has(n)) { seen.add(n); unique.push(n); } });

         lineInfo = {
           id: lr.id,
           departName: lr.departName,
           arriveeName: lr.arriveeName,
           stations: unique.map((name, idx) => ({ id: idx + 1, name }))
         };
         console.log('fetchLineInfo -> built stations (names):', lineInfo.stations.map(s => s.name));
       } else {
         // Si aucune desservie définie, tenter de construire la liste depuis les schedules (fallback enrichi)
         if (Array.isArray(schedules) && schedules.length > 0) {
           // Même algorithme que le fallback global: prendre l'horaire avec le plus d'arrêts
           const allSet = new Set();
           const order = [];
           let longest = null;
           let longestStops = [];

           schedules.forEach(sc => {
             let stops = [];
             try { stops = JSON.parse(sc.stops_json || '[]'); } catch {};
             if (stops.length > longestStops.length) {
               longestStops = stops;
               longest = sc;
             }
           });

           if (longest) {
             const departStation = longest.departure_station || lr.departName;
             const arrivalStation = longest.arrival_station || lr.arriveeName;

             if (departStation && !allSet.has(departStation)) { allSet.add(departStation); order.push(departStation); }
             longestStops.forEach(stop => {
               const stName = stop.station_name || stop.station;
               if (stName && !allSet.has(stName)) { allSet.add(stName); order.push(stName); }
             });
             if (arrivalStation && !allSet.has(arrivalStation)) { allSet.add(arrivalStation); order.push(arrivalStation); }

             lineInfo = {
               id: lr.id,
               departName: departStation,
               arriveeName: arrivalStation,
               stations: order.map((name, idx) => ({ id: idx + 1, name }))
             };
            console.log('fetchLineInfo -> built stations (from schedules):', lineInfo.stations.map(s => s.name));
           } else {
             // si pas d'horaire exploitable, fallback simple départ/arrivée
             lineInfo = {
               id: lr.id,
               departName: lr.departName,
               arriveeName: lr.arriveeName,
               stations: [
                 { id: lr.depart_station_id, name: lr.departName },
                 { id: lr.arrivee_station_id, name: lr.arriveeName }
               ]
             };
            console.log('fetchLineInfo -> fallback simple stations:', lineInfo.stations.map(s => s.name));
           }
         } else {
           // Si aucune desservie et pas de schedules, afficher au moins départ/arrivée
           lineInfo = {
             id: lr.id,
             departName: lr.departName,
             arriveeName: lr.arriveeName,
             stations: [
               { id: lr.depart_station_id, name: lr.departName },
               { id: lr.arrivee_station_id, name: lr.arriveeName }
             ]
           };
          console.log('fetchLineInfo -> fallback no dess + no schedules:', lineInfo.stations.map(s => s.name));
         }
       }
     }
   } catch (err) {
     console.error('Erreur lors de la récupération de lineInfo depuis base principale:', err);
   } finally {
     mainConn.release();
   }


  return lineInfo;
}
