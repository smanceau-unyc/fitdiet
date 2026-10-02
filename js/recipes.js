/**
 * recipes.js — Recettes : calcul des macros à partir des ingrédients, portions ajustées
 * aux besoins, substitutions équivalentes, filtres (exclusions, régime), suggestions.
 *
 * Règle : aucune macro de recette n'est saisie à la main. Tout vient de la somme des
 * ingrédients, divisée par le nombre de portions.
 */
window.FD = window.FD || {};

FD.recipes = (function () {
  const U = FD.utils;

  const SOURCE_APP = { type: 'app', label: 'Recette créée par l\'application', date: '2026-10-02' };

  function all(state) {
    const base = (window.FD_RECIPES || []).map((r) => Object.assign({ source: SOURCE_APP }, r));
    return base.concat(state.recipes || []);
  }

  function byId(state, id) { return all(state).find((r) => r.id === id) || null; }

  function sourceLabel(r) {
    const s = r.source || SOURCE_APP;
    let t = s.label || 'Source inconnue';
    if (s.author) t += ' — ' + s.author;
    if (s.url) t += ' — ' + s.url;
    if (s.date) t += ' (' + U.frShort(s.date.slice(0, 10)) + ')';
    return t;
  }

  /** Valeurs de chaque ligne + totaux + par portion. */
  function compute(state, recipe, ingredients) {
    const ings = ingredients || recipe.ingredients;
    const total = FD.nutrition.zero();
    const lines = [];
    const missing = [];
    let variable = false;
    const sources = {};
    ings.forEach((ing) => {
      const f = FD.foods.byId(state, ing.foodId);
      if (!f) { missing.push(ing.foodId); return; }
      const v = FD.foods.compute(f, ing.qty, ing.unit);
      if (!v) { missing.push(ing.foodId); return; }
      FD.nutrition.add(total, v);
      if (f.variable) variable = true;
      sources[f.source || 'demo'] = true;
      lines.push({ ing, food: f, v });
    });
    const n = recipe.servings || 1;
    const per = {};
    Object.keys(total).forEach((k) => { per[k] = total[k] / n; });
    return { total, per, lines, missing, variable, sources: Object.keys(sources) };
  }

  /** Arrondi d'une quantité selon l'unité (pas de fausse précision). */
  function roundQty(qty, unit) {
    if (FD.foods.isPiece(unit)) return Math.max(1, Math.round(qty));
    if (unit === 'portion') return Math.max(0.5, Math.round(qty * 2) / 2);
    const step = qty < 30 ? 5 : qty < 200 ? 10 : 25;
    return Math.max(step, Math.round(qty / step) * step);
  }

  /** Ingrédients d'UNE portion. */
  function perServing(recipe) {
    const n = recipe.servings || 1;
    return recipe.ingredients.map((i) => Object.assign({}, i, { qty: i.qty / n }));
  }

  /**
   * Ajuste une portion pour viser kcal et protéines d'un repas.
   * On résout un système 2×2 sur deux facteurs : a (sources de protéines) et c (féculents/fruits).
   * Légumes et assaisonnements ne bougent pas. Les facteurs sont bornés (0,6 – 1,8)
   * pour garder une assiette réaliste.
   */
  function fit(state, recipe, target, baseIngredients) {
    const ings = baseIngredients || perServing(recipe);
    const groupVal = (role) => {
      const sub = ings.filter((i) => (role === 'other' ? !['prot', 'carb'].includes(i.role) : i.role === role));
      return compute(state, { servings: 1 }, sub).total;
    };
    const P = groupVal('prot'), Cb = groupVal('carb'), O = groupVal('other');
    let a = 1, c = 1;
    if (target && target.kcal) {
      const tp = target.p, tk = target.kcal;
      const det = P.p * Cb.kcal - Cb.p * P.kcal;
      if (Math.abs(det) > 1e-6 && P.kcal + Cb.kcal > 0) {
        a = ((tp - O.p) * Cb.kcal - Cb.p * (tk - O.kcal)) / det;
        c = (P.p * (tk - O.kcal) - P.kcal * (tp - O.p)) / det;
      } else {
        const base = P.kcal + Cb.kcal + O.kcal;
        a = c = base > 0 ? tk / base : 1;
      }
      if (!(a > 0)) a = 0.6;
      if (!(c > 0)) c = 0.6;
      a = U.clamp(a, 0.6, 1.8); c = U.clamp(c, 0.6, 1.8);
      if (!Cb.kcal) c = 1;
      if (!P.kcal) a = 1;
    }
    const scaled = ings.map((i) => {
      const k = i.role === 'prot' ? a : i.role === 'carb' ? c : 1;
      return { foodId: i.foodId, unit: i.unit, role: i.role, qty: roundQty(i.qty * k, i.unit) };
    });
    const res = compute(state, { servings: 1 }, scaled);
    return { ingredients: scaled, totals: res.total, factors: { prot: a, carb: c }, variable: res.variable };
  }

  /** Écart entre un repas et sa cible (0 = parfait). Les protéines manquantes pèsent plus lourd. */
  function fitError(totals, target) {
    if (!target || !target.kcal) return 0;
    const ek = Math.abs(totals.kcal - target.kcal) / target.kcal;
    const short = Math.max(0, target.p - totals.p) / Math.max(target.p, 1);
    const excess = Math.max(0, totals.p - target.p * 1.35) / Math.max(target.p, 1);
    return ek + 1.5 * short + 0.4 * excess;
  }

  /** Groupe de substitution d'un aliment (aliments existants uniquement). */
  function substitutesFor(state, foodId) {
    const groups = window.FD_SUBSTITUTES || [];
    const g = groups.find((x) => x.includes(foodId));
    let ids = g ? g.filter((x) => x !== foodId) : [];
    const f = FD.foods.byId(state, foodId);
    if (!ids.length && f) ids = FD.foods.all(state).filter((x) => x.cat === f.cat && x.id !== foodId && x.state === f.state).map((x) => x.id);
    return ids.map((id) => FD.foods.byId(state, id)).filter((x) => x && foodAllowed(state, x).ok);
  }

  /**
   * Remplace un ingrédient par un équivalent : la quantité est recalculée pour conserver
   * l'apport principal du rôle (protéines pour une source de protéines, glucides pour un féculent,
   * calories sinon).
   */
  function substitute(state, ing, newFoodId) {
    const oldF = FD.foods.byId(state, ing.foodId), newF = FD.foods.byId(state, newFoodId);
    if (!oldF || !newF) return ing;
    const key = ing.role === 'prot' ? 'p' : ing.role === 'carb' ? 'g' : 'kcal';
    const old = FD.foods.compute(oldF, ing.qty, ing.unit);
    let unit = ing.unit;
    if (FD.foods.toBaseQty(newF, 1, unit) === null) unit = newF.basis === '100ml' ? 'ml' : 'g';
    const perUnit = FD.foods.compute(newF, 1, unit);
    let qty = ing.qty;
    if (old && perUnit && perUnit[key] > 0.01) qty = old[key] / perUnit[key];
    else if (old && perUnit && perUnit.kcal > 0) qty = old.kcal / perUnit.kcal;
    // garde-fou : pas plus de 5× le poids d'origine (ex. légume remplacé par un féculent)
    const oldBase = FD.foods.toBaseQty(oldF, ing.qty, ing.unit) || 0;
    const newBase = FD.foods.toBaseQty(newF, qty, unit) || 0;
    if (oldBase && newBase > oldBase * 5) qty = qty * (oldBase * 5) / newBase;
    return { foodId: newFoodId, unit, role: ing.role, qty: roundQty(qty, unit) };
  }

  /* ---------------- Filtres : exclusions, allergies, régime ---------------- */

  function terms(str) { return String(str || '').split(/[,;\n]/).map((t) => U.norm(t).trim()).filter((t) => t.length >= 3); }

  function foodAllowed(state, f) {
    const p = state.profile;
    const name = U.norm(f.base + ' ' + (f.brand || ''));
    const bad = terms(p.excluded).concat(terms(p.allergies)).concat(terms(p.intolerances));
    const hit = bad.find((t) => name.includes(t));
    if (hit) return { ok: false, reason: 'contient « ' + hit + ' »' };
    const meat = f.cat === 'viandes', fish = f.cat === 'poissons' || f.id === 'thon-naturel';
    const animal = meat || fish || f.cat === 'laitiers' || f.id === 'whey' || f.id === 'miel';
    if (p.diet === 'vegetarien' && (meat || fish)) return { ok: false, reason: 'régime végétarien' };
    if (p.diet === 'pescetarien' && meat) return { ok: false, reason: 'régime pescétarien' };
    if (p.diet === 'vegetalien' && animal) return { ok: false, reason: 'régime végétalien' };
    if (p.diet === 'sans-porc' && f.pork) return { ok: false, reason: 'sans porc' };
    return { ok: true };
  }

  function recipeAllowed(state, r) {
    for (const ing of r.ingredients) {
      const f = FD.foods.byId(state, ing.foodId);
      if (!f) return { ok: false, reason: 'ingrédient introuvable' };
      const a = foodAllowed(state, f);
      if (!a.ok) return a;
    }
    return { ok: true };
  }

  /**
   * Suggestions pour le reste de la journée : recettes ajustées pour approcher
   * les calories et protéines restantes. Renvoie les n meilleures.
   */
  function suggest(state, mealId, remaining, n) {
    const out = [];
    all(state).forEach((r) => {
      if (mealId && !r.meals.includes(mealId)) return;
      if (!recipeAllowed(state, r).ok) return;
      const f = fit(state, r, remaining);
      out.push({ recipe: r, fit: f, error: fitError(f.totals, remaining) });
    });
    return out.sort((a, b) => a.error - b.error).slice(0, n || 4);
  }

  return { all, byId, sourceLabel, compute, roundQty, perServing, fit, fitError, substitutesFor, substitute, foodAllowed, recipeAllowed, suggest, SOURCE_APP };
})();
