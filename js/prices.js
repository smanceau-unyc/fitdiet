/**
 * prices.js — Prix des aliments et coût estimé des repas, plans et courses.
 * Priorité : prix saisi par l'utilisateur > prix indicatif de démo. Coût = estimation
 * au poids (ou à l'unité), sans tenir compte des conditionnements du magasin.
 */
window.FD = window.FD || {};

FD.prices = (function () {
  const U = FD.utils;

  /** Prix d'un aliment : { price, per, source: 'utilisateur' | 'indicatif', date } ou null. */
  function get(state, foodId) {
    const u = (state.prices || {})[foodId];
    if (u && u.price > 0) return Object.assign({ source: 'utilisateur' }, u);
    const d = (window.FD_DEFAULT_PRICES || {})[foodId];
    return d ? { price: d[0], per: d[1], source: 'indicatif' } : null;
  }

  /** Aliment à acheter (variante crue si l'aliment est noté cuit) + quantité convertie. */
  function purchase(state, foodId, qty, unit) {
    let f = FD.foods.byId(state, foodId);
    if (!f) return null;
    let grams = FD.foods.toBaseQty(f, qty, unit) || 0;
    const raw = FD.shopping.rawVariant(state, f);
    if (raw) { grams = grams * f.kcal / raw.kcal; f = raw; }
    return { food: f, grams };
  }

  function costOf(state, food, grams) {
    const pr = get(state, food.id);
    if (!pr) return null;
    if (pr.per === 'unite') return food.unitG ? Math.ceil(grams / food.unitG - 0.05) * pr.price : null;
    return grams / 1000 * pr.price; // €/kg ou €/L (base 100 ml ≈ 100 g pour l'estimation)
  }

  /** Coût d'un ingrédient (null si prix inconnu). */
  function ingredientCost(state, ing) {
    const p = purchase(state, ing.foodId, ing.qty, ing.unit);
    if (!p) return null;
    const pr = get(state, p.food.id);
    if (!pr) return null;
    if (pr.per === 'unite') return p.food.unitG ? (p.grams / p.food.unitG) * pr.price : null; // proratisé à l'échelle d'un repas
    return p.grams / 1000 * pr.price;
  }

  function mealCost(state, ings) {
    let total = 0, missing = 0;
    ings.forEach((i) => { const c = ingredientCost(state, i); if (c === null) missing++; else total += c; });
    return { total, missing };
  }

  function planCost(state, plan) {
    let total = 0, missing = 0;
    const days = plan.days.map((d) => {
      let t = 0;
      d.meals.forEach((m) => { const c = mealCost(state, m.ingredients); t += c.total; missing += c.missing; });
      total += t;
      return t;
    });
    return { total, days, missing };
  }

  function euros(n) { return n === null || n === undefined ? '—' : U.num(n, 2) + ' €'; }

  /** Budget hebdomadaire saisi dans le profil (nombre) ou null. */
  function weeklyBudget(state) { const b = U.parseNum(state.profile.budget); return b && b > 0 ? b : null; }

  return { get, purchase, costOf, ingredientCost, mealCost, planCost, euros, weeklyBudget };
})();
