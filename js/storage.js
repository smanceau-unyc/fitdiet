/**
 * storage.js — Persistance locale (localStorage) + export / import JSON.
 * Toute l'application lit et écrit un seul objet "state", sérialisé sous une clé unique.
 */
window.FD = window.FD || {};

FD.storage = (function () {
  const KEY = 'fitdiet-coach.v1';
  const VERSION = 1;

  /** Types de séance par défaut : calories et lipides du jour ; glucides = calories restantes. */
  function defaultSessionTypes() {
    return [
      { id: 'upper', label: 'Force haut', cat: 'force', kcal: 2000, fat: 67 },
      { id: 'lower', label: 'Force bas', cat: 'force', kcal: 2000, fat: 67 },
      { id: 'full', label: 'Full body', cat: 'force', kcal: 2000, fat: 67 },
      { id: 'hybrid', label: 'Hybride', cat: 'force', kcal: 2000, fat: 62 },
      { id: 'run_hard', label: 'Course intense', cat: 'run_hard', kcal: 2000, fat: 60 },
      { id: 'run_long', label: 'Course longue', cat: 'run_hard', kcal: 2000, fat: 60 },
      { id: 'run_easy', label: 'Course facile', cat: 'cardio', kcal: 1950, fat: 67 },
      { id: 'recup', label: 'Récup active', cat: 'repos', kcal: 1900, fat: 67 },
      { id: 'repos', label: 'Repos', cat: 'repos', kcal: 1900, fat: 67 }
    ];
  }

  function defaultState() {
    return {
      version: VERSION,
      profile: {
        name: 'Steven',
        sex: 'homme',
        age: 39,
        height: 173,
        weight: 73.5,
        targetWeight: 70,
        waist: 85.5,
        targetWaist: 82,
        job: 'sedentaire',          // activité hors sport : sedentaire | debout | physique
        steps: 6700,                // pas moyens actuels
        stepsGoal: 8000,
        strengthPerWeek: 4,
        runPerWeek: 2,
        sessionMinutes: 60,
        goal: 'perte',              // perte | maintien | prise | recompo
        pace: 'modere',             // lent | modere | rapide
        kcalMin: 1900,              // plafond choisi par l'utilisateur
        kcalMax: 2000,
        kcalOffset: 0,              // ajustement global appliqué par le coach (kcal/jour)
        proteinG: 140,
        fatG: 65,                   // lipides quotidiens fixes ; vide = valeur propre à chaque type de séance
        fatPerKgMin: 0.7,
        fatPerKgMax: 1.0,
        fiberG: 30,
        mealsPerDay: 4,
        trainingTime: '07:00',
        allergies: '', intolerances: '', excluded: '', preferred: '',
        diet: 'omnivore', budget: '', cookTime: '20',
        equipment: ['plaque', 'four', 'micro-ondes'],
        // Situations où le coach suspend les ajustements automatiques
        pregnancy: false, medicalCondition: false, medication: false
      },
      sessionTypes: defaultSessionTypes(),
      weekPlan: { lun: 'upper', mar: 'lower', mer: 'recup', jeu: 'upper', ven: 'lower', sam: 'run_easy', dim: 'repos' },
      days: {},          // 'YYYY-MM-DD' -> { weight, waist, steps, sleep, hunger, perf, water, session, trainingDone, minutes, otherActivity, otherMinutes, foods:[] , manualKcal, manualProtein }
      checkins: {},      // '2026-S40' -> réponses aux questions hebdo
      decisions: [],     // historique des décisions du coach
      customFoods: [],   // aliments ajoutés (Open Food Facts, Ciqual, saisie manuelle)
      foodLinks: {},     // id aliment démo -> id aliment Ciqual dont il prend les valeurs
      recipes: [],       // recettes saisies par l'utilisateur
      favorites: {},     // id recette -> true (recettes favorites)
      plan: null,        // plan alimentaire généré
      planSettings: null,
      shopping: { checked: {} },
      prices: {},        // prix saisis : id aliment -> { price, per: 'kg' | 'L' | 'unite', date }
      templates: (window.FD_DEFAULT_TEMPLATES || []).map((t) => JSON.parse(JSON.stringify(t))),
      settings: {
        theme: 'sombre',
        recipeMacros: 'source', // macros des recettes importées : 'source' (livre) ou 'calcul' (ingrédients)
        coach: {
          stableWeekPct: 0.15,     // |variation hebdo| < 0,15 % du poids = stable
          waistStableCm: 0.5,      // variation < 0,5 cm = stable (erreur de mesure)
          adherenceMin: 85,        // % minimal avant de proposer un ajustement
          proteinMin: 90,          // % de l'objectif protéique
          lowKcalFloor: { homme: 1500, femme: 1200 }
        }
      },
      meta: { createdAt: new Date().toISOString(), demoData: false }
    };
  }

  /** Fusion profonde : complète un état chargé avec les clés par défaut manquantes. */
  function mergeDefaults(target, defaults) {
    Object.keys(defaults).forEach((k) => {
      if (target[k] === undefined) target[k] = defaults[k];
      else if (defaults[k] && typeof defaults[k] === 'object' && !Array.isArray(defaults[k]) &&
               target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
        mergeDefaults(target[k], defaults[k]);
      }
    });
    return target;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      return mergeDefaults(JSON.parse(raw), defaultState());
    } catch (e) {
      console.error('Lecture du stockage impossible', e);
      return defaultState();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Écriture du stockage impossible', e);
      return false;
    }
  }

  function exportJSON(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fitdiet-coach-' + FD.utils.todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /** Valide puis renvoie l'état importé (lève une erreur explicite sinon). */
  function parseImport(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error("Le fichier n'est pas un JSON valide."); }
    if (!data || typeof data !== 'object' || !data.profile || !data.days) {
      throw new Error("Ce fichier ne ressemble pas à un export FitDiet Coach (profil ou journal manquant).");
    }
    return mergeDefaults(data, defaultState());
  }

  function reset() { localStorage.removeItem(KEY); return defaultState(); }

  return { KEY, load, save, exportJSON, parseImport, reset, defaultState, defaultSessionTypes };
})();
