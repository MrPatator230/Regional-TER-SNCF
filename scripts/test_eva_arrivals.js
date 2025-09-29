// Script de test pour la logique de l'API EVA arrivées
// Exécuter: node scripts/test_eva_arrivals.js

const sampleArrivals = [
  {
    id: 'a1',
    operator: 'Sillons',
    planned_time: '12:00',
    arrival_time: '12:04',
    stops: [
      { station_name: 'Saint-Étienne' },
      { station_name: 'Givors' },
      { station_name: 'Lyon Part-Dieu' }
    ],
    voie: 'C',
    logo: '/files/type/ter.svg',
    type: 'TER',
    number: '886726'
  },
  {
    id: 'a2',
    operator: 'Sillons',
    planned_time: '12:02',
    arrival_time: '12:20',
    stops: [ { station_name: 'Clermont-Ferrand' }, { station_name: 'Lyon Part-Dieu' } ],
    voie: '',
    logo: '/files/type/tgv.svg',
    type: 'TGV INOUI',
    number: '6683',
    delay: 18,
    note: 'Défaut alimentation électrique'
  },
  {
    id: 'a3',
    operator: 'Autre',
    planned_time: '12:05',
    arrival_time: '12:08',
    stops: [ { station_name: 'Valence' }, { station_name: 'Grenoble' } ],
    voie: 'J',
    logo: '/files/type/ter.svg',
    type: 'TER',
    number: '17624'
  },
  {
    id: 'a4',
    operator: 'Sillons',
    planned_time: '12:07',
    arrival_time: '',
    stops: [ { station_name: 'Bourg-en-Bresse' }, { station_name: 'Ambérieu-en-Bugey', cancelled: true}, { station_name: 'Lyon Part-Dieu' } ],
    voie: '',
    logo: '/files/type/ter.svg',
    type: 'TER',
    number: '96566',
    cancelled: true,
    incident: 'Train en panne'
  },
  {
    id: 'b1',
    operator: 'Autre',
    planned_time: '12:15',
    arrival_time: '12:15',
    stops: [ { station_name: 'Dijon Ville' }, { station_name: 'Besançon' } ],
    voie: '2',
    logo: '/files/type/ter.svg',
    type: 'TER',
    number: '45210'
  },
  {
    id: 'c1',
    operator: 'Sillons',
    planned_time: '12:20',
    arrival_time: '12:30',
    stops: [ { station_name: 'Brazey-en-Plaine' }, { station_name: 'Dijon Ville' } ],
    voie: '4',
    logo: '/files/type/tgv.svg',
    type: 'TGV',
    number: '2001',
    delay: 10
  }
];

function norm(s){
  if(!s) return '';
  return String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[\s]+/g,' ').trim().toLowerCase();
}

function queryArrivals(gare){
  const q = norm(gare);
  const prepared = sampleArrivals.map(a => ({
    ...a,
    arrival_time: (a.arrival_time || a.arrival || a.planned_time || a.scheduled_time || '')
  }));

  const arrivals = prepared.filter(a => {
    if((a.operator || '').toLowerCase() !== 'sillons') return false;
    const stops = a.stops || [];
    const inStops = stops.some(s => norm(s.station_name) === q);
    const dest = stops.length ? norm(stops[stops.length - 1].station_name) : norm(a.destination_station);
    return inStops || dest === q;
  });

  const fallback = prepared.filter(a => {
    if((a.operator || '').toLowerCase() !== 'sillons') return false;
    const allNames = (a.stops || []).map(s => norm(s.station_name)).join(' ');
    return allNames.includes(q.split(' ')[0] || '');
  }).slice(0,3);

  return arrivals.length ? arrivals : fallback;
}

const tests = ['Lyon Part-Dieu', 'Dijon Ville', 'Brazey-en-Plaine', 'Saint-Etienne'];

for(const t of tests){
  console.log('---', t, '---');
  const res = queryArrivals(t);
  console.log(JSON.stringify(res, null, 2));
}

