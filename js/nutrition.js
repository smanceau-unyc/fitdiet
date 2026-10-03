/**
 * nutrition.js — Repas, totaux nutritionnels, répartition par repas et repas types.
 */
window.FD = window.FD || {};

FD.nutrition = (function () {
  const MEALS = [
    { id: 'petitdej', label: 'Petit-déjeuner', share: [0.20, 0.25] },
    { id: 'dejeuner', label: 'Déjeuner', share: [0.30, 0.35] },
    { id: 'collation', label: 'Collation', share: [0.10, 0.20] },
    { id: 'diner', label: 'Dîner', share: [0.30, 0.35] }
  ];

  const FREE_KINDS = { libre: 'Repas libre', restaurant: 'Restaurant', dessert: 'Dessert', chocolat: 'Chocolat', alcool: 'Alcool', autre: 'Autre' };

  function zero() { return { kcal: 0, p: 0, g: 0, l: 0, fib: 0, sug: 0, salt: 0 }; }

  function add(a, b) {
    if (!b) return a;
    Object.keys(a).forEach((k) => { a[k] += b[k] || 0; });
    return a;
  }

  /** Valeurs d'une entrée du journal (aliment recalculé ou saisie libre). */
  function entryValues(entry) {
    if (entry.free) return { kcal: entry.kcal || 0, p: entry.p || 0, g: entry.g || 0, l: entry.l || 0, fib: entry.fib || 0, sug: 0, salt: 0, grams: null };
    return FD.foods.compute(entry.food, entry.qty, entry.unit) || zero();
  }

  /** Copie figée des valeurs d'un aliment : l'entrée reste lisible même si l'aliment disparaît. */
  function snapshot(f) {
    const keys = ['id', 'base', 'brand', 'state', 'basis', 'kcal', 'p', 'g', 'l', 'fib', 'sug', 'salt', 'unitG', 'unitLabel', 'portionG', 'portionLabel', 'unitsFrom', 'source', 'barcode', 'variable', 'alcohol', 'cat'];
    const o = {};
    keys.forEach((k) => { if (f[k] !== undefined) o[k] = f[k]; });
    return o;
  }

  function totals(entries) {
    return (entries || []).reduce((acc, e) => add(acc, entryValues(e)), zero());
  }

  function totalsByMeal(entries) {
    const out = {};
    MEALS.forEach((m) => { out[m.id] = totals((entries || []).filter((e) => e.meal === m.id)); });
    return out;
  }

  /**
   * Cible par repas : répartition par défaut, avec glucides déplacés vers le repas
   * qui précède et celui qui suit l'entraînement (ex. petit-déj pré-séance le matin).
   */
  function mealTargets(target, trainingTime, isTraining) {
    const hour = trainingTime ? parseInt(trainingTime.split(':')[0], 10) : null;
    const res = {};
    MEALS.forEach((m) => {
      const share = (m.share[0] + m.share[1]) / 2;
      res[m.id] = { kcal: target.kcal * share, p: target.p * share, g: target.g * share, l: target.l * share, note: '' };
    });
    if (isTraining && hour !== null) {
      let pre, post;
      if (hour < 10) { pre = 'petitdej'; post = 'dejeuner'; }
      else if (hour < 15) { pre = 'petitdej'; post = 'dejeuner'; }
      else if (hour < 18) { pre = 'collation'; post = 'diner'; }
      else { pre = 'collation'; post = 'diner'; }
      if (hour >= 10 && hour < 15) { pre = 'collation'; } // séance vers midi : collation pré, déjeuner post
      res[pre].note = 'Pré-séance : digeste, riche en glucides, peu de lipides';
      res[post].note = 'Post-séance : repas complet, protéines et glucides';
      // déplacer ~10 % des glucides du dîner (ou du petit-déj) vers pré/post
      const donor = [pre, post].includes('diner') ? 'petitdej' : 'diner';
      const moved = res[donor].g * 0.25;
      res[donor].g -= moved;
      res[pre].g += moved / 2;
      res[post].g += moved / 2;
    }
    return res;
  }

  return { MEALS, FREE_KINDS, zero, add, entryValues, snapshot, totals, totalsByMeal, mealTargets };
})();
