/**
 * tracking.js — Journal quotidien : mesures (poids, taille, pas, sommeil, faim…),
 * entrées alimentaires, activité, et génération de données de démonstration.
 */
window.FD = window.FD || {};

FD.tracking = (function () {
  const U = FD.utils;

  function getDay(state, iso) { return state.days[iso] || null; }

  function ensureDay(state, iso) {
    if (!state.days[iso]) state.days[iso] = { foods: [] };
    if (!state.days[iso].foods) state.days[iso].foods = [];
    return state.days[iso];
  }

  const METRIC_KEYS = ['weight', 'waist', 'steps', 'sleep', 'hunger', 'perf', 'water', 'session', 'trainingDone', 'minutes',
    'otherActivity', 'otherMinutes', 'manualKcal', 'manualProtein', 'waistConditions', 'note'];

  /** Enregistre les mesures d'une journée (une valeur vide efface la mesure). */
  function setMetrics(state, iso, values) {
    const d = ensureDay(state, iso);
    METRIC_KEYS.forEach((k) => {
      if (!(k in values)) return;
      const v = values[k];
      if (v === null || v === '' || v === undefined) delete d[k];
      else d[k] = v;
    });
    return d;
  }

  function clearMetrics(state, iso) {
    const d = state.days[iso];
    if (!d) return;
    METRIC_KEYS.forEach((k) => { delete d[k]; });
    if (!d.foods || !d.foods.length) delete state.days[iso];
  }

  function addFood(state, iso, food, qty, unit, meal, group) {
    const d = ensureDay(state, iso);
    const entry = Object.assign({ id: U.uid(), food: FD.nutrition.snapshot(food), qty, unit, meal }, group ? { group } : {});
    d.foods.push(entry);
    return entry;
  }

  function addFree(state, iso, data) {
    const d = ensureDay(state, iso);
    const entry = Object.assign({ id: U.uid(), free: true }, data);
    d.foods.push(entry);
    return entry;
  }

  function addTemplate(state, iso, tpl) {
    let n = 0;
    const group = { id: U.uid(), name: tpl.name, label: 'repas type', scale: 1 };
    tpl.items.forEach((it) => {
      const f = FD.foods.byId(state, it.foodId);
      if (f) { addFood(state, iso, f, it.qty, it.unit, tpl.meal, group); n++; }
    });
    return n;
  }

  function updateFood(state, iso, entryId, patch) {
    const d = state.days[iso];
    if (!d) return;
    const e = d.foods.find((x) => x.id === entryId);
    if (e) Object.assign(e, patch);
  }

  /** Supprime toutes les entrées d'un groupe (recette ajoutée en une fois). */
  function removeGroup(state, iso, groupId) {
    const d = state.days[iso];
    if (!d) return;
    d.foods = d.foods.filter((x) => !(x.group && x.group.id === groupId));
  }

  /** Change le nombre de portions d'un groupe : toutes les quantités sont mises à l'échelle. */
  function scaleGroup(state, iso, groupId, newScale) {
    const d = state.days[iso];
    if (!d || !(newScale > 0)) return;
    d.foods.forEach((x) => {
      if (!x.group || x.group.id !== groupId) return;
      const old = x.group.scale || 1;
      if (x.free) { ['kcal', 'p', 'g', 'l', 'fib'].forEach((k) => { if (typeof x[k] === 'number') x[k] = Math.round(x[k] * newScale / old * 10) / 10; }); x.group = Object.assign({}, x.group, { scale: newScale }); return; }
      const q = x.qty * newScale / old;
      x.qty = FD.foods.isPiece(x.unit) || x.unit === 'portion' ? Math.max(0.5, Math.round(q * 2) / 2) : Math.round(q * 10) / 10;
      x.group = Object.assign({}, x.group, { scale: newScale });
    });
  }

  function removeFood(state, iso, entryId) {
    const d = state.days[iso];
    if (!d) return;
    d.foods = d.foods.filter((x) => x.id !== entryId);
  }

  /** Substitue l'aliment d'une entrée en conservant la quantité (macros recalculées). */
  function substitute(state, iso, entryId, newFood) {
    const d = state.days[iso];
    const e = d && d.foods.find((x) => x.id === entryId);
    if (!e || e.free) return;
    e.food = FD.nutrition.snapshot(newFood);
    if (FD.foods.toBaseQty(newFood, e.qty, e.unit) === null) e.unit = 'g';
  }

  /** Totaux du jour : journal alimentaire si renseigné, sinon saisie manuelle des kcal/protéines. */
  function dayTotals(state, iso) {
    const d = state.days[iso];
    if (d && d.foods && d.foods.length) return Object.assign(FD.nutrition.totals(d.foods), { tracked: true, mode: 'journal' });
    if (d && typeof d.manualKcal === 'number') {
      return Object.assign(FD.nutrition.zero(), { kcal: d.manualKcal, p: d.manualProtein || 0, tracked: true, mode: 'manuel', partial: typeof d.manualProtein !== 'number' });
    }
    return Object.assign(FD.nutrition.zero(), { tracked: false, mode: null });
  }

  /** Dépense estimée de la journée (activités saisies + pas), en fourchette. */
  function activityEstimate(state, iso) {
    const d = state.days[iso] || {};
    const kg = state.profile.weight;
    let low = 0, high = 0;
    const parts = [];
    if (d.trainingDone && d.minutes) {
      const type = FD.calc.sessionFor(state, iso);
      const r = FD.calc.activityRange(type.id === 'recup' ? 'recup' : type.cat, d.minutes, kg);
      low += r[0]; high += r[1];
      parts.push({ label: type.label + ' · ' + d.minutes + ' min', range: r });
    }
    if (d.otherActivity && d.otherMinutes) {
      const r = FD.calc.activityRange(d.otherActivity, d.otherMinutes, kg);
      low += r[0]; high += r[1];
      parts.push({ label: ({ velo: 'Vélo', marche: 'Marche', autre: 'Autre activité' }[d.otherActivity] || 'Activité') + ' · ' + d.otherMinutes + ' min', range: r });
    }
    if (d.steps) {
      const r = FD.calc.stepsRange(d.steps, kg);
      low += r[0]; high += r[1];
      parts.push({ label: U.num(d.steps) + ' pas', range: r });
    }
    return { low, high, parts };
  }

  /** Générateur pseudo-aléatoire déterministe (données de démo reproductibles). */
  function rng(seed) {
    let s = seed;
    return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  /**
   * Données de démonstration sur 28 jours : poids stable, tour de taille en baisse,
   * protéines proches de l'objectif, ~6 700 pas. Cas réaliste d'une recomposition.
   */
  function loadDemo(state, todayIso) {
    const r = rng(42);
    state.days = {};
    for (let i = 28; i >= 1; i--) {
      const iso = U.addDays(todayIso, -i);
      const wd = U.weekdayKey(iso);
      const d = ensureDay(state, iso);
      if (r() > 0.15) d.weight = U.roundTo(73.5 + [0.2, -0.15, 0.1, -0.2, 0.15, -0.1, 0][i % 7] + (r() - 0.5) * 0.1, 0.1);
      if (i % 7 === 0) { d.waist = U.roundTo(86.3 - (28 - i) * 0.035, 0.1); d.waistConditions = 'matin'; }
      d.steps = Math.round(6700 + (r() - 0.5) * 1800);
      d.sleep = U.roundTo(6.6 + r() * 1.0, 0.1);
      d.hunger = Math.round(4 + r() * 2);
      const plan = FD.calc.sessionType(state, state.weekPlan[wd]);
      if (plan.cat !== 'repos') { d.trainingDone = true; d.minutes = plan.cat === 'force' ? 65 : 40; d.perf = 'stable'; }
      state.templates.forEach((t) => addTemplate(state, iso, t));
      if (wd === 'sam') addFree(state, iso, { name: 'Restaurant entre amis', kind: 'restaurant', meal: 'diner', kcal: 550, p: 25, g: 45, l: 28 });
    }
    state.meta.demoData = true;
  }

  return { getDay, ensureDay, setMetrics, clearMetrics, addFood, addFree, addTemplate, updateFood, removeFood, removeGroup, scaleGroup, substitute, dayTotals, activityEstimate, loadDemo };
})();
