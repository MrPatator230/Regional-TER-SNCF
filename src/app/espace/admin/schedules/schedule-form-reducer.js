// État initial du formulaire
export const initialFormState = {
    general: {
        ligneId: '',
        departureStation: '',
        arrivalStation: '',
        departureTime: '',
        arrivalTime: '',
        trainNumber: '',
        trainType: ''
    },
    stops: [],
    days: {
        selected: [],
        holidays: false,
        sundays: false,
        custom: false,
        customDates: ''
    },
    rollingStock: '',
    isSubstitution: false,
    original: null
};

// Reducer pour gérer l'état du formulaire
export function scheduleFormReducer(state, action) {
    // Sécuriser l'accès à action.payload pour éviter les erreurs si payload est undefined
    const payload = action && action.payload ? action.payload : undefined;

    switch (action.type) {
        case 'SET_GENERAL':
            return {
                ...state,
                general: { ...state.general, ...(payload || {}) }
            };

        case 'SET_STOPS':
            return {
                ...state,
                stops: payload || []
            };

        case 'ADD_STOP':
            return {
                ...state,
                stops: [...state.stops, payload]
            };

        case 'UPDATE_STOP':
            return {
                ...state,
                stops: state.stops.map((stop, index) =>
                    index === action.index ? { ...stop, ...(payload || {}) } : stop
                )
            };

        case 'REMOVE_STOP':
            return {
                ...state,
                stops: state.stops.filter((_, index) => index !== action.index)
            };

        case 'SET_DAYS':
            return {
                ...state,
                days: { ...state.days, ...(payload || {}) }
            };

        case 'SET_ROLLING':
            return {
                ...state,
                rollingStock: payload || ''
            };

        case 'SET_SUBSTITUTION':
            return {
                ...state,
                isSubstitution: typeof payload === 'boolean' ? payload : !!payload
            };

        case 'LOAD_FROM_DTO':
            {
                const p = payload || {};
                return {
                    general: {
                        ligneId: p.ligneId || '',
                        departureStation: p.departureStation || '',
                        arrivalStation: p.arrivalStation || '',
                        departureTime: p.departureTime || '',
                        arrivalTime: p.arrivalTime || '',
                        trainNumber: p.trainNumber || '',
                        trainType: p.trainType || ''
                    },
                    stops: p.stops || [],
                    days: p.days || {
                        selected: [],
                        holidays: false,
                        sundays: false,
                        custom: false,
                        customDates: ''
                    },
                    rollingStock: p.rollingStock || '',
                    isSubstitution: p.isSubstitution || false,
                    original: {
                        id: p.id,
                        general: {
                            ligneId: p.ligneId || '',
                            departureStation: p.departureStation || '',
                            arrivalStation: p.arrivalStation || '',
                            departureTime: p.departureTime || '',
                            arrivalTime: p.arrivalTime || '',
                            trainNumber: p.trainNumber || '',
                            trainType: p.trainType || ''
                        },
                        stops: p.stops || [],
                        days: p.days || {
                            selected: [],
                            holidays: false,
                            sundays: false,
                            custom: false,
                            customDates: ''
                        },
                        rollingStock: p.rollingStock || '',
                        isSubstitution: p.isSubstitution || false
                    }
                };
            }

        case 'APPLY_SAVED_DTO':
            // Met à jour l'original après sauvegarde réussie
            return {
                ...state,
                original: {
                    ...state.original,
                    ...(payload || {})
                }
            };

        case 'LOAD_SCHEDULE':
            return {
                ...state,
                ...(payload || {}),
                original: payload || null
            };

        case 'RESET':
            return initialFormState;

        case 'RESET_TO_ORIGINAL':
            return state.original ? { ...state.original } : initialFormState;

        default:
            return state;
    }
}

// Fonction pour calculer les différences entre l'état actuel et l'original
export function computeDiff(state) {
    if (!state.original) {
        return {};
    }

    const diff = {};
    const current = state;
    const original = state.original;

    // Comparer les propriétés générales
    const generalDiff = {};
    Object.keys(current.general).forEach(key => {
        if (current.general[key] !== original.general[key]) {
            generalDiff[key] = {
                old: original.general[key],
                new: current.general[key]
            };
        }
    });

    if (Object.keys(generalDiff).length > 0) {
        diff.general = generalDiff;
    }

    // Comparer les arrêts
    const currentStops = current.stops || [];
    const originalStops = original.stops || [];

    if (JSON.stringify(currentStops) !== JSON.stringify(originalStops)) {
        diff.stops = {
            old: originalStops,
            new: currentStops,
            added: currentStops.filter(stop =>
                !originalStops.some(origStop =>
                    origStop.station === stop.station &&
                    origStop.arrival === stop.arrival &&
                    origStop.departure === stop.departure
                )
            ),
            removed: originalStops.filter(origStop =>
                !currentStops.some(stop =>
                    stop.station === origStop.station &&
                    stop.arrival === origStop.arrival &&
                    stop.departure === origStop.departure
                )
            ),
            modified: currentStops.filter(stop => {
                const origStop = originalStops.find(os => os.station === stop.station);
                return origStop && (
                    origStop.arrival !== stop.arrival ||
                    origStop.departure !== stop.departure
                );
            })
        };
    }

    // Comparer les jours de circulation
    if (JSON.stringify(current.days) !== JSON.stringify(original.days)) {
        diff.days = {
            old: original.days,
            new: current.days
        };
    }

    // Comparer le matériel roulant
    if (current.rollingStock !== original.rollingStock) {
        diff.rollingStock = {
            old: original.rollingStock,
            new: current.rollingStock
        };
    }

    // Comparer le statut de substitution
    if (current.isSubstitution !== original.isSubstitution) {
        diff.isSubstitution = {
            old: original.isSubstitution,
            new: current.isSubstitution
        };
    }

    return diff;
}
