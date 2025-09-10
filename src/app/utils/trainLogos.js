// Utilitaire pour gérer les logos et informations des types de trains
// Les chemins d'accès sont récupérés depuis la base de données primaire

export function getTrainTypeLogo(trainType) {
  // Cette fonction sera appelée côté client avec les données déjà récupérées depuis l'API
  // Le mapping réel est fait côté serveur dans les APIs d'afficheurs
  const type = (trainType || 'TER').toUpperCase();

  // Mapping par défaut pour les types communs si aucune donnée BDD
  const defaultLogos = {
    'TER': '/img/type/ter.svg',
    'INTERCITES': '/img/type/intercites.svg',
    'TGV': '/img/type/tgv.svg',
    'INOUI': '/img/type/inoui.svg',
    'OUIGO': '/img/type/ouigo.svg',
    'EUROSTAR': '/img/type/eurostar.svg',
    'LIO': '/img/type/lio.svg',
    'MOBIGO': '/img/type/mobigo.svg'
  };

  return defaultLogos[type] || '/img/type/ter.svg';
}

export function getTrainTypeAlt(trainType) {
  const type = (trainType || 'TER').toUpperCase();
  return type;
}

export function getTrainTypeColor(trainType) {
  const type = (trainType || 'TER').toUpperCase();

  // Couleurs par défaut selon les types de trains
  const defaultColors = {
    'TER': '#0088ce',
    'INTERCITES': '#d2232a',
    'TGV': '#2e3191',
    'INOUI': '#c70e61',
    'OUIGO': '#61318b',
    'EUROSTAR': '#ffcc00',
    'LIO': '#009639',
    'MOBIGO': '#0066cc'
  };

  return defaultColors[type] || '#0088ce';
}
